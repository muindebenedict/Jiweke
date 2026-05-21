import os
import requests
import logging

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_PROMPT = """You are Jiweke, a friendly and patient WhatsApp assistant helping Kenyan informal sector workers — boda boda riders, mama mbogas, hawkers, fundis and other self-employed people — understand and register with Kenya's National Social Security Fund (NSSF).

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

Always stay on topic — NSSF, retirement savings, and social security in Kenya. If asked about unrelated topics, gently redirect."""

def get_gemini_response(phone_number, user_message, step_context="", chat_history=None):
    """
    Query the Gemini API (using gemini-3.5-flash) to get a helpful response.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not set. Falling back to local responses.")
        return None
        
    # Query the Gemini API using gemini-2.0-flash model (Updated to address model name error)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    # Format chat history and message
    # Convert history into Gemini contents format if present
    contents = []
    
    if chat_history:
        for item in chat_history:
            role = "user" if item.get("direction") == "inbound" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": item.get("message_text", "")}]
            })
            
    # Add the current user query
    contents.append({
        "role": "user",
        "parts": [{"text": f"[Step Context: {step_context}]\n\nUser Question: {user_message}"}]
    })
    
    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": GEMINI_SYSTEM_PROMPT}]
        },
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 600
        }
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 200:
            res_json = response.json()
            # Extract response text
            candidates = res_json.get("candidates")
            if candidates and len(candidates) > 0:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and len(parts) > 0:
                    return parts[0].get("text", "")
            logger.error(f"Failed to find content in Gemini API response: {response.text}")
        else:
            logger.error(f"Gemini API returned status code {response.status_code}: {response.text}")
    except Exception as e:
        logger.error(f"Error calling Gemini REST API: {str(e)}", exc_info=True)
        
    return None
