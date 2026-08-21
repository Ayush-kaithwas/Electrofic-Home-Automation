# 🍓 Raspberry Pi 24/7 Gateway Setup Guide

This document explains how the **Raspberry Pi Gateway** operates, what files are in the `raspberry-pi/` directory, and how to run `bridge.py` as a continuous **24/7 background system service**.

---

## 📁 Raspberry Pi Folder Structure

```
raspberry-pi/
 ├── bridge.py                         # Main daemon syncing MQTT (ESP32) <-> Firebase (Cloud)
 ├── home-automation-bridge.service    # Systemd service configuration for 24/7 background run
 ├── firebase-seed.json                # Clean switchboard schema (No NULLs, direct switch keys)
 ├── seed_firebase.py                  # One-time script to populate Firebase Realtime Database
 ├── serviceAccountKey.json            # Secret Firebase credentials key from Firebase Console
 └── requirements.txt                  # Python dependencies (paho-mqtt, firebase-admin)
```

---

## ⚙️ How the Gateway Works

```
 ┌───────────────────────────┐
 │   ESP32 Wireless Nodes    │  (Relays / Switches / Sensors)
 └─────────────┬─────────────┘
               │ Local MQTT Topics (`home/nodes/{id}/telemetry` & `home/nodes/{id}/set`)
               ▼
 ┌───────────────────────────┐
 │   Mosquitto MQTT Broker   │  (Port 1883 on Raspberry Pi)
 └─────────────┬─────────────┘
               │ Local Socket
               ▼
 ┌───────────────────────────┐
 │   `bridge.py` Gateway     │  (Running 24/7 via Systemd Service)
 └─────────────┬─────────────┘
               │ Real-time Bi-directional HTTPS WebSockets
               ▼
 ┌───────────────────────────┐
 │  Firebase Cloud Database  │  (electrofic-homeautomation-default-rtdb)
 └─────────────┬─────────────┘
               │ Web Dashboard (Mobile / Laptop)
               ▼
 ┌───────────────────────────┐
 │  AuraHome Web Dashboard   │
 └───────────────────────────┘
```

1. **Downlink (Control)**:
   - When you click a switch on the Web Dashboard, Firebase writes to `/commands/{node_id}/{switch_id}`.
   - `bridge.py` receives this change instantly and publishes an MQTT packet to `home/nodes/{node_id}/set`.
   - The ESP32 receives the MQTT packet and toggles the relay.

2. **Uplink (Status & Sensor Telemetry)**:
   - The ESP32 publishes relay status & sensor telemetry to MQTT topic `home/nodes/{node_id}/telemetry`.
   - `bridge.py` catches the MQTT message and updates `/devices/{node_id}/telemetry` in Firebase.

---

## 🚀 One-Time Setup on Raspberry Pi

### 1. Install System Packages & Mosquitto
```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients python3-pip git
```

### 2. Configure Mosquitto for Subnet Access
```bash
sudo nano /etc/mosquitto/conf.d/default.conf
```
Add these 2 lines:
```ini
listener 1883 0.0.0.0
allow_anonymous true
```
Save (`Ctrl+O`, `Enter`, `Ctrl+X`) and restart Mosquitto:
```bash
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto
```

### 3. Install Python Dependencies
```bash
cd /home/pi/TestHomeAutomation/raspberry-pi
pip3 install -r requirements.txt
```

### 4. (Optional) Seed Firebase Database
If your Firebase Realtime Database is empty:
```bash
python3 seed_firebase.py
```

---

## 🔄 Enable 24/7 Automatic Background Service

To ensure `bridge.py` runs 24/7 automatically (even across power cuts or reboots):

```bash
# 1. Copy service file to systemd directory
sudo cp /home/pi/TestHomeAutomation/raspberry-pi/home-automation-bridge.service /etc/systemd/system/

# 2. Reload systemd daemon
sudo systemctl daemon-reload

# 3. Enable and start the service immediately
sudo systemctl enable --now home-automation-bridge
```

---

## 🛠️ Management & Monitoring Commands

| Action | Command |
| :--- | :--- |
| **Check service status** | `sudo systemctl status home-automation-bridge` |
| **View live real-time logs** | `journalctl -u home-automation-bridge -f` |
| **Restart the bridge** | `sudo systemctl restart home-automation-bridge` |
| **Stop the bridge** | `sudo systemctl stop home-automation-bridge` |
| **Disable autostart** | `sudo systemctl disable home-automation-bridge` |

---

## 💡 Troubleshooting

- **Connection refused on port 1883**:
  Check if Mosquitto is running: `sudo systemctl status mosquitto`. Start it with `sudo systemctl start mosquitto`.
- **Firebase credentials warning**:
  Ensure `serviceAccountKey.json` is located in `/home/pi/TestHomeAutomation/raspberry-pi/serviceAccountKey.json`.
- **ESP32 not receiving commands**:
  Ensure the `NODE_ID` in `esp32_relay_switch.ino` matches the node name in Firebase commands (e.g. `hall`, `first_floor`, `harry`, `mom_dad`, `ayush`).
