# ⚡ Electrofic — Smart Home Automation & IoT Ecosystem

[![Firebase Hosting](https://img.shields.io/badge/Firebase-Hosting%20%7C%20Live-orange?style=flat&logo=firebase)](https://electrofic-homeautomation.web.app/)
[![React](https://img.shields.io/badge/React-18-blue?style=flat&logo=react)](https://reactjs.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-Gateway-C51A4A?style=flat&logo=raspberrypi)](https://www.raspberrypi.org/)
[![ESP32](https://img.shields.io/badge/ESP32-Microcontroller-red?style=flat&logo=espressif)](https://www.espressif.com/)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=flat&logo=githubactions)](https://github.com/Ayush-kaithwas/Electrofic-Home-Automation/actions)

**Electrofic** is a modern, real-time Smart Home Automation system featuring a progressive web app (PWA) dashboard, multi-floor switchboard control, IoT sensor telemetry, smart water tank monitoring, and an intelligent Raspberry Pi gateway bridging ESP32 hardware nodes directly with Firebase Realtime Database.

---

## 🌟 Key Features

### 🎛️ Multi-Floor Switchboard Control
- Individual and room-level control across 5 floors (`Ground Floor Hall`, `First Floor`, `Harry's Room`, `Mom & Dad's Room`, and `Ayush's Room`).
- Real-time relay state toggling with instant visual feedback.
- Multi-speed fan regulator adjustments.

### 💧 Smart Water Monitoring & Pump Automation
- Real-time water tank volume & capacity tracking with visual fluid animations.
- Water quality metrics (TDS and pH monitoring).
- Automated and manual water pump controls with safety cutoffs.

### 🌡️ Climate, Telemetry & Energy Analytics
- Ambient room temperature, humidity, and motion sensor telemetry.
- Real-time electricity consumption (Watts) and billing estimations (₹ / kWh).
- Activity logs and automated quick scenes (e.g., Night Mode, All Off).

### 📱 Modern Progressive Web App (PWA)
- **Glassmorphic UI**: Cyber-luminescent dark theme with smooth micro-animations and typography.
- **Real-time Sync**: Direct Firebase Realtime Database integration for instant synchronization across devices.
- **Installable PWA**: Works seamlessly on mobile (iOS/Android) and desktop with offline service worker support.

### 🔄 Automated CI/CD
- Built-in GitHub Actions workflow auto-deploys every commit merged into `main` directly to **Firebase Hosting**.

---

## 🏗️ Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────┐
 │                  ESP32 Microcontroller Node                 │
 │  - Relays (Lights, Fans, Chandelier, Sockets)               │
 │  - Environmental Sensors (Temp, Humidity, Water)            │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Local MQTT Topics)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  Raspberry Pi Master Hub                    │
 │  - Mosquitto MQTT Broker (Port 1883)                        │
 │  - Python Gateway Bridge (`bridge.py`)                      │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Firebase Admin SDK / WebSockets)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              Firebase Realtime Cloud Database               │
 │          (Live State Sync & Command Dispatching)            │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Firebase Web SDK / HTTPS)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              Electrofic React PWA Dashboard                 │
 │            (Hosted live on Firebase Hosting)                │
 └─────────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
.
├── .github/workflows/       # GitHub Actions CI/CD (Auto-deploys to Firebase Hosting)
├── docs/                    # Hardware wiring guides & Raspberry Pi setup documentation
├── esp32-nodes/             # Arduino / C++ firmware for ESP32 relay modules
├── raspberry-pi/            # Python gateway daemon, bridge script & systemd service
├── web-dashboard/           # React 18 PWA Web Dashboard (HTML, CSS, JS, Assets)
└── .gitignore               # Excludes secrets (serviceAccountKey.json, .env) and node_modules
```

---

## 🚀 Getting Started

### 1. Web Dashboard (Local Development)
```bash
cd web-dashboard
# Run local preview server
python serve-app.py
```
Open `http://localhost:8080` in your browser.

### 2. Raspberry Pi Gateway
```bash
cd raspberry-pi
pip3 install -r requirements.txt
python3 bridge.py
```

### 3. Flash ESP32 Firmware
1. Open `esp32-nodes/esp32_relay_switch/esp32_relay_switch.ino` in Arduino IDE.
2. Enter your Wi-Fi credentials and Raspberry Pi IP address.
3. Upload to your ESP32 board.

---

## 🔄 Automatic Deployment

Any push to the `main` branch automatically triggers the GitHub Actions workflow to build and deploy the dashboard live to:
👉 **[https://electrofic-homeautomation.web.app/](https://electrofic-homeautomation.web.app/)**

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
