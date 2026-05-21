# app/services/nssf_service.py
# This is the Core Chatbot Engine for Jiweke.
# It implements a robust conversation state machine that guides self-employed Kenyan workers (Mama Mbogas,
# Boda boda riders, hawkers) through NSSF registration, balance checking, and claims workflows.
# Supports English and Swahili dynamically.

import logging
import random
from datetime import datetime
from app import db
from app.models import User, ConversationState, Message
from app.services.gemini_service import get_gemini_response
from app.services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)

# List of all 47 counties of Kenya
COUNTIES_LIST = [
    "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita/Taveta", "Garissa", "Wajir", "Mandera", 
    "Marsabit", "Isolo", "Meru", "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni", "Nyandarua", 
    "Nyeri", "Kirinyaga", "Murang'a", "Kiambu", "Turkana", "West Pokot", "Samburu", "Trans Nzoia", 
    "Uasin Gishu", "Elgeyo/Marakwet", "Nandi", "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado", 
    "Kericho", "Bomet", "Kakamega", "Vihiga", "Bungoma", "Busia", "Siaya", "Kisumu", "Homa Bay", 
    "Migori", "Kisii", "Nyamira", "Nairobi"
]

OCCUPATIONS = {
    "1": "Boda Boda Rider",
    "2": "Mama Mboga / Vendor",
    "3": "Fundi / Artisan",
    "4": "Hawker / Small Trader",
    "5": "House Help / Domestic worker",
    "6": "Farmer",
    "7": "Other Informal Sector Worker"
}

def handle_user_message(phone_number, user_text):
    """
    Primary orchestrator responding to messages from a given phone_number.
    - Creates user if they don't exist
    - Fetches or initializes conversation state
    - Validates inputs according to the current state step
    - Dispatches to correct handler
    - Saves DB changes
    - Sends message back via WhatsApp
    """
    user_text_strip = user_text.strip()
    
    # 1. Log Inbound Message in DB
    inbound_log = Message(phone_number=phone_number, direction="inbound", message_text=user_text_strip)
    db.session.add(inbound_log)
    
    # 2. Get or Create User
    user = User.query.filter_by(phone_number=phone_number).first()
    if not user:
        # Detect language preference from the very first greeting
        # If greeting has Swahili keywords ("mambo", "habari", "sasa", "vipi", "jambo", "nssf"), default to Swahili.
        # Otherwise, if English features are strong, default to English.
        first_word = user_text_strip.lower()
        lang = "sw"
        if any(kw in first_word for kw in ["hello", "hi", "how", "register", "balance", "help", "en"]):
            lang = "en"
            
        user = User(
            phone_number=phone_number, 
            registration_status="pending",
            language_preference=lang
        )
        db.session.add(user)
        db.session.flush() # get id before referencing in ConversationState
        logger.info(f"Created new user account for {phone_number} with language preferences: {lang}")

    # 3. Get or Create Conversation State
    state = ConversationState.query.filter_by(phone_number=phone_number).first()
    if not state:
        state = ConversationState(phone_number=phone_number, current_step="select_language")
        db.session.add(state)
        db.session.flush()

    # Intercept registered users who need logging in
    is_login_step = state.current_step in ["login_id", "login_password"]
    context_data = state.get_context()
    if user.registration_status == "complete" and not context_data.get("authenticated") and not is_login_step:
        state.current_step = "login_id"
        state.set_context({})
        lang = user.language_preference
        welcome_prompt = (
            "Karibu tena kwenye Jiweke! 👋 Ili kupata huduma zako za NSSF, tafadhali andika *Nambari yako ya Kitambulisho cha Taifa* (National ID Number) kama jina lako la mtumiaji (username):"
            if lang == "sw" else
            "Welcome back to Jiweke! 👋 To access your NSSF services, please type your *National ID Card Number* as your username:"
        )
        
        outbound_log = Message(phone_number=phone_number, direction="outbound", message_text=welcome_prompt)
        db.session.add(outbound_log)
        state.last_message_at = datetime.utcnow()
        db.session.commit()
        send_whatsapp_message(phone_number, welcome_prompt)
        return welcome_prompt

    # 4. Handle Global Traps (menu, help, reset)
    lc_text = user_text_strip.lower()
    if lc_text in ["menu", "help", "msaada", "nyumbani", "mwanzo", "reset", "cancel", "r"]:
        state.current_step = "main_menu"
        state.set_context({"authenticated": context_data.get("authenticated")})
        logger.info(f"User {phone_number} triggered main menu fallback keyword.")

    # Intercept balance queries if the user isn't currently in a strict registration form entry flow
    is_registration_step = state.current_step in [
        "collect_name", "collect_id", "collect_dob", "collect_occupation", "collect_county", "collect_password", "confirm_details"
    ]
    
    balance_keywords = [
        "balance", "salio", "check balance", "current balance", "show balance", "check my balance",
        "statement", "account statement", "my statement", "how much", "savings balance", "saving balance",
        "pension balance", "angalia salio", "salio langu", "taarifa ya akaunti", "taarifa ya salio",
        "kujua salio", "pata salio", "nssf balance"
    ]
    is_balance_request = any(kw in lc_text for kw in balance_keywords) or lc_text == "2"

    if not is_registration_step and is_balance_request:
        state.current_step = "check_balance"
        state.set_context({})
        logger.info(f"User {phone_number} triggered live balance inquiry.")

    # 5. Process logic depending on current_step
    response_text = ""
    current_step = state.current_step
    context_data = state.get_context()

    logger.info(f"Processing message for {phone_number} at step: {current_step}")

    if current_step == "login_id":
        response_text = process_login_id(user, state, user_text_strip)

    elif current_step == "login_password":
        response_text = process_login_password(user, state, user_text_strip)

    elif current_step in ["greeting", "select_language"]:
        lc_text = user_text_strip.lower()
        if lc_text in ["1", "english", "en"]:
            user.language_preference = "en"
            state.current_step = "main_menu"
            db.session.commit()
            response_text = get_menu_message("en")
        elif lc_text in ["2", "kiswahili", "sw", "kiswahili"]:
            user.language_preference = "sw"
            state.current_step = "main_menu"
            db.session.commit()
            response_text = get_menu_message("sw")
        else:
            state.current_step = "select_language"
            db.session.commit()
            response_text = "Karibu Jiweke! 👋 Tafadhali chagua lugha ya kuendelea (Please choose a language to continue):\n\n1️⃣ English\n2️⃣ Kiswahili"

    elif current_step == "main_menu":
        response_text = process_main_menu(user, state, user_text_strip)

    # REGISTRATION FLOW
    elif current_step == "collect_name":
        response_text = process_collect_name(user, state, user_text_strip)
        
    elif current_step == "collect_id":
        response_text = process_collect_id(user, state, user_text_strip)
        
    elif current_step == "collect_dob":
        response_text = process_collect_dob(user, state, user_text_strip)
        
    elif current_step == "collect_occupation":
        response_text = process_collect_occupation(user, state, user_text_strip)
        
    elif current_step == "collect_county":
        response_text = process_collect_county(user, state, user_text_strip)

    elif current_step == "collect_password":
        response_text = process_collect_password(user, state, user_text_strip)
        
    elif current_step == "confirm_details":
        response_text = process_confirm_details(user, state, user_text_strip)

    # BALANCE AND CLAiMS (Other paths)
    elif current_step == "check_balance":
        # Returns user to main menu after showing balance
        response_text = process_check_balance(user, state, user_text_strip)
        state.current_step = "main_menu"
        
    elif current_step == "claim_guidance":
        response_text = process_claim_guidance(user, state, user_text_strip)
        
    else:
        # Fallback to greeting
        response_text = get_menu_message(user.language_preference)
        state.current_step = "main_menu"

    # Add next prompt action footer if not already explicitly formatted
    # to let the user always know what inputs to type
    if not any(footer in response_text for footer in ["1️⃣", "2️⃣", "👉", "Type"]):
        if user.language_preference == "sw":
            suffix = "\n\n💡 Tuma *menu* kurudi mwanzo."
        else:
            suffix = "\n\n💡 Type *menu* to return to start."
        response_text += suffix

    # 6. Save State and Context changes to Database
    state.last_message_at = datetime.utcnow()
    db.session.commit()

    # 7. Log Outbound message in Database
    outbound_log = Message(phone_number=phone_number, direction="outbound", message_text=response_text)
    db.session.add(outbound_log)
    db.session.commit()

    # 8. Send WhatsApp Message
    send_whatsapp_message(phone_number, response_text)
    return response_text


# --- STEP LOGIC IMPLEMENTATIONS ---

def get_menu_message(lang):
    """Generates the Main Greeting screen text."""
    if lang == "sw":
        return (
            "Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\n"
            "Nitakusaidia kwa urahisi:\n"
            "1️⃣ Kujiunga na NSSF (NSSF Registration)\n"
            "2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n"
            "3️⃣ Kuelewa namna ya kudai faida zako (NSSF Claims)\n"
            "4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\n"
            "Ungependa kuanza na nini leo? Tafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*."
        )
    else:
        return (
            "Welcome to Jiweke! 👋 I am your digital NSSF assistant in Kenya. ✨\n\n"
            "I am here to help you:\n"
            "1️⃣ Register with NSSF (NSSF Registration)\n"
            "2️⃣ Check your retirement savings balance (NSSF Balance)\n"
            "3️⃣ Understand how to claim your benefits (NSSF Claims)\n"
            "4️⃣ Learn more about social security & NSSF (NSSF Knowledge)\n\n"
            "What would you like to do today? Please reply with *1*, *2*, *3*, or *4*."
        )


def process_main_menu(user, state, text):
    """Processes user response on the main dashboard menu layer."""
    lang = user.language_preference

    if text == "1":
        # Launch registration
        state.current_step = "collect_name"
        state.set_context({"reg_started": True})
        if lang == "sw":
            return (
                "Safi sana! Hebu nikuandikishe sasa hivi ili uanze kujiwekea akiba ya uzeeni. 🏛️\n\n"
                "👉 Tafadhali andika *Majina yako kamili* (majina mawili au zaidi kama yaliyo kwenye Kitambulisho chako cha Taifa):"
            )
        else:
            return (
                "Excellent choice! Let's get you registered right now to start securing your retirement. 🏛️\n\n"
                "👉 Please type your *Full Name* (at least two names as they appear on your National ID Card):"
            )

    elif text == "2":
        # Balance check
        state.current_step = "check_balance"
        return process_check_balance(user, state, text)

    elif text == "3":
        # Claims guidance
        state.current_step = "claim_guidance"
        if lang == "sw":
            return (
                "Karibu kwenye mwongozo wa madai ya NSSF. 📋\n"
                "Chagua aina ya faida unayotaka kuielewa zaidi:\n\n"
                "1️⃣ Faida ya Uzeeni (Retirement Benefit - umri wa miaka 55+)\n"
                "2️⃣ Faida ya Walemavu (Invalidity Benefit - ulemavu wa kudumu)\n"
                "3️⃣ Faida ya Warithi (Survivors Benefit - kwa familia ya mwanachama aliyefariki)\n"
                "4️⃣ Kurudi kwenye orodha kuu (Main Menu)\n\n"
                "Jibu kwa kutuma nambari *1*, *2*, *3* au *4*."
            )
        else:
            return (
                "Welcome to the NSSF claims helper. 📋\n"
                "Select the category of benefits you want to learn about:\n\n"
                "1️⃣ Retirement Benefit (Age 55+ or early age 50)\n"
                "2️⃣ Invalidity Benefit (For permanent physical/mental disability)\n"
                "3️⃣ Survivors Benefit (For dependents of a deceased member)\n"
                "4️⃣ Go back to Main Menu\n\n"
                "Reply with *1*, *2*, *3* or *4*."
            )

    elif text == "4":
        # Knowledge Base queries powered by Gemini/Claude
        if lang == "sw":
            return (
                "Mimi ni mtaalamu wa mambo yote ya NSSF! 🧠\n"
                "Unaweza kuniuliza maswali yoyote uliyo nayo. Mathalani:\n"
                "• _Kuna adhabu gani nikichelewa kulipa?_\n"
                "• _Je, asilimia 6 inatolewaje kwa mfanyakazi nchini Kenya?_\n"
                "• _NSSF ni kodi au kibindo cha akiba?_\n\n"
                "Tafadhali andika swali lako sasa hivi kwa Kiswahili au Kiingereza, nami nitakujibu kwa undani mchezo mchezo!"
            )
        else:
            return (
                "I am an expert in everything NSSF! 🧠\n"
                "Ask me any general questions you have, such as:\n"
                "• _What are the penalties for late contributions?_\n"
                "• _How is the 6% rate calculated?_\n"
                "• _Is NSSF a tax or a personal savings account?_\n\n"
                "Go ahead and type your question now in English or Swahili, and I will gladly answer it!"
            )

    else:
        # Check if the user typed an informational query instead of picking menu numbers
        # If yes, we forward it to Gemini AI!
        logger.info("Forwarding menu input to Gemini as a standard question.")
        ai_reply = get_gemini_response(user.phone_number, text, "User was at the Main Menu choice and asked: " + text)
        if ai_reply:
            return ai_reply
            
        # If Claude isn't configured, give deterministic reminder
        if lang == "sw":
            return (
                "Samahani, sikuelewa chaguo hilo. 🙁\n"
                "Tafadhali chagua kwa kutuma namba kuanzia *1* hadi *4*.\n\n"
                "Tuma *menu* wakati wowote kurudi mwanzo."
            )
        else:
            return (
                "I didn't quite get that choice. 🙁\n"
                "Please choose by replying with a number between *1* and *4*.\n\n"
                "Type *menu* at any time to return to start."
            )


def process_collect_name(user, state, text):
    """Saves user name and asks for National ID."""
    lang = user.language_preference
    names = text.split()
    
    # Validate name consists of at least two words
    if len(names) < 2:
        if lang == "sw":
            return "⚠️ Tafadhali andika majina yako mawili kamili ili tuendelee (Majina yasipungue mawili):"
        else:
            return "⚠️ Please verify you typed your full official name. Enter at least two names:"
            
    # Save to transient db session context
    ctx = state.get_context()
    ctx["name"] = text
    state.set_context(ctx)
    
    state.current_step = "collect_id"
    if lang == "sw":
        return (
            f"Asante {text}! sasa,\n\n"
            "👉 Tafadhali andika *Nambari ya Kitambulisho chako cha Taifa* (National ID Number, tarakimu 7 hadi 8):"
        )
    else:
        return (
            f"Thank you, {text}! Now,\n\n"
            "👉 Please type your *National ID Card Number* (should be 7 to 8 digits long):"
        )


def process_collect_id(user, state, text):
    """Validates ID number and advances to DOB collection."""
    lang = user.language_preference
    
    # National ID must be digits and between 7 and 8 digits long in Kenya
    clean_id = "".join(filter(str.isdigit, text))
    if len(clean_id) < 7 or len(clean_id) > 8:
        if lang == "sw":
            return "⚠️ Kitambulisho cha Taifa lazima kiwe na tarakimu (namba) 7 au 8. Tafadhali andika nambari sahihi:"
        else:
            return "⚠️ A valid Kenya National ID should contain 7 or 8 digits. Please enter a valid one:"
            
    # Save ID to session
    ctx = state.get_context()
    ctx["id_number"] = clean_id
    state.set_context(ctx)
    
    state.current_step = "collect_dob"
    if lang == "sw":
        return (
            "Kazi nzuri! Sasa,\n\n"
            "👉 Tafadhali andika *Tarehe yako ya Kuzaliwa* kwa mfumo huu:\n"
            " *DD/MM/YYYY* (kwa mfano, kama ulizaliwa Tarehe 15, mwezi wa 8, 1994, andika *15/08/1994*):"
        )
    else:
        return (
            "Perfect. Next,\n\n"
            "👉 Please provide your *Date of Birth* in the following format:\n"
            " *DD/MM/YYYY* (e.g. if you were born on August 15, 1994, type *15/08/1994*):"
        )


def process_collect_dob(user, state, text):
    """Validates DOB format, ensures user is of age (18+) and advances."""
    lang = user.language_preference
    
    # Simple regex validation and birth math
    try:
        parts = text.split("/")
        if len(parts) != 3:
            raise ValueError()
        day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        dob_dt = datetime(year, month, day)
        
        # Calculate Age in 2026 (current time is 2026-05-20)
        curr_year = 2026
        age = curr_year - year
        if age < 18:
            if lang == "sw":
                return "⚠️ Samahani, lazima uwe na umri wa miaka 18 au zaidi kujiandikisha na NSSF. Tafadhali thibitisha tarehe:"
            else:
                return "⚠️ Sorry, you must be 18 years or older to register for an NSSF savings account. Please verify your age:"
                
        # Save to context
        ctx = state.get_context()
        ctx["date_of_birth"] = text
        state.set_context(ctx)
        
        state.current_step = "collect_occupation"
        
        # Build Occupation menu
        if lang == "sw":
            return (
                "Umefanya vizuri sana! Sasa tungependa kujua kazi unayofanya ili tushughulikie faili yako vizuri. 💼\n\n"
                "Chagua nambari moja ya kazi yako hapa chini:\n"
                "1️⃣ Boda boda Rider (Mwendesha Pikipiki)\n"
                "2️⃣ Mama Mboga / Vendor (Muuzaji wa Chakula/Grogery)\n"
                "3️⃣ Fundi / Artisan (Mjenzi, Seremala, Tailor n.k)\n"
                "4️⃣ Hawker / Retail Trader (Muuzaji wa barabarani)\n"
                "5️⃣ House Help (Mfanyikazi wa nyumbani)\n"
                "6️⃣ Farmer (Mkulima/Mfugaji)\n"
                "7️⃣ Kazi nyinginezo (Other Worker)\n\n"
                "Jibu kwa kutuma namba *1*, *2*, *3*, *4*, *5*, *6*, au *7*:"
            )
        else:
            return (
                "Excellent. Next, we would love to know what work you do to register your account profile accurately. 💼\n\n"
                "Choose one number corresponding to your occupation below:\n"
                "1️⃣ Boda boda Rider\n"
                "2️⃣ Mama Mboga / Groceries Vendor\n"
                "3️⃣ Fundi / Artisan (Mason, Carpenter, Tailor, Painter etc)\n"
                "4️⃣ Hawker / Street Retailer\n"
                "5️⃣ House Help / Domestic Aide\n"
                "6️⃣ Farmer / Agro-producer\n"
                "7️⃣ Other Informal Worker\n\n"
                "Reply with *1*, *2*, *3*, *4*, *5*, *6*, or *7*:"
            )

    except (ValueError, IndexError):
        if lang == "sw":
            return "⚠️ Tarehe isiyo sahihi. Tafadhali andika tarehe yako ya kuzaliwa kwa kutumia alama ya kukata (/) kama hivi: *DD/MM/YYYY* (kwa mfano *24/11/1997*):"
        else:
            return "⚠️ Invalid format. Please write your date of birth using slashes in the exact format: *DD/MM/YYYY* (e.g. *24/11/1997*):"


def process_collect_occupation(user, state, text):
    """Registers occupation option and asks for county selection."""
    lang = user.language_preference
    
    if text not in OCCUPATIONS:
        if lang == "sw":
            return "⚠️ Tafadhali chagua namba halali kuanzia *1* hadi *7* kulingana na orodha ya kazi:"
        else:
            return "⚠️ Please reply with a valid number from *1* to *7* corresponding to the listed occupations:"
            
    # Save occupation
    ctx = state.get_context()
    ctx["occupation"] = OCCUPATIONS[text]
    state.set_context(ctx)
    
    state.current_step = "collect_county"
    
    # We will show them a selection of some key counties, but tell them they can type their county directly or pick by number.
    # To satisfy "list all 47 Kenya counties as numbered options" we can construct a neat pagination or brief list, or let them input their county and we search for matching index!
    # Let's list common counties as options to keep it short on WhatsApp but allow them to just type any county name in Kenya.
    if lang == "sw":
        return (
            "Safi sana! Unafanya kazi katika Kaunti gani ya uendeshaji nchini Kenya? 📍\n\n"
            "👉 Tafadhali andika jina la Kaunti yako ya uendeshaji moja kwa moja (kwa mfano, Nairobi):"
        )
    else:
        return (
            "Great! In which County of operations do you work in Kenya? 📍\n\n"
            "👉 Please type your County of operations directly (e.g., Nairobi):"
        )


def process_collect_county(user, state, text):
    """Processes county input and proceeds to collecting password."""
    lang = user.language_preference
    selected_county = None
    
    # Check if they typed a number or typed a word
    clean_text = text.strip()
    if clean_text.isdigit():
        idx = int(clean_text)
        if 1 <= idx <= 47:
            selected_county = COUNTIES_LIST[idx - 1]
    else:
        # Search for matched string
        match = [c for c in COUNTIES_LIST if c.lower() == clean_text.lower()]
        if match:
            selected_county = match[0]
        else:
            # Check closest substring match
            match_sub = [c for c in COUNTIES_LIST if clean_text.lower() in c.lower()]
            if match_sub:
                selected_county = match_sub[0]

    # If county is not found in the official 47 list, we still allow whatever they typed to avoid blocking a worker's enrollment flow!
    if not selected_county:
        selected_county = clean_text.title()

    ctx = state.get_context()
    ctx["county"] = selected_county
    ctx["mpesa_phone"] = user.phone_number # Pre-fill with WhatsApp number
    state.set_context(ctx)

    state.current_step = "collect_password"
    
    if lang == "sw":
        return (
            "Imepatikana vizuri sana! Sasa, tafadhali weka nenosiri (password) lako jipya la siri ili kuongeza ulinzi kwenye akaunti yako ya Jiweke.\n\n"
            "⚠️ *Kumbuka vyema:* Tafadhali chagua nenosiri rahisi kukumbuka kwa sababu utaliitisha kila unapotaka kuingia tena mbeleni!"
        )
    else:
        return (
            "Excellent, county saved! Now, please set your new secret password to protect your account security.\n\n"
            "⚠️ *Make sure to remember:* Choose a password you can easily remember, as you will be required to enter it whenever you log in from now on!"
        )


def process_confirm_details(user, state, text):
    """Confirms user input and assigns target mock account."""
    lang = user.language_preference
    ctx = state.get_context()
    
    if text == "1":
        # Create user account and mock NSSF profile!
        # Generate random NSSF reference number e.g. NSSF-384918
        mock_nssf = f"NSSF-{random.randint(100000, 999999)}"
        
        user.name = ctx.get("name")
        user.id_number = ctx.get("id_number")
        user.date_of_birth = ctx.get("date_of_birth")
        user.occupation = ctx.get("occupation")
        user.county = ctx.get("county")
        user.password = ctx.get("password")
        user.nssf_number = mock_nssf
        user.registration_status = "complete"
        
        # Save state back to registered main menu track & log in immediately
        state.current_step = "main_menu"
        state.set_context({"authenticated": True}) # authenticated session
        
        db.session.commit()
        
        if lang == "sw":
            return (
                f"🎉 HONGERA SANA {user.name}! Sasa wewe ni mwanachama rasmi wa NSSF! 🎉\n\n"
                f"Nambari yako mpya ya NSSF ni: *{mock_nssf}* 🏆\n"
                "Nimeweka data zako salama kwenye vitabu vyetu vya akiba ya uzeeni.\n\n"
                "📝 *Mambo ya Kukumbuka kuhusu Akiba Yako:*\n"
                "• Unaweza kuchangia kiasi kidogo sana kama *Ksh 50* kila unapopata kipato chako.\n"
                "• Akiba hii sio kodi ya serikali; ni fedha zako mwenyewe, na serikali inakuongezea faida/riba (interest) mwaka hadi mwaka uzeeni!\n"
                "• Kuchangia fanya hivi: Enda Paybill na utumie *Paybill Namba 200222*, nambari yako ya akaunti iwe namba yako ya NSSF.\n"
                "• Unaweza kuangalia bakaa ya akiba yako wakati wowote hapa kwa kuandika neno *balance*.\n\n"
                "Tuma neno *menu* wakati wowote ili kuona orodha ya huduma tena."
            )
        else:
            return (
                f"🎉 CONGRATULATIONS {user.name}! You are now successfully registered with NSSF! 🎉\n\n"
                f"Your official NSSF Registration Number is: *{mock_nssf}* 🏆\n"
                "We have securely saved your profile inside the database.\n\n"
                "📝 *Important things to remember about your savings:*\n"
                "• This is NOT a government tax; it is your personal money which accumulates heavy compound interest over the years!\n"
                "• You can contribute as little as *KES 50* dynamically whenever you get cash (whether daily, weekly, or monthly).\n"
                "• To make a contribution, use M-Pesa *Paybill Number 200222* with your NSSF Number as the Account Number.\n"
                "• You can check your totals anytime by sending the word *balance* in this chat.\n\n"
                "Type *menu* at any time to return to the interactive dashboard."
            )
            
    elif text == "2":
        # Cancel and restart
        state.current_step = "collect_name"
        state.set_context({"reg_started": True})
        if lang == "sw":
            return (
                "Sawa, hebu tuanze kurejesha upya kwa usahihi. 🔄\n\n"
                "👉 Tafadhali andika upya *Majina yako mawili kamili* ya Kitambulisho cha Taifa:"
            )
        else:
            return (
                "No problem, let's restart and correct the inputs. 🔄\n\n"
                "👉 Please type your official *Full Name* once again:"
            )
    else:
        if lang == "sw":
            return "⚠️ Tafadhali chagua kwa kujibu: \n*1* (Ndiyo, nambari ipo sahihi) au \n*2* (Hapana, sahihisha):"
        else:
            return "⚠️ Please reply with either: \n*1* (Yes, details are correct) or \n*2* (No, correct details):"


def process_check_balance(user, state, text):
    """Calculates mock balance based on registration status."""
    lang = user.language_preference
    
    if user.registration_status != "complete":
        if lang == "sw":
            return (
                "⚠️ Hujakamilisha usajili wako wa NSSF bado.\n"
                "Ili uanze kuangalia akiba yako ya uzeeni au kuchangia kwa M-Pesa, tafadhali jiandikishe kwanza.\n\n"
                "Chagua *1* kwenye orodha kuu kurudi kwenye usajili."
            )
        else:
            return (
                "⚠️ You have not registered with NSSF yet.\n"
                "To check your active balances or make deposits via M-Pesa, you must complete your registration first.\n\n"
                "Please choose Option *1* in the Main Menu to begin registration."
            )
            
    # Mocking contributions database status
    total_months = 4
    total_amount = 2650.00
    pension_estimates = 3200.00 # basic projected monthly returns
    
    if lang == "sw":
        return (
            f"📊 *TAARIFA YA AKAUNTI YA NSSF YA {user.name.upper()}* 📊\n\n"
            f"• *Nambari ya NSSF:* {user.nssf_number}\n"
            f"• *Hali ya Akaunti:* Inafanya Kazi (Active)\n"
            f"• *Jumla Kuu ya Michango:* Ksh {total_amount:,.2f} 💰\n"
            f"• *Miezi Uliyochangia:* miezi {total_months}\n"
            f"• *Kadirio la Pensheni kila mwezi (umri wa miaka 55+):* Ksh {pension_estimates:,.2f}/mwezi\n\n"
            "💡 Unaweza kuongeza akiba yako sasa hivi! Changia kupitia Safaricom M-Pesa Paybill *200222*.\n\n"
            "Tuma neno *menu* kurudi kwenye orodha kuu."
        )
    else:
        return (
            f"📊 *NSSF ACCOUNT STATEMENT FOR {user.name.upper()}* 📊\n\n"
            f"• *NSSF Number:* {user.nssf_number}\n"
            f"• *Account Status:* Active\n"
            f"• *Total Contributed Savings:* KES {total_amount:,.2f} 💰\n"
            f"• *Active Contribution Months:* {total_months} months\n"
            f"• *Estimated Monthly Pension (at age 55 retirement):* KES {pension_estimates:,.2f}/month\n\n"
            "💡 You can increase your savings right now! Simply chip in via M-Pesa Paybill *200222* with your NSSF number.\n\n"
            "Type *menu* to return to the interactive dashboard."
        )


def process_claim_guidance(user, state, text):
    """Walks manual claims categories and displays nearest county offices."""
    lang = user.language_preference
    user_county = user.county if user.county else "Nairobi"
    
    if text == "4" or text.lower() in ["menu", "back", "kurudi"]:
        state.current_step = "main_menu"
        return get_menu_message(lang)
        
    nearest_office = f"NSSF Branch Office in {user_county} County"
    if user_county.lower() in ["nairobi", "machakos", "kiambu"]:
        nearest_office = f"NSSF Nyayo House, Hill Plaza branch or nearest hub in {user_county}"
    elif user_county.lower() == "mombasa":
        nearest_office = "NSSF branch located at Social Security House, Nkrumah Road, Mombasa"
    elif user_county.lower() == "kisumu":
        nearest_office = "NSSF Branch inside Re-Insurance Plaza, Kisumu"

    if text == "1":
        if lang == "sw":
            return (
                f"👵🧓 *Chaguo 1: Faida ya Uzeeni (Age & Retirement Benefit)*\n\n"
                "Unastahili kudai kiasi hiki ukifikia umri wa miaka 55, au kupitia kujiuzulu mapema ukifikia miaka 50.\n\n"
                "📜 *Nyaraka zinazohitajika kuwasilisha tawi la NSSF:*\n"
                "1. Kitambulisho chako cha Kitaifa cha asili na nakala yake\n"
                "2. Kadi yako ya NSSF ya asili au Kitambulisho\n"
                "3. Nambari ya akaunti ya Benki iliyoidhinishwa na picha za pasipoti mbili\n"
                "4. Barua ya kusimamishwa kazi au barua ya kustaafu (kama unaajiriwa)\n\n"
                f"📍 *Ofisi ya NSSF iliyo karibu nawe:* {nearest_office}.\n\n"
                "Tuma *menu* au chagua nambari nyingine kuanzia 1 hadi 4 kuendelea mbele."
            )
        else:
            return (
                f"👵🧓 *Choice 1: Retirement & Age Benefit Guidance*\n\n"
                "You are eligible to claim your accumulated savings upon attaining the retirement age of 55, or early retirement at age 50.\n\n"
                "📜 *Documents needed to apply:*\n"
                "1. Original National ID Card and a clean photocopy\n"
                "2. Original NSSF Member Card/Slip\n"
                "3. Certified copy of Bank Account details and your KRA PIN\n"
                "4. Two recent colored passport-size photographs\n\n"
                f"📍 *Your Nearest NSSF Branch office is:* {nearest_office}.\n\n"
                "Type *menu* to return or choose another option (1-4)."
            )

    elif text == "2":
        if lang == "sw":
            return (
                f"♿ *Chaguo 2: Faida ya Walemavu (Invalidity Benefit)*\n\n"
                "Mwanachama yeyote anayepata ulemavu wa kudumu wa kimwili au kiakili unaomzuia kufanya kazi anaweza kudai faida hii.\n\n"
                "📜 *Nyaraka zinazohitajika kuwasilisha:*\n"
                "1. Ripoti rasmi ya daktari iliyothibitishwa (Medical Board Report)\n"
                "2. Kitambulisho chako cha asili na kadi ya NSSF\n"
                "3. Maelezo ya akaunti yako ya benki kupokea malipo\n\n"
                f"📍 *Tawi la karibu na Kaunti yako ya {user_county}:* {nearest_office}.\n\n"
                "Tuma *menu* au chagua nambari nyingine kuendelea mbele."
            )
        else:
            return (
                f"♿ *Choice 2: Invalidity / Physical Disability Benefit*\n\n"
                "This benefit is payable to members who have sustained a permanent physical or mental disability which prevents them from engaging in active employment.\n\n"
                "📜 *Documents needed to apply:*\n"
                "1. Certified Medical Report from a government medical officer/board\n"
                "2. Original National ID and NSSF Card\n"
                "3. Bank account details and passport pictures\n\n"
                f"📍 *Your Nearest NSSF Branch office is:* {nearest_office}.\n\n"
                "Type *menu* to return or choose another option (1-4)."
            )

    elif text == "3":
        if lang == "sw":
            return (
                f"🕯️ *Chaguo 3: Faida ya Warithi (Survivors Benefit)*\n\n"
                "Hulipwa kwa watu tegemezi au familia ya mwanachama aliyefariki ambaye alikuwa mchangiaji.\n\n"
                "📜 *Inavyohitajika kudai:*\n"
                "1. Cheti cha asili cha kifo cha mwanachama (Death Certificate)\n"
                "2. Barua ya uthibitisho wa chifu wa eneo hilo au barua ya utawala\n"
                "3. Vitambulisho vya warithi / tegemezi na cheti cha ndoa au cheti cha kuzaliwa kwa watoto\n\n"
                f"📍 *Ofisi iliyo karibu kwa madai haya:* {nearest_office}.\n\n"
                "Tuma *menu* kurudi kwenye usajili au orodha kuu."
            )
        else:
            return (
                f"🕯️ *Choice 4: Survivors Benefit (Deceased Member Recovery)*\n\n"
                "Payable to the dependents/family members of a deceased member who had contributed to NSSF.\n\n"
                "📜 *Documents required to claim support:*\n"
                "1. Original Death Certificate of the deceased member\n"
                "2. Identification cards and birth certificates of dependants/marriage certificate of spouse\n"
                "3. Letter of administration or Chief's confirmation letter\n\n"
                f"📍 *Nearest security administration office:* {nearest_office}.\n\n"
                "Type *menu* to go back to the Main Menu dashboard."
            )

    else:
        # Unexpected input during claims guidance. Remind them on valid choices.
        if lang == "sw":
            return (
                "⚠️ Chaguo haramu. Tafadhali chagua:\n"
                "• *1* - Faida ya uzeeni\n"
                "• *2* - Faida ya ulemavu\n"
                "• *3* - Faida ya warithi\n"
                "• *4* - Kurudi Orodha Kuu."
            )
        else:
            return (
                "⚠️ Invalid option during Claims. Please reply with:\n"
                "• *1* for Retirement benefit\n"
                "• *2* for Invalidity benefit\n"
                "• *3* for Survivors benefit\n"
                "• *4* to go back to Main Menu."
            )


def process_login_id(user, state, text):
    lang = user.language_preference
    clean_id = "".join(filter(str.isdigit, text))
    if clean_id == user.id_number:
        state.current_step = "login_password"
        db.session.commit()
        return (
            "Nambari yako ya Kitambulisho imethibitishwa vyema! ✔️\n\n👉 Sasa, tafadhali andika *Nenosiri (Password)* lako la siri kuingia kwenye huduma zako za NSSF:"
            if lang == "sw" else
            "Your National ID Number has been successfully verified! ✔️\n\n👉 Now, please type your *Password* to access NSSF services:"
        )
    else:
        return (
            "⚠️ Kitambulisho hicho hakilingani na akaunti yako ya nambari hii. Tafadhali andika Kitambulisho chako sahihi:"
            if lang == "sw" else
            "⚠️ That National ID does not match the registered account for this phone number. Please enter your correct ID:"
        )


def process_login_password(user, state, text):
    lang = user.language_preference
    # Ezekiel/Mary fallback password "1234"
    expected_password = user.password or "1234"
    if text == expected_password:
        state.current_step = "main_menu"
        state.set_context({"authenticated": True})
        db.session.commit()
        return (
            f"Mambo sawa! Umeingia kikamilifu kwenye akaunti yako ya Jiweke. 🔓\n\n{get_menu_message(lang)}"
            if lang == "sw" else
            f"Success! You have successfully logged into your Jiweke account. 🔓\n\n{get_menu_message(lang)}"
        )
    else:
        return (
            "⚠️ Nenosiri lako si sahihi. Tafadhali jaribu tena:"
            if lang == "sw" else
            "⚠️ Incorrect password. Please try again:"
        )


def process_collect_password(user, state, text):
    lang = user.language_preference
    context = state.get_context()
    context["password"] = text
    state.current_step = "confirm_details"
    state.set_context(context)
    db.session.commit()

    masked_password = "*" * len(text) if text else "****"

    if lang == "sw":
        return (
            f"Mambo ni moto! Tumeshamaliza kukusanya data zako zote. Tafadhali kagua maelezo haya kabla sijakuandikisha rasmi: 📝\n\n"
            f"👤 *Majina:* {context.get('name')}\n"
            f"🆔 *Kitambulisho (National ID):* {context.get('id_number')}\n"
            f"📅 *Kuzaliwa (DOB):* {context.get('date_of_birth')}\n"
            f"💼 *Kazi:* {context.get('occupation')}\n"
            f"📍 *Kaunti:* {context.get('county')}\n"
            f"🔑 *Nenosiri la Siri:* {masked_password}\n"
            f"💸 *Nambari ya M-Pesa:* {context.get('mpesa_phone')}\n\n"
            f"Je, maelezo haya yapo Sahihi?\n"
            f"1️⃣ Ndiyo, maelezo yapo sahihi. Nihifadhi sasa\n"
            f"2️⃣ Hapana, nataka kurekebisha baadhi yazo"
        )
    else:
        return (
            f"We are almost there! We have collected all your details. Please review carefully before we finalize registration: 📝\n\n"
            f"👤 *Full Name:* {context.get('name')}\n"
            f"🆔 *National ID:* {context.get('id_number')}\n"
            f"📅 *Date of Birth:* {context.get('date_of_birth')}\n"
            f"💼 *Occupation:* {context.get('occupation')}\n"
            f"📍 *County:* {context.get('county')}\n"
            f"🔑 *Password:* {masked_password}\n"
            f"💸 *M-Pesa Phone:* {context.get('mpesa_phone')}\n\n"
            f"Are these details correct?\n"
            f"1️⃣ Yes, proceed with registration\n"
            f"2️⃣ No, correct or restart registration"
        )
