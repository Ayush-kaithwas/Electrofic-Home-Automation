#!/usr/bin/env python3
"""
Seed Firebase Realtime Database with initial AuraHome schema and switchboard data
"""

import json
import os
import sys
import firebase_admin
from firebase_admin import credentials, db

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CRED_PATH = os.path.join(SCRIPT_DIR, "serviceAccountKey.json")
SEED_PATH = os.path.join(SCRIPT_DIR, "firebase-seed.json")
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "https://electrofic-homeautomation-default-rtdb.firebaseio.com")

def seed():
    if not os.path.exists(CRED_PATH):
        print(f"❌ Error: {CRED_PATH} not found!")
        sys.exit(1)

    if not os.path.exists(SEED_PATH):
        print(f"❌ Error: {SEED_PATH} not found!")
        sys.exit(1)

    print("🔌 Connecting to Firebase Realtime Database...")
    cred = credentials.Certificate(CRED_PATH)
    firebase_admin.initialize_app(cred, {
        'databaseURL': FIREBASE_DATABASE_URL
    })

    print("📖 Reading firebase-seed.json...")
    with open(SEED_PATH, "r") as f:
        data = json.load(f)

    print("🚀 Uploading schema and initial data to Firebase...")
    ref = db.reference("/")
    ref.update(data)

    print("✅ Firebase schema and switchboards successfully uploaded!")

if __name__ == "__main__":
    seed()
