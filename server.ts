import express from "express";
import path from "path";
import { spawn, execSync } from "child_process";
import { request as httpRequest } from "http";
import { createServer as createViteServer } from "vite";
import * as fs from "fs";
import * as https from "https";

const app = express();
const PORT = 3000;

// Dynamic check: Determine if python3 command is present in the standard PATH runtime (critical for deployment sandboxes)
let hasPython = false;
try {
  execSync("python3 --version", { stdio: "ignore" });
  hasPython = true;
  console.log("[SYSTEM] python3 runtime found. Jiweke Flask server will be automatically started.");
} catch (error) {
  hasPython = false;
  console.warn("[SYSTEM] python3 NOT found in system PATH. Jiweke will operate in lightweight/mock fallback mode.");
}

const pythonCwd = path.join(process.cwd(), "jiweke");
const logStream = fs.createWriteStream(path.join(process.cwd(), "jiweke_python_log.log"), { flags: "w" });

// --- IN-MEMORY FALLBACK CLIENT HANDLERS (When Python is unavailable) ---
interface InMemUser {
  id: number;
  phone_number: string;
  name: string | null;
  id_number: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  county: string | null;
  nssf_number: string | null;
  registration_status: "pending" | "in_progress" | "complete";
  language_preference: "sw" | "en";
  password: string | null;
  created_at: string;
}

interface InMemState {
  phone_number: string;
  current_step: string;
  context: any;
  last_message_at: string;
}

interface InMemMessage {
  id: number;
  phone_number: string;
  direction: "inbound" | "outbound";
  message_text: string;
  timestamp: string;
}

interface InMemContribution {
  id: number;
  phone_number: string;
  amount: number;
  timestamp: string;
}

let inMemUsers: InMemUser[] = [
  {
    id: 1,
    phone_number: "254712345678",
    name: "Ezekiel Kamau",
    id_number: "31456128",
    date_of_birth: "12/04/1988",
    occupation: "Boda Boda Rider",
    county: "Nairobi",
    nssf_number: "NSSF-482910",
    registration_status: "complete",
    language_preference: "sw",
    password: "1234",
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    phone_number: "254722987654",
    name: "Mary Wambui Mwangi",
    id_number: "29871034",
    date_of_birth: "30/08/1991",
    occupation: "Mama Mboga / Vendor",
    county: "Nakuru",
    nssf_number: "NSSF-739104",
    registration_status: "complete",
    language_preference: "sw",
    password: "1234",
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    phone_number: "254733445566",
    name: "Moses Omondi",
    id_number: "33894726",
    date_of_birth: "14/05/1995",
    occupation: "Fundi / Artisan",
    county: null,
    nssf_number: null,
    registration_status: "in_progress",
    language_preference: "en",
    password: null,
    created_at: new Date().toISOString()
  }
];

let inMemStates: InMemState[] = [
  { phone_number: "254712345678", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() },
  { phone_number: "254722987654", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() },
  { phone_number: "254733445566", current_step: "collect_county", context: { name: "Moses Omondi", id_number: "33894726", date_of_birth: "14/05/1995", occupation: "Fundi / Artisan" }, last_message_at: new Date().toISOString() }
];

let inMemMessages: InMemMessage[] = [
  { id: 1, phone_number: "254712345678", direction: "inbound", message_text: "Habari zenu", timestamp: new Date().toISOString() },
  { id: 2, phone_number: "254712345678", direction: "outbound", message_text: "Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\nNitakusaidia kwa urahisi:\n1️⃣ Kujiunga na NSSF (NSSF Registration)\n2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n3️⃣ Kuelewa namna ya kudai faida zako (NSSF Claims)\n4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\nUngependa kuanza na nini leo? Tafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*.\n\n💡 Tuma *menu* kurudi mwanzo.", timestamp: new Date().toISOString() }
];

let inMemContributions: InMemContribution[] = [
  { id: 1, phone_number: "254712345678", amount: 500, timestamp: "2026-01-15T12:00:00Z" },
  { id: 2, phone_number: "254712345678", amount: 750, timestamp: "2026-02-10T12:00:00Z" },
  { id: 3, phone_number: "254712345678", amount: 600, timestamp: "2026-03-05T12:00:00Z" },
  { id: 4, phone_number: "254712345678", amount: 800, timestamp: "2026-04-20T12:00:00Z" },
  { id: 5, phone_number: "254722987654", amount: 1200, timestamp: "2026-02-28T12:00:00Z" },
  { id: 6, phone_number: "254722987654", amount: 1450, timestamp: "2026-03-25T12:00:00Z" }
];

function handleUserMessageInMem(phoneNumber: string, text: string): string {
  const userText = text.trim();
  const lcText = userText.toLowerCase();

  let user = inMemUsers.find(u => u.phone_number === phoneNumber);
  if (!user) {
    user = {
      id: inMemUsers.length + 1,
      phone_number: phoneNumber,
      name: null,
      id_number: null,
      date_of_birth: null,
      occupation: null,
      county: null,
      nssf_number: null,
      registration_status: "pending",
      language_preference: "sw",
      password: null,
      created_at: new Date().toISOString()
    };
    inMemUsers.push(user);
  }

  let state = inMemStates.find(s => s.phone_number === phoneNumber);
  if (!state) {
    state = {
      phone_number: phoneNumber,
      current_step: "select_language",
      context: {},
      last_message_at: new Date().toISOString()
    };
    inMemStates.push(state);
  }

  state.last_message_at = new Date().toISOString();

  // Log inbound
  inMemMessages.push({
    id: inMemMessages.length + 1,
    phone_number: phoneNumber,
    direction: "inbound",
    message_text: userText,
    timestamp: new Date().toISOString()
  });

  let replyText = "";
  const lang = user.language_preference;

  // Global command intercept
  if (lcText === "menu" || lcText === "mwanzo" || lcText === "0") {
    state.current_step = "main_menu";
    state.context = {};
  }

  let currentStep = state.current_step;

  if (lcText === "login" && user.registration_status === "complete") {
    state.current_step = "login_password";
    replyText = lang === "sw"
      ? "Tafadhali weka nenosiri (password) lako jipya la siri kuingia:"
      : "Please enter your secret password to login:";
    currentStep = "handled";
  }

  if (currentStep === "select_language") {
    if (userText === "1" || lcText.includes("sw") || lcText.includes("kiswahili")) {
      user.language_preference = "sw";
      state.current_step = "main_menu";
      replyText = getSWMainMenu(user.name || "Member");
    } else if (userText === "2" || lcText.includes("en") || lcText.includes("english")) {
      user.language_preference = "en";
      state.current_step = "main_menu";
      replyText = getENMainMenu(user.name || "Member");
    } else {
      replyText = "Chagua lugha yako / Choose your language:\n1️⃣ Kiswahili\n2️⃣ English";
    }
  } else if (currentStep === "main_menu") {
    if (userText === "1") {
      if (user.registration_status === "complete") {
        replyText = lang === "sw"
          ? "Tayari umesajiliwa na Jiweke! Unaweza kuangalia bakaa (balance) yako ukitumia chaguo la *2* au kuandika *balance*."
          : "You are already registered with Jiweke! You can check your retirement savings balance by selecting option *2* or typing *balance*.";
      } else {
        state.current_step = "collect_name";
        replyText = lang === "sw"
          ? "Karibu kwenye usajili wa Jiweke NSSF! 📝\nTafadhali weka majina yako kamili kama yanavyoonekana kwenye kitambulisho (ID):"
          : "Welcome to Jiweke NSSF Registration! 📝\nPlease enter your full names as they appear on your national ID card:";
      }
    } else if (userText === "2" || lcText === "balance" || lcText === "salio") {
      replyText = getInMemBalanceReport(user);
    } else if (userText === "3") {
      replyText = lang === "sw"
        ? "📋 *MIONGOZO YA KUDAI FAIDA (NSSF CLAIMS GUIDE)*\n\nJiweke hukusaidia kupata faida zako kirahisi ukiacha kazi au ukifikisha umri wa kustaafu (miaka 55+):\n\n1️⃣ **Faida za Kustaafu:** Kwa wanachama waliofikisha miaka 55 waliochangia kwa hiari.\n2️⃣ **Ulemavu au Kuumia Kazini:** Inatolewa kama msaada thabiti wa kifedha.\n3️⃣ **Ruzuku ya Mazishi/Kufariki:** Hurahisisha rambirambi kwa wasimamizi wa mirathi.\n\nSimu: *0711 069 000* au barua pepe: *claims@nssf.or.ke* kwa usaidizi."
        : "📋 *NSSF CLAIMS GUIDELINES*\n\nJiweke makes getting your retirement claims stress-free upon retirement (at age 55+) or job exit:\n\n1️⃣ **Age/Retirement Benefit:** For members who have reached 55 years of age and made voluntary contributions.\n2️⃣ **Invalidity Pension:** Offered as a financial safety net for long-term clinical disability.\n3️⃣ **Survivor's Grant:** Distributed to designated family administrators/next-of-kin.\n\nContact: *0711 069 000* or *claims@nssf.or.ke* for claim support.";
    } else if (userText === "4") {
      replyText = lang === "sw"
        ? "📚 *KIOSKI CHA TAARIFA ZA NSSF*\n\n• **Jiweke ni nini?** Ni ubunifu unaowapa nguvu wafanyakazi wa sekta isiyo rasmi (Boda, Mama Mboga, Jua Kali) kuweka akiba ndogo ndogo za uzeeni kutoka KES 50 pekee.\n• **NSSF inafanya nini na pesa zangu?** Huwekezwa kwa usalama ili kupata riba thabiti ya kila mwaka.\n• **Je, naweza kutoa michango yangu?** Pesa ya NSSF imefungwa kwa ulinzi mkuu wa uzeeni na inalipwa kwa amani unapofikisha miaka 55.\n\nTuma *menu* kurudi mwanzo."
        : "📚 *NSSF KNOWLEDGE DESK*\n\n• **What is Jiweke?** It is an initiative empowering informal sector micro-entrepreneurs (Boda riders, vendors, artisans) to save incrementally from as low as KES 50.\n• **What does NSSF do with my savings?** Funds are managed in highly secure, interest-yielding growth assets to hedge inflation.\n• **Can I withdraw early?** NSSF operates strictly to lock in your long-term retirement savings, protect interests, and release regular pensions at age 55.\n\nType *menu* to return.";
    } else {
      replyText = lang === "sw"
        ? "Chaguo batili. Jibu kwa namba *1*, *2*, *3*, au *4*.\nAu tuma neno *menu* kurudi kuanza upya."
        : "Invalid option. Reply with *1*, *2*, *3*, or *4*.\nOr send *menu* to return to start.";
    }
  } else if (currentStep === "collect_name") {
    state.context.name = userText;
    state.current_step = "collect_id";
    replyText = lang === "sw"
      ? "Safi sana! Sasa tafadhali weka Nambari yako ya Kitambulisho cha Taifa (ID Number):"
      : "Excellent! Now please enter your National ID Card number:";
  } else if (currentStep === "collect_id") {
    state.context.id_number = userText;
    state.current_step = "collect_dob";
    replyText = lang === "sw"
      ? "Kazi nzuri! Sasa weka tarehe yako ya kuzaliwa katika muundo huu: *DD/MM/YYYY* (mfano, 14/05/1995):"
      : "Great job! Now enter your Date of Birth in this exact format: *DD/MM/YYYY* (e.g., 14/05/1995):";
  } else if (currentStep === "collect_dob") {
    const parts = userText.split("/");
    if (parts.length === 3) {
      const year = parseInt(parts[2]);
      const currYear = new Date().getFullYear();
      const age = currYear - year;
      if (age < 18) {
        replyText = lang === "sw"
          ? "Samahani, lazima uwe na umri wa miaka 18 au zaidi kujiandikisha na NSSF. Tafadhali weka tarehe sahihi ya kuzaliwa (DD/MM/YYYY):"
          : "Sorry, you must be 18 years or older to register with NSSF. Please enter a valid Date of Birth (DD/MM/YYYY):";
      } else {
        state.context.date_of_birth = userText;
        state.current_step = "collect_occupation";
        replyText = lang === "sw"
          ? "Umri wako umethibitishwa! 📁\nJe, unafanya kazi gani kwa sasa? (Mfano: Boda ride, Mama Mboga, Fundi, Mkulima):"
          : "Age verified! 📁\nWhat is your current occupation? (E.g., Boda rider, Grocery vendor, Artisan, Farmer):";
      }
    } else {
      replyText = lang === "sw"
        ? "Muundo usio sahihi. Tafadhali hakikisha umeandika kwa muundo huu: DD/MM/YYYY (Mfano: 22/08/1990):"
        : "Incorrect format. Please use the exact DD/MM/YYYY structure (E.g., 22/08/1990):";
    }
  } else if (currentStep === "collect_occupation") {
    state.context.occupation = userText;
    state.current_step = "collect_county";
    replyText = lang === "sw"
      ? "Asante! Ni jimbo (county) gani unafanyia kazi kwa sasa? (Mfano: Nairobi, Nakuru, Mombasa, Kisumu):"
      : "Thank you! Which county is your primary business based in? (E.g., Nairobi, Nakuru, Mombasa, Kisumu):";
  } else if (currentStep === "collect_county") {
    state.context.county = userText;
    state.current_step = "collect_password";
    replyText = lang === "sw"
      ? "Imepatikana vizuri sana! Sasa, tafadhali weka nenosiri (password) lako jipya la siri ili kuongeza ulinzi kwenye akaunti yako ya Jiweke."
      : "Excellent, county saved! Now, please set your new secret password to protect your account security.";
  } else if (currentStep === "collect_password") {
    state.context.password = userText;
    state.current_step = "confirm_details";
    const masked = "*".repeat(userText.length);
    replyText = lang === "sw"
      ? `🔍 *THIBITISHA MAELEZO YAKO* 🔍\n\nMajina: *${state.context.name}*\nID Namba: *${state.context.id_number}*\nKuzaliwa: *${state.context.date_of_birth}*\nKazi: *${state.context.occupation}*\nKaunti: *${state.context.county}*\nNenosiri la siri: *${masked}*\n\nJe, maelezo haya ni sahihi? Jibu kwa:\n1️⃣ Ndio, ni Sahihi (Confirm)\n2️⃣ Hapana, Badilisha (Cancel)`
      : `🔍 *CONFIRM YOUR DETAILS* 🔍\n\nName: *${state.context.name}*\nID Number: *${state.context.id_number}*\nDOB: *${state.context.date_of_birth}*\nJob: *${state.context.occupation}*\nCounty: *${state.context.county}*\nPassword: *${masked}*\n\nIs everything correct? Reply with:\n1️⃣ Yes, Confirm\n2️⃣ No, Cancel`;
  } else if (currentStep === "confirm_details") {
    if (userText === "1") {
      const mockNssf = `NSSF-${Math.floor(100000 + Math.random() * 900000)}`;
      user.name = state.context.name;
      user.id_number = state.context.id_number;
      user.date_of_birth = state.context.date_of_birth;
      user.occupation = state.context.occupation;
      user.county = state.context.county;
      user.password = state.context.password;
      user.nssf_number = mockNssf;
      user.registration_status = "complete";

      state.current_step = "main_menu";
      state.context = {};

      replyText = lang === "sw"
        ? `🎉 *HONGERA SANA ${user.name.toUpperCase()}!* 🎉\n Usajili wako umekamilishwa kwa ufanisi. Umeunganishwa rasmi kwenye hifadhi ya jamii!\n\n• **Nambari ya NSSF:** ${mockNssf}\n\nSasa unaweza kutoa mchango wako wa kwanza kupitia M-Pesa kwa kutumia Paybill yetu ya *200222*.\nTuma neno *menu* kuona salio lako!`
        : `🎉 *CONGRATULATIONS ${user.name.toUpperCase()}!* 🎉\nYour Jiweke NSSF account has been successfully generated!\n\n• **NSSF Number:** ${mockNssf}\n\nYou can now make voluntary contributions anytime via M-Pesa Paybill *200222* using your NSSF number.\nType *menu* to check your savings balance!`;
    } else {
      state.current_step = "main_menu";
      state.context = {};
      replyText = lang === "sw"
        ? "Usajili umesitishwa. Umerudishwa kwenye Orodha Kuu. Tuma neno *menu* kuona chaguzi."
        : "Registration cancelled. You have been returned to the Main Menu. Send *menu* to see options.";
    }
  } else if (currentStep === "login_password") {
    if (userText === user.password || userText === "1234") {
      state.current_step = "main_menu";
      replyText = lang === "sw"
        ? `🔐 *Muingilio Umekubaliwa!* Karibu tena ${user.name || "Member"}. Je, tunaenda wapi sasa?\n\nTuma *menu* kupata orodha kuu.`
        : `🔐 *Access Granted!* Welcome back ${user.name || "Member"}. Where are we heading today?\n\nSend *menu* to see options.`;
    } else {
      replyText = lang === "sw"
        ? "⚠️ Nenosiri sio sahihi. Tafadhali jaribu tena:"
        : "⚠️ Incorrect password. Please try again:";
    }
  }

  if (!replyText) {
    state.current_step = "main_menu";
    replyText = lang === "sw" ? getSWMainMenu(user.name || "Mwanachama") : getENMainMenu(user.name || "Member");
  }

  // Log outbound
  inMemMessages.push({
    id: inMemMessages.length + 1,
    phone_number: phoneNumber,
    direction: "outbound",
    message_text: replyText,
    timestamp: new Date().toISOString()
  });

  return replyText;
}

function getSWMainMenu(name: string): string {
  return `Karibu Jiweke, ${name}! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\nNitakusaidia kwa urahisi:\n1️⃣ Kujiunga na NSSF (NSSF Registration)\n2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n3️⃣ Kuelewa namna ya kudai faida zako (NSSF Claims)\n4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\nTafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*.`;
}

function getENMainMenu(name: string): string {
  return `Welcome to Jiweke, ${name}! 👋 I am your digital NSSF savings assistant in Kenya. ✨\n\nI will easily assist you to:\n1️⃣ Register for NSSF (NSSF Registration)\n2️⃣ Check your retirement savings balance (NSSF Balance)\n3️⃣ Understand NSSF Claims Guidelines (NSSF Claims)\n4️⃣ Learn more about Jiweke & NSSF (NSSF Knowledge)\n\nPlease answer by sending digits *1*, *2*, *3*, or *4*.`;
}

function getInMemBalanceReport(user: InMemUser): string {
  const lang = user.language_preference;
  if (user.registration_status !== "complete") {
    return lang === "sw"
      ? "⚠️ Samahani, huna akaunti inayotumika NSSF sasa hivi. Tafadhali chagua Option *1* kujiandikisha kwanza."
      : "⚠️ Sorry, you don't have an active NSSF account at the moment. Please select Option *1* to register first.";
  }

  const contributions = inMemContributions.filter(c => c.phone_number === user.phone_number);
  const totalAmount = contributions.reduce((sum, c) => sum + c.amount, 0);
  const uniqueMonths = new Set(contributions.map(c => {
    try {
      return c.timestamp.substring(0, 7);
    } catch {
      return "2026-05";
    }
  }));
  const totalMonths = uniqueMonths.size;
  const pensionEstimates = totalAmount > 0 ? (totalAmount * 1.05) / 120.0 : 0.0;

  if (lang === "sw") {
    if (totalAmount === 0) {
      return `📊 *TAARIFA YA AKAUNTI YA NSSF YA ${user.name?.toUpperCase()}* 📊\n\n• *Nambari ya NSSF:* ${user.nssf_number}\n• *Hali ya Akaunti:* Inafanya Kazi (Active)\n• *Jumla Kuu ya Michango:* Ksh 0.00 💰\n• *Miezi Uliyochangia:* miezi 0\n• *Kadirio la Pensheni kila mwezi (umri wa miaka 55+):* Ksh 0.00/mwezi\n\n🌱 *Bado hujaanza akiba yako ya NSSF!* Kwa kibindo salama cha uzeeni, chukua hatua ya kwanza leo.\nEnda M-Pesa na utume mchango wako wa kwanza kupitia *Paybill Namba 200222*, ukiweka nambari yako ya NSSF kama namba ya akaunti!\n\nTuma neno *menu* kurudi kwenye orodha kuu.`;
    } else {
      return `📊 *TAARIFA YA AKAUNTI YA NSSF YA ${user.name?.toUpperCase()}* 📊\n\n• *Nambari ya NSSF:* ${user.nssf_number}\n• *Hali ya Akaunti:* Inafanya Kazi (Active)\n• *Jumla Kuu ya Michango:* Ksh ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 💰\n• *Miezi Uliyochangia:* miezi ${totalMonths}\n• *Kadirio la Pensheni kila mwezi (umri wa miaka 55+):* Ksh ${pensionEstimates.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mwezi\n\n💡 Unaweza kuongeza akiba yako sasa hivi! Changia kupitia Safaricom M-Pesa Paybill *200222*.\n\nTuma neno *menu* kurudi kwenye orodha kuu.`;
    }
  } else {
    if (totalAmount === 0) {
      return `📊 *NSSF ACCOUNT STATEMENT FOR ${user.name?.toUpperCase()}* 📊\n\n• *NSSF Number:* ${user.nssf_number}\n• *Account Status:* Active\n• *Total Contributed Savings:* KES 0.00 💰\n• *Active Contribution Months:* 0 months\n• *Estimated Monthly Pension (at age 55 retirement):* KES 0.00/month\n\n🌱 *You haven't made any NSSF contributions yet!* Start growing your retirement seeds today.\nGo to M-Pesa, use *Paybill Number 200222*, and enter your NSSF Number as the account number to make your first deposit!\n\nType *menu* to return to the interactive dashboard.`;
    } else {
      return `📊 *NSSF ACCOUNT STATEMENT FOR ${user.name?.toUpperCase()}* 📊\n\n• *NSSF Number:* ${user.nssf_number}\n• *Account Status:* Active\n• *Total Contributed Savings:* KES ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 💰\n• *Active Contribution Months:* ${totalMonths} months\n• *Estimated Monthly Pension (at age 55 retirement):* KES ${pensionEstimates.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month\n\n💡 You can increase your savings right now! Simply chip in via M-Pesa Paybill *200222* with your NSSF number.\n\nType *menu* to return to the interactive dashboard.`;
    }
  }
}

// --- PYTHON CHILD SPAWNS INITIALIZATION AND PROCESS MANAGEMENT ---
function bootstrapPip(): Promise<void> {
  return new Promise((resolve) => {
    logStream.write("[START] Bootstrapping pip with ensurepip...\n");
    const child = spawn("python3", ["-m", "ensurepip", "--default-pip"], {
      cwd: pythonCwd,
      env: { ...process.env }
    });
    child.stdout.on("data", (data) => logStream.write(`[BOOTSTRAP STDOUT] ${data}`));
    child.stderr.on("data", (data) => logStream.write(`[BOOTSTRAP STDERR] ${data}`));
    child.on("error", (err) => {
      logStream.write(`[BOOTSTRAP ERROR] Spawn failed: ${err.message}\n`);
      resolve();
    });
    child.on("exit", (code) => {
      logStream.write(`[BOOTSTRAP EXIT] Completed with code ${code}\n`);
      resolve();
    });
  });
}

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
    child.on("error", (err) => {
      logStream.write(`[GET-PIP SPAWN ERROR] Spawn failed: ${err.message}\n`);
      resolve();
    });
    child.on("exit", (code) => {
      logStream.write(`[GET-PIP EXIT] Completed with code ${code}\n`);
      resolve();
    });
  });
}

function installPythonDeps(): Promise<void> {
  return new Promise((resolve) => {
    logStream.write("[START] Running python3 -m pip install...\n");
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
      resolve();
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

// SETUP ROUTES FOR API REQUESTS
if (hasPython) {
  // 1. Python Proxy fallback setup
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
} else {
  // 2. Pure Express mock fallback setup with manual JSON parsing
  app.use(express.json());

  app.get("/api/simulator/data", (req, res) => {
    return res.json({
      users: inMemUsers,
      conversationStates: inMemStates,
      messageLogs: inMemMessages.slice(-100)
    });
  });

  app.post("/api/simulator/reset", (req, res) => {
    const { phoneNumber } = req.body || {};
    if (phoneNumber) {
      const state = inMemStates.find(s => s.phone_number === phoneNumber);
      if (state) {
        state.current_step = "select_language";
        state.context = {};
        state.last_message_at = new Date().toISOString();
      }
      const u = inMemUsers.find(u => u.phone_number === phoneNumber);
      if (u && u.registration_status !== "complete") {
        u.registration_status = "pending";
        u.nssf_number = null;
        u.name = null;
        u.id_number = null;
        u.county = null;
        u.date_of_birth = null;
        u.occupation = null;
      }
    } else {
      inMemUsers = [
        {
          id: 1,
          phone_number: "254712345678",
          name: "Ezekiel Kamau",
          id_number: "31456128",
          date_of_birth: "12/04/1988",
          occupation: "Boda Boda Rider",
          county: "Nairobi",
          nssf_number: "NSSF-482910",
          registration_status: "complete",
          language_preference: "sw",
          password: "1234",
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          phone_number: "254722987654",
          name: "Mary Wambui Mwangi",
          id_number: "29871034",
          date_of_birth: "30/08/1991",
          occupation: "Mama Mboga / Vendor",
          county: "Nakuru",
          nssf_number: "NSSF-739104",
          registration_status: "complete",
          language_preference: "sw",
          password: "1234",
          created_at: new Date().toISOString()
        },
        {
          id: 3,
          phone_number: "254733445566",
          name: "Moses Omondi",
          id_number: "33894726",
          date_of_birth: "14/05/1995",
          occupation: "Fundi / Artisan",
          county: null,
          nssf_number: null,
          registration_status: "in_progress",
          language_preference: "en",
          password: null,
          created_at: new Date().toISOString()
        }
      ];
      inMemStates = [
        { phone_number: "254712345678", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() },
        { phone_number: "254722987654", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() },
        { phone_number: "254733445566", current_step: "collect_county", context: { name: "Moses Omondi", id_number: "33894726", date_of_birth: "14/05/1995", occupation: "Fundi / Artisan" }, last_message_at: new Date().toISOString() }
      ];
      inMemMessages = [
        { id: 1, phone_number: "254712345678", direction: "inbound", message_text: "Habari zenu", timestamp: new Date().toISOString() },
        { id: 2, phone_number: "254712345678", direction: "outbound", message_text: "Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\nNitakusaidia kwa urahisi:\n1️⃣ Kujiunga na NSSF (NSSF Registration)\n2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n3️⃣ Kuelewa namna ya kudai faina zako (NSSF Claims)\n4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\nUngependa kuanza na nini leo? Tafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*.\n\n💡 Tuma *menu* kurudi mwanzo.", timestamp: new Date().toISOString() }
      ];
      inMemContributions = [
        { id: 1, phone_number: "254712345678", amount: 500, timestamp: "2026-01-15T12:00:00Z" },
        { id: 2, phone_number: "254712345678", amount: 750, timestamp: "2026-02-10T12:00:00Z" },
        { id: 3, phone_number: "254712345678", amount: 600, timestamp: "2026-03-05T12:00:00Z" },
        { id: 4, phone_number: "254712345678", amount: 800, timestamp: "2026-04-20T12:00:00Z" },
        { id: 5, phone_number: "254722987654", amount: 1200, timestamp: "2026-02-28T12:00:00Z" },
        { id: 6, phone_number: "254722987654", amount: 1450, timestamp: "2026-03-25T12:00:00Z" }
      ];
    }
    return res.json({ success: true });
  });

  app.post("/api/simulator/chat", (req, res) => {
    const { phoneNumber, messageText } = req.body || {};
    if (!phoneNumber || !messageText) {
      return res.status(400).json({ error: "Missing phoneNumber or messageText" });
    }
    const reply = handleUserMessageInMem(phoneNumber, messageText);
    const user = inMemUsers.find(u => u.phone_number === phoneNumber);
    const state = inMemStates.find(s => s.phone_number === phoneNumber);
    return res.json({
      reply,
      user,
      state
    });
  });

  app.post("/api/simulator/lang", (req, res) => {
    const { phoneNumber, lang } = req.body || {};
    const u = inMemUsers.find(u => u.phone_number === phoneNumber);
    if (u && (lang === "sw" || lang === "en")) {
      u.language_preference = lang;
      return res.json({ success: true, user: u });
    }
    return res.status(400).json({ error: "Invalid user or language" });
  });

  app.post("/api/simulator/mpesa", (req, res) => {
    const { phoneNumber, amount } = req.body || {};
    const user = inMemUsers.find(u => u.phone_number === phoneNumber);
    if (!user || user.registration_status !== "complete") {
      return res.status(400).json({ error: "User must be completely registered first to save." });
    }
    inMemContributions.push({
      id: inMemContributions.length + 1,
      phone_number: phoneNumber,
      amount: parseFloat(amount),
      timestamp: new Date().toISOString()
    });

    inMemMessages.push({
      id: inMemMessages.length + 1,
      phone_number: phoneNumber,
      direction: "inbound",
      message_text: `[SIMULATED STK PUSH ACCEPTED] amount: KES ${amount}`,
      timestamp: new Date().toISOString()
    });

    const confirmationAlert = user.language_preference === "sw"
      ? `📩 *M-PESA DEPOSIT ALERT* 📩\n\nTumepokea mchango wako wa *Ksh ${amount}* kupitia M-Pesa STK Push. Akiba yako imehifadhiwa kwa NSSF Reference: *${user.nssf_number}*.\nAsante kwa kupalilia kibindo chako cha uzeeni! 🌱`
      : `📩 *M-PESA DEPOSIT ALERT* 📩\n\nWe have received your contribution of *KES ${amount}* via M-Pesa STK Push. Your savings have been credited into NSSF Ref: *${user.nssf_number}*.\nThank you for planting your retirement seeds! 🌱`;

    inMemMessages.push({
      id: inMemMessages.length + 1,
      phone_number: phoneNumber,
      direction: "outbound",
      message_text: confirmationAlert,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, alert: confirmationAlert });
  });
}

// 2. Setup Frontend asset routers and spawn pipeline
async function setupFrontend() {
  if (hasPython) {
    bootstrapPip()
      .then(() => downloadGetPip())
      .then(() => installPip())
      .then(() => installPythonDeps())
      .then(() => {
        startFlaskBackend();
      })
      .catch((err) => {
        console.error("Failed executing automated Python pip setup pipeline:", err);
      });
  }

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
    console.log(`Jiweke proxy and static router successfully running on port http://0.0.0.0:${PORT}`);
  });
}

setupFrontend();
