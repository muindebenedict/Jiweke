import express from "express";
import path from "path";
import { spawn } from "child_process";
import { request as httpRequest } from "http";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// 1. Run pip3 install to install Python dependencies if missing
const pythonCwd = path.join(process.cwd(), "jiweke");
console.log(`Checking/installing Python dependencies in ${pythonCwd}...`);

import * as fs from "fs";
const logStream = fs.createWriteStream(path.join(process.cwd(), "jiweke_python_log.log"), { flags: "w" });

function bootstrapPip(): Promise<void> {
  return new Promise((resolve) => {
    logStream.write("[START] Bootstrapping pip with ensurepip...\n");
    const child = spawn("python3", ["-m", "ensurepip", "--default-pip"], {
      cwd: pythonCwd,
      env: { ...process.env }
    });
    child.stdout.on("data", (data) => logStream.write(`[BOOTSTRAP STDOUT] ${data}`));
    child.stderr.on("data", (data) => logStream.write(`[BOOTSTRAP STDERR] ${data}`));
    child.on("exit", (code) => {
      logStream.write(`[BOOTSTRAP EXIT] Completed with code ${code}\n`);
      resolve();
    });
  });
}

import * as https from "https";

function downloadGetPip(): Promise<void> {
  return new Promise((resolve, reject) => {
    const filePath = path.join(process.cwd(), "get-pip.py");
    if (fs.existsSync(filePath)) {
      logStream.write("[DOWNLOAD] get-pip.py already exists. Skipping download.\n");
      resolve();
      return;
    }
    logStream.write("[START] Downloading get-pip.py...\n");
    const file = fs.createWriteStream(filePath);
    https.get("https://bootstrap.pypa.io/get-pip.py", (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        logStream.write("[DOWNLOAD OK] get-pip.py downloaded successfully.\n");
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(filePath, () => {});
      logStream.write(`[DOWNLOAD ERROR] Failed to download get-pip.py: ${err.message}\n`);
      reject(err);
    });
  });
}

function installPip(): Promise<void> {
  return new Promise((resolve) => {
    logStream.write("[START] Running python3 get-pip.py --user...\n");
    const child = spawn("python3", ["get-pip.py", "--user"], {
      cwd: process.cwd(),
      env: { ...process.env }
    });
    child.stdout.on("data", (data) => logStream.write(`[GET-PIP STDOUT] ${data}`));
    child.stderr.on("data", (data) => logStream.write(`[GET-PIP STDERR] ${data}`));
    child.on("exit", (code) => {
      logStream.write(`[GET-PIP EXIT] Completed with code ${code}\n`);
      resolve();
    });
  });
}

function installPythonDeps(): Promise<void> {
  return new Promise((resolve) => {
    logStream.write("[START] Running python3 -m pip install...\n");
    // Ensure user-local install directory is in PATH
    const userBinPath = path.join(process.env.HOME || "/root", ".local/bin");
    const updatedPath = `${userBinPath}:${process.env.PATH}`;

    const pip = spawn("python3", ["-m", "pip", "install", "--user", "-r", "requirements.txt"], {
      cwd: pythonCwd,
      env: { ...process.env, PATH: updatedPath }
    });

    pip.stdout.on("data", (data) => {
      logStream.write(`[PIP STDOUT] ${data}`);
    });

    pip.stderr.on("data", (data) => {
      logStream.write(`[PIP STDERR] ${data}`);
    });

    pip.on("error", (err) => {
      logStream.write(`[PIP SPAWN ERROR] ${err}\n`);
      console.error("Failed to start python3 pip subprocess:", err);
      resolve(); // Proceed anyway
    });

    pip.on("exit", (code, signal) => {
      logStream.write(`[PIP EXIT] Completed with code ${code} and signal ${signal}\n`);
      console.log(`python3 -m pip install exited with code ${code}`);
      resolve();
    });
  });
}

function startFlaskBackend() {
  console.log(`Starting Flask backend on port 5000 within ${pythonCwd}...`);
  const python_proc = spawn("python3", ["-u", "run.py"], {
    cwd: pythonCwd,
    stdio: "pipe",
    env: { ...process.env, PORT: "5000", FLASK_RUN_PORT: "5000" }
  });

  python_proc.stdout.on("data", (data) => {
    logStream.write(`[STDOUT] ${data}`);
  });

  python_proc.stderr.on("data", (data) => {
    logStream.write(`[STDERR] ${data}`);
  });

  python_proc.on("error", (err) => {
    logStream.write(`[SPAWN ERROR] ${err}\n`);
    console.error("Failed to start Flask backend subprocess:", err);
  });

  python_proc.on("exit", (code, signal) => {
    logStream.write(`[EXIT] Flask backend exited with code ${code} and signal ${signal}\n`);
    console.log(`Flask backend subprocess exited with code ${code} and signal ${signal}`);
  });
}

// IMPORTANT: Do NOT place express.json() before this API proxy middleware,
// as body-parser consumes the stream and causes hanging in req.pipe(proxyReq).
app.use("/api", (req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: 5000,
    path: `/api${req.url}`,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxyReq, { end: true });

  proxyReq.on("error", (err) => {
    console.error("Proxy routing error querying Flask server:", err);
    res.status(502).send("Bad Gateway (Flask server not ready or exited)");
  });
});

// 2. Setup Frontend asset routers
async function setupFrontend() {
  // Install python dependencies and then boot backend
  bootstrapPip()
    .then(() => downloadGetPip())
    .then(() => installPip())
    .then(() => installPythonDeps())
    .then(() => {
      startFlaskBackend();
    });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Jiweke server proxy and static router running on http://0.0.0.0:${PORT}`);
  });
}

setupFrontend();
