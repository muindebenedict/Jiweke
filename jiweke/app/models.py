# app/models.py
# This file defines the SQLAlchemy database models used to store user properties,
# keeping track of the chatbot's dynamic conversation steps, and logging messages.

from datetime import datetime
import json
from app import db
# Import secure password hashing utilities to keep user credentials encrypted (CRITICAL FIX 2)
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    """
    User model to save details of Kenyan informal sector workers.
    """
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), unique=True, nullable=False) # e.g. "2547XXXXXXXX"
    name = db.Column(db.String(100), nullable=True) # Full Name
    id_number = db.Column(db.String(20), nullable=True) # National ID
    date_of_birth = db.Column(db.String(20), nullable=True) # format DD/MM/YYYY
    occupation = db.Column(db.String(50), nullable=True) # "Boda Boda Rider", "Mama Mboga" etc
    county = db.Column(db.String(50), nullable=True) # Kenya county name
    nssf_number = db.Column(db.String(30), nullable=True) # Assigned NSSF number (randomly generated mock)
    registration_status = db.Column(db.String(20), default="pending", nullable=False) # "pending", "in_progress", "complete"
    language_preference = db.Column(db.String(5), default="sw", nullable=False) # "sw" (Swahili) or "en" (English)
    password = db.Column(db.String(255), nullable=True) # Updated password column length to 255 to store the secure hash safely
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def set_password(self, raw_password):
        """
        Hashes the provided plain text password and stores it securely in the database (CRITICAL FIX 2).
        """
        if raw_password:
            self.password = generate_password_hash(raw_password)
        else:
            self.password = None

    def check_password(self, raw_password):
        """
        Verifies the provided plain text password against the securely stored hash (CRITICAL FIX 2).
        """
        if not self.password or not raw_password:
            return False
        return check_password_hash(self.password, raw_password)

    def to_dict(self):
        """Converts user instance database values to a dictionary."""
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "name": self.name,
            "id_number": self.id_number,
            "date_of_birth": self.date_of_birth,
            "occupation": self.occupation,
            "county": self.county,
            "nssf_number": self.nssf_number,
            "registration_status": self.registration_status,
            "language_preference": self.language_preference,
            "password": self.password,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class ConversationState(db.Model):
    """
    Keeps track of where a individual phone number is currently in the conversation flow structure.
    Also handles multi-user session values stored inside JSON text.
    """
    __tablename__ = 'conversation_states'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), db.ForeignKey('users.phone_number'), unique=True, nullable=False)
    
    # tracks stage: "greeting", "collect_name", "collect_id", "collect_dob", 
    # "collect_occupation", "collect_county", "confirm_details", "registered", 
    # "main_menu", "check_balance", "claim_guidance"
    current_step = db.Column(db.String(50), default="greeting", nullable=False)
    
    # context is a serialized JSON text database column for temporarily saving form answers in flow
    context = db.Column(db.Text, default="{}", nullable=False)
    
    last_message_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def get_context(self):
        """Deserializes context DB string back into a Python dict."""
        try:
            return json.loads(self.context) if self.context else {}
        except Exception:
            return {}

    def set_context(self, context_dict):
        """Serializes Python dict context back into a database text string."""
        self.context = json.dumps(context_dict if context_dict is not None else {})

    def to_dict(self):
        """Dumps state parameters into dictionary."""
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "current_step": self.current_step,
            "context": self.get_context(),
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None
        }


class Message(db.Model):
    """
    Logging system for all inbound and outbound texts. Helps for administrative debugging.
    """
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), nullable=False) # Sender or recipient phone
    direction = db.Column(db.String(10), nullable=False) # "inbound" or "outbound"
    message_text = db.Column(db.Text, nullable=False) # Text body of message
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        """Serializes the message log."""
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "direction": self.direction,
            "message_text": self.message_text,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class Contribution(db.Model):
    """
    Model to track individual NSSF contributions made by users (MINOR FIX 5).
    """
    __tablename__ = 'contributions'

    id = db.Column(db.Integer, primary_key=True)
    # Foreign key referencing User's phone_number
    phone_number = db.Column(db.String(20), db.ForeignKey('users.phone_number'), nullable=False)
    # The actual amount deposited by the user, stored as float
    amount = db.Column(db.Float, nullable=False)
    # The timestamp of when this deposit was processed
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        """Serializes contribution details for API or debugging use."""
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "amount": self.amount,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }
