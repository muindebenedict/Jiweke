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
