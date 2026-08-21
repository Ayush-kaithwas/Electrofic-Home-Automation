#!/usr/bin/env python3
"""
==============================================================================
⚡ ELECTROFIC — Firebase Realtime Database Full Seeder & Reset Script
==============================================================================
Overwrites and syncs all database parameters into Firebase in one go:
  - 5 Floor Switchboards & Points (Hall, 1st Floor, Harry, Mom & Dad, Ayush)
  - Water Monitoring System (Level, pH, TDS, Inflow/Outflow, Pump State)
  - Environmental Telemetry (Temp, Humidity, Air Quality, AQI, CO2, Power)
  - ESP32 Hardware Status (All 5 nodes initialized to Offline standby)
  - Commands branch cleared
==============================================================================
"""

import json
import os
import sys
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CRED_PATH = os.path.join(SCRIPT_DIR, "serviceAccountKey.json")
SEED_PATH = os.path.join(SCRIPT_DIR, "firebase-seed.json")
FIREBASE_DATABASE_URL = os.getenv(
    "FIREBASE_DATABASE_URL",
    "https://electrofic-homeautomation-default-rtdb.firebaseio.com"
).rstrip('/')

def load_seed_data():
    if not os.path.exists(SEED_PATH):
        print(f"❌ Error: Seed data file '{SEED_PATH}' not found!")
        sys.exit(1)
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def seed_with_admin_sdk(data):
    """Seed using Firebase Admin SDK (with serviceAccountKey.json)"""
    import firebase_admin
    from firebase_admin import credentials, db

    print("🔌 Authenticating via Firebase Admin SDK...")
    cred = credentials.Certificate(CRED_PATH)
    try:
        firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DATABASE_URL})
    except ValueError:
        pass  # App already initialized

    print("🚀 Overwriting entire Firebase Realtime Database with clean schema...")
    ref = db.reference("/")
    ref.set(data)
    print("✅ SUCCESS: All parameters (rooms, pump, climate, devices) overwritten in Firebase!")

def seed_with_rest_api(data):
    """Seed using Firebase REST API (Direct PUT)"""
    print(f"🔌 Connecting to Firebase REST API at {FIREBASE_DATABASE_URL}...")
    url = f"{FIREBASE_DATABASE_URL}/.json"
    json_bytes = json.dumps(data).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=json_bytes,
        headers={'Content-Type': 'application/json'},
        method='PUT'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("🚀 Overwriting all parameters in Firebase Realtime Database...")
                print("✅ SUCCESS: All parameters (5 room switchboards, pump, climate, devices) overwritten in Firebase!")
            else:
                print(f"⚠️ Response status code: {response.status}")
    except urllib.error.HTTPError as e:
        error_content = e.read().decode('utf-8')
        print(f"❌ HTTP Error {e.code}: {error_content}")
        print("\n💡 Note: If Permission Denied, ensure your Firebase Realtime Database Rules allow write or place 'serviceAccountKey.json' in this folder.")
    except Exception as e:
        print(f"❌ Connection error: {e}")

def main():
    print("==========================================================")
    print("   ⚡ ELECTROFIC — FIREBASE DATABASE FULL OVERWRITE       ")
    print("==========================================================")
    
    data = load_seed_data()
    print(f"📖 Loaded {len(data)} root branches from firebase-seed.json:")
    for key in data.keys():
        print(f"   • /{key}")

    # Check if Firebase Admin SDK with serviceAccountKey is available
    if os.path.exists(CRED_PATH):
        try:
            seed_with_admin_sdk(data)
            return
        except Exception as e:
            print(f"⚠️ Admin SDK notice ({e}). Falling back to REST...")

    # Fallback to direct REST API
    seed_with_rest_api(data)

if __name__ == "__main__":
    main()
