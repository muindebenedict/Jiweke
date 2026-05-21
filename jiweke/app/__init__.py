# app/__init__.py
# Inside this app factory, we set up Flask, configure SQLAlchemy,
# and register application routes.

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config import Config

# Create the global SQLAlchemy database object
# This will be initialized with the Flask instance inside create_app
db = SQLAlchemy()

def create_app():
    """
    Flask Application Factory.
    Initializes Flask, database models, and registers the blueprinted routes.
    """
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
        
    return app
