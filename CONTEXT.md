# ⚡ ELECTROFIC — AI Project Context Document

> **Purpose**: This file is the single source of truth for AI assistants working on this codebase.
> Update this document whenever the architecture, schema, or file structure changes significantly.
>
> **Last Updated**: 2026-08-25
> **Project Name**: Electrofic Home Automation System
> **Firebase Project ID**: `electrofic-homeautomation`
> **Live Dashboard URL**: https://electrofic-homeautomation.web.app/

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository Structure](#2-repository-structure)
3. [Node Inventory (ESP32 Devices)](#3-node-inventory-esp32-devices)
4. [MQTT Topic Map](#4-mqtt-topic-map)
5. [Firebase Realtime Database Schema](#5-firebase-realtime-database-schema)
6. [Raspberry Pi Gateway (bridge.py)](#6-raspberry-pi-gateway-bridgepy)
7. [ESP32 Node Firmware](#7-esp32-node-firmware)
8. [Web Dashboard](#8-web-dashboard)
9. [Known Issues and Gotchas](#9-known-issues-and-gotchas)
10. [Changelog](#10-changelog)

---

## 1. System Architecture

```
+--------------------------------------------------------------+
|              ESP32 Microcontroller Nodes (x5)                |
|  - Connected to Home Wi-Fi (SSID: YOUR_WIFI_SSID)                 |
|  - Controls Relays (Lights, Fans, Chandeliers)               |
|  - Reads DHT22 sensors (Temperature & Humidity)              |
|  - Publishes heartbeat every 3s, telemetry every 8s          |
+------------------------------+-------------------------------+
                               | Local Wi-Fi -- MQTT Protocol (1883)
                               v
+--------------------------------------------------------------+
|           Raspberry Pi 4 -- Master Gateway (24/7)            |
|  - Mosquitto MQTT Broker  (port 1883)                        |
|  - bridge.py daemon       (systemd service)                  |
|    +-- Syncs telemetry -> Firebase Realtime DB               |
|    +-- Listens Firebase /commands -> dispatches MQTT cmds    |
|    +-- Heartbeat watchdog (marks nodes offline after 6s)     |
|    +-- Local WebSocket gateway (port 8765) for LAN dashboard |
+------------------------------+-------------------------------+
                               | Firebase Admin SDK (HTTPS/JWT)
                               v
+--------------------------------------------------------------+
|           Firebase Cloud (Google)                            |
|  - Realtime Database -- live telemetry, device states, cmds  |
|  - Hosting           -- serves the React PWA globally        |
+------------------------------+-------------------------------+
                               | Firebase JS SDK (WebSockets)
                               v
+--------------------------------------------------------------+
|           Electrofic React PWA Web Dashboard                 |
|  - Multi-floor switchboards, water, electricity, climate     |
|  - Works on mobile, tablet, desktop                          |
|  - Also connects to RPi via ws://[rpi-ip]:8765 on LAN        |
+--------------------------------------------------------------+
```

**Design Intent — Dual-Mode, Local-First:**

The system is designed to work **fully without internet**. Firebase is used only when internet is available. The dashboard should automatically detect which mode it is in:

| Mode | Condition | Dashboard connects to | Commands go via |
|------|-----------|-----------------------|-----------------|
| **Local LAN** | Phone/browser on same Wi-Fi as RPi | `ws://[rpi-ip]:8765` directly | WebSocket → MQTT → ESP32 |
| **Remote** | Outside home network / internet available | Firebase Realtime DB | Firebase `/commands` → RPi listener → MQTT → ESP32 |

- **Local path**: Dashboard connects to RPi WebSocket (port 8765). RPi `bridge.py` publishes to MQTT directly. Zero cloud latency. Works even if internet is down.
- **Remote path**: Dashboard reads/writes Firebase. RPi `bridge.py` syncs telemetry up and listens for commands. Requires internet on both RPi and client device.
- **Fallback logic** (planned): Dashboard should attempt WebSocket first, and only fall back to Firebase if WebSocket connection fails or times out.

---

## 2. Repository Structure

```
Home Automation Project/
+-- CONTEXT.md                          <- THIS FILE (AI context, keep updated)
+-- README.md                           <- Human-readable overview
+-- docs/
|   +-- SETUP_GUIDE.md                  <- Full hardware + software setup steps
|   +-- RASPBERRY_PI_GATEWAY_GUIDE.md   <- RPi-specific deployment guide
|
+-- raspberry-pi/                       <- Runs 24/7 on Raspberry Pi
|   +-- bridge.py                       <- Core daemon (MQTT <-> Firebase bridge)
|   +-- home-automation-bridge.service  <- systemd unit file
|   +-- requirements.txt                <- Python deps: firebase-admin, paho-mqtt, websockets
|   +-- serviceAccountKey.json          <- Firebase service account (SECRET - do NOT commit)
|   +-- firebase-seed.json              <- Initial Firebase DB structure (run once to seed)
|   +-- seed_firebase.py                <- Script to push firebase-seed.json to Firebase
|
+-- esp32-nodes/                        <- Arduino/C++ firmware per room
|   +-- esp32_ayush_node/
|   |   +-- esp32_ayush_node.ino        <- Ayush Room (2nd Floor)
|   +-- esp32_first_floor_node/
|   |   +-- esp32_first_floor_node.ino
|   +-- esp32_hall_node/
|   |   +-- esp32_hall_node.ino
|   +-- esp32_harry_node/
|   |   +-- esp32_harry_node.ino
|   +-- esp32_mom_dad_node/
|       +-- esp32_mom_dad_node.ino
|
+-- web-dashboard/                      <- React PWA (no build step -- CDN Babel)
    +-- index.html                      <- Entry point, loads all scripts via <script> tags
    +-- style.css                       <- All styling (~51KB, single file)
    +-- manifest.json                   <- PWA manifest
    +-- sw.js                           <- Service Worker (offline caching)
    +-- serve-app.py                    <- Local Python HTTP dev server
    +-- firebase.json                   <- Firebase Hosting config
    +-- src/
    |   +-- main.jsx                    <- Renders <App /> into #root
    |   +-- App.jsx                     <- Root component, ALL state lives here
    |   +-- data/
    |   |   +-- switchboardData.js      <- Static room/switch definitions (window.INITIAL_BOARDS)
    |   +-- components/
    |       +-- Sidebar.jsx             <- Desktop navigation sidebar
    |       +-- MobileHeader.jsx        <- Mobile top bar + hamburger drawer
    |       +-- Topbar.jsx              <- Live stats bar (active devices, bill, water)
    |       +-- SwitchboardSection.jsx  <- Floor-by-floor switchboard panels
    |       +-- SwitchCard.jsx          <- Individual switch toggle card
    |       +-- FanRegulator.jsx        <- Fan speed slider (levels 1-5)
    |       +-- WaterMonitoring.jsx     <- Water tank level + pump control
    |       +-- ClimateSensors.jsx      <- Temperature, humidity, AQI display
    |       +-- ElectricityBilling.jsx  <- Live wattage + monthly bill estimate
    |       +-- QuickScenes.jsx         <- Scene buttons (All Off, Night Mode, etc.)
    |       +-- ActivityLog.jsx         <- Live event log feed
    +-- icons/                          <- PWA icons (192x192, 512x512)
```

---

## 3. Node Inventory (ESP32 Devices)

| Node ID       | Room                | Floor        | RPi IP (hardcoded in firmware) |
|---------------|---------------------|--------------|-------------------------------|
| `ayush`       | Ayush Room          | 2nd Floor    | `192.168.137.185`             |
| `harry`       | Harry Room          | 2nd Floor    | same RPi IP                   |
| `first_floor` | First Floor Room    | 1st Floor    | same RPi IP                   |
| `hall`        | Hall                | Ground Floor | same RPi IP                   |
| `mom_dad`     | Mom & Dad Room      | 1st Floor    | same RPi IP                   |

> **IMPORTANT**: All ESP32 nodes have the Raspberry Pi IP hardcoded as `MQTT_SERVER`.
> If the RPi's IP changes, ALL firmware files must be updated and reflashed.
> Home Wi-Fi SSID: `YOUR_WIFI_SSID`

### Ayush Room -- Switch Point Map

| Point ID | GPIO (relay) | GPIO (PWM) | Appliance          | Has Regulator |
|----------|--------------|------------|--------------------|---------------|
| `ay1`    | 25           | 18         | Main Fan           | YES (speed 1-5) |
| `ay2`    | 26           | --         | Main Light         | no            |
| `ay3`    | 27           | --         | Night Bulb         | no            |
| `ay5`    | 14           | --         | Brown Fan (secondary) | no         |
| `ay6`    | 12           | --         | Centre Light Socket| no            |

> NOTE: Point `ay4` is intentionally skipped/absent.
> Relay logic is ACTIVE-LOW: `RELAY_ON = LOW`, `RELAY_OFF = HIGH`.

---

## 4. MQTT Topic Map

All topics use the prefix `home/nodes/`.

| Topic                                | Direction  | Publisher  | Subscriber | Payload                                          |
|--------------------------------------|------------|------------|------------|--------------------------------------------------|
| `home/nodes/{node_id}/telemetry`     | Node -> RPi | ESP32      | bridge.py  | Full JSON: relays, temp, humidity, ip, rssi, uptime |
| `home/nodes/{node_id}/heartbeat`     | Node -> RPi | ESP32      | bridge.py  | Lightweight: `{node_id, ts_ms, rssi}`            |
| `home/nodes/{node_id}/set`           | RPi -> Node | bridge.py  | ESP32      | JSON: relay key-value pairs + optional `speed`   |
| `home/nodes/all/scene`               | RPi -> ALL  | bridge.py  | All ESP32  | `{name: "all_off"|"night_mode", timestamp}`      |
| `home/nodes/water_pump/set`          | RPi -> Pump | bridge.py  | Water node | Pump control JSON                                |
| `home/water/telemetry`               | Pump -> RPi | Water node | bridge.py  | Tank level, flow, pump state                     |
| `home/electricity/telemetry`         | Meter -> RPi | Energy node | bridge.py | liveWatts, todayKwh, monthlyKwh                 |
| `home/energy/telemetry`              | Meter -> RPi | Energy node | bridge.py | Alias for electricity topic                      |

### Telemetry JSON Example (ESP32 -> RPi)

```json
{
  "node_id":   "ayush",
  "room":      "Ayush Room (2nd Floor)",
  "ip":        "192.168.137.33",
  "rssi":      -56,
  "status":    "online",
  "uptime_s":  104,
  "relays": {
    "ay1_fan_main":     true,
    "ay1_fan_speed":    5,
    "ay2_light_main":   true,
    "ay3_night_bulb":   false,
    "ay5_brown_fan":    false,
    "ay6_centre_light": true
  },
  "temperature": 24.0,
  "humidity":    54.0
}
```

### Command JSON Examples (RPi -> ESP32)

```json
// Toggle a relay:
{ "ay2": true }

// Set fan + speed:
{ "ay1": true, "speed": 3 }

// Scene broadcast on home/nodes/all/scene:
{ "name": "all_off", "timestamp": 1724500000 }
{ "name": "night_mode", "timestamp": 1724500000 }
```

---

## 5. Firebase Realtime Database Schema

**Database URL**: `https://electrofic-homeautomation-default-rtdb.firebaseio.com`

```
/ (root)
+-- devices/
|   +-- {node_id}/              e.g. "ayush", "harry", "hall", "first_floor", "mom_dad"
|       +-- status              "online" | "offline"   (written by bridge watchdog)
|       +-- room                "Ayush Room (2nd Floor)"
|       +-- telemetry/          Full last-known telemetry JSON snapshot
|
+-- water_system/
|   +-- levelPercent            float
|   +-- volumeLitres            float
|   +-- maxCapacity             int (1000)
|   +-- fillingTimeMin          float
|   +-- inflowRate              float
|   +-- pumpActive              bool
|   +-- autoMode                bool
|
+-- environment/
|   +-- temp                    float (degrees C)
|   +-- humidity                int (%)
|   +-- airQuality              string
|   +-- aqi                     int
|   +-- pm25                    float
|   +-- pm10                    float
|   +-- co2                     int
|
+-- electricity/
|   +-- liveWatts               float
|   +-- todayKwh                float
|   +-- monthlyKwh              float
|   +-- tariffRateRupees        float (default 7.50)
|   +-- hourlyLoad              array[12] of floats
|
+-- boards/                     Static switch layout (mirrors switchboardData.js)
|   +-- {node_id}/...
|
+-- commands/                   <- Web dashboard WRITES here; RPi listens here via SSE
    +-- {node_id}/              e.g. "ayush" -> { ay2: true }
    +-- scene/                  e.g. { name: "all_off" }
    +-- water_pump/             pump control payload
```

---

## 6. Raspberry Pi Gateway (bridge.py)

**File**: `raspberry-pi/bridge.py` (468 lines)

### Configuration Constants

| Variable              | Default / Source                                                  |
|-----------------------|-------------------------------------------------------------------|
| `MQTT_BROKER`         | `"localhost"` (env: `MQTT_BROKER`)                               |
| `MQTT_PORT`           | `1883` (env: `MQTT_PORT`)                                        |
| `WS_PORT`             | `8765`                                                            |
| `HEARTBEAT_TIMEOUT_S` | `6` -- seconds before a node is marked offline                   |
| `WATCHDOG_INTERVAL_S` | `3` -- seconds between watchdog checks                           |
| `KNOWN_NODES`         | `["ayush", "hall", "first_floor", "harry", "mom_dad"]`           |
| `FIREBASE_DATABASE_URL` | `https://electrofic-homeautomation-default-rtdb.firebaseio.com` |
| `FIREBASE_CRED_PATH`  | `./serviceAccountKey.json` (env: `FIREBASE_CRED_PATH`)           |

### Threads

| Thread/Task          | Type          | Description                                          |
|----------------------|---------------|------------------------------------------------------|
| Main thread          | blocking      | `mqtt_client.loop_forever()` -- MQTT I/O             |
| `FirebaseManager`    | daemon thread | Self-healing: probes Firebase every 30s, sets `_firebase_ready`, starts/restarts command listener |
| `HeartbeatWatchdog`  | daemon thread | Checks `_last_heartbeat`; marks stale nodes offline  |
| `WSGateway`          | daemon thread | Runs asyncio event loop for local WebSocket server   |

### Key Global State

```python
_last_heartbeat: dict   # { node_id: float epoch } -- protected by _heartbeat_lock
_local_state: dict      # { devices, water_system, environment, electricity }
_ws_clients: set        # Active WebSocket connections
_mqtt_ref               # Reference to paho MQTT client (used by WS handler)
_firebase_ready         # threading.Event -- SET when Firebase is reachable
                        # CLEARED by any failed Firebase write -> triggers reconnect
_firebase_listener_handle  # SSE ListenerRegistration -- closed/restarted by manager
```

### Message Flow

```
[ESP32] heartbeat  -> on_message() -> _last_heartbeat[node_id] = time.time()
                                   -> _broadcast_state() -> WS clients (always)
                                   -> Firebase: devices/{node_id}/status = "online"
                                      (only if _firebase_ready.is_set())

[ESP32] telemetry  -> on_message() -> _broadcast_state() -> WS clients (always)
                                   -> env readings -> _broadcast_state() (always)
                                   -> Firebase: devices/{node_id}/telemetry.update(data)
                                   -> Firebase: environment.update({temp, humidity})
                                      (only if _firebase_ready.is_set())
                                   -> on Firebase error: _firebase_ready.clear()

[Firebase /commands] -> _attach_firebase_listener() callback
                     -> mqtt_client.publish(home/nodes/{id}/set)

[FirebaseManager]    -> every 30s: checks _firebase_ready
                     -> if not set: db.reference("devices").get() probe
                     -> on success: _firebase_ready.set() + restart listener
                     -> on failure: sleep 30s, retry forever

[HeartbeatWatchdog]  -> every 3s, checks _last_heartbeat timestamps
                     -> if stale > 6s -> _broadcast_state(offline) (always)
                                      -> Firebase: devices/{id}/status = "offline"
                                         (only if _firebase_ready.is_set())
                                      -> on Firebase error: _firebase_ready.clear()
```

### Systemd Service

**File**: `raspberry-pi/home-automation-bridge.service`

Critical settings:
- `After=network.target mosquitto.service time-sync.target` -- waits for NTP sync before starting
- `Restart=always`, `RestartSec=5` -- auto-restarts on crash
- Env vars set inline: `MQTT_BROKER`, `FIREBASE_CRED_PATH`, `FIREBASE_DATABASE_URL`

---

## 7. ESP32 Node Firmware

**Location**: `esp32-nodes/{node_id}/{node_id}.ino`

All nodes share an identical code structure:

| Section                  | Description                                                        |
|--------------------------|--------------------------------------------------------------------|
| Network & MQTT config    | Wi-Fi credentials + RPi IP hardcoded at top of file               |
| Pin definitions          | `#define` macros per relay GPIO + PWM pin for fan speed           |
| Relay state variables    | `bool state*` + `int fanSpeed` per appliance                      |
| `applyFanMainSpeed()`    | Maps speed 1-5 to PWM duty cycle 80-255 via `ledcWrite`           |
| `applyRelayStates()`     | Writes all bool states to GPIO; calls `applyFanMainSpeed`          |
| `publishHeartbeat()`     | Every 3s: `{node_id, ts_ms, rssi}` -- lightweight liveness signal |
| `publishTelemetry()`     | Every 8s: full relay states + temp/humidity JSON                   |
| `handleMqttMessage()`    | Parses `/set` and `/scene` commands; calls applyRelayStates + publishTelemetry |
| `reconnectMQTT()`        | Reconnects Wi-Fi then MQTT if disconnected                         |
| `setup()` / `loop()`     | Standard Arduino entry points                                      |

**Required Arduino Libraries:**
- `PubSubClient` by Nick O'Leary (MQTT client)
- `ArduinoJson` by Benoit Blanchon (JSON)
- `WiFi.h` (built-in ESP32 core)

**PWM API Compatibility Guard** (in fan nodes):
```cpp
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(PIN_FAN_PWM, dutyCycle);    // Core v3.x API
#else
  ledcWrite(PWM_CHANNEL, dutyCycle);    // Core v2.x API
#endif
```

---

## 8. Web Dashboard

**Stack**: React 18 loaded via CDN. No npm build step. Babel transforms JSX in-browser at runtime. All components export themselves as `window.ComponentName` instead of ES module exports.

**Root component**: `web-dashboard/src/App.jsx` -- All application state lives here.

### App State Summary

| State         | Type   | Description                                                   |
|---------------|--------|---------------------------------------------------------------|
| `boards`      | object | All switchboard states keyed by node_id, initialized from `window.INITIAL_BOARDS` |
| `waterData`   | object | Tank level, pump state, flow rates, pH, TDS                   |
| `envData`     | object | Temperature, humidity, AQI, PM2.5, PM10, CO2                 |
| `elecData`    | object | Live wattage, kWh today/monthly, tariff, hourly load array    |
| `logs`        | array  | Activity log `{id, time, text, type}`                         |
| `activeTab`   | string | `"overview"` / `"switchboards"` / `"water"` / `"electricity"` |
| `selectedFloor` | string | Active node ID in switchboard view                          |

### Switch Point Object Schema

```js
{
  id: "ay1",              // Unique point ID (matches Firebase relay key prefix)
  num: 1,                 // Physical switch number on board
  name: "FAN (Regulator)",
  desc: "Controls Main Fan",
  icon: "fa-fan",         // Font Awesome class
  type: "fan",            // "fan" | "light" | "chandelier" | "regulator"
  state: true,            // Current on/off
  hasRegulator: true,     // Shows FanRegulator speed slider if true
  speed: 5                // Fan speed level 1-5
}
```

### Scenes

| Scene Name  | Behavior                                                        |
|-------------|------------------------------------------------------------------|
| `all_off`   | All switches -> false                                           |
| `all_on`    | All switches -> true                                            |
| `night_mode`| Only switches with "NIGHT" or "SMART" in name -> true          |
| `eco_mode`  | Only `type === "light"` switches -> true                        |

### Connectivity Strategy (Planned — Not Yet Implemented)

The dashboard is designed to operate in two modes, chosen automatically:

#### Mode 1: Local LAN (Primary / Preferred)
- Dashboard connects to `ws://[rpi-ip]:8765` (the WebSocket server in `bridge.py`)
- On connect, RPi immediately sends a full state snapshot: `{type: "state", devices: {...}, water_system: {...}, ...}`
- Subsequent MQTT telemetry is broadcast as partial state updates to all connected WS clients
- Commands (toggle, scene, pump) are sent as JSON messages over the same WebSocket:
  ```json
  { "type": "cmd",   "target": "ayush", "ay2": true }
  { "type": "scene", "name": "all_off" }
  { "type": "pump",  "pumpActive": true }
  ```
- RPi `bridge.py` already supports this fully — the WS server, command router, and state broadcaster are all implemented.

#### Mode 2: Remote via Firebase (Fallback / Away from Home)
- Dashboard connects to Firebase Realtime DB using the JS SDK (already loaded in `index.html`)
- Listens to `/devices`, `/water_system`, `/environment`, `/electricity` for live telemetry
- Writes commands to `/commands/{node_id}` which RPi picks up via SSE listener
- Firebase project: `electrofic-homeautomation`

#### Auto-Detection Logic (To Be Implemented in Dashboard)
```
1. Try to connect to ws://[RPi_IP]:8765 with a short timeout (~3s)
2. If WebSocket connects successfully -> use LOCAL mode
3. If WebSocket fails / times out -> use FIREBASE mode
4. Show connection mode indicator in UI (e.g. "Local" / "Remote" badge)
5. If in Local mode and WS drops -> automatically try reconnect, then fall back to Firebase
```

> **Current Status**: The dashboard has NO live connection of any kind yet.
> All state is local to React only. The dashboard simulates telemetry fluctuations with `setInterval`.
> Both the WebSocket client and Firebase listener wiring are **pending implementation** in the frontend.
> The RPi side (`bridge.py` WS server + Firebase sync) is already fully implemented.

---

## 9. Known Issues and Gotchas

### Firebase JWT Invalid Grant (Clock Skew)

**Symptom**:
```
invalid_grant: Invalid JWT: Token must be a short-lived token (60 minutes)
and in a reasonable timeframe. Check your iat and exp values in the JWT claim.
```

**Cause**: Raspberry Pi system clock is out of sync with real time. The Pi has no hardware RTC
and relies entirely on NTP at boot. If NTP fails (no internet at startup), the clock may be
hours or days off, causing the Firebase Admin SDK to generate JWTs with invalid timestamps.

**Immediate fix**:
```bash
sudo ntpdate -u pool.ntp.org
sudo systemctl restart home-automation-bridge
```

**Permanent mitigation**: `home-automation-bridge.service` includes `time-sync.target` in `After=`,
so systemd will wait for clock synchronization before launching the bridge daemon.

---

### Relay Pin Polarity (Active-LOW)

All relay modules used are active-LOW. In firmware: `RELAY_ON = LOW`, `RELAY_OFF = HIGH`.
Writing `HIGH` to a relay pin turns it OFF. This is a common source of confusion when debugging.

---

### RPi IP Hardcoded in All Firmware

The Raspberry Pi's local IP (`192.168.137.185`) is hardcoded in every `.ino` file as `MQTT_SERVER`.
If the RPi gets a new IP address, every single ESP32 node must be reflashed. Consider setting a
static DHCP lease for the RPi on your router to prevent this.

---

### PWM Fan Control -- Arduino Core Version

The `ledcWrite` API changed between ESP32 Arduino core v2.x and v3.x. All fan nodes use
`#if ESP_ARDUINO_VERSION` compile-time guards to handle both. Make sure the correct
core version is installed in Arduino IDE. Mismatches cause silent fan control failures.

---

### Mom/Dad Node Status

The `mom_dad` node exists in `KNOWN_NODES`, `firebase-seed.json`, and `switchboardData.js`,
but confirm that `esp32_mom_dad_node.ino` is fully implemented and tested before deploying.

---

## 10. Changelog

| Date       | Change                                                                      |
|------------|-----------------------------------------------------------------------------|
| 2026-08-25 | Created `CONTEXT.md` (this file) as AI project context document             |
| 2026-08-25 | Fixed `home-automation-bridge.service`: added `time-sync.target` to `After=` |
| 2026-08-21 | Identified Firebase JWT clock-skew error on RPi; documented fix             |
