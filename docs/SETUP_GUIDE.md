# Master Setup & Deployment Guide: Custom RPi + ESP32 + Firebase Smart Home

This guide walks you through setting up your smart home automation system using a **Raspberry Pi Master Hub**, **ESP32 Wi-Fi Nodes**, **Firebase Realtime Database & Hosting**, and the **Electrofic React PWA Web Dashboard**.

---

## 🏗️ Architecture Summary

```
 ┌─────────────────────────────────────────────────────────────┐
 │                  ESP32 Microcontroller Node                 │
 │  - Connects to Local Wi-Fi                                  │
 │  - Controls Relays (Lights, Fan, AC, Appliances)            │
 │  - Reads Sensors (Temperature, Humidity, Motion)            │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Local MQTT Protocol)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  Raspberry Pi Master Gateway                │
 │  - Mosquitto MQTT Broker (Port 1883)                        │
 │  - Python Bridge Daemon (`bridge.py`)                       │
 │  - Systemd Service (`home-automation-bridge.service`)       │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Realtime Cloud Sync)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │            Firebase Cloud (Hosting & Realtime DB)           │
 │  - Firebase Realtime Database (Live Telemetry & Controls)   │
 │  - Firebase Hosting (Global PWA Access)                     │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (PWA WebSockets / HTTPS)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │             Electrofic React PWA Dashboard                  │
 │  - Multi-floor Switchboards, Water Monitoring, & Telemetry  │
 │  - Works on Mobile Phone, Tablet & Desktop Browsers         │
 └─────────────────────────────────────────────────────────────┘
```

---

## 💻 Step 1: Prepare Raspberry Pi Master Hub

### 1.1 OS Flashing
1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Insert MicroSD Card and select **Raspberry Pi OS Lite (64-bit)**.
3. Configure settings before writing:
   - Set Hostname (e.g. `raspberrypi.local`)
   - Enable SSH (Password authentication)
   - Configure your home Wi-Fi SSID & Password.

### 1.2 Install Required Packages on RPi
SSH into your Raspberry Pi and install Mosquitto MQTT broker and Python dependencies:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y mosquitto mosquitto-clients python3-pip python3-venv git

# Enable Mosquitto service
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### 1.3 Configure Mosquitto Broker for Local Subnet Access
Edit `/etc/mosquitto/mosquitto.conf`:
```bash
sudo nano /etc/mosquitto/mosquitto.conf
```
Add the following two lines at the bottom to allow ESP32 nodes to connect without restriction:
```ini
listener 1883 0.0.0.0
allow_anonymous true
```
Restart Mosquitto:
```bash
sudo systemctl restart mosquitto
```

### 1.4 Copy & Start Python Gateway Daemon on RPi
1. Create project folder on Raspberry Pi: `mkdir -p /home/pi/home-automation`
2. Copy files from `raspberry-pi/` to `/home/pi/home-automation/raspberry-pi/`.
3. Install Python dependencies:
   ```bash
   cd /home/pi/home-automation/raspberry-pi
   pip3 install -r requirements.txt
   ```
4. Place `serviceAccountKey.json` from Firebase into `/home/pi/home-automation/raspberry-pi/`.
5. Enable Systemd Service on Raspberry Pi:
   ```bash
   sudo cp home-automation-bridge.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable home-automation-bridge
   sudo systemctl start home-automation-bridge
   ```
6. Check service status:
   ```bash
   sudo systemctl status home-automation-bridge
   ```

---

## ⚡ Step 2: Flash ESP32 Microcontroller Nodes

### 2.1 Hardware Connections
Connect an ESP32 board to a **4-Channel 5V Relay Module**:
- `VCC` -> ESP32 5V (or Vin)
- `GND` -> ESP32 GND
- `IN1` -> ESP32 GPIO 25 (Relay 1 - Light)
- `IN2` -> ESP32 GPIO 26 (Relay 2 - Fan)
- `IN3` -> ESP32 GPIO 27 (Relay 3 - Mood Light)
- `IN4` -> ESP32 GPIO 14 (Relay 4 - AC/Socket)

### 2.2 Arduino IDE Setup
1. Install **Arduino IDE** (v2.0+).
2. Add ESP32 Board URL in *Preferences*: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install Board Manager package: `esp32 by Espressif Systems`.
4. Open **Library Manager** (`Ctrl+Shift+I`) and install:
   - **PubSubClient** by Nick O'Leary
   - **ArduinoJson** by Benoit Blanchon

### 2.3 Flash Firmware
1. Open `esp32-nodes/esp32_relay_switch/esp32_relay_switch.ino`.
2. Update Wi-Fi details & Raspberry Pi IP address:
   ```cpp
   const char* WIFI_SSID = "YOUR_HOME_WIFI";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* MQTT_SERVER = "192.168.1.100"; // Replace with your RPi IP address
   ```
3. Select board `ESP32 Dev Module` and click **Upload**.
4. Open Serial Monitor at **115200 baud** to confirm Wi-Fi & MQTT connection.

---

## 🔥 Step 3: Firebase Realtime Database Setup

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Under project `electrofic-homeautomation`, select **Realtime Database**.
3. **Security Rules** for Realtime Database:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
4. Obtain Service Account Key for RPi:
   - Go to **Project Settings** -> **Service Accounts**.
   - Click **Generate new private key**.
   - Save file as `serviceAccountKey.json` and upload to your Raspberry Pi `raspberry-pi/` directory.

---

## 🌐 Step 4: Web Dashboard & Automatic Deployment

### Local Development
```bash
cd web-dashboard
python serve-app.py
```
Open `http://localhost:8080` in your browser.

### Automatic GitHub Actions Deployment
Whenever you push changes to the `main` branch, GitHub Actions will automatically deploy the latest dashboard to **Firebase Hosting** at `https://electrofic-homeautomation.web.app/`.
