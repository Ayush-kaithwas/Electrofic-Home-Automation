/* -------------------------------------------------------------
 * AuraHome — Dashboard Logic & Firebase Realtime Database Sync
 * ------------------------------------------------------------- */

// Paste your Firebase Web App configuration below
const firebaseConfig = {
  apiKey: "AIzaSyC4iLzJJ1JC16IMEnvBXZGFJZSlt2V4yGo",
  authDomain: "electrofic-homeautomation.firebaseapp.com",
  databaseURL: "https://electrofic-homeautomation-default-rtdb.firebaseio.com",
  projectId: "electrofic-homeautomation",
  storageBucket: "electrofic-homeautomation.firebasestorage.app",
  messagingSenderId: "393502148816",
  appId: "1:393502148816:web:11ac4f274a0a324b64b6d5",
  measurementId: "G-753V6EZ8XK"
};

let db = null;
let isMockMode = true;

// Current local state for mock/fallback mode
const deviceStates = {
  living_room_node: {
    relay1: false,
    relay2: false,
    relay3: false,
    relay4: false,
    temperature: 24.5,
    humidity: 58,
    status: 'online'
  }
};

// --- INITIALIZATION ---
function initApp() {
  // Check if Firebase is configured with real credentials
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      isMockMode = false;
      addLog("Connected to live Firebase Realtime Database.", "success");
      setupFirebaseListeners();
    } catch (e) {
      console.error("Firebase init failed:", e);
      enableMockMode();
    }
  } else {
    enableMockMode();
  }
}

function enableMockMode() {
  isMockMode = true;
  addLog("Firebase config unconfigured. Running in Interactive Local Demo Mode.", "info");
  updateUIFromState('living_room_node', deviceStates.living_room_node);
  
  // Simulate live temperature fluctuation every 5 seconds
  setInterval(() => {
    const tempChange = (Math.random() * 0.4 - 0.2).toFixed(1);
    deviceStates.living_room_node.temperature = (parseFloat(deviceStates.living_room_node.temperature) + parseFloat(tempChange)).toFixed(1);
    document.getElementById("val-temp").innerText = deviceStates.living_room_node.temperature;
  }, 5000);
}

// --- FIREBASE LISTENERS ---
function setupFirebaseListeners() {
  // Listen for Gateway status & RPi heartbeat
  const statusRef = db.ref("devices/living_room_node/status");
  statusRef.on("value", (snapshot) => {
    const val = snapshot.val();
    const dot = document.getElementById("rpi-status-dot");
    const txt = document.getElementById("rpi-status-text");
    if (val === "online") {
      dot.className = "status-dot online";
      txt.innerText = "Gateway Online";
    } else {
      dot.className = "status-dot";
      txt.innerText = "Gateway Offline";
    }
  });

  // Listen for node telemetry state updates
  const telemetryRef = db.ref("devices/living_room_node/telemetry");
  telemetryRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
      addLog(`Received update from node living_room_node`, "info");
      
      if (data.relays) {
        updateUIFromState('living_room_node', {
          relay1: data.relays.relay1,
          relay2: data.relays.relay2,
          relay3: data.relays.relay3,
          relay4: data.relays.relay4
        });
      }

      if (data.temperature) {
        document.getElementById("val-temp").innerText = data.temperature;
      }
      if (data.humidity) {
        document.getElementById("val-humidity").innerText = data.humidity;
      }
    }
  });
}

// --- COMMAND EXECUTION ---
function toggleRelay(nodeId, relayKey, isChecked) {
  addLog(`Toggle command: ${nodeId} -> ${relayKey} = ${isChecked ? 'ON' : 'OFF'}`, "cmd");

  if (!isMockMode && db) {
    // Write command to Firebase Realtime Database at /commands/{nodeId}/{relayKey}
    db.ref(`commands/${nodeId}/${relayKey}`).set(isChecked)
      .then(() => addLog(`Firebase command sent: ${relayKey}=${isChecked}`, "success"))
      .catch((err) => addLog(`Firebase error: ${err.message}`, "error"));
  } else {
    // Local mock update
    deviceStates[nodeId][relayKey] = isChecked;
    updateUIFromState(nodeId, deviceStates[nodeId]);
  }
}

// --- SCENE AUTOMATION CONTROLS ---
function triggerScene(sceneName) {
  addLog(`Triggered Scene: ${sceneName.toUpperCase()}`, "cmd");

  let targetState = { relay1: false, relay2: false, relay3: false, relay4: false };

  switch(sceneName) {
    case 'all_on':
      targetState = { relay1: true, relay2: true, relay3: true, relay4: true };
      break;
    case 'all_off':
      targetState = { relay1: false, relay2: false, relay3: false, relay4: false };
      break;
    case 'night_mode':
      targetState = { relay1: false, relay2: true, relay3: true, relay4: false };
      break;
    case 'eco_mode':
      targetState = { relay1: true, relay2: false, relay3: false, relay4: false };
      break;
  }

  // Apply target states
  Object.keys(targetState).forEach(relayKey => {
    toggleRelay('living_room_node', relayKey, targetState[relayKey]);
  });
}

// --- UI UPDATE HELPERS ---
function updateUIFromState(nodeId, state) {
  const relays = ['relay1', 'relay2', 'relay3', 'relay4'];
  let activeCount = 0;

  relays.forEach((rKey) => {
    const isON = state[rKey] || false;
    if (isON) activeCount++;

    const card = document.getElementById(`card-${rKey}`);
    const toggle = document.getElementById(`toggle-${rKey}`);
    const stateText = document.getElementById(`state-text-${rKey}`);

    if (card && toggle && stateText) {
      toggle.checked = isON;
      if (isON) {
        card.classList.add("active");
        stateText.innerText = "ACTIVE (ON)";
      } else {
        card.classList.remove("active");
        stateText.innerText = "STANDBY (OFF)";
      }
    }
  });

  document.getElementById("active-devices-count").innerText = `${activeCount} / 4 Active`;
}

function addLog(message, type = "info") {
  const logBox = document.getElementById("log-box");
  if (!logBox) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const logEntry = document.createElement("div");
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;

  logBox.appendChild(logEntry);
  logBox.scrollTop = logBox.scrollHeight;
}

// Start application when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);
