# run.py
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
    # Local sandboxed server runs on port 5000 (standard for Flask)
    # Bind to 0.0.0.0 so that local tools like ngrok can easily tunnel the port to Facebook
    print("\n--------------------------------------------------------------")
    print("🚀 JIWEKE NSSF WHATSAPP AI ASSISTANT RUNNING 🚀")
    print("--------------------------------------------------------------")
    print("Developing Locally? Use ngrok to tunnel to Meta Developer Portal:")
    print("👉 Command: ngrok http 5000")
    print("Copy the forwarding https URL and configure it in Meta App Dashboard as Webhook URL!")
    print("--------------------------------------------------------------\n")
    
    app.run(host="0.0.0.0", port=5000, debug=True)
