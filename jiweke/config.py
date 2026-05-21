# config.py
# This file reads application configurations from environment variables
# using python-dotenv.

import os
from dotenv import load_dotenv

# Load variables from .env file if it exists
load_dotenv()

class Config:
    """Base Configuration class containing shared parameters."""
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "default-fallback-key-change-in-prod")
    DEBUG = os.environ.get("DEBUG", "True").lower() == "true"
    
    # SQLAlchemy configuration - default to SQLite for dev, but supports PostgreSQL
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///jiweke.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # WhatsApp configuration
    WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
    WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
    WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "jiweke-verify-token-2024")
    
    # Anthropic Claude API Configuration
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    
    # M-Pesa Daraja API credentials
    MPESA_CONSUMER_KEY = os.environ.get("MPESA_CONSUMER_KEY", "todo")
    MPESA_CONSUMER_SECRET = os.environ.get("MPESA_CONSUMER_SECRET", "todo")
    MPESA_SHORTCODE = os.environ.get("MPESA_SHORTCODE", "todo")
    MPESA_PASSKEY = os.environ.get("MPESA_PASSKEY", "todo")
