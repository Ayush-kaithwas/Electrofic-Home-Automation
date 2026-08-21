# Walkthrough - Node.js Backend & Database Service Implementation

We have successfully created and verified the standalone **Node.js Backend & Database Service** for the **AuraHome Smart Home System**.

The backend operates in a dedicated [`backend/`](file:///d:/Home%20Automation%20Project/backend) directory, serving REST APIs, real-time WebSockets, and utilizing an embedded **SQLite Database** (`aurahome.db`) to manage states, commands, and telemetry.

---

## 🛠️ Components Created

```
d:\Home Automation Project\
 ├── backend/
 │    ├── db/
 │    │    ├── database.js     # SQLite helper functions and schema setup
 │    │    ├── seed.js         # Initial database seeder (populates floor switchboards)
 │    │    └── aurahome.db     # SQLite database file
 │    ├── routes/
 │    │    ├── deviceRoutes.js # REST routes for switchboards & pending commands
 │    │    ├── waterRoutes.js  # REST routes for water tank monitoring
 │    │    └── telemetryRoutes.js # REST routes for ESP32/RPi sensor logging
 │    ├── websocket.js         # Real-time WebSocket broadcasting server
 │    ├── server.js            # Main Express application entry point (Port 5000)
 │    ├── package.json         # Node.js dependencies (express, sqlite3, ws, cors, dotenv)
 │    └── .env                 # Environment configuration (PORT=5000)
 └── raspberry-pi/
      └── node_backend_bridge.py # Gateway daemon bridging MQTT ESP32 nodes with Node.js backend
```

---

## 🌐 API Specifications & Capabilities

### REST Endpoints (Port 5000)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Server health check and database status |
| `/api/boards` | `GET` | Fetch all floor switchboards & switch states |
| `/api/boards/:id` | `GET` | Fetch details for a specific switchboard (e.g. `hall`, `harry`, `ayush`) |
| `/api/boards/:boardId/points/:pointId` | `PATCH` | Toggle switch state or fan speed; queues command for RPi & broadcasts via WebSocket |
| `/api/commands/pending` | `GET` | Used by RPi Gateway to poll pending commands for ESP32 nodes |
| `/api/commands/:id/ack` | `POST` | Used by RPi Gateway to acknowledge command execution |
| `/api/water` | `GET / PUT` | Retrieve & update water tank levels, pH, TDS, and pump state |
| `/api/telemetry` | `POST / GET` | Post sensor data (temperature, humidity, motion) from RPi/ESP32 & query history |

### WebSocket Gateway (Port 5000)
- **URL**: `ws://<SERVER_IP>:5000`
- **Events**: Broadcasts `POINT_UPDATE`, `WATER_UPDATE`, and `TELEMETRY_LOG` in real-time to all connected Web Dashboard clients and Raspberry Pi bridge instances.

---

## 🧪 Verification Results

1. **Database Initialization & Seeding**:
   - Initialized SQLite schema tables: `boards`, `water_system`, `environment`, `commands`, `telemetry_logs`.
   - Seeded initial floor switchboards parsed from floor specs (`hall`, `first_floor`, `harry`, `mom_dad`, `ayush`).

2. **Backend Server Startup**:
   - Node.js Express server is active on `http://localhost:5000` and `http://192.168.10.253:5000`.

3. **REST API Verification**:
   - `GET /api/health` ➡️ Returned `{"status": "ONLINE", "database": "SQLite (aurahome.db)"}`
   - `GET /api/boards` ➡️ Returned all 5 floor switchboards with points.
   - `PATCH /api/boards/hall/points/h1` ➡️ Successfully updated switch state and logged pending command in SQLite.
   - `GET /api/commands/pending` ➡️ Returned pending command with payload `{"state": false}` ready for RPi dispatch.

---

## 🚀 How to Run

### Start Node.js Backend Server
```powershell
cd "d:\Home Automation Project\backend"
npm start
```

### Run Seeder Manually (if needed)
```powershell
cd "d:\Home Automation Project\backend"
npm run seed
```

### Run Raspberry Pi Gateway Bridge (on RPi)
```bash
cd /home/pi/home-automation/raspberry-pi
python3 node_backend_bridge.py
```
