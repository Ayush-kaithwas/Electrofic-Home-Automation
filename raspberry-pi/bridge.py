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

Design — Local-First, Firebase as Background Sync:
  - MQTT broker + local WebSocket server ALWAYS run regardless of internet.
  - Firebase is managed by a self-healing background thread (_firebase_manager_loop)
    that retries every FIREBASE_RETRY_S seconds until internet is available.
  - Any failed Firebase write clears _firebase_ready so the manager detects
    the outage and schedules a reconnect automatically.
  - Effect: the RPi ALWAYS keeps Firebase up to date the moment internet arrives,
    even if it had no internet at boot time.
==============================================================================
"""

import asyncio
import json
import logging
import os
import sys
import time
import threading
try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False
    logging.warning("⚠️  'websockets' not installed — local WS gateway disabled. Run: pip install websockets")
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
MQTT_HEARTBEAT_TOPIC  = "home/nodes/+/heartbeat"   # Lightweight liveness pings
MQTT_WATER_TELEMETRY  = "home/water/telemetry"
MQTT_ENERGY_TELEMETRY = "home/electricity/telemetry"
MQTT_COMMAND_PREFIX   = "home/nodes"

# All known node IDs (must match Firebase /devices keys)
KNOWN_NODES = ["ayush", "hall", "first_floor", "harry", "mom_dad"]

# Heartbeat watchdog: stores epoch timestamp of last heartbeat per node
# Protected by a lock since it's written by on_message and read by watchdog thread
_heartbeat_lock = threading.Lock()
_last_heartbeat: dict = {}          # { node_id: float (epoch seconds) }
HEARTBEAT_TIMEOUT_S = 10           # Mark offline after 10 s of silence
WATCHDOG_INTERVAL_S = 3            # Check every 3 s
FIREBASE_RETRY_S    = 30           # Seconds between Firebase reconnect attempts

# --- LOCAL WEBSOCKET GATEWAY ---
WS_PORT = 8765   # Local WebSocket server port (dashboard connects to this)

# Mutable state dict — updated from MQTT, broadcast to WS clients
_local_state: dict = {
    "devices":      {},   # { node_id: {status, ip, rssi, last_seen, relays} }
    "water_system": {},
    "environment":  {},
    "electricity":  {},
}
_state_lock   = threading.Lock()
_ws_clients: set = set()          # active WebSocket connections
_ws_loop      = None              # asyncio event loop for WS server (set in thread)
_mqtt_ref     = None              # reference to paho MQTT client (set in main)

# Firebase Credentials Path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CRED_PATH = os.path.join(SCRIPT_DIR, "serviceAccountKey.json")
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH", DEFAULT_CRED_PATH)
FIREBASE_DATABASE_URL = os.getenv(
    "FIREBASE_DATABASE_URL",
    "https://electrofic-homeautomation-default-rtdb.firebaseio.com"
)

# --- FIREBASE STATE ---
# _firebase_ready is SET when Firebase is reachable and actively syncing.
# Any failed Firebase write calls _firebase_ready.clear() so the manager
# thread detects the outage and schedules a reconnect automatically.
_firebase_ready          = threading.Event()
_firebase_listener_lock  = threading.Lock()
_firebase_listener_handle = None   # SSE ListenerRegistration handle (for restart)


# ==============================================================================
# FIREBASE — CREDENTIALS LOADER (no network call, one-time)
# ==============================================================================
def _load_firebase_credentials():
    """
    Parses the service-account JSON key and initialises the Firebase Admin SDK.
    This does NOT make a network call — it only reads a local file.
    Returns True on success, False if the key file is missing or invalid.
    """
    if not os.path.exists(FIREBASE_CRED_PATH):
        logging.warning(
            f"⚠️  Firebase credentials not found at '{FIREBASE_CRED_PATH}'. "
            "Cloud sync permanently disabled."
        )
        return False
    try:
        cred = credentials.Certificate(FIREBASE_CRED_PATH)
        firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DATABASE_URL})
        logging.info("🔑 Firebase credentials loaded (SDK initialised — no network call yet).")
        return True
    except Exception as e:
        logging.error(f"❌ Firebase SDK initialisation failed: {e}")
        return False


# ==============================================================================
# FIREBASE — COMMAND LISTENER (internal helper)
# ==============================================================================
def _attach_firebase_listener(mqtt_client):
    """
    Registers an SSE listener on Firebase /commands.
    Returns the ListenerRegistration handle so the manager can close/restart it.
    """
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
            payload = json.dumps(data) if isinstance(data, dict) else str(data)
            mqtt_client.publish(target_topic, payload, qos=1)
            logging.info(f"⚡ Dispatched Room Command to MQTT [{target_topic}]: {payload}")

        except Exception as e:
            logging.error(f"Error in Firebase command listener: {e}")

    return db.reference("commands").listen(command_listener)


# ==============================================================================
# FIREBASE MANAGER — self-healing background thread
# ==============================================================================
def _firebase_manager_loop(mqtt_client):
    """
    Runs as a daemon thread for the entire lifetime of the process.

    Lifecycle:
      1. Loads Firebase credentials once at startup (no internet needed).
      2. Repeatedly probes Firebase with a lightweight DB read until reachable.
      3. Once reachable: sets _firebase_ready, attaches the /commands SSE listener.
      4. Sleeps FIREBASE_RETRY_S seconds, then does a health check.
      5. If _firebase_ready was cleared by a failed write anywhere in the codebase,
         closes the stale listener and re-enters the probe loop.

    This means the RPi ALWAYS syncs to Firebase the moment internet becomes
    available — even if it had zero internet at boot time.
    """
    global _firebase_listener_handle

    if not _load_firebase_credentials():
        return   # No credentials file — Firebase sync permanently disabled

    listener_running = False

    while True:
        # ── Phase 1: prove Firebase is reachable ─────────────────────────────
        if not _firebase_ready.is_set():
            try:
                db.reference("devices").get()   # lightweight connectivity probe
                _firebase_ready.set()
                logging.info("☁️  Firebase reachable — cloud sync ACTIVE.")
            except Exception as e:
                logging.warning(
                    f"⏳ Firebase unreachable ({type(e).__name__}: {e}). "
                    f"Retrying in {FIREBASE_RETRY_S}s..."
                )
                time.sleep(FIREBASE_RETRY_S)
                continue

        # ── Phase 2: start / restart the command listener ────────────────────
        if not listener_running:
            with _firebase_listener_lock:
                # Close any stale listener from a previous session
                if _firebase_listener_handle is not None:
                    try:
                        _firebase_listener_handle.close()
                    except Exception:
                        pass
                    _firebase_listener_handle = None

                try:
                    _firebase_listener_handle = _attach_firebase_listener(mqtt_client)
                    listener_running = True
                    logging.info("👂 Firebase /commands listener active.")
                except Exception as e:
                    logging.error(f"Failed to attach Firebase listener: {e}")
                    _firebase_ready.clear()   # treat as connectivity failure
                    listener_running = False
                    time.sleep(FIREBASE_RETRY_S)
                    continue

        # ── Phase 3: periodic health check ───────────────────────────────────
        time.sleep(FIREBASE_RETRY_S)

        if not _firebase_ready.is_set():
            # A write failure elsewhere cleared the flag.
            # Reset listener state so we re-probe and restart on the next loop.
            listener_running = False
            logging.info("🔄 Firebase connection lost — scheduling reconnect...")


# ==============================================================================
# MQTT CALLBACKS
# ==============================================================================
def on_connect(client, userdata, flags, rc, properties=None):
    is_success = (rc == 0) if isinstance(rc, int) else (not rc.is_failure)
    if is_success:
        logging.info("✅ Connected successfully to local Mosquitto MQTT Broker.")
        client.subscribe(MQTT_TELEMETRY_TOPIC)
        client.subscribe(MQTT_HEARTBEAT_TOPIC)        # ← subscribe to heartbeats
        client.subscribe(MQTT_WATER_TELEMETRY)
        client.subscribe(MQTT_ENERGY_TELEMETRY)
        client.subscribe("home/energy/telemetry")
        logging.info(f"📡 Subscribed to topics: {MQTT_TELEMETRY_TOPIC}, heartbeat, {MQTT_WATER_TELEMETRY}, {MQTT_ENERGY_TELEMETRY}")
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

        # ── HEARTBEAT ─────────────────────────────────────────────────────────
        if topic.endswith("/heartbeat"):
            parts = topic.split('/')
            if len(parts) >= 4:
                node_id = parts[2]
                with _heartbeat_lock:
                    _last_heartbeat[node_id] = time.time()
                logging.debug(f"💓 Heartbeat received from {node_id}")

                # Broadcast online status to local WS clients (always)
                _broadcast_state({"devices": {node_id: {
                    "status": "online",
                    "rssi":   data.get("rssi")
                }}})

                # Mark online in Firebase if reachable
                if _firebase_ready.is_set():
                    try:
                        db.reference(f"devices/{node_id}/status").set("online")
                    except Exception as fe:
                        logging.warning(f"Firebase heartbeat update failed: {fe}")
                        _firebase_ready.clear()
            return
        # ──────────────────────────────────────────────────────────────────────

        data["last_seen"] = int(time.time())
        fb_enabled = _firebase_ready.is_set()

        # 1. Water System Telemetry
        if "water" in topic:
            _broadcast_state({"water_system": data})          # ← local WS (always)
            if fb_enabled:
                try:
                    db.reference("water_system").update(data)
                    logging.info("💧 Updated /water_system in Firebase")
                except Exception as fe:
                    logging.warning(f"Firebase write failed (water_system): {fe}")
                    _firebase_ready.clear()
            return

        # 2. Electricity / Energy Telemetry
        if "electricity" in topic or "energy" in topic:
            _broadcast_state({"electricity": data})            # ← local WS (always)
            if fb_enabled:
                try:
                    db.reference("electricity").update(data)
                    logging.info("⚡ Updated /electricity in Firebase")
                except Exception as fe:
                    logging.warning(f"Firebase write failed (electricity): {fe}")
                    _firebase_ready.clear()
            return

        # 3. Node Telemetry (home/nodes/{node_id}/telemetry)
        parts = topic.split('/')
        if len(parts) >= 4:
            node_id = parts[2]

            # Build WS device entry from telemetry
            dev_entry = {
                "status":    "online",
                "ip":        data.get("ip", "—"),
                "rssi":      data.get("rssi"),
                "last_seen": data.get("last_seen"),
                "uptime_s":  data.get("uptime_s"),
                "relays":    data.get("relays", {}),
            }
            _broadcast_state({"devices": {node_id: dev_entry}})  # ← local WS (always)

            # Stamp heartbeat from telemetry
            with _heartbeat_lock:
                _last_heartbeat[node_id] = time.time()

            # Always push environment readings to local WS regardless of Firebase
            env_update = {}
            if "temperature" in data or "humidity" in data:
                if "temperature" in data: env_update["temp"] = data["temperature"]
                if "humidity"    in data: env_update["humidity"] = data["humidity"]
                _broadcast_state({"environment": env_update})

            if fb_enabled:
                try:
                    db.reference(f"devices/{node_id}/telemetry").update(data)
                    db.reference(f"devices/{node_id}/status").set("online")

                    # Propagate environment readings to Firebase
                    if env_update:
                        db.reference("environment").update(env_update)

                    logging.info(f"⚡ Synced telemetry → Firebase for node: {node_id}")
                except Exception as fe:
                    logging.warning(f"Firebase write failed (telemetry/{node_id}): {fe}")
                    _firebase_ready.clear()

    except Exception as e:
        logging.error(f"Error processing MQTT message: {e}")


# ==============================================================================
# LOCAL WEBSOCKET SERVER
# ==============================================================================

async def _ws_handler(websocket, path=None):
    """Manage a single browser WebSocket connection."""
    _ws_clients.add(websocket)
    try:
        # Push full current state immediately on connect
        with _state_lock:
            snapshot = dict(_local_state)
        await websocket.send(json.dumps({"type": "state", **snapshot}))

        # Receive commands from the browser dashboard
        async for raw in websocket:
            await _handle_ws_cmd(raw)
    except Exception:
        pass
    finally:
        _ws_clients.discard(websocket)

async def _handle_ws_cmd(raw: str):
    """Route a WS command from the dashboard to the MQTT broker."""
    global _mqtt_ref
    try:
        msg = json.loads(raw)
        if not _mqtt_ref:
            return
        cmd_type = msg.get("type")

        if cmd_type == "cmd":         # Toggle / speed change for a room node
            target = msg.get("target")
            if target:
                payload = {k: v for k, v in msg.items() if k not in ("type", "target")}
                _mqtt_ref.publish(f"{MQTT_COMMAND_PREFIX}/{target}/set", json.dumps(payload), qos=1)
                logging.info(f"[WS→MQTT] cmd to {target}: {payload}")

        elif cmd_type == "scene":     # Broadcast automation scene (all_off / night_mode)
            payload = {"name": msg.get("name"), "timestamp": int(time.time())}
            _mqtt_ref.publish(f"{MQTT_COMMAND_PREFIX}/all/scene", json.dumps(payload), qos=1)
            logging.info(f"[WS→MQTT] scene: {msg.get('name')}")

        elif cmd_type == "pump":      # Water motor pump control
            payload = {k: v for k, v in msg.items() if k != "type"}
            _mqtt_ref.publish(f"{MQTT_COMMAND_PREFIX}/water_pump/set", json.dumps(payload), qos=1)
            logging.info(f"[WS→MQTT] pump: {payload}")

    except Exception as ex:
        logging.error(f"WS command error: {ex}")

async def _broadcast(message: str):
    """Send a JSON string to every connected WS client."""
    if not _ws_clients:
        return
    dead = set()
    for ws in list(_ws_clients):
        try:
            await ws.send(message)
        except Exception:
            dead.add(ws)
    _ws_clients -= dead

def _broadcast_state(partial_update: dict):
    """
    Thread-safe helper called from the MQTT thread.
    Merges `partial_update` into _local_state and pushes the full state
    snapshot to all connected WS clients.
    """
    global _ws_loop
    with _state_lock:
        for k, v in partial_update.items():
            if isinstance(v, dict) and isinstance(_local_state.get(k), dict):
                # Deep-merge dicts (e.g. devices: {node_id: {...}})
                if k == "devices":
                    for node_id, node_data in v.items():
                        if node_id not in _local_state[k]:
                            _local_state[k][node_id] = {}
                        _local_state[k][node_id].update(node_data)
                else:
                    _local_state[k].update(v)
            else:
                _local_state[k] = v
        snapshot = {k: dict(v) if isinstance(v, dict) else v
                    for k, v in _local_state.items()}

    if _ws_loop and not _ws_loop.is_closed() and _ws_clients:
        message = json.dumps({"type": "state", **snapshot})
        asyncio.run_coroutine_threadsafe(_broadcast(message), _ws_loop)

def _start_ws_server():
    """Run the asyncio WebSocket server in its own daemon thread."""
    global _ws_loop
    if not WEBSOCKETS_AVAILABLE:
        return
    _ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_ws_loop)

    async def _serve():
        async with websockets.serve(_ws_handler, "0.0.0.0", WS_PORT):
            logging.info(f"🔌 Local WebSocket Gateway live → ws://0.0.0.0:{WS_PORT}")
            await asyncio.Future()   # keep running forever

    try:
        _ws_loop.run_until_complete(_serve())
    except Exception as ex:
        logging.error(f"WebSocket server crashed: {ex}")


# ==============================================================================
# HEARTBEAT WATCHDOG THREAD
# ==============================================================================
def _watchdog_loop():
    """
    Runs forever in a daemon thread.
    Every WATCHDOG_INTERVAL_S seconds it checks every known node.
    If a node's last heartbeat is older than HEARTBEAT_TIMEOUT_S, it is marked
    'offline' in local WS state and in Firebase (whenever Firebase is reachable).
    """
    logging.info(f"🐕 Watchdog started — timeout={HEARTBEAT_TIMEOUT_S}s, interval={WATCHDOG_INTERVAL_S}s")
    while True:
        time.sleep(WATCHDOG_INTERVAL_S)
        now = time.time()
        with _heartbeat_lock:
            snapshot = dict(_last_heartbeat)
        for node_id in KNOWN_NODES:
            last = snapshot.get(node_id)
            if last is None:
                # Never heard from this node — leave status as-is (seed sets it)
                continue
            if (now - last) > HEARTBEAT_TIMEOUT_S:
                # Mark offline in WS local state (always)
                _broadcast_state({"devices": {node_id: {"status": "offline"}}})
                # Mark offline in Firebase only if currently reachable
                if _firebase_ready.is_set():
                    try:
                        status_ref = db.reference(f"devices/{node_id}/status")
                        current = status_ref.get()
                        if current != "offline":
                            status_ref.set("offline")
                            logging.warning(f"📴 {node_id} missed heartbeat — marked OFFLINE in Firebase")
                    except Exception as fe:
                        logging.warning(f"Watchdog Firebase write failed for {node_id}: {fe}")
                        _firebase_ready.clear()


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================
def main():
    print("==========================================================")
    print("   ⚡ ELECTROFIC — RASPBERRY PI MASTER GATEWAY DAEMON    ")
    print("==========================================================")
    print("   Local MQTT + WebSocket: ALWAYS ON                     ")
    print("   Firebase cloud sync:    auto-connects when internet ✓ ")
    print("==========================================================")

    try:
        mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=MQTT_CLIENT_ID)
    except AttributeError:
        mqtt_client = mqtt.Client(client_id=MQTT_CLIENT_ID)

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    logging.info(f"Connecting to Mosquitto Broker at {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        logging.error(f"❌ Could not connect to MQTT broker: {e}")
        sys.exit(1)

    global _mqtt_ref
    _mqtt_ref = mqtt_client   # allow WS handler to publish MQTT commands

    # Start Firebase manager — self-healing, retries until internet is available.
    # Runs completely independently of MQTT and WebSocket.
    threading.Thread(
        target=_firebase_manager_loop,
        args=(mqtt_client,),
        daemon=True,
        name="FirebaseManager"
    ).start()

    # Start heartbeat watchdog
    threading.Thread(
        target=_watchdog_loop,
        daemon=True,
        name="HeartbeatWatchdog"
    ).start()

    # Start local WebSocket gateway
    threading.Thread(
        target=_start_ws_server,
        daemon=True,
        name="WSGateway"
    ).start()

    try:
        mqtt_client.loop_forever()
    except KeyboardInterrupt:
        logging.info("Gateway daemon shutting down.")
        mqtt_client.disconnect()

if __name__ == "__main__":
    main()
