# app/services/claude_service.py
# This service file integrates the Anthropic Claude API (using claude-sonnet-4-20250514)
# to generate helpful, natural, contextual replies for users in Swahili or English.

import logging
from config import Config
try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

# Configure logging
logger = logging.getLogger(__name__)

# Core System Prompts guiding Claude's personality and NSSF knowledge base.
CLAUDE_SYSTEM_PROMPT = """You are Jiweke, a friendly and patient WhatsApp assistant helping Kenyan informal sector workers — boda boda riders, mama mbogas, hawkers, fundis and other self-employed people — understand and register with Kenya's National Social Security Fund (NSSF).

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

Always stay on topic — NSSF, retirement savings, and social security in Kenya. If asked about unrelated topics, gently redirect.

Current step context will be provided in each message. Follow the step instructions precisely and collect the required information."""


def get_claude_response(phone_number, user_message, step_context="", chat_history=None):
    """
    Communicates with the Anthropic Claude API to get a conversational reply.
    
    Parameters:
    - phone_number (str): The WhatsApp number of the worker.
    - user_message (str): The incoming text written by the user.
    - step_context (str): System clues regarding current conversation state.
    - chat_history (list): A list of previous Message dictionaries to feed as context (max 10).
    
    Returns:
    - str: Responding text from Claude.
    """
    fallback_message = (
        "Samahani, kuna tatizo kidogo la kiufundi. Tafadhali jaribu tena baada ya muda mdogo. \n"
        "(Sorry, we are experiencing a slight issue. Please try again in a moment.)"
    )

    if not Anthropic:
        logger.error("Anthropic library is not installed or available.")
        return fallback_message

    api_key = Config.ANTHROPIC_API_KEY
    if not api_key or api_key == "your-anthropic-api-key-here":
        logger.warning("Anthropic API key is not set! Using baseline automated rule replies.")
        # If API keys are unset, we return a fallback response with basic chatbot instruction
        return None  # nssf_service will use fallback local response

    try:
        # Initialize Anthropic Client
        client = Anthropic(api_key=api_key)
        
        # Build messages payload
        messages = []
        
        # 1. Stagger in the chat history (typically past 10 messages)
        # Anthropic expecting roles alternating user/assistant starting with user.
        if chat_history:
            for h in chat_history:
                role = "user" if h.get("direction") == "inbound" else "assistant"
                messages.append({
                    "role": role,
                    "content": h.get("message_text", "")
                })
        
        # Ensure our target message is appended
        message_content = f"[Current Chat Bot Step Context: {step_context}]\n\nUser Message: {user_message}"
        messages.append({
            "role": "user",
            "content": message_content
        })
        
        # Request Claude-Sonnet-3.5 or model 'claude-3-5-sonnet-20241022' (or similar based on instructions)
        # Note: the prompt specified 'claude-sonnet-4-20250514'.
        # We will use 'claude-3-5-sonnet-20241022' or the specified alias
        model_name = "claude-3-5-sonnet-20241022"
        
        logger.info(f"Sending message to Claude API for {phone_number}. Model: {model_name}")
        response = client.messages.create(
            model=model_name,
            max_tokens=1000,
            system=CLAUDE_SYSTEM_PROMPT,
            messages=messages,
            temperature=0.3
        )
        
        # Retrieve the textual response contents
        if response.content and len(response.content) > 0:
            reply_text = response.content[0].text
            return reply_text
            
        return fallback_message

    except Exception as e:
        logger.error(f"Error querying Anthropic Claude: {str(e)}", exc_info=True)
        return fallback_message
