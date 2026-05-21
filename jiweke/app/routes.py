# app/routes.py
# This file constructs the main Flask Blueprints directing WhatsApp communications.
# Handles GET verification challenges and incoming POST notifications from Meta servers.

import logging
from flask import Blueprint, request, jsonify, make_response
from config import Config
from app.services.nssf_service import handle_user_message

# Declare our main application controller Blueprint route layer
main_bp = Blueprint('main', __name__)
logger = logging.getLogger(__name__)

from datetime import datetime

def seed_demo_data():
    from app import db
    from app.models import User, ConversationState, Message
    
    # Clean database first to avoid duplicate primary key violations on reseeding
    db.session.query(ConversationState).delete()
    db.session.query(Message).delete()
    db.session.query(User).delete()
    db.session.commit()
    
    # Seed 3 Demo Users
    u1 = User(
        phone_number="254712345678",
        name="Ezekiel Kamau",
        id_number="31456128",
        date_of_birth="12/04/1988",
        occupation="Boda Boda Rider",
        county="Nairobi",
        nssf_number="NSSF-482910",
        registration_status="complete",
        language_preference="sw",
        password="1234"
    )
    u2 = User(
        phone_number="254722987654",
        name="Mary Wambui Mwangi",
        id_number="29871034",
        date_of_birth="30/08/1991",
        occupation="Mama Mboga / Vendor",
        county="Nakuru",
        nssf_number="NSSF-739104",
        registration_status="complete",
        language_preference="sw",
        password="1234"
    )
    u3 = User(
        phone_number="254733445566",
        name="Moses Omondi",
        id_number="33894726",
        date_of_birth="14/05/1995",
        occupation="Fundi / Artisan",
        county=None,
        nssf_number=None,
        registration_status="in_progress",
        language_preference="en",
        password=None
    )
    db.session.add_all([u1, u2, u3])
    db.session.commit()
    
    # Seed their Conversation States
    cs1 = ConversationState(phone_number="254712345678", current_step="main_menu")
    cs1.set_context({})
    
    cs2 = ConversationState(phone_number="254722987654", current_step="main_menu")
    cs2.set_context({})
    
    cs3 = ConversationState(phone_number="254733445566", current_step="collect_county")
    cs3.set_context({
        "name": "Moses Omondi",
        "id_number": "33894726",
        "date_of_birth": "14/05/1995",
        "occupation": "Fundi / Artisan"
    })
    db.session.add_all([cs1, cs2, cs3])
    db.session.commit()
    
    # Message Logs
    m1 = Message(
        phone_number="254712345678",
        direction="inbound",
        message_text="Habari zenu",
        timestamp=datetime.utcnow()
    )
    m2 = Message(
        phone_number="254712345678",
        direction="outbound",
        message_text="Karibu Jiweke! 👋 Mimi ni msaidizi wako wa digitali wa NSSF nchini Kenya. ✨\n\nNitakusaidia kwa urahisi:\n1️⃣ Kujiunga na NSSF (NSSF Registration)\n2️⃣ Kuangalia akiba yako ya sasa (NSSF Balance)\n3️⃣ Kuelewa namna ya kudai faida zako (NSSF Claims)\n4️⃣ Kujifunza zaidi kuhusu NSSF (NSSF Knowledge)\n\nUngependa kuanza na nini leo? Tafadhali jibu kwa kutuma nambari *1*, *2*, *3*, au *4*.\n\n💡 Tuma *menu* kurudi mwanzo.",
        timestamp=datetime.utcnow()
    )
    db.session.add_all([m1, m2])
    db.session.commit()

@main_bp.route('/', methods=['GET'])
def index():
    """Simple status/health check check endpoint."""
    return jsonify({
        "app": "Jiweke NSSF WhatsApp Assistant",
        "status": "online",
        "api_endpoints": {
            "whatsapp_webhook": "/webhook"
        }
    })

@main_bp.route('/api/simulator/data', methods=['GET'])
def get_simulator_data():
    from app.models import User, ConversationState, Message
    users = User.query.all()
    # Auto-seed if SQLite is completely empty
    if not users:
        seed_demo_data()
        users = User.query.all()
        
    states = ConversationState.query.all()
    messages = Message.query.all()
    return jsonify({
        "users": [u.to_dict() for u in users],
        "conversationStates": [s.to_dict() for s in states],
        "messageLogs": [m.to_dict() for m in messages[-100:]]
    })

@main_bp.route('/api/simulator/reset', methods=['POST'])
def reset_simulator():
    from app import db
    from app.models import User, ConversationState
    data = request.get_json() or {}
    phone_number = data.get("phoneNumber")
    
    if phone_number:
        state = ConversationState.query.filter_by(phone_number=phone_number).first()
        if state:
            state.current_step = "select_language"
            state.set_context({})
            state.last_message_at = datetime.utcnow()
            
        user = User.query.filter_by(phone_number=phone_number).first()
        if user and user.registration_status != "complete":
            user.registration_status = "pending"
            user.nssf_number = None
            user.name = None
            user.id_number = None
            user.county = None
            user.date_of_birth = None
            user.occupation = None
        db.session.commit()
    else:
        seed_demo_data()
        
    return jsonify({"success": True})

@main_bp.route('/api/simulator/chat', methods=['POST'])
def chat_simulator():
    from app.models import User, ConversationState
    data = request.get_json() or {}
    phone_number = data.get("phoneNumber")
    message_text = data.get("messageText")
    
    if not phone_number or not message_text:
        return jsonify({"error": "Missing phoneNumber or messageText"}), 400
        
    from app.services.nssf_service import handle_user_message
    reply = handle_user_message(phone_number, message_text)
    
    # Reload after modification
    user = User.query.filter_by(phone_number=phone_number).first()
    state = ConversationState.query.filter_by(phone_number=phone_number).first()
    
    return jsonify({
        "reply": reply,
        "user": user.to_dict() if user else None,
        "state": state.to_dict() if state else None
    })

@main_bp.route('/api/simulator/lang', methods=['POST'])
def change_language_simulator():
    from app import db
    from app.models import User
    data = request.get_json() or {}
    phone_number = data.get("phoneNumber")
    lang = data.get("lang")
    
    user = User.query.filter_by(phone_number=phone_number).first()
    if user and lang in ["sw", "en"]:
        user.language_preference = lang
        db.session.commit()
        return jsonify({"success": True, "user": user.to_dict()})
    else:
        return jsonify({"error": "Invalid user or language"}), 400

@main_bp.route('/api/simulator/mpesa', methods=['POST'])
def mpesa_simulator():
    from app import db
    from app.models import User, Message
    data = request.get_json() or {}
    phone_number = data.get("phoneNumber")
    amount = data.get("amount")
    
    user = User.query.filter_by(phone_number=phone_number).first()
    if not user or user.registration_status != "complete":
        return jsonify({"error": "User must be completely registered first to save."}), 400
        
    # Log simulated STK Push Inbound
    m_in = Message(
        phone_number=phone_number,
        direction="inbound",
        message_text=f"[SIMULATED STK PUSH ACCEPTED] amount: KES {amount}"
    )
    db.session.add(m_in)
    db.session.commit()
    
    confirmation_alert = (
        f"📩 *M-PESA DEPOSIT ALERT* 📩\n\n"
        f"Tumepokea mchango wako wa *Ksh {amount}* kupitia M-Pesa STK Push. Akiba yako imehifadhiwa kwa NSSF Reference: *{user.nssf_number}*.\n"
        f"Asante kwa kupalilia kibindo chako cha uzeeni! 🌱"
    ) if user.language_preference == "sw" else (
        f"📩 *M-PESA DEPOSIT ALERT* 📩\n\n"
        f"We have received your contribution of *KES {amount}* via M-Pesa STK Push. Your savings have been credited into NSSF Ref: *{user.nssf_number}*.\n"
        f"Thank you for planting your retirement seeds! 🌱"
    )
    
    # Log simulated confirmation alert Outbound
    m_out = Message(
        phone_number=phone_number,
        direction="outbound",
        message_text=confirmation_alert
    )
    db.session.add(m_out)
    db.session.commit()
    
    return jsonify({"success": True, "alert": confirmation_alert})


@main_bp.route('/webhook', methods=['GET'])
def whatsapp_verification():
    """
    GET request handler for WhatsApp Cloud API verification check.
    Safaricom & Facebook developers dashboard calls this GET request when registering the webhook.
    """
    # Hub query parameters sent by Meta servers during webhook setup
    hub_mode = request.args.get('hub.mode')
    hub_token = request.args.get('hub.verify_token')
    hub_challenge = request.args.get('hub.challenge')
    
    logger.info(f"Received webhook verification request: mode={hub_mode}, token={hub_token}")

    if hub_mode == "subscribe":
        # Ensure token specified in Facebook developer setup matches what is stored in configuration env
        expected_token = Config.WHATSAPP_VERIFY_TOKEN
        
        if hub_token == expected_token:
            logger.info("Webhook subscription verified successfully!")
            # Challenge MUST be returned as clean plain text
            response = make_response(str(hub_challenge))
            response.headers['Content-Type'] = 'text/plain'
            return response
            
        logger.warning(f"Verification token mismatch! Expected: {expected_token}, Got: {hub_token}")
        return "Unauthorized verification token mismatch", 403
        
    return "Invalid subscription request mode", 400


@main_bp.route('/webhook', methods=['POST'])
def whatsapp_message_received():
    """
    POST webhook receiver where Meta uploads all real-time WhatsApp events.
    Parses structural text inputs, protects state with try/except, and returns immediate 200 OK
    so Meta doesn't queue and repeat events.
    """
    try:
        data = request.get_json()
        logger.info(f"Incoming WhatsApp Event Payload: {data}")
        
        # Verify valid structure containing message details
        if not data or "entry" not in data:
            # Not a standard message body we can act upon, ignore gracefully
            return jsonify({"status": "ignored", "reason": "non_conforming_payload"}), 200

        # Meta packs webhook objects nested in list structures:
        # data.entry[0].changes[0].value.messages[0]
        for entries in data.get("entry", []):
            for changes in entries.get("changes", []):
                value = changes.get("value", {})
                
                # Check for list of active messages
                if "messages" in value:
                    for msg in value.get("messages", []):
                        # Extract sender detail
                        sender_phone = msg.get("from") # Format 2547XXXXXXXX
                        message_id = msg.get("id")
                        
                        # Guard to identify message body content type (ignore media, stickers, etc.)
                        if msg.get("type") == "text":
                            message_text = msg.get("text", {}).get("body", "")
                            
                            logger.info(f"Received message ID {message_id} from {sender_phone}: '{message_text}'")
                            
                            # Handle state advancement and respond back
                            handle_user_message(sender_phone, message_text)
                            
                        else:
                            # Not text message (could be image, audios, location, interactive list)
                            # Handle gracefully by telling user we only read text
                            logger.info(f"Received unsupported attachment type: {msg.get('type')}")
                            
                            # Determine language preference if we have user
                            from app.models import User
                            user = User.query.filter_by(phone_number=sender_phone).first()
                            lang = user.language_preference if user else "sw"
                            
                            fallback_notice = (
                                "Habari! Kwa sasa bado siwezi kusoma picha au sauti. 🙁\n"
                                "Tafadhali andika ujumbe wako kwa njia ya sauti au maandishi kama *haraka*.\n\n"
                                "Tuma neno *menu* kurudi mwanzo."
                            ) if lang == "sw" else (
                                "Hello! I cannot read images, voices, or documents yet. 🙁\n"
                                "Please send your query as standard typed text message so I can assist you!\n\n"
                                "Type *menu* to open dashboard."
                            )
                            
                            from app.services.whatsapp_service import send_whatsapp_message
                            send_whatsapp_message(sender_phone, fallback_notice)

        # Meta demands a 200 response immediately or retries endless times
        return jsonify({"status": "success", "message": "event_processed_safely"}), 200

    except Exception as general_err:
        # NEVER return a 500 error to Meta servers during crashes
        # Log it and recover silently
        logger.critical(f"Critical crash in POST webhook: {str(general_err)}", exc_info=True)
        return jsonify({"status": "recovered_error", "details": str(general_err)}), 200
