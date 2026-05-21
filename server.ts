import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini SDK with telemetry and AI Studio key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Configure system instructions for NSSF Knowledge questions
const JIWEKE_SYSTEM_INSTRUCTION = `You are Jiweke, a friendly and patient WhatsApp assistant helping Kenyan informal sector workers — boda boda riders, mama mbogas, hawkers, fundis and other self-employed people — understand and register with Kenya's National Social Security Fund (NSSF).

Your personality:
- Warm, encouraging, and simple
- Use short sentences — no long paragraphs
- Use emojis sparingly to make messages friendly
- Never use complex financial jargon
- If the user writes in Swahili, respond in Swahili
- If the user writes in English, respond in English
- If mixed, match the dominant language

Your knowledge:
- NSSF contribution rate is 6% of salary (employer matches 6%)
- Voluntary contributors can pay as little as KES 50 at a time
- Contributions go to Paybill 200222 on M-Pesa
- Benefits include: retirement (age 55), invalidity, survivors, withdrawal (age 50), emigration
- Penalties for employers: 5% on unpaid amount + 1% monthly interest
- NSSF Self Service Portal: selfservice.nssf.or.ke
- NSSF helpline: 0800 720 455 (toll free)
- Latest contribution rates (2026): Tier I up to KES 9,000 salary, Tier II up to KES 108,000

CRITICAL REQUIREMENT ON CHECKING BALANCE:
- DO NOT tell active/general users to dial *303# or use any other external USSD code or portals to check their balance.
- INSTEAD, instruct them that they can check their actual NSSF balance directly in this WhatsApp conversation right now! Let them know they should just reply with '2' or find the balance option or write 'balance' in the chat to see their live statement immediately.

Always stay on topic — NSSF, retirement savings, and social security in Kenya. If asked about unrelated topics, gently redirect.`;

// In-memory dynamic database for the Simulator
interface MockUser {
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

interface ConversationState {
  phone_number: string;
  current_step: string;
  context: Record<string, any>;
  last_message_at: string;
}

interface MessageLog {
  id: number;
  phone_number: string;
  direction: "inbound" | "outbound";
  message_text: string;
  timestamp: string;
}

// Global lists of 47 Kenyan Counties and Occupations
const COUNTIES_LIST = [
  "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita/Taveta", "Garissa", "Wajir", "Mandera", 
  "Marsabit", "Isolo", "Meru", "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni", "Nyandarua", 
  "Nyeri", "Kirinyaga", "Murang'a", "Kiambu", "Turkana", "West Pokot", "Samburu", "Trans Nzoia", 
  "Uasin Gishu", "Elgeyo/Marakwet", "Nandi", "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado", 
  "Kericho", "Bomet", "Kakamega", "Vihiga", "Bungoma", "Busia", "Siaya", "Kisumu", "Homa Bay", 
  "Migori", "Kisii", "Nyamira", "Nairobi"
];

const OCCUPATIONS_MAP: Record<string, string> = {
  "1": "Boda Boda Rider",
  "2": "Mama Mboga / Vendor",
  "3": "Fundi / Artisan",
  "4": "Hawker / Small Trader",
  "5": "House Help / Domestic worker",
  "6": "Farmer",
  "7": "Other Informal Sector Worker"
};

// Seed initial database state with realistic profiles
let mockUsers: MockUser[] = [
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
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
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
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 3,
    phone_number: "254733445566",
    name: "Moses Omondi",
    id_number: "33894726",
    date_of_birth: "14/05/1995",
    occupation: "Fundi / Artisan",
    county: "Kisumu",
    nssf_number: null,
    registration_status: "in_progress",
    language_preference: "en",
    password: null,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];

let conversationStates: Record<string, ConversationState> = {
  "254712345678": {
    phone_number: "254712345678",
    current_step: "main_menu",
    context: {},
    last_message_at: new Date().toISOString()
  },
  "254722987654": {
    phone_number: "254722987654",
    current_step: "main_menu",
    context: {},
    last_message_at: new Date().toISOString()
  },
  "254733445566": {
    phone_number: "254733445566",
    current_step: "collect_county",
    context: {
      name: "Moses Omondi",
      id_number: "33894726",
      date_of_birth: "14/05/1995",
      occupation: "Fundi / Artisan"
    },
    last_message_at: new Date().toISOString()
  }
};

let messageLogs: MessageLog[] = [
  {
    id: 1,
    phone_number: "254712345678",
    direction: "inbound",
    message_text: "Habari zenu",
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  },
  {
    id: 2,
    phone_number: "254712345678",
    direction: "outbound",
    message_text: "Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya...",
    timestamp: new Date(Date.now() - 29 * 60 * 1000).toISOString()
  }
];

let messageIdCounter = 3;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Fetch simulator data for the Dashboard
  app.get("/api/simulator/data", (req, res) => {
    res.json({
      users: mockUsers,
      conversationStates: Object.values(conversationStates),
      messageLogs: messageLogs.slice(-100) // limit to last 100 for safety
    });
  });

  // API Route: Reset database simulation state
  app.post("/api/simulator/reset", (req, res) => {
    const { phoneNumber } = req.body;
    if (phoneNumber) {
      // Reset specific user's conversation state
      if (conversationStates[phoneNumber]) {
        conversationStates[phoneNumber] = {
          phone_number: phoneNumber,
          current_step: "select_language",
          context: {},
          last_message_at: new Date().toISOString()
        };
      }
      const user = mockUsers.find(u => u.phone_number === phoneNumber);
      if (user && user.registration_status !== "complete") {
        user.registration_status = "pending";
        user.nssf_number = null;
        user.name = null;
        user.id_number = null;
        user.county = null;
        user.date_of_birth = null;
        user.occupation = null;
      }
    } else {
      // Global reset
      mockUsers = mockUsers.map(u => {
        if (u.id > 2) { // keep Ezekiel and Mary complete as demo anchors
          return {
            ...u,
            name: null,
            id_number: null,
            date_of_birth: null,
            occupation: null,
            county: null,
            nssf_number: null,
            registration_status: "pending" as const
          };
        }
        return u;
      });
      conversationStates = {
        "254712345678": { phone_number: "254712345678", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() },
        "254722987654": { phone_number: "254722987654", current_step: "main_menu", context: {}, last_message_at: new Date().toISOString() }
      };
      messageLogs = [
        {
          id: 1,
          phone_number: "254712345678",
          direction: "inbound",
          message_text: "Sasa",
          timestamp: new Date().toISOString()
        }
      ];
      messageIdCounter = 2;
    }
    res.json({ success: true });
  });

  // API Route: Handle chat interaction simulated webhook!
  app.post("/api/simulator/chat", async (req, res) => {
    const { phoneNumber, messageText } = req.body;
    if (!phoneNumber || !messageText) {
      return res.status(400).json({ error: "Missing phoneNumber or messageText" });
    }

    const trimmedMsg = messageText.trim();

    // 1. Log inbound message
    const inboundMsg: MessageLog = {
      id: messageIdCounter++,
      phone_number: phoneNumber,
      direction: "inbound",
      message_text: trimmedMsg,
      timestamp: new Date().toISOString()
    };
    messageLogs.push(inboundMsg);

    // 2. Fetch or create user
    let user = mockUsers.find(u => u.phone_number === phoneNumber);
    if (!user) {
      // detect initial language
      const firstWord = trimmedMsg.toLowerCase();
      let langPreference: "sw" | "en" = "sw";
      if (/\b(hello|hi|how|register|balance|help|en)\b/i.test(firstWord)) {
        langPreference = "en";
      }
      user = {
        id: mockUsers.length + 1,
        phone_number: phoneNumber,
        name: null,
        id_number: null,
        date_of_birth: null,
        occupation: null,
        county: null,
        nssf_number: null,
        registration_status: "pending",
        language_preference: langPreference,
        password: null,
        created_at: new Date().toISOString()
      };
      mockUsers.push(user);
    }

    // 3. Get or create conversation state
    let state = conversationStates[phoneNumber];
    if (!state) {
      state = {
        phone_number: phoneNumber,
        current_step: "select_language",
        context: {},
        last_message_at: new Date().toISOString()
      };
      conversationStates[phoneNumber] = state;
    }

    // Intercept registered users who need logging in
    const isLoginStep = ["login_id", "login_password"].includes(state.current_step);
    if (user.registration_status === "complete" && !state.context.authenticated && !isLoginStep) {
      state.current_step = "login_id";
      state.context = {};
      const lang = user.language_preference;
      const welcomePrompt = lang === "sw"
        ? "Karibu tena kwenye Jiweke! 👋 Ili kupata huduma zako za NSSF, tafadhali andika *Nambari yako ya Kitambulisho cha Taifa* (National ID Number) kama jina lako la mtumiaji (username):"
        : "Welcome back to Jiweke! 👋 To access your NSSF services, please type your *National ID Card Number* as your username:";

      const outboundMsg: MessageLog = {
        id: messageIdCounter++,
        phone_number: phoneNumber,
        direction: "outbound",
        message_text: welcomePrompt,
        timestamp: new Date().toISOString()
      };
      messageLogs.push(outboundMsg);

      state.last_message_at = new Date().toISOString();

      return res.json({
        reply: welcomePrompt,
        user,
        state
      });
    }

    // 4. Global fallback keys
    const lowerMsg = trimmedMsg.toLowerCase();
    if (["menu", "help", "msaada", "nyumbani", "mwanzo", "reset", "cancel", "r"].includes(lowerMsg)) {
      // In case they are logged in, allow them to navigate. If they are not logged in, they are blocked by the interceptor above anyway.
      state.current_step = "main_menu";
      state.context = { authenticated: state.context.authenticated };
    }

    // Intercept balance queries if the user isn't in a strict multi-step form entry flow
    const isRegistrationStep = [
      "collect_name", "collect_id", "collect_dob", "collect_occupation", "collect_county", "collect_password", "confirm_details"
    ].includes(state.current_step);

    const balanceKeywords = [
      "balance", "salio", "check balance", "current balance", "show balance", "check my balance",
      "statement", "account statement", "my statement", "how much", "savings balance", "saving balance",
      "pension balance", "angalia salio", "salio langu", "taarifa ya akaunti", "taarifa ya salio",
      "kujua salio", "pata salio", "nssf balance"
    ];
    const isBalanceRequest = balanceKeywords.some(kw => lowerMsg.includes(kw)) || lowerMsg === "2";

    if (!isRegistrationStep && isBalanceRequest) {
      state.current_step = "main_menu";
      state.context = {};
    }

    // 5. Run the state machine logic
    let replyText = "";
    const lang = user.language_preference;

    if (state.current_step === "login_id") {
      const cleanId = trimmedMsg.replace(/\D/g, "");
      if (cleanId === user.id_number) {
        state.current_step = "login_password";
        replyText = lang === "sw"
          ? "Nambari yako ya Kitambulisho imethibitishwa vyema! ✔️\n\n👉 Sasa, tafadhali andika *Nenosiri (Password)* lako la siri ili kuingia kwenye huduma zako za NSSF:"
          : "Your National ID Number has been successfully verified! ✔️\n\n👉 Now, please type your *Password* to access NSSF services:";
      } else {
        replyText = lang === "sw"
          ? "⚠️ Kitambulisho hicho hakilingani na akaunti yako ya nambari hii. Tafadhali andika Kitambulisho chako sahihi:"
          : "⚠️ That National ID does not match the registered account for this phone number. Please enter your correct ID:";
      }
    }
    else if (state.current_step === "login_password") {
      const expectedPassword = user.password || "1234";
      if (trimmedMsg === expectedPassword) {
        state.context.authenticated = true;
        state.current_step = "main_menu";
        replyText = lang === "sw"
          ? `Mambo sawa! Umeingia kikamilifu kwenye akaunti yako ya Jiweke. 🔓\n\n${getMenuMessageString(lang)}`
          : `Success! You have successfully logged into your Jiweke account. 🔓\n\n${getMenuMessageString(lang)}`;
      } else {
        replyText = lang === "sw"
          ? "⚠️ Nenosiri lako si sahihi. Tafadhali jaribu tena:"
          : "⚠️ Incorrect password. Please try again:";
      }
    }
    else if (state.current_step === "greeting" || state.current_step === "select_language") {
      const lowerArg = trimmedMsg.toLowerCase();
      if (["1", "english", "en"].includes(lowerArg)) {
        user.language_preference = "en";
        state.current_step = "main_menu";
        replyText = getMenuMessageString("en");
      } else if (["2", "kiswahili", "sw", "kiswahili"].includes(lowerArg)) {
        user.language_preference = "sw";
        state.current_step = "main_menu";
        replyText = getMenuMessageString("sw");
      } else {
        state.current_step = "select_language";
        replyText = "Karibu Jiweke! 👋 Tafadhali chagua lugha ya kuendelea (Please choose a language to continue):\n\n1️⃣ English\n2️⃣ Kiswahili";
      }
    } 
    else if (state.current_step === "main_menu") {
      if (trimmedMsg === "1") {
        state.current_step = "collect_name";
        state.context = { reg_started: true };
        replyText = lang === "sw" 
          ? "Safi sana! Hebu nikuandikishe sasa hiyi ili uanze kujiwekea akiba ya uzeeni. 🏛️\n\n👉 Tafadhali andika *Majina yako kamili* (majina mawili au zaidi kama yaliyo kwenye Kitambulisho chako cha Taifa):"
          : "Excellent choice! Let's get you registered right now to start securing your retirement. 🏛️\n\n👉 Please type your *Full Name* (at least two names as they appear on your National ID Card):";
      } 
      else if (trimmedMsg === "2" || isBalanceRequest) {
        state.current_step = "main_menu";
        replyText = getBalanceString(user, lang);
      } 
      else if (trimmedMsg === "3") {
        state.current_step = "claim_guidance";
        replyText = lang === "sw"
          ? "Karibu kwenye mwongozo wa madai ya NSSF. 📋\nChagua aina ya faida unayotaka kuielewa zaidi:\n\n1️⃣ Faida ya Uzeeni (Retirement Benefit - miaka 55+)\n2️⃣ Faida ya Walemavu (Invalidity Benefit - ulemavu)\n3️⃣ Faida ya Warithi (Survivors Benefit - kwa familia)\n4️⃣ Kurudi kwenye orodha kuu (Main Menu)\n\nJibu kwa kutuma nambari *1*, *2*, *3* au *4*."
          : "Welcome to the NSSF claims helper. 📋\nSelect the category of benefits you want to learn about:\n\n1️⃣ Retirement Benefit (Age 55+ or early age 50)\n2️⃣ Invalidity Benefit (For permanent physical/mental disability)\n3️⃣ Survivors Benefit (For dependents of a deceased member)\n4️⃣ Go back to Main Menu\n\nReply with *1*, *2*, *3* or *4*.";
      } 
      else if (trimmedMsg === "4") {
        replyText = lang === "sw"
          ? "Mimi ni mtaalamu wa mambo yote ya NSSF! 🧠\nUnaweza kuniuliza maswali yoyote uliyo nayo. Mathalani:\n• _Kuna adhabu gani nikichelewa kulipa?_\n• _Je, asilimia 6 inatolewaje kwa mfanyakazi nchini Kenya?_\n• _NSSF ni kodi au kibindo cha akiba?_\n\nTafadhali andika swali lako sasa hivi kwa Kiswahili au Kiingereza, nami nitakujibu kwa undani mchezo mchezo!"
          : "I am an expert in everything NSSF! 🧠\nAsk me any general questions you have, such as:\n• _What are the penalties for late contributions?_\n• _How is the 6% rate calculated?_\n• _Is NSSF a tax or a personal savings account?_\n\nGo ahead and type your question now in English or Swahili, and I will gladly answer it!";
      } 
      else {
        // Fallback for general conversation / NSSF knowledge Q&A powered by Gemini!
        replyText = await queryGeminiChat(trimmedMsg, state.current_step);
      }
    }
    else if (state.current_step === "collect_name") {
      const names = trimmedMsg.split(/\s+/);
      if (names.length < 2) {
        replyText = lang === "sw"
          ? "⚠️ Tafadhali andika majina yako mawili kamili ili tuendelee (Majina yasipungue mawili):"
          : "⚠️ Please verify you typed your full official name. Enter at least two names:";
      } else {
        state.context.name = trimmedMsg;
        state.current_step = "collect_id";
        replyText = lang === "sw"
          ? `Asante ${trimmedMsg}! Sasa,\n\n👉 Tafadhali andika *Nambari ya Kitambulisho chako cha Taifa* (National ID Number, tarakimu 7 hadi 8):`
          : `Thank you, ${trimmedMsg}! Now,\n\n👉 Please type your *National ID Card Number* (should be 7 to 8 digits long):`;
      }
    }
    else if (state.current_step === "collect_id") {
      const cleanId = trimmedMsg.replace(/\D/g, "");
      if (cleanId.length < 7 || cleanId.length > 8) {
        replyText = lang === "sw"
          ? "⚠️ Kitambulisho cha Taifa lazima kiwe na tarakimu (namba) 7 au 8. Tafadhali andika nambari sahihi:"
          : "⚠️ A valid Kenya National ID should contain 7 or 8 digits. Please enter a valid one:";
      } else {
        state.context.id_number = cleanId;
        state.current_step = "collect_dob";
        replyText = lang === "sw"
          ? "Kazi nzuri! Sasa,\n\n👉 Tafadhali andika *Tarehe yako ya Kuzaliwa* kwa mfumo huu:\n *DD/MM/YYYY* (kwa mfano, kama ulizaliwa Tarehe 15, mwezi wa 8, 1994, andika *15/08/1994*):"
          : "Perfect. Next,\n\n👉 Please provide your *Date of Birth* in the following format:\n *DD/MM/YYYY* (e.g. if you were born on August 15, 1994, type *15/08/1994*):";
      }
    }
    else if (state.current_step === "collect_dob") {
      const dobMatch = trimmedMsg.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!dobMatch) {
        replyText = lang === "sw"
          ? "⚠️ Tarehe isiyo sahihi. Tafadhali andika tarehe yako ya kuzaliwa kwa kutumia alama ya kukata (/) kama hivi: *DD/MM/YYYY* (kwa mfano *24/11/1997*):"
          : "⚠️ Invalid format. Please write your date of birth using slashes in the exact format: *DD/MM/YYYY* (e.g. *24/11/1997*):";
      } else {
        const year = parseInt(dobMatch[3], 10);
        const age = 2026 - year;
        if (age < 18) {
          replyText = lang === "sw"
            ? "⚠️ Samahani, lazima uwe na umri wa miaka 18 au zaidi kujiandikisha na NSSF. Tafadhali thibitisha tarehe:"
            : "⚠️ Sorry, you must be 18 years or older to register for an NSSF savings account. Please verify your age:";
        } else {
          state.context.date_of_birth = trimmedMsg;
          state.current_step = "collect_occupation";
          replyText = lang === "sw"
            ? "Umefanya vizuri sana! Sasa tungependa kujua kazi unayofanya ili tushughulikie faili yako vizuri. 💼\n\nChagua nambari moja ya kazi yako hapa chini:\n1️⃣ Boda boda Rider (Mwendesha Pikipiki)\n2️⃣ Mama Mboga / Vendor (Muuzaji wa Chakula/Groceries)\n3️⃣ Fundi / Artisan (Mjenzi, Seremala, Tailor n.k)\n4️⃣ Hawker / Retail Trader (Muuzaji wa barabarani)\n5️⃣ House Help (Mfanyikazi wa nyumbani)\n6️⃣ Farmer (Mkulima/Mfugaji)\n7️⃣ Kazi nyinginezo (Other Worker)\n\nJibu kwa kutuma namba *1*, *2*, *3*, *4*, *5*, *6*, au *7*:"
            : "Excellent. Next, we would love to know what work you do to register your account profile accurately. 💼\n\nChoose one number corresponding to your occupation below:\n1️⃣ Boda boda Rider\n2️⃣ Mama Mboga / Groceries Vendor\n3️⃣ Fundi / Artisan (Mason, Carpenter, Tailor, Painter etc)\n4️⃣ Hawker / Street Retailer\n5️⃣ House Help / Domestic Aide\n6️⃣ Farmer / Agro-producer\n7️⃣ Other Informal Worker\n\nReply with *1*, *2*, *3*, *4*, *5*, *6*, or *7*:";
        }
      }
    }
    else if (state.current_step === "collect_occupation") {
      if (!OCCUPATIONS_MAP[trimmedMsg]) {
        replyText = lang === "sw"
          ? "⚠️ Tafadhali chagua namba halali kuanzia *1* hadi *7* kulingana na orodha ya kazi:"
          : "⚠️ Please reply with a valid number from *1* to *7* corresponding to the listed occupations:";
      } else {
        state.context.occupation = OCCUPATIONS_MAP[trimmedMsg];
        state.current_step = "collect_county";
        replyText = lang === "sw"
          ? "Safi sana! Unafanya kazi katika Kaunti gani ya uendeshaji nchini Kenya? 📍\n\n👉 Tafadhali andika jina la Kaunti yako ya uendeshaji moja kwa moja (kwa mfano, Nairobi):"
          : "Great! In which County of operations do you work in Kenya? 📍\n\n👉 Please type your County of operations directly (e.g., Nairobi):";
      }
    }
    else if (state.current_step === "collect_county") {
      let selectedCounty = trimmedMsg;
      if (/^\d+$/.test(trimmedMsg)) {
        const idx = parseInt(trimmedMsg, 10);
        if (idx >= 1 && idx <= 47) {
          selectedCounty = COUNTIES_LIST[idx - 1];
        }
      } else {
        const found = COUNTIES_LIST.find(c => c.toLowerCase() === trimmedMsg.toLowerCase());
        if (found) selectedCounty = found;
      }
      state.context.county = selectedCounty;
      state.context.mpesa_phone = phoneNumber;
      state.current_step = "collect_password";

      replyText = lang === "sw"
        ? "Imepatikana vizuri sana! Sasa, tafadhali weka nenosiri (password) lako jipya la siri ili kuongeza ulinzi kwenye akaunti yako.\n\n⚠️ *Kumbuka vyema:* Tafadhali chagua nenosiri rahisi kukumbuka kwa sababu utaliitisha kila unapotaka kuingia tena mbeleni!"
        : "Excellent, county saved! Now, please set your new secret password to protect your account security.\n\n⚠️ *Make sure to remember:* Choose a password you can easily remember, as you will be required to enter it whenever you log in from now on!";
    }
    else if (state.current_step === "collect_password") {
      state.context.password = trimmedMsg;
      state.current_step = "confirm_details";

      const maskedPassword = "*".repeat(trimmedMsg.length || 4);

      replyText = lang === "sw"
        ? `Mambo ni moto! Tumeshamaliza kukusanya data zako zote. Tafadhali kagua maelezo haya kabla sijakuandikisha rasmi: 📝\n\n👤 *Majina:* ${state.context.name}\n🆔 *Kitambulisho (National ID):* ${state.context.id_number}\n📅 *Kuzaliwa (DOB):* ${state.context.date_of_birth}\n💼 *Kazi:* ${state.context.occupation}\n📍 *Kaunti:* ${state.context.county}\n🔑 *Nenosiri la Siri:* ${maskedPassword}\n💸 *Nambari ya M-Pesa:* ${state.context.mpesa_phone}\n\nJe, maelezo haya yapo Sahihi?\n1️⃣ Ndiyo, maelezo yapo sahihi. Nihifadhi sasa\n2️⃣ Hapana, nataka kurekebisha baadhi yazo`
        : `We are almost there! We have collected all your details. Please review carefully before we finalize registration: 📝\n\n👤 *Full Name:* ${state.context.name}\n🆔 *National ID:* ${state.context.id_number}\n📅 *Date of Birth:* ${state.context.date_of_birth}\n💼 *Occupation:* ${state.context.occupation}\n📍 *County:* ${state.context.county}\n🔑 *Password:* ${maskedPassword}\n💸 *M-Pesa Phone:* ${state.context.mpesa_phone}\n\nAre these details correct?\n1️⃣ Yes, proceed with registration\n2️⃣ No, correct or restart registration`;
    }
    else if (state.current_step === "confirm_details") {
      if (trimmedMsg === "1") {
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
        state.context = { authenticated: true };

        replyText = lang === "sw"
          ? `🎉 HONGERA SANA ${user.name}! Sasa wewe ni mwanachama rasmi wa NSSF! 🎉\n\nNambari yako mpya ya NSSF ni: *${mockNssf}* 🏆\n\n📝 *Mambo ya Kukumbuka:*\n• Kiasi gani: Unaweza kuchangia kiasi kidogo sana kama *Ksh 50* kila unapoingiza kipato.\n• Akaunti sio kodi; ni fedha zako, na serikali inakuongezea faida/riba kila mwaka uzeeni!\n• Namna ya kulipa: Lipa kwa M-Pesa *Paybill Namba 200222*, Account Number ikiwa nambari yako ya NSSF.\n• Kuangalia Salio: Tuma neno *balance* kuangalia akaunti wakati wowote.`
          : `🎉 CONGRATULATIONS ${user.name}! You are now successfully registered with NSSF! 🎉\n\nYour official NSSF Registration Number is: *${mockNssf}* 🏆\n\n📝 *Important Things to Remember:*\n• This is NOT a government tax; it is your personal money which accumulates heavy compound interest!\n• You can contribute as little as *KES 50* dynamically whenever you get cash.\n• To deposit, use M-Pesa *Paybill Number 200222* with your NSSF Number as the Account Number.\n• Type *balance* to check savings totals.`;
      } 
      else if (trimmedMsg === "2") {
        state.current_step = "collect_name";
        state.context = { reg_started: true };
        replyText = lang === "sw"
          ? "Sawa, hebu tuanze kurejesha upya kwa usahihi. 🔄\n\n👉 Tafadhali andika upya *Majina yako mawili kamili* ya Kitambulisho cha Taifa:"
          : "No problem, let's restart and correct the inputs. 🔄\n\n👉 Please type your official *Full Name* once again:";
      }
      else {
        replyText = lang === "sw"
          ? "⚠️ Tafadhali chagua kwa kujibu: \n*1* (Ndiyo, nambari ipo sahihi) au \n*2* (Hapana, sahihisha):"
          : "⚠️ Please reply with either: \n*1* (Yes, details are correct) or \n*2* (No, correct details):";
      }
    }
    else if (state.current_step === "claim_guidance") {
      const nearestOffice = `NSSF Branch Office in ${user.county || "Nairobi"} County`;
      if (trimmedMsg === "1") {
        replyText = lang === "sw"
          ? `👵🧓 *Faida ya Uzeeni (Age & Retirement Benefit)*\n\nUnastahili kudai kiasi hiki ukifikia umri wa miaka 55, au miaka 50 kwa kujiuzulu mapema.\n\n📜 *Nyaraka za kuwasilisha:*\n1. Kitambulisho chako cha Kitaifa cha asili na nakala yake\n2. Kadi yako ya NSSF ya asili au Kitambulisho\n3. Nambari ya akaunti ya Benki iliyoidhinishwa na picha za pasipoti mbili\n\n📍 *Ofisi iliyo karibu:* ${nearestOffice}.\n\nTuma *menu* kurudi kwenye orodha kuu.`
          : `👵🧓 *Retirement & Age Benefit Guidance*\n\nYou are eligible to claim your accumulated savings upon attaining the retirement age of 55.\n\n📜 *Documents needed to apply:*\n1. Original National ID Card and photocopy\n2. Original NSSF Member Card/Slip\n3. Certified copy of Bank Account details and KRA PIN\n\n📍 *Nearest NSSF Branch:* ${nearestOffice}.\n\nType *menu* to return to start.`;
      }
      else if (trimmedMsg === "2") {
        replyText = lang === "sw"
          ? `♿ *Faida ya Walemavu (Invalidity Benefit)*\n\nMwanachama yeyote anayepata ulemavu wa kudumu unaomzuia kufanya kazi anaweza kudai faida hii.\n\n📜 *Nyaraka za kuwasilisha:*\n1. Ripoti rasmi ya daktari iliyothibitishwa (Medical Board)\n2. Kitambulisho chako na kadi ya NSSF\n\n📍 *Ofisi iliyo karibu:* ${nearestOffice}.\n\nTuma *menu* kurudi.`
          : `♿ *Invalidity / Physical Disability Benefit*\n\nThis benefit is payable to members who have sustained a permanent physical or mental disability.\n\n📜 *Documents needed:*\n1. Certified Medical Report from government medical officer\n2. Original National ID and NSSF Card\n\n📍 *Nearest NSSF Branch:* ${nearestOffice}.\n\nType *menu* to return.`;
      }
      else if (trimmedMsg === "3") {
        replyText = lang === "sw"
          ? `🕯️ *Faida ya Warithi (Survivors Benefit)*\n\nHulipwa kwa watu tegemezi au familia ya mwanachama aliyefariki.\n\n📜 *Inavyohitajika kudai:*\n1. Cheti cha asili cha kifo cha mwanachama (Death Certificate)\n2. Barua ya uthabisho wa chifu wa eneo hilo\n3. Vitambulisho vya warithi / tegemezi\n\n📍 *Ofisi iliyo karibu:* ${nearestOffice}.\n\nTuma *menu* kurudi kwenye orodha kuu.`
          : `🕯️ *Survivors Benefit (Deceased Member Recovery)*\n\nPayable to the dependents/family members of a deceased member.\n\n📜 *Documents required:*\n1. Original Death Certificate of the deceased member\n2. IDs and birth certificates of dependants / Chief's letter\n\n📍 *Nearest NSSF Branch:* ${nearestOffice}.\n\nType *menu* to return.`;
      }
      else if (trimmedMsg === "4") {
        state.current_step = "main_menu";
        replyText = getMenuMessageString(lang);
      }
      else {
        replyText = lang === "sw"
          ? "⚠️ Chaguo haramu. Tafadhali chagua:\n• *1* - Faida ya uzeeni\n• *2* - Faida ya ulemavu\n• *3* - Faida ya warithi\n• *4* - Kurudi Orodha Kuu."
          : "⚠️ Invalid option. Please reply with:\n• *1* for Retirement\n• *2* for Invalidity\n• *3* for Survivors\n• *4* to go back to Main Menu.";
      }
    }

    // Append footer action prompt
    if (!replyText.includes("1️⃣") && !replyText.includes("2️⃣") && !replyText.includes("👉") && !replyText.includes("Type")) {
      if (lang === "sw") {
        replyText += "\n\n💡 Tuma *menu* kurudi mwanzo.";
      } else {
        replyText += "\n\n💡 Type *menu* to return to start.";
      }
    }

    // 6. Log outbound reply
    const outboundMsg: MessageLog = {
      id: messageIdCounter++,
      phone_number: phoneNumber,
      direction: "outbound",
      message_text: replyText,
      timestamp: new Date().toISOString()
    };
    messageLogs.push(outboundMsg);

    state.last_message_at = new Date().toISOString();

    res.json({
      reply: replyText,
      user,
      state
    });
  });

  // API Route: Switch simulated language
  app.post("/api/simulator/lang", (req, res) => {
    const { phoneNumber, lang } = req.body;
    const user = mockUsers.find(u => u.phone_number === phoneNumber);
    if (user && (lang === "sw" || lang === "en")) {
      user.language_preference = lang;
      res.json({ success: true, user });
    } else {
      res.status(400).json({ error: "Invalid user or language" });
    }
  });

  // API Route: Simulator trigger M-Pesa mock transaction
  app.post("/api/simulator/mpesa", (req, res) => {
    const { phoneNumber, amount } = req.body;
    const user = mockUsers.find(u => u.phone_number === phoneNumber);
    if (!user || user.registration_status !== "complete") {
      return res.status(400).json({ error: "User resides must be completely registered first to save." });
    }

    // Log simulated M-pesa text alerts!
    const mpesaInbound: MessageLog = {
      id: messageIdCounter++,
      phone_number: phoneNumber,
      direction: "inbound",
      message_text: `[SIMULATED STK PUSH ACCEPTED] amount: KES ${amount}`,
      timestamp: new Date().toISOString()
    };
    messageLogs.push(mpesaInbound);

    const confirmationAlert = user.language_preference === "sw"
      ? `📩 *M-PESA DEPOSIT ALERT* 📩\n\nTumepokea mchango wako wa *Ksh ${amount}* kupitia M-Pesa STK Push. Akiba yako imehifadhiwa kwa NSSF Reference: *${user.nssf_number}*.\nAsante kwa kupalilia kibindo chako cha uzeeni! 🌱`
      : `📩 *M-PESA DEPOSIT ALERT* 📩\n\nWe have received your contribution of *KES ${amount}* via M-Pesa STK Push. Your savings have been credited into NSSF Ref: *${user.nssf_number}*.\nThank you for planting your retirement seeds! 🌱`;

    const mpesaOutbound: MessageLog = {
      id: messageIdCounter++,
      phone_number: phoneNumber,
      direction: "outbound",
      message_text: confirmationAlert,
      timestamp: new Date().toISOString()
    };
    messageLogs.push(mpesaOutbound);

    res.json({ success: true, alert: confirmationAlert });
  });

  // Vite development vs production asset delivery
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
    console.log(`Jiweke server running on http://0.0.0.0:${PORT}`);
  });
}

// --- Dynamic Text Generator helper functions ---

function getMenuMessageString(lang: "sw" | "en") {
  return lang === "sw"
    ? "Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\nNitakusaidia kwa urahisi:\n1️⃣ Kujiunga na NSSF (NSSF Registration)\n2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n3️⃣ Kuelewa namna ya kudai faida zako (NSSF Claims)\n4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\nUngependa kuanza na nini leo? Tafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*."
    : "Welcome to Jiweke! 👋 I am your digital NSSF assistant in Kenya. ✨\n\nI am here to help you:\n1️⃣ Register with NSSF (NSSF Registration)\n2️⃣ Check your retirement savings balance (NSSF Balance)\n3️⃣ Understand how to claim your benefits (NSSF Claims)\n4️⃣ Learn more about social security & NSSF (NSSF Knowledge)\n\nWhat would you like to do today? Please reply with *1*, *2*, *3*, or *4*.";
}

function getBalanceString(user: MockUser, lang: "sw" | "en") {
  if (user.registration_status !== "complete") {
    return lang === "sw"
      ? "⚠️ Hujakamilisha usajili wako wa NSSF bado.\nIli uanze kuangalia akiba yako ya uzeeni au kuchangia kwa M-Pesa, tafadhali jiandikishe kwanza.\n\nChagua *1* kwenye orodha kuu kurudi kwenye usajili."
      : "⚠️ You have not registered with NSSF yet.\nTo check your active balances or make deposits via M-Pesa, you must complete your registration first.\n\nPlease choose Option *1* in the Main Menu to begin registration.";
  }
  const totalAmount = 2650.00;
  const totalMonths = 4;
  const pensionEstimates = 3200.00;
  return lang === "sw"
    ? `📊 *TAARIFA YA AKAUNTI YA NSSF YA ${user.name?.toUpperCase()}* 📊\n\n• *Nambari ya NSSF:* ${user.nssf_number}\n• *Hali ya Akaunti:* Inafanya Kazi (Active)\n• *Jumla Kuu ya Michango:* Ksh ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n• *Miezi Uliyochangia:* miezi ${totalMonths}\n• *Kadirio la Pensheni kila mwezi (umri wa miaka 55+):* Ksh ${pensionEstimates.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mwezi\n\n💡 Unaweza kuongeza akiba yako sasa hivi! Changia kupitia Safaricom M-Pesa Paybill *200222*.\n\nTuma neno *menu* kurudi kwenye orodha kuu.`
    : `📊 *NSSF ACCOUNT STATEMENT FOR ${user.name?.toUpperCase()}* 📊\n\n• *NSSF Number:* ${user.nssf_number}\n• *Account Status:* Active\n• *Total Contributed Savings:* KES ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n• *Active Contribution Months:* ${totalMonths} months\n• *Estimated Monthly Pension (at retirement):* KES ${pensionEstimates.toLocaleString(undefined, { minimumFractionDigits: 2 })}/month\n\n💡 You can increase your savings right now! Simply chip in via M-Pesa Paybill *200222* with your NSSF number.\n\nType *menu* to return to the interactive dashboard.`;
}

// Smart general knowledge fallback integration using Gemini!
async function queryGeminiChat(question: string, stepContext: string) {
  try {
    const systemPromptCombined = `${JIWEKE_SYSTEM_INSTRUCTION}\n\nCurrent Step Context: ${stepContext}. Keep answers under 120 words. Speak direct simple Swahili/English matching the user. Always end with: 'Tuma *menu* kurudi nyumbani.'`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: question,
      config: {
        systemInstruction: systemPromptCombined,
        temperature: 0.4,
      }
    });
    return response.text || "Samahani, kuna hitilafu katika kupata mawasiliano ya AI. Tafadhali thibitisha swali lako kisha jaribu tena.";
  } catch (err: any) {
    console.error("Gemini assistant query err:", err);
    return "Samahani, kuna tatizo la mtandao katika kupata usajili wa AI. (Sorry, there was a slight network issue processing your AI request. Please try again or type *menu*)";
  }
}

startServer();
