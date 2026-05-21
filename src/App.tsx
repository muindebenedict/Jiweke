import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, 
  Smartphone, 
  Database, 
  FileCode, 
  Users, 
  RefreshCw, 
  ChevronRight, 
  Send, 
  Check, 
  Trash2, 
  HelpCircle, 
  Shield, 
  CheckSquare, 
  MapPin, 
  TrendingUp, 
  BadgeHelp,
  ArrowRight,
  Globe,
  Coins
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { pythonProjectFiles, PythonFile } from "./data/pythonProjectFiles";

// --- CLIENT REUSABLE TYPES ---
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

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"simulator" | "database" | "source_code" | "county_insights">("simulator");

  // Selected dynamic telephone to simulate WhatsApp conversation
  const [selectedPhone, setSelectedPhone] = useState<string>("254790000001");
  const [customPhoneInput, setCustomPhoneInput] = useState<string>("");
  const [isAddingPhone, setIsAddingPhone] = useState<boolean>(false);

  // Active message sending state
  const [chatInput, setChatInput] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);

  // Python explorer selections
  const [selectedPythonFile, setSelectedPythonFile] = useState<PythonFile>(pythonProjectFiles[0]);

  // Server state caches
  const [usersCache, setUsersCache] = useState<MockUser[]>([]);
  const [statesCache, setStatesCache] = useState<ConversationState[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Safaricom M-Pesa STK push simulation state
  const [showMpesaPush, setShowMpesaPush] = useState<boolean>(false);
  const [mpesaAmount, setMpesaAmount] = useState<number>(200);
  const [mpesaPin, setMpesaPin] = useState<string>("");
  const [isProcessingMpesa, setIsProcessingMpesa] = useState<boolean>(false);
  const [mpesaSuccessMessage, setMpesaSuccessMessage] = useState<string | null>(null);

  // Auto-scroll anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Statistics summaries
  const countiesStats = [
    { name: "Nairobi", workers: 4120, voluntarySavings: 384500, flagRate: 85 },
    { name: "Nakuru", workers: 2180, voluntarySavings: 154200, flagRate: 72 },
    { name: "Mombasa", workers: 1950, voluntarySavings: 141000, flagRate: 78 },
    { name: "Kisumu", workers: 1250, voluntarySavings: 93400, flagRate: 64 },
    { name: "Machakos", workers: 890, voluntarySavings: 54100, flagRate: 59 },
    { name: "Kakamega", workers: 640, voluntarySavings: 38200, flagRate: 51 }
  ];

  // Refresh data from the server endpoint
  const fetchData = async () => {
    try {
      const response = await fetch("/api/simulator/data");
      const data = await response.json();
      setUsersCache(data.users || []);
      setStatesCache(data.conversationStates || []);
      setMessageLogs(data.messageLogs || []);
      
      // If our selectedPhone has no matching conversation state on server, create an empty one
      const phoneExists = data.conversationStates.some((s: any) => s.phone_number === selectedPhone);
      if (!phoneExists && selectedPhone) {
        // Simple client side initialize is fine when they do first text
      }
    } catch (err) {
      console.error("Failed fetching simulator endpoints context:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // poll every 4 seconds for fresh db state values
    const timer = setInterval(fetchData, 4000);
    return () => clearInterval(timer);
  }, [selectedPhone]);

  // Scroll messages on fresh log streams
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageLogs, selectedPhone, activeTab]);

  // Send test chat message to simulator
  const sendChatMessage = async (textToSend?: string) => {
    const finalMsg = textToSend || chatInput;
    if (!finalMsg.trim() || !selectedPhone) return;

    setChatInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/simulator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: selectedPhone,
          messageText: finalMsg
        })
      });
      const data = await response.json();
      
      // Update local values immediately
      await fetchData();
    } catch (err) {
      console.error("Failed executing simulator message dispatch:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Change simulated user language on server
  const changeLanguageOnServer = async (lang: "sw" | "en") => {
    try {
      await fetch("/api/simulator/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: selectedPhone,
          lang
        })
      });
      await fetchData();
    } catch (err) {
      console.error("Failed changing simulator language preference:", err);
    }
  };

  // Trigger simulated STK push callback
  const runSimulatedMpesaPush = async () => {
    if (!mpesaAmount || mpesaAmount < 10) return;
    setIsProcessingMpesa(true);
    
    // Simulate some loading seconds looking like Safaricom handshake
    setTimeout(async () => {
      try {
        const response = await fetch("/api/simulator/mpesa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: selectedPhone,
            amount: mpesaAmount
          })
        });
        const data = await response.json();
        setMpesaSuccessMessage(data.alert);
        await fetchData();
      } catch (err) {
        console.error("Error trigger mock STK Push webhook:", err);
      } finally {
        setIsProcessingMpesa(false);
        // hide panel and success text
        setTimeout(() => {
          setShowMpesaPush(false);
          setMpesaSuccessMessage(null);
          setMpesaPin("");
        }, 4000);
      }
    }, 2000);
  };

  // Reset entire simulation database logs
  const handleResetSimulator = async (phoneOnly: boolean = false) => {
    try {
      await fetch("/api/simulator/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: phoneOnly ? JSON.stringify({ phoneNumber: selectedPhone }) : JSON.stringify({})
      });
      // Pick initial phone default on clean wipes
      if (!phoneOnly) {
        setSelectedPhone("254790000001");
      }
      await fetchData();
    } catch (err) {
      console.error("Error executing database resets:", err);
    }
  };

  // Build a custom phone list selection incorporating server additions
  const availablePhones = [
    { value: "254790000001", label: "Mama Mboga (Alice Atieno) - 254790000001" },
    { value: "254790000002", label: "Boda Boda Rider (John Mwangi) - 254790000002" },
    { value: "254790000003", label: "Tailor Fundi (Fatuma Juma) - 254790000003" }
  ];

  // Incorporate added custom numbers or live registered ones
  usersCache.forEach(u => {
    if (!availablePhones.some(p => p.value === u.phone_number)) {
      availablePhones.push({
        value: u.phone_number,
        label: `${u.name || "Casual Worker"} (${u.phone_number})`
      });
    }
  });

  const activeUserState = statesCache.find(s => s.phone_number === selectedPhone);
  const activeUser = usersCache.find(u => u.phone_number === selectedPhone);
  const filteredMessages = messageLogs.filter(m => m.phone_number === selectedPhone);

  const addNewSimulatedPhone = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customPhoneInput.replace(/\D/g, "");
    if (clean.length < 9) {
      alert("Please enter a valid phone number (e.g., 254712345678)");
      return;
    }
    const formatted = clean.startsWith("254") ? clean : "254" + clean.replace(/^0+/, "");
    setSelectedPhone(formatted);
    setIsAddingPhone(false);
    setCustomPhoneInput("");
  };

  return (
    <div id="jiweke_app_frame" className="min-h-screen text-slate-900 flex flex-col font-sans selection:bg-emerald-150 selection:text-emerald-900">
      
      {/* BRAND HEADER BANNER */}
      <header className="bg-[#0f172a] text-white border-b border-slate-800 shrink-0 shadow-md">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Smartphone className="w-5.5 h-5.5 text-slate-900 font-extrabold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-2xl tracking-normal text-white">Jiweke</h1>
                <span className="bg-emerald-500/15 text-emerald-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  Swahili For "Set Yourself Up"
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Kenyan NSSF WhatsApp AI Assistant & Voluntary Saving Portal for Informal Workers
              </p>
            </div>
          </div>

          {/* SIMULATION CONTROLS */}
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => handleResetSimulator(false)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition text-xs font-medium flex items-center gap-1.5 focus:ring-1 focus:ring-slate-600"
              title="Restores database with seeding templates"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset All
            </button>
            <div className="h-5 w-[1px] bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Simulated SQLite Port: 5000</span>
            </div>
          </div>

        </div>
      </header>

      {/* TABS NAVIGATION */}
      <div className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex justify-start space-x-1 overflow-x-auto no-scrollbar scroll-smooth">
          
          <button
            onClick={() => setActiveTab("simulator")}
            className={`py-3.5 px-4 font-display font-semibold border-b-2 text-xs flex items-center gap-2 transition duration-200 cursor-pointer ${
              activeTab === "simulator"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Interactive Chatbot Simulator
          </button>

          <button
            onClick={() => setActiveTab("database")}
            className={`py-3.5 px-4 font-display font-semibold border-b-2 text-xs flex items-center gap-2 transition duration-200 cursor-pointer ${
              activeTab === "database"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Database className="w-4 h-4" />
            SQLite Database Monitor
          </button>

          <button
            onClick={() => setActiveTab("source_code")}
            className={`py-3.5 px-4 font-display font-semibold border-b-2 text-xs flex items-center gap-2 transition duration-200 cursor-pointer ${
              activeTab === "source_code"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <FileCode className="w-4 h-4" />
            Python Source Explorer
          </button>

          <button
            onClick={() => setActiveTab("county_insights")}
            className={`py-3.5 px-4 font-display font-semibold border-b-2 text-xs flex items-center gap-2 transition duration-200 cursor-pointer ${
              activeTab === "county_insights"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            <Users className="w-4 h-4" />
            Kenyan Counties Breakdown
          </button>

        </div>
      </div>

      {/* MAIN LAYOUT WRAPPER */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 overflow-y-auto">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-sm font-medium text-slate-500">Connecting with Jiweke server instance...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            
            {/* TAB 1: INTERACTIVE WHATSAPP SIMULATOR */}
            {activeTab === "simulator" && (
              <motion.div
                key="simulator"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >
                
                {/* SIMULATION UTILITY PANEL */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* WORKER SELECTOR */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-display font-bold text-slate-800 text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Users className="w-4.5 h-4.5 text-emerald-600" />
                      Select Simulated Worker
                    </h3>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                          Simulated Active SIM Card/Phone
                        </label>
                        <select
                          value={selectedPhone}
                          onChange={(e) => setSelectedPhone(e.target.value)}
                          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg py-2 px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition cursor-pointer"
                        >
                          {availablePhones.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* ADD NEW SIMULATED NUMBER */}
                      {isAddingPhone ? (
                        <form onSubmit={addNewSimulatedPhone} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 space-y-2.5">
                          <p className="text-[11px] text-emerald-800 leading-normal">
                             Add a new telephone to test how dynamic registration handles blank states.
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="e.g. 254711223344"
                              value={customPhoneInput}
                              onChange={(e) => setCustomPhoneInput(e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg py-1.5 px-3 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              type="submit"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg px-3 py-1.5 transition active:scale-95 cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsAddingPhone(false)}
                            className="text-[11px] text-slate-400 hover:text-slate-600 underline text-left"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => setIsAddingPhone(true)}
                          className="w-full text-center py-2 border border-dashed border-slate-300 hover:border-slate-450 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                        >
                          + Simulate a brand new worker phone
                        </button>
                      )}

                      {/* WORKER METADATA CARD */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mt-2">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-2">Simulated App Database Entry</span>
                        
                        {activeUser ? (
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">Name:</span>
                              <span className="font-semibold text-slate-800">{activeUser.name || <span className="text-slate-400 text-[10px] italic">Not Filled</span>}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">ID Card:</span>
                              <span className="font-mono font-medium text-slate-800">{activeUser.id_number || <span className="text-slate-400 text-[10px] italic">Not Filled</span>}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-550">Password:</span>
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded text-[11px]">{activeUser.password || <span className="text-slate-400 text-[10px] font-normal italic">Not Set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">NSSF Number:</span>
                              <span className="font-mono bg-emerald-150 text-emerald-800 font-bold px-1 rounded text-[11px]">
                                {activeUser.nssf_number || <span className="text-slate-400 text-[10px] font-normal italic">None Assigned</span>}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">Occupation:</span>
                              <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[120px]">{activeUser.occupation || <span className="text-slate-400 text-[10px] italic">Not Filled</span>}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">County:</span>
                              <span className="font-semibold text-slate-800 text-[11px]">{activeUser.county || <span className="text-slate-400 text-[10px] italic">Not Filled</span>}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">Flow Step:</span>
                              <span className="font-mono bg-indigo-100 text-indigo-800 font-medium px-1 rounded text-[10px]">
                                {activeUserState?.current_step || "greeting"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/70 py-1 px-2 rounded">
                              <span className="text-slate-500">Language Pref:</span>
                              <div className="flex gap-1.5 items-center">
                                <button
                                  onClick={() => changeLanguageOnServer("sw")}
                                  className={`px-1 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${activeUser.language_preference === "sw" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}
                                >
                                  SW
                                </button>
                                <button
                                  onClick={() => changeLanguageOnServer("en")}
                                  className={`px-1 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${activeUser.language_preference === "en" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}
                                >
                                  EN
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-slate-400 text-xs italic">
                            No registered statistics yet. Send a first greeting message to seed profile!
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* QUICK QUICK ACTION OPTIONS */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-display font-bold text-slate-800 text-sm mb-3.5 flex items-center gap-1.5 border-b border-slate-100 pb-3">
                      <CheckSquare className="w-4.5 h-4.5 text-emerald-600" />
                      Quick Simulation Chips
                    </h3>
                    <p className="text-xs text-slate-500 mb-3 leading-normal">
                      Simulate tapping preset numerical menu numbers and terms inside WhatsApp chat.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => sendChatMessage("Sasa")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "Sasa" (Swahili Greeting)
                      </button>
                      <button
                        onClick={() => sendChatMessage("Hello")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "Hello" (English Greeting)
                      </button>
                      <button
                        onClick={() => sendChatMessage("1")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "1" (Register)
                      </button>
                      <button
                        onClick={() => sendChatMessage("2")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "2" (Check Balance)
                      </button>
                      <button
                        onClick={() => sendChatMessage("3")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "3" (Claim Documents)
                      </button>
                      <button
                        onClick={() => sendChatMessage("4")}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition active:scale-95 cursor-pointer"
                      >
                        "4" (NSSF Knowledge)
                      </button>
                      <button
                        onClick={() => sendChatMessage("menu")}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs py-1.5 px-3 rounded-lg border border-emerald-200 transition active:scale-95 cursor-pointer"
                      >
                        "menu" (Main Dashboard)
                      </button>
                      <button
                        onClick={() => handleResetSimulator(true)}
                        className="bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs py-1.5 px-3 rounded-lg border border-red-200 transition active:scale-95 cursor-pointer"
                      >
                        Reset Conversation Flow
                      </button>
                    </div>

                    {/* M-PESA DARAJA PROMPT TRIGGER */}
                    {activeUser?.registration_status === "complete" && (
                      <div className="border-t border-slate-100 pt-4 mt-4">
                        <button
                          onClick={() => setShowMpesaPush(true)}
                          className="w-full bg-[#1faf38] hover:bg-[#18932e] text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-xs cursor-pointer"
                        >
                          <Coins className="w-4 h-4 text-white" />
                          Simulate M-Pesa STK push contribution
                        </button>
                      </div>
                    )}

                  </div>

                </div>

                {/* SMARTPHONE FRAME SCREEN */}
                <div className="lg:col-span-8 flex justify-center">
                  
                  <div className="relative w-full max-w-[420px] aspect-[9/18.5] bg-slate-900 rounded-[50px] p-3.5 shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden ring-1 ring-slate-700/50">
                    
                    {/* CAMERA SPOT / EARPIECE */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-slate-900 rounded-b-3xl z-40 flex items-center justify-center">
                      <div className="w-16 h-1 rounded-full bg-slate-800 mb-1" />
                      <div className="w-3.5 h-3.5 rounded-full bg-slate-950 ml-3 mb-1 border border-slate-800" />
                    </div>

                    {/* SCREEN CANVAS CONTAINER */}
                    <div className="flex-1 bg-[#efeae2] whatsapp-chat-bg rounded-[38px] flex flex-col overflow-hidden relative border border-slate-950">
                      
                      {/* WHATSAPP TOP BAR */}
                      <div className="bg-[#075e54] text-white pt-8 pb-3 px-4 flex items-center justify-between shadow-md">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-emerald-100 text-slate-800 flex items-center justify-center font-bold text-xs shadow-inner">
                              JW
                            </div>
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25d366] rounded-full border border-white" />
                          </div>

                          <div>
                            <div className="flex items-center gap-1">
                              <h4 className="font-sans font-bold text-xs pb-0.5 leading-none">Jiweke NSSF Bot</h4>
                              {/* Meta Verification Badge */}
                              <svg className="w-3 h-3 text-emerald-400 fill-current" viewBox="0 0 24 24">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                              </svg>
                            </div>
                            <span className="text-[10px] text-emerald-200">Set yourself up — Official Assistant</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <span className="bg-[#128c7e] text-white text-[9px] font-bold px-2 py-0.5 rounded border border-[#128c7e]/80">
                            254700200222
                          </span>
                        </div>
                      </div>

                      {/* MESSAGES LOGS LIST BODY */}
                      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3.5">
                        {filteredMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                            <div className="w-12 h-12 rounded-full bg-slate-200/50 flex items-center justify-center mb-3">
                              <MessageSquare className="w-6 h-6 text-slate-400 rotate-12" />
                            </div>
                            <p className="text-xs font-semibold text-slate-500">No Messages Logged Yet</p>
                            <p className="text-[10px] text-slate-400 max-w-[200px] mt-1">
                              Send your first hello message to begin interaction! Pick a quick suggestion on the left panel or type custom text.
                            </p>
                          </div>
                        ) : (
                          filteredMessages.map((m) => {
                            const isInbound = m.direction === "inbound";
                            return (
                              <div
                                key={m.id}
                                className={`flex ${isInbound ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-xs relative leading-relaxed ${
                                    isInbound
                                      ? "bg-[#dcf8c6] text-slate-800 rounded-tr-none border-l border-emerald-100"
                                      : "bg-white text-slate-800 rounded-tl-none border border-slate-200/50"
                                  }`}
                                >
                                  {/* Message Text with simple line breaks */}
                                  <p className="whitespace-pre-wrap font-sans text-[11.5px]">
                                    {m.message_text}
                                  </p>

                                  {/* Timestamp + Checks */}
                                  <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-slate-400">
                                    <span>
                                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {isInbound && (
                                      <div className="flex text-emerald-600">
                                        <Check className="w-3 h-3 -mr-1" />
                                        <Check className="w-3 h-3" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* CHAT INPUT FORM */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendChatMessage();
                        }}
                        className="bg-[#f0f2f5] p-3 border-t border-slate-200 flex items-center gap-1.5 shrink-0"
                      >
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Andika ujumbe hapa..."
                          className="flex-1 bg-white border border-slate-300 rounded-full py-1.5 px-3.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                        />
                        <button
                          type="submit"
                          disabled={isSending || !chatInput.trim()}
                          className="w-8.5 h-8.5 bg-[#075e54] hover:bg-[#128c7e] text-white rounded-full flex items-center justify-center transition active:scale-95 disabled:bg-slate-300 disabled:scale-100 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>

                      {/* SAFARICOM M-PESA STK SIMULATED DIALOG POPUP */}
                      {showMpesaPush && (
                        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                          <div className="bg-white w-full max-w-[280px] rounded-2xl overflow-hidden shadow-2xl border border-slate-300 animate-in fade-in zoom-in duration-200">
                            
                            <div className="bg-[#1faf38] text-white p-3 flex justify-between items-center">
                              <span className="text-[10px] font-bold tracking-wider uppercase">Safaricom Daraja Push</span>
                              <span className="bg-black/20 text-[9px] px-1.5 rounded">M-Pesa Webhook</span>
                            </div>

                            <div className="p-4 text-xs">
                              {mpesaSuccessMessage ? (
                                <div className="text-center py-2 space-y-2">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#1faf38] flex items-center justify-center mx-auto">
                                    <Check className="w-5 h-5" />
                                  </div>
                                  <p className="font-semibold text-slate-800">Prompt Authorized Successfully</p>
                                  <p className="text-[10px] text-slate-500 leading-normal">
                                    Safaricom webhook returned code *0* success. Incoming payment alert has been texted to the phone session!
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <p className="text-slate-600 leading-normal text-[11px]">
                                    Simulating **STK Push PIN Request** on phone {selectedPhone}. Worker will be prompted with a Safaricom dialog:
                                  </p>
                                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-[10px] text-slate-700 leading-relaxed">
                                    Do you want to authorize payment of **KES {mpesaAmount}** to **NSSF Savings Paybill 200222** for account reference **{activeUser?.nssf_number}**? Enter PIN:
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Amount in KES (Kenya Shillings)
                                    </label>
                                    <input
                                      type="number"
                                      value={mpesaAmount}
                                      onChange={(e) => setMpesaAmount(parseInt(e.target.value) || 50)}
                                      className="bg-slate-50 border border-slate-350 rounded-md py-1 px-2 text-xs w-full mb-3"
                                    />

                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Simulated M-Pesa PIN (4 digits)
                                    </label>
                                    <input
                                      type="password"
                                      maxLength={4}
                                      value={mpesaPin}
                                      onChange={(e) => setMpesaPin(e.target.value.replace(/\D/g, ""))}
                                      placeholder="••••"
                                      className="bg-slate-50 border border-slate-350 rounded-md py-1 px-2 text-xs w-full text-center tracking-widest font-bold"
                                    />
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setShowMpesaPush(false)}
                                      className="flex-1 py-1.5 border border-slate-300 rounded-lg text-[11px] text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                                    >
                                      Declined
                                    </button>
                                    <button
                                      type="button"
                                      disabled={mpesaPin.length < 4 || isProcessingMpesa}
                                      onClick={runSimulatedMpesaPush}
                                      className="flex-1 py-1.5 bg-[#1faf38] hover:bg-[#18932e] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      {isProcessingMpesa ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : mpesaSuccessMessage ? (
                                        "Saved!"
                                      ) : (
                                        "Accept/Pay"
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      )}

                    </div>

                  </div>

                </div>

              </motion.div>
            )}

            {/* TAB 2: SQLITE DATABASE VIEWER */}
            {activeTab === "database" && (
              <motion.div
                key="database"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                
                {/* DATABASE HEADER METRIC INFO */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                      <Users className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Users Table</span>
                      <p className="text-lg font-bold text-slate-800">{usersCache.length}</p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-800">
                      <Database className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Session Steps active</span>
                      <p className="text-lg font-bold text-slate-800">{statesCache.length}</p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center text-teal-800">
                      <MessageSquare className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Logged Messages</span>
                      <p className="text-lg font-bold text-slate-800">{messageLogs.length}</p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                      <Coins className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">M-Pesa voluntary savings</span>
                      <p className="text-lg font-bold text-slate-800">KES 10,600</p>
                    </div>
                  </div>
                </div>

                {/* USERS TABLE */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-display font-bold text-slate-800 text-sm">Users Table (`users`)</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Kenyan informal workers registered inside the NSSF SQLite schema</p>
                    </div>
                    <button
                      onClick={fetchData}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs rounded border border-slate-200 cursor-pointer"
                    >
                      Refresh Table
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 text-[10px]">
                          <th className="py-3 px-4">ID</th>
                          <th className="py-3 px-4">Phone Number</th>
                          <th className="py-3 px-4">Full Name</th>
                          <th className="py-3 px-4">National ID</th>
                          <th className="py-3 px-4">Password</th>
                          <th className="py-3 px-4">Assigned NSSF Number</th>
                          <th className="py-3 px-4">Occupation</th>
                          <th className="py-3 px-4">County</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Lang</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {usersCache.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50/55 transition">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-400">{u.id}</td>
                            <td className="py-3.5 px-4 font-mono text-slate-900">{u.phone_number}</td>
                            <td className="py-3.5 px-4">{u.name || <span className="text-slate-400 italic">Unfilled</span>}</td>
                            <td className="py-3.5 px-4 font-mono">{u.id_number || <span className="text-slate-400 italic">Unfilled</span>}</td>
                            <td className="py-3.5 px-4 font-mono text-indigo-650 font-bold">{u.password || <span className="text-slate-450 font-normal italic">None</span>}</td>
                            <td className="py-3.5 px-4">
                              {u.nssf_number ? (
                                <span className="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded font-mono text-[11px]">
                                  {u.nssf_number}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">None</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-[11px] text-slate-500">{u.occupation || <span className="text-slate-400 italic">Unfilled</span>}</td>
                            <td className="py-3.5 px-4">{u.county || <span className="text-slate-400 italic">Unfilled</span>}</td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.registration_status === "complete"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {u.registration_status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 uppercase font-bold text-slate-400">{u.language_preference}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DYNAMIC CONVERSATION STATE SCHEMA */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <h3 className="font-display font-bold text-slate-800 text-sm">Conversation States</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Keeps track of active step contexts</p>
                    </div>

                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {statesCache.map((s) => (
                        <div key={s.phone_number} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex flex-col justify-between hover:border-slate-350 transition">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-mono font-bold text-slate-700">{s.phone_number}</span>
                            <span className="bg-indigo-100 text-indigo-800 font-semibold text-[10px] px-2 py-0.5 rounded font-mono">
                              {s.current_step}
                            </span>
                          </div>
                          <div className="mr-auto">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase mb-1">State Scratch Data:</span>
                            <pre className="text-[9.5px] font-mono bg-white p-2 rounded border border-slate-150 overflow-x-auto text-slate-600">
                              {JSON.stringify(s.context, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* LIVE TERMINAL MESSAGES STREAM */}
                  <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
                    <div className="mb-4">
                      <h3 className="font-display font-bold text-slate-800 text-sm">Live System Message Stream</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Replicates log dumps on live webhooks mapping communication lines</p>
                    </div>

                    <div className="flex-1 min-h-[220px] max-h-[350px] bg-slate-900 rounded-xl p-4 font-mono text-[10.5px] text-slate-300 overflow-y-auto space-y-2">
                      {messageLogs.map((m) => (
                        <div key={m.id} className="border-b border-slate-800 pb-1.5 flex flex-col sm:flex-row gap-1 justify-between">
                          <div className="flex items-start gap-1">
                            <span className="text-[#25d366] font-bold">[{m.direction.toUpperCase()}]</span>
                            <span className="text-slate-500 font-bold">Phone: {m.phone_number}</span>
                            <span className="text-slate-200">{m.message_text}</span>
                          </div>
                          <span className="text-slate-500 text-[9.5px] shrink-0 self-end sm:self-auto">
                            {new Date(m.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </motion.div>
            )}

            {/* TAB 3: PYTHON SOURCE EXPLORER */}
            {activeTab === "source_code" && (
              <motion.div
                key="source_code"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >
                
                {/* EXPLORER TREE BAR */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <FileCode className="w-4.5 h-4.5 text-emerald-600" />
                      Python File Tree (`jiweke/`)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Explore the production code structure that handles the NSSF bots</p>
                  </div>

                  <div className="space-y-1.5">
                    {pythonProjectFiles.map((file) => {
                      const isSelected = selectedPythonFile.path === file.path;
                      return (
                        <button
                          key={file.path}
                          onClick={() => setSelectedPythonFile(file)}
                          className={`w-full text-left py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                            isSelected
                              ? "bg-slate-100 text-emerald-800 border-l-4 border-emerald-600"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-extrabold text-[10px]">📁</span>
                            <span>{file.path}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-500 leading-normal space-y-2">
                    <p className="font-bold text-slate-700">Quick Setup Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Copy variables in `.env.example` into `.env`.</li>
                      <li>Run virtual env activation.</li>
                      <li>Launch dependencies install.</li>
                      <li>Run Flask app booting.</li>
                    </ol>
                    <p className="text-slate-400 text-[10px]">Refer the README.md in the root directory for absolute setup.</p>
                  </div>
                </div>

                {/* SYNTAX RENDER RAMP */}
                <div className="lg:col-span-8 bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  
                  <div className="bg-[#1e293b] text-slate-200 px-5 py-3.5 flex justify-between items-center border-b border-slate-800 flex-wrap gap-2">
                    <div>
                      <span className="font-mono text-emerald-450 text-xs font-bold font-mono">/jiweke/{selectedPythonFile.path}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">{selectedPythonFile.description}</p>
                    </div>
                    <span className="bg-[#0f172a] text-[10px] font-bold text-indigo-400 font-mono px-2 py-0.5 rounded uppercase">
                      {selectedPythonFile.language}
                    </span>
                  </div>

                  <div className="p-5 font-mono text-[11.5px] text-slate-300 overflow-x-auto leading-relaxed max-h-[500px]">
                    <pre className="no-scrollbar pr-2 whitespace-pre text-slate-200">
                      <code>{selectedPythonFile.content}</code>
                    </pre>
                  </div>

                </div>

              </motion.div>
            )}

            {/* TAB 4: KENYA COUNTIES MAP & Voluntary Savings INSIGHTS */}
            {activeTab === "county_insights" && (
              <motion.div
                key="county_insights"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                
                {/* EDUCATIONAL HERO BLOCK */}
                <div className="bg-gradient-to-tr from-emerald-900 to-teal-850 text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="space-y-2 max-w-[550px]">
                    <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold tracking-wider uppercase inline-block px-2.5 py-0.5 rounded-full mb-1">
                      Voluntary National Pension Platform
                    </div>
                    <h2 className="font-display font-bold text-2xl tracking-normal text-white">Powering Retirement Security for Kenya's Informal Laborers</h2>
                    <p className="text-sm text-emerald-100 leading-relaxed font-sans">
                      Under Kenya's social security rules, self-employed workers can voluntarily contribute any amount (as low as KES 50) anytime via the NSSF paybill *200222*. There are no monthly penalties for skipping a payment—providing absolute flexibility to casual workers whose incomes fluctuate!
                    </p>
                  </div>
                  
                  <div className="bg-white/10 border border-white/10 rounded-2xl p-4 shrink-0 shadow-lg text-center backdrop-blur-md">
                    <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest block mb-1">Voluntary Saver Growth Rate</span>
                    <p className="text-4xl font-extrabold text-white font-display">+42%</p>
                    <span className="text-[10px] text-slate-300">Annual Increase (2025 - 2026)</span>
                  </div>
                </div>

                {/* KENYA VOLUNTARY COUNTIES STATISTICSGRID */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  
                  <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <h3 className="font-display font-bold text-slate-800 text-sm">Top Subscribing Counties of Kenya</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Live voluntary registration rates compiled across 47 regions</p>
                    </div>

                    <div className="space-y-3">
                      {countiesStats.map((stat) => (
                        <div key={stat.name} className="flex flex-col gap-1.5 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                              {stat.name} County
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-slate-500">
                              {stat.workers.toLocaleString()} registered savers
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-600 h-1.5 rounded-full"
                                style={{ width: `${stat.flagRate}%` }}
                              />
                            </div>
                            <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 rounded px-1.5">
                              {stat.flagRate}%
                            </span>
                          </div>
                          
                          <span className="text-[10px] text-slate-400 block">Jumla ya akiba voluntary: KES {stat.voluntarySavings.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* NSSF COMPREHENSIVE BENEFITS TABLE */}
                  <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <h3 className="font-display font-bold text-slate-800 text-sm">Kenya NSSF Benefits & Claims categories</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Guided automatically inside Jiweke's Claims and Documents menu</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 hover:shadow-xs transition duration-200">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                          1
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs">Retirement & Age Benefit</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                          Payable to voluntary savers who have reached the official retirement age of 55, or early retirement at age 50. Requires National ID, original member card, and verified banking details.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 hover:shadow-xs transition duration-200">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
                          2
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs">Invalidity Benefit</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                          Payable immediately to any NSSF saver who sustaining physical or mental disabilities preventing continued employment. Requires verification reports from government medical boards.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 hover:shadow-xs transition duration-200">
                        <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                          3
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs">Survivors Benefit</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                          Payable to dependents or immediate family members of a deceased voluntary contributor. Requires Chieftain's support letter, death certificate, and beneficiary identity verification.
                        </p>
                      </div>

                    </div>

                    {/* DARAJA PAYMENTS DETAILS EXPLAINER */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex gap-3 text-xs leading-relaxed">
                      <Shield className="w-6 h-6 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-800 mb-1">Compound Savings Security Guarantee</p>
                        <p className="text-slate-500 text-[11px] leading-normal">
                          All voluntary payments triggered via Safaricom STK Push flow securely into central NSSF Kenya funds. Safaricom's Daraja API uses callback validation parameters that correlate M-Pesa Receipts with NSSF reference profiles to prevent wrong accounts transactions.
                        </p>
                      </div>
                    </div>

                  </div>

                </div>

              </motion.div>
            )}

          </AnimatePresence>
        )}

      </main>

      {/* COMPACT FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-4 shrink-0 text-center text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p>© 2026 Jiweke NSSF WhatsApp Assistant. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span>Powered secure server-side Gemini</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Kenya Informal Sector digital pension framework</span>
          </p>
        </div>
      </footer>

    </div>
  );
}
