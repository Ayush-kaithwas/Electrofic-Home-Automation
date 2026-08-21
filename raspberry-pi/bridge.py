#!/usr/bin/env python3
"""
Raspberry Pi Home Automation MQTT <-> Firebase Bridge Daemon
-----------------------------------------------------------
This script acts as the master gateway on the Raspberry Pi:
1. Connects to the local Mosquitto MQTT broker.
2. Connects to Firebase Realtime Database using Firebase Admin SDK.
3. Syncs device status from ESP32 nodes (MQTT) to Firebase (Cloud).
4. Listens for web dashboard commands in Firebase and forwards them to ESP32 nodes via MQTT.
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
MQTT_CLIENT_ID = "RPi_HomeAutomation_Gateway"

# Topic structure: home/nodes/{node_id}/telemetry or home/nodes/{node_id}/set
MQTT_TELEMETRY_TOPIC = "home/nodes/+/telemetry"
MQTT_COMMAND_TOPIC_PREFIX = "home/nodes"

# Resolve serviceAccountKey.json path relative to this script directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CRED_PATH = os.path.join(SCRIPT_DIR, "serviceAccountKey.json")
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH", DEFAULT_CRED_PATH)
FIREBASE_DATABASE_URL = os.getenv("FIREBASE_DATABASE_URL", "https://electrofic-homeautomation-default-rtdb.firebaseio.com")

# --- INITIALIZE FIREBASE ---
def init_firebase():
    if not os.path.exists(FIREBASE_CRED_PATH):
        logging.warning(
            f"Firebase service account file '{FIREBASE_CRED_PATH}' not found! "
            "Running in simulation/mock mode for Firebase. "
            "Please copy your 'serviceAccountKey.json' to this folder."
        )
        return False
    
    try:
        cred = credentials.Certificate(FIREBASE_CRED_PATH)
        firebase_admin.initialize_app(cred, {
            'databaseURL': FIREBASE_DATABASE_URL
        })
        logging.info("Successfully connected to Firebase Realtime Database.")
        return True
    except Exception as e:
        logging.error(f"Failed to initialize Firebase: {e}")
        return False

# --- MQTT CALLBACKS ---
def on_connect(client, userdata, flags, rc, properties=None):
    is_success = (rc == 0) if isinstance(rc, int) else (not rc.is_failure)
    if is_success:
        logging.info("Connected successfully to MQTT Broker.")
        # Subscribe to all device telemetry topics
        client.subscribe(MQTT_TELEMETRY_TOPIC)
        logging.info(f"Subscribed to topic: {MQTT_TELEMETRY_TOPIC}")
    else:
        logging.error(f"Failed to connect to MQTT Broker, code: {rc}")

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload_str = msg.payload.decode("utf-8")
        logging.info(f"MQTT Received [{topic}]: {payload_str}")

        # Extract node_id from topic: home/nodes/{node_id}/telemetry
        parts = topic.split('/')
        if len(parts) >= 4:
            node_id = parts[2]
            
            # Try parsing JSON payload
            try:
                data = json.loads(payload_str)
            except json.JSONDecodeError:
                data = {"raw_value": payload_str}

            data["last_seen"] = int(time.time())

            # Update Firebase Realtime DB at /devices/{node_id}
            if userdata.get("firebase_enabled"):
                ref = db.reference(f"devices/{node_id}/telemetry")
                ref.update(data)
                # Also set node status to online
                status_ref = db.reference(f"devices/{node_id}/status")
                status_ref.set("online")
                logging.info(f"Updated Firebase for node: {node_id}")

    except Exception as e:
        logging.error(f"Error processing MQTT message: {e}")

# --- FIREBASE COMMAND LISTENER ---
def setup_firebase_listeners(mqtt_client):
    """Listens for commands written by Web App into /commands branch in Firebase"""
    def command_listener(event):
        try:
            if event.data is None:
                return
            
            # Event path structure e.g. /commands/{node_id}/{actuator} = value
            path = event.path  # e.g., /living_room_relay/relay1
            data = event.data
            
            logging.info(f"Firebase Command Event: path={path}, data={data}")
            
            parts = [p for p in path.split('/') if p]
            if len(parts) >= 1:
                node_id = parts[0]
                target_topic = f"{MQTT_COMMAND_TOPIC_PREFIX}/{node_id}/set"
                
                # Payload to send to ESP32
                payload = json.dumps(data) if isinstance(data, dict) else str(data)
                mqtt_client.publish(target_topic, payload, qos=1)
                logging.info(f"Forwarded command to MQTT [{target_topic}]: {payload}")
                
        except Exception as e:
            logging.error(f"Error in Firebase listener: {e}")

    try:
        cmd_ref = db.reference("commands")
        cmd_ref.listen(command_listener)
        logging.info("Listening for incoming web commands on Firebase '/commands'")
    except Exception as e:
        logging.error(f"Failed to attach Firebase listener: {e}")

# --- MAIN RUNNER ---
def main():
    fb_enabled = init_firebase()

    userdata = {"firebase_enabled": fb_enabled}
    try:
        mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=MQTT_CLIENT_ID, userdata=userdata)
    except AttributeError:
        mqtt_client = mqtt.Client(client_id=MQTT_CLIENT_ID, userdata=userdata)

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    logging.info(f"Connecting to MQTT Broker at {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        logging.error(f"Could not connect to MQTT broker: {e}")
        sys.exit(1)

    if fb_enabled:
        setup_firebase_listeners(mqtt_client)

    mqtt_client.loop_forever()

if __name__ == "__main__":
    main()
