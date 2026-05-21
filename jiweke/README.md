# Jiweke — NSSF WhatsApp AI Assistant 🏛️🇰🇪

Jiweke (Swahili for *"set yourself up"*) is a complete, production-ready WhatsApp chatbot application built to help Kenyan informal sector workers register with the National Social Security Fund (NSSF), check savings balances, and learn about benefit claims processes in simple English and Swahili.

The Kenyan informal sector represents millions of hardworking citizens including boda boda riders, mama mbogas, hawkers, fundis, and casual laborers who often lack access to digital pension registration tools. Jiweke bridges this digital divide by offering a simple, automated conversational experience over WhatsApp—allowing workers to secure their retirement easily without visiting official offices or using complex web forms.

---

## 🚀 Key Features

*   **Bilingual Swahili & English State Machine:** Context-aware language translation automatically responding to user syntax.
*   **Step-by-Step NSSF Registration:** Collects, cleans, and validates registration details (Name, National ID, DOB 18+, Occupation, County, M-Pesa Phone).
*   **Balance & Statement Inquiry:** Keeps track of active saving months, total accumulated cash, and pension forecast calculations.
*   **Benefits Claims Navigator:** Walks beneficiaries through the criteria and documents needed for Retirement, Invalidity, and Survivors' benefits.
*   **AI Conversational Agent:** Connects with Anthropic Claude API (Claude-3.5-Sonnet) to answer user general questions regarding social security regulations, employer matches, and late payment interests.
*   **M-Pesa STK Push Scaffold:** Scaffolds Safaricom's Daraja API STK Push payments to let workers fund their retirement directly on their phones.

---

## 🛠️ Prerequisites

Before running the application, make sure you have:

1.  **Python 3.12+** installed on your system.
2.  An active **Meta Developer Account** with a WhatsApp Business Cloud API App configured.
3.  An **Anthropic Claude API Key** (for smart social security answers).
4.  **ngrok** installed on your machine to expose your localhost port `5000` to Meta's servers.

---

## 📦 Step-by-Step Local Setup

1.  **Extract or Clone the codebase:**
    Make sure you have all files in your working directory.

2.  **Create a virtual environment and activate it:**
    ```bash
    # Create environment
    python -m venv venv
    
    # Activate on Linux/macOS
    source venv/bin/activate
    
    # Activate on Windows
    venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Set up Environment Variables:**
    Copy `.env.example` to `.env` and fill in your keys:
    ```bash
    cp .env.example .env
    ```
    Open `.env` in a text editor and enter your secret parameters:
    *   `FLASK_SECRET_KEY`: A random password for security sessions.
    *   `ANTHROPIC_API_KEY`: Your real Anthropic Developer API Key starting with `sk-ant`.
    *   `WHATSAPP_TOKEN`: Meta permanent system user token.
    *   `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp sandboxed or live phone number ID.
    *   `WHATSAPP_VERIFY_TOKEN`: A private custom string (e.g. `jiweke-verify-token-2024`) that matches what you type into the Meta Developer Console.

---

## 🌐 Exposing Localhost to WhatsApp (ngrok)

Meta's servers require an encrypted public URL (`https://...`) to send live webhook notifications about new WhatsApp texts. Expose your local Flask port `5000` using ngrok:

```bash
ngrok http 5000
```

Once running, ngrok will display a forwarding line in your terminal looking like:
`Forwarding  https://a1b2-34-56-78.ngrok-free.app -> http://localhost:5000`

**Save this HTTPS forwarding address for the next step!**

---

## 🔗 Configuring WhatsApp Webhook on Meta Developer Console

1.  Navigate to your [Meta Developers Portal](https://developers.facebook.com/) and open your **WhatsApp Business API Application**.
2.  Under the sidebar menu, click on **WhatsApp** -> **Configuration**.
3.  Locate the **Webhook** section and click **Edit**.
4.  Fill out the popup parameters:
    *   **Callback URL:** Paste your ngrok HTTPS forwarding address followed by the `/webhook` path, e.g., `https://a1b2-34-56-78.ngrok-free.app/webhook`
    *   **Verify Token:** Paste the exact same string configured as `WHATSAPP_VERIFY_TOKEN` inside your local `.env` file (e.g., `jiweke-verify-token-2024`).
5.  Click **Verify and Save**. (Flask must be running in the background for this verification handshake to succeed!)
6.  Once verified, locate **Webhook fields** on the configuration screen, look for **messages**, and click **Subscribe** to start receiving incoming alerts.

---

## 🏃 Running the Application

Start the local Flask development server:

```bash
python run.py
```

The database SQLite file `jiweke.db` is built automatically inside your root folder during startup, creating the `users`, `conversation_states`, and `messages` tables.

---

## 🧪 Testing the Bot

1.  Open WhatsApp on your mobile phone.
2.  Send any text (e.g. *"Sasa"* or *"Hello"*) to your configured Meta Sandboxed/Official test phone number.
3.  The Jiweke Chatbot will greet you in your preferred language!
4.  Type **1** to test the entire registration flow, **2** to check balance statements, and **3** to get guided on benefit claims.
5.  Type any general questions like *"Kuna riba gani uzeeni?"* to verify Claude's social security compliance.
6.  Type **menu** at any time to return to dashboard choices.

---

## ☁️ Deployment Notes (Railway or Render)

To ship Jiweke to production using a cloud provider (e.g. Render, Railway):

### Prepare PostgreSQL Production Database
Instead of local SQLite, configure a PostgreSQL database hosting instance. Change your `DATABASE_URL` environment parameter inside production settings:
`DATABASE_URL=postgresql://user:password@host:port/database`

### Setup Start Command
Both Render and Railway parse your Python projects and boot them with Gunicorn. Configure your deployment Start Command to:
`gunicorn run:app`

### Set Production Environment Variables
Paste all key-value secrets (e.g. `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, etc.) inside the provider's Environmental Dashboard, making sure `DEBUG` is set to `False`.
