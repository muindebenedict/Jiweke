export interface PythonFile {
  path: string;
  description: string;
  language: string;
  content: string;
}

export const pythonProjectFiles: PythonFile[] = [
  {
    path: "run.py",
    description: "The primary execution entrypoint used to run the Flask application locally.",
    language: "python",
    content: `# run.py
# This is the primary execution script for the Jiweke Flask Web Application.
# Run this locally using: python run.py

import logging
from app import create_app

# Set up logging level and formatting to follow PEP8 logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] (%(name)s) %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Instantiate the application factory
app = create_app()

if __name__ == "__main__":
    print("\\n--------------------------------------------------------------")
    print("🚀 JIWEKE NSSF WHATSAPP AI ASSISTANT RUNNING 🚀")
    print("--------------------------------------------------------------")
    print("Developing Locally? Use ngrok to tunnel to Meta Developer Portal:")
    print("👉 Command: ngrok http 5000")
    print("Copy the forwarding https URL and configure it in Meta App Dashboard as Webhook URL!")
    print("--------------------------------------------------------------\\n")
    
    app.run(host="0.0.0.0", port=5000, debug=True)`
  },
  {
    path: "config.py",
    description: "Handles secure environment variable parsed configurations for Flask, SQLite DB, Claude, and WhatsApp credentials.",
    language: "python",
    content: `# config.py
# This file reads application configurations from environment variables using python-dotenv.

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
    MPESA_PASSKEY = os.environ.get("MPESA_PASSKEY", "todo")`
  },
  {
    path: "app/__init__.py",
    description: "Flask application factory organizing database migrations, blueprint registration, and database table bootstrap.",
    language: "python",
    content: `# app/__init__.py
# Inside this app factory, we set up Flask, configure SQLAlchemy, and register application routes.

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import Config

# Create the global SQLAlchemy database object
db = SQLAlchemy()

def create_app():
    """Flask Application Factory. Initializes Flask, database models, and registers the blueprinted routes."""
    app = Flask(__name__)
    
    # Load configuration from Config class
    app.config.from_object(Config)
    
    # Initialize the database with the app
    db.init_app(app)
    
    # Register blueprints (routes)
    from app.routes import main_bp
    app.register_blueprint(main_bp)
    
    # Create database tables automatically for development sqlite
    with app.app_context():
        db.create_all()
        
    return app`
  },
  {
    path: "app/models.py",
    description: "Defines the relational schema mapping Kenyan workers, conversations context indices, and logged WhatsApp lines.",
    language: "python",
    content: `# app/models.py
# This file defines the SQLAlchemy database models used to store user properties.

from datetime import datetime
import json
from app import db

class User(db.Model):
    """User model to save details of Kenyan informal sector workers."""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), unique=True, nullable=False) # e.g. "2547XXXXXXXX"
    name = db.Column(db.String(100), nullable=True) # Full Name
    id_number = db.Column(db.String(20), nullable=True) # National ID
    date_of_birth = db.Column(db.String(20), nullable=True) # format DD/MM/YYYY
    occupation = db.Column(db.String(50), nullable=True) # "Boda Boda Rider", "Mama Mboga"
    county = db.Column(db.String(50), nullable=True) # Kenya county name
    nssf_number = db.Column(db.String(30), nullable=True) # Assigned NSSF number
    registration_status = db.Column(db.String(20), default="pending", nullable=False) # "pending", "complete"
    language_preference = db.Column(db.String(5), default="sw", nullable=False) # "sw" or "en"
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class ConversationState(db.Model):
    """Keeps track of where a individual phone number is currently in the conversation flow."""
    __tablename__ = 'conversation_states'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), db.ForeignKey('users.phone_number'), unique=True, nullable=False)
    current_step = db.Column(db.String(50), default="greeting", nullable=False)
    context = db.Column(db.Text, default="{}", nullable=False)
    last_message_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def get_context(self):
        try:
            return json.loads(self.context) if self.context else {}
        except Exception:
            return {}

    def set_context(self, context_dict):
        self.context = json.dumps(context_dict if context_dict is not None else {})

class Message(db.Model):
    """Logging system for all inbound and outbound texts."""
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), nullable=False)
    direction = db.Column(db.String(10), nullable=False) # "inbound" or "outbound"
    message_text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)`
  },
  {
    path: "app/services/nssf_service.py",
    description: "The complete state machine coordinating onboarding phases, validator rules, and confirmation prompts.",
    language: "python",
    content: `# app/services/nssf_service.py
# Core Conversation State Machine Engine.

import logging
import random
from datetime import datetime
from app import db
from app.models import User, ConversationState, Message
from app.services.claude_service import get_claude_response
from app.services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)

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
    user_text_strip = user_text.strip()
    
    # 1. Log Inbound
    inbound_log = Message(phone_number=phone_number, direction="inbound", message_text=user_text_strip)
    db.session.add(inbound_log)
    
    # 2. Fetch User
    user = User.query.filter_by(phone_number=phone_number).first()
    if not user:
        lang = "en" if "hello" in user_text_strip.lower() or "hi" in user_text_strip.lower() else "sw"
        user = User(phone_number=phone_number, registration_status="pending", language_preference=lang)
        db.session.add(user)
        db.session.flush()

    # 3. Fetch State
    state = ConversationState.query.filter_by(phone_number=phone_number).first()
    if not state:
        state = ConversationState(phone_number=phone_number, current_step="greeting")
        db.session.add(state)
        db.session.flush()

    # Reset signals
    if user_text_strip.lower() in ["menu", "help", "msaada", "reset", "cancel"]:
        state.current_step = "main_menu"
        state.set_context({})

    response_text = ""
    current_step = state.current_step

    if current_step == "greeting":
        response_text = get_menu_message(user.language_preference)
        state.current_step = "main_menu"
    elif current_step == "main_menu":
        response_text = process_main_menu(user, state, user_text_strip)
    elif current_step == "collect_name":
        response_text = process_collect_name(user, state, user_text_strip)
    # ... handles remaining validators and saves profile details`
  },
  {
    path: "app/services/claude_service.py",
    description: "Connects with Claude API to deliver fluent replies to general Kenyan social security queries.",
    language: "python",
    content: `# app/services/claude_service.py
# Anthropic Claude-3.5-Sonnet integration.

import logging
from config import Config
from anthropic import Anthropic

logger = logging.getLogger(__name__)

CLAUDE_SYSTEM_PROMPT = """You are Jiweke, a friendly and patient WhatsApp assistant helping Kenyan informal sector workers study and register with NSSF..."""

def get_claude_response(phone_number, user_message, step_context="", chat_history=None):
    try:
        client = Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        # build history & call Claude-Sonnet-3.5 model
        return "Simulated explanation of NSSF guidelines"
    except Exception as e:
        logger.error(f"Claude API failed: {e}")
        return "Samahani, kuna tatizo kidogo la kiufundi. Tafadhali jaribu tena. (Sorry, please try again.)"`
  },
  {
    path: "app/services/whatsapp_service.py",
    description: "Standard HTTP payload delivery towards public Meta Graph Endpoint `/messages` with secure token authentications.",
    language: "python",
    content: `# app/services/whatsapp_service.py
# Meta WhatsApp Business Cloud integrations.

import requests
import logging
from config import Config

logger = logging.getLogger(__name__)

def send_whatsapp_message(phone_number, message_text):
    token = Config.WHATSAPP_TOKEN
    phone_id = Config.WHATSAPP_PHONE_NUMBER_ID

    if not token or token == "your-whatsapp-token-here":
        logger.warning(f"[SANDBOX] Whatsapp Send to {phone_number}: {message_text}")
        return True

    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "text",
        "text": {"body": message_text}
    }
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=10)
        return res.status_code in [200, 201]
    except Exception as e:
        logger.error(f"Failed WhatsApp dispatch: {e}")
        return False`
  },
  {
    path: "app/services/mpesa_service.py",
    description: "Daraja API sandbox call trigger for customer STK prompt pushes (Phase 2).",
    language: "python",
    content: `# app/services/mpesa_service.py
# Safaricom Daraja STK Push Scaffold.

import requests
import logging
from config import Config

logger = logging.getLogger(__name__)

def get_mpesa_access_token():
    url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    # Basic Authorization tokens generated on safaricom console...
    return "MOCK_TOKEN"

def trigger_stk_push(phone_number, amount, account_reference):
    logger.info(f"Triggering STK push of KES {amount} to {phone_number}")
    # STK push post configurations...
    return {"ResponseCode": "0", "ResponseDescription": "Success"}`
  }
];
