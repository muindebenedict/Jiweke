# app/services/whatsapp_service.py
# This service file integrates Meta's WhatsApp Cloud API to send individual messages
# to Kenyan workers. It logs transactions and catches HTTP communication errors.

import requests
import logging
from config import Config

logger = logging.getLogger(__name__)

def send_whatsapp_message(phone_number, message_text):
    """
    Sends a WhatsApp message via Meta Cloud API.
    
    Parameters:
    - phone_number (str): recipient's phone number e.g. 2547XXXXXXXX
    - message_text (str): body of text to send
    
    Returns:
    - bool: True if successfully dispatched, False otherwise
    """
    token = Config.WHATSAPP_TOKEN
    phone_id = Config.WHATSAPP_PHONE_NUMBER_ID

    logger.info(f"Attempting to send WhatsApp message to {phone_number}: {message_text[:40]}...")

    # Log/warn if webhook configuration is incomplete
    if not token or token == "your-whatsapp-token-here" or not phone_id or phone_id == "your-phone-number-id-here":
        logger.warning(
            f"[SANDBOX MODE] WhatsApp credentials not configured. "
            f"Pretending to send message to {phone_number}: \n'{message_text}'"
        )
        # Still return True in sandbox/dev to let local simulator or testing proceed without crashing
        return True

    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone_number,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message_text
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        
        # Check HTTP status code
        if response.status_code in [200, 201]:
            logger.info(f"WhatsApp message dispatched successfully to {phone_number}")
            return True
        else:
            logger.error(
                f"WhatsApp API returned error code {response.status_code}. "
                f"Response body: {response.text}"
            )
            return False
            
    except requests.exceptions.RequestException as req_err:
        logger.error(f"HTTP request exception while sending WhatsApp message to {phone_number}: {str(req_err)}")
        return False
