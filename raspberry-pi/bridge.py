#!/usr/bin/env python3
"""
==============================================================================
⚡ ELECTROFIC — Raspberry Pi 24/7 Master Gateway Daemon
MQTT <-> Firebase Realtime Database Bridge
==============================================================================
This daemon runs as a continuous systemd service on the Raspberry Pi:
1. Connects to the local Mosquitto MQTT broker (Port 1883).
2. Connects to Firebase Realtime Database using Firebase Admin SDK.
3. Syncs device telemetry & sensor readings from ESP32 nodes into Firebase.
4. Listens for web dashboard commands in Firebase and dispatches MQTT packets:
   - Room point toggles & fan speed adjustments -> home/nodes/{node_id}/set
   - Automation Scenes (All Off, Night Mode)    -> home/nodes/all/scene
   - Water Pump Control                         -> home/nodes/water_pump/set
==============================================================================
"""

import json
import logging
import os
import sys
import time
import paho.mqtt.client as mqtt
import firebase_admin
from firebase_admin import credentials, db

# --- LOGGING CONFIGURATION ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

# --- CONFIGURATION ---
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_CLIENT_ID = "RPi_Electrofic_Gateway"

# Topic Subscriptions & Prefixes
MQTT_TELEMETRY_TOPIC  = "home/nodes/+/telemetry"
MQTT_WATER_TELEMETRY  = "home/water/telemetry"
MQTT_ENERGY_TELEMETRY = "home/electricity/telemetry"
MQTT_COMMAND_PREFIX   = "home/nodes"

# Firebase Credentials Path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CRED_PATH = os.path.join(SCRIPT_DIR, "serviceAccountKey.json")
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH", DEFAULT_CRED_PATH)
FIREBASE_DATABASE_URL = os.getenv(
    "FIREBASE_DATABASE_URL",
    "https://electrofic-homeautomation-default-rtdb.firebaseio.com"
)

# --- INITIALIZE FIREBASE ---
def init_firebase():
    if not os.path.exists(FIREBASE_CRED_PATH):
        logging.warning(
            f"⚠️ Firebase service account key '{FIREBASE_CRED_PATH}' not found!\n"
            "   Please place your 'serviceAccountKey.json' in the raspberry-pi folder."
        )
        return False
    
    try:
        cred = credentials.Certificate(FIREBASE_CRED_PATH)
        firebase_admin.initialize_app(cred, {
            'databaseURL': FIREBASE_DATABASE_URL
        })
        logging.info("✅ Successfully authenticated with Firebase Realtime Database.")
        return True
    except Exception as e:
        logging.error(f"❌ Failed to initialize Firebase: {e}")
        return False

# --- MQTT CALLBACKS ---
def on_connect(client, userdata, flags, rc, properties=None):
    is_success = (rc == 0) if isinstance(rc, int) else (not rc.is_failure)
    if is_success:
        logging.info("✅ Connected successfully to local Mosquitto MQTT Broker.")
        client.subscribe(MQTT_TELEMETRY_TOPIC)
        client.subscribe(MQTT_WATER_TELEMETRY)
        client.subscribe(MQTT_ENERGY_TELEMETRY)
        client.subscribe("home/energy/telemetry")
        logging.info(f"📡 Subscribed to topics: {MQTT_TELEMETRY_TOPIC}, {MQTT_WATER_TELEMETRY}, {MQTT_ENERGY_TELEMETRY}")
    else:
        logging.error(f"❌ Failed to connect to MQTT Broker, return code: {rc}")

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload_str = msg.payload.decode("utf-8")
        logging.info(f"[MQTT RECV] {topic}: {payload_str}")

        try:
            data = json.loads(payload_str)
        except json.JSONDecodeError:
            data = {"raw_value": payload_str}

        data["last_seen"] = int(time.time())

        if not userdata.get("firebase_enabled"):
            return

        # 1. Water System Telemetry
        if "water" in topic:
            water_ref = db.reference("water_system")
            water_ref.update(data)
            logging.info("💧 Updated /water_system telemetry in Firebase")
            return

        # 1b. Electricity / Energy Telemetry
        if "electricity" in topic or "energy" in topic:
            elec_ref = db.reference("electricity")
            elec_ref.update(data)
            logging.info("⚡ Updated /electricity telemetry in Firebase")
            return

        # 2. Node Telemetry (home/nodes/{node_id}/telemetry)
        parts = topic.split('/')
        if len(parts) >= 4:
            node_id = parts[2]
            
            # Update node device telemetry
            ref = db.reference(f"devices/{node_id}/telemetry")
            ref.update(data)
            
            # Set online status
            status_ref = db.reference(f"devices/{node_id}/status")
            status_ref.set("online")
            
            # If environmental data exists, update /environment
            if "temperature" in data or "humidity" in data:
                env_update = {}
                if "temperature" in data: env_update["temp"] = data["temperature"]
                if "humidity" in data: env_update["humidity"] = data["humidity"]
                db.reference("environment").update(env_update)

            logging.info(f"⚡ Synced telemetry to Firebase for room node: {node_id}")

    except Exception as e:
        logging.error(f"Error processing MQTT message: {e}")

# --- FIREBASE COMMAND LISTENER ---
def setup_firebase_listeners(mqtt_client):
    """Listens for commands dispatched by the Web App in Firebase /commands"""
    def command_listener(event):
        try:
            if event.data is None:
                return
            
            path = event.path  # e.g., /hall/h1, /scene, /water_pump
            data = event.data
            
            logging.info(f"[FIREBASE CMD] Path: {path} | Data: {data}")
            
            parts = [p for p in path.split('/') if p]
            if not parts:
                return

            target = parts[0]

            # 1. Global Scene Broadcast (ALL_OFF, NIGHT_MODE)
            if target == "scene":
                target_topic = f"{MQTT_COMMAND_PREFIX}/all/scene"
                payload = json.dumps(data) if isinstance(data, dict) else str(data)
                mqtt_client.publish(target_topic, payload, qos=1)
                logging.info(f"📢 Broadcasted Scene to MQTT [{target_topic}]: {payload}")
                return

            # 2. Water Motor Pump Command
            if target == "water_pump":
                target_topic = f"{MQTT_COMMAND_PREFIX}/water_pump/set"
                payload = json.dumps(data) if isinstance(data, dict) else str(data)
                mqtt_client.publish(target_topic, payload, qos=1)
                logging.info(f"🚰 Dispatched Water Pump command [{target_topic}]: {payload}")
                return

            # 3. Room-Specific Point Toggles & Fan Speed
            node_id = target
            target_topic = f"{MQTT_COMMAND_PREFIX}/{node_id}/set"
            
            # Format payload for ESP32
            payload = json.dumps(data) if isinstance(data, dict) else str(data)
            mqtt_client.publish(target_topic, payload, qos=1)
            logging.info(f"⚡ Dispatched Room Command to MQTT [{target_topic}]: {payload}")
                
        except Exception as e:
            logging.error(f"Error in Firebase command listener: {e}")

    try:
        cmd_ref = db.reference("commands")
        cmd_ref.listen(command_listener)
        logging.info("👂 Actively listening for web commands on Firebase '/commands'")
    except Exception as e:
        logging.error(f"Failed to attach Firebase command listener: {e}")

# --- MAIN ENTRY POINT ---
def main():
    print("==========================================================")
    print("   ⚡ ELECTROFIC — RASPBERRY PI MASTER GATEWAY DAEMON    ")
    print("==========================================================")

    fb_enabled = init_firebase()
    userdata = {"firebase_enabled": fb_enabled}

    try:
        mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=MQTT_CLIENT_ID, userdata=userdata)
    except AttributeError:
        mqtt_client = mqtt.Client(client_id=MQTT_CLIENT_ID, userdata=userdata)

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    logging.info(f"Connecting to Mosquitto Broker at {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        logging.error(f"❌ Could not connect to MQTT broker: {e}")
        sys.exit(1)

    if fb_enabled:
        setup_firebase_listeners(mqtt_client)

    try:
        mqtt_client.loop_forever()
    except KeyboardInterrupt:
        logging.info("Gateway daemon shutting down.")
        mqtt_client.disconnect()

if __name__ == "__main__":
    main()
