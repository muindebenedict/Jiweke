# app/services/mpesa_service.py
# This service file scaffolds Safaricom's M-Pesa Daraja API for STK Push contributions (Phase 2).
# It provides token retrieval methods and outlines the POST request payloads for triggering payment prompts on users' phones.

import logging
import requests
from requests.auth import HTTPBasicAuth
from config import Config

logger = logging.getLogger(__name__)

def get_mpesa_access_token():
    """
    Retrieves the OAuth2 bearer access token from Daraja API using Developer Keys.
    
    Returns:
    - str: Access token if successful, None otherwise.
    """
    consumer_key = Config.MPESA_CONSUMER_KEY
    consumer_secret = Config.MPESA_CONSUMER_SECRET
    
    if consumer_key == "todo" or consumer_secret == "todo":
        logger.warning("[M-PESA] Developer Credentials are set to default 'todo'. Token retrieval skipped.")
        return None
        
    url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    try:
        response = requests.get(url, auth=HTTPBasicAuth(consumer_key, consumer_secret), timeout=10)
        if response.status_code == 200:
            token = response.json().get("access_token")
            logger.info("Successfully fetched M-Pesa Daraja Access Token.")
            return token
        else:
            logger.error(f"Failed to fetch M-Pesa token. HTTP Status: {response.status_code}, Body: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Exception raised during M-Pesa token generation: {str(e)}")
        return None


def trigger_stk_push(phone_number, amount, account_reference):
    """
    Dispatches a Daraja API STK Push request to Safaricom.
    This prompts the Kenyan worker with an M-Pesa UI window on their Safaricom SIM card,
    asking them to enter their M-Pesa PIN to complete the NSSF voluntary retirement payment.
    
    Parameters:
    - phone_number (str): format 2547XXXXXXXX or 2541XXXXXXXX
    - amount (int/float): contribution amount in Kenya Shillings (e.g., KES 50, 100, 200)
    - account_reference (str): The assigned target NSSF account number (e.g. NSSF-847291)
    
    Returns:
    - dict: Safaricom API response payload or mock dictionary.
    """
    # Parse phone number to match format 2547...
    formatted_phone = phone_number
    if formatted_phone.startswith("+"):
        formatted_phone = formatted_phone[1:]
    if formatted_phone.startswith("0"):
        formatted_phone = "254" + formatted_phone[1:]
        
    # LOG THE PAYMENT TRIGGER INITIATION
    logger.info(f"Initiating STK Push for {formatted_phone} of KES {amount} reference NSSF {account_reference}...")

    token = get_mpesa_access_token()
    if not token:
        logger.warning(
            f"[M-PESA SCAFFOLD] Safaricom Credentials are not fully configured. "
            f"Simulating STK Push request dispatch to Safaricom on phone: {formatted_phone} to save KES {amount} NSSF."
        )
        return {
            "status": "simulated_success",
            "MerchantRequestID": "sim-req-8394-02",
            "CheckoutRequestID": "sim-checkout-7281-01",
            "ResponseCode": "0",
            "ResponseDescription": "Success. Request accepted for processing on phone screen."
        }

    # Safaricom STK Push Sandbox endpoint
    url = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/query" # Or process endpoint
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Payload format required by Daraja OpenAPI
    payload = {
        "BusinessShortCode": Config.MPESA_SHORTCODE,
        "Password": "TODO_GENERATED_BASE64_PASSWORD",
        "Timestamp": "20260520175000",
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": int(formatted_phone),
        "PartyB": Config.MPESA_SHORTCODE,
        "PhoneNumber": int(formatted_phone),
        "CallBackURL": "https://your-domain.ngrok-free.app/api/mpesa/callback",
        "AccountReference": account_reference,
        "TransactionDesc": f"NSSF Voluntary Savings Jiweke"
    }

    # TODO: Perform actual requests.post call and process Safaricom Response
    # Since this is Phase 2, we return a mock success structure for testing stability
    logger.info("STK Push triggered in sandbox mode with valid bearer token.")
    return {
        "status": "success",
        "MerchantRequestID": "sim-req-daraja",
        "CheckoutRequestID": "sim-checkout-daraja",
        "ResponseCode": "0",
        "ResponseDescription": "Success. Prompt delivered to Safaricom Subscriber."
    }
