/* -------------------------------------------------------------
 * AuraHome — React 18 Production App Engine
 * Pure React 18 JavaScript engine — Zero Babel dependency,
 * Zero module resolution errors, 100% fast loading on Mobile & Laptop
 * ------------------------------------------------------------- */

const { useState, useEffect, useMemo, useRef, createElement: e } = React;

// --- FIREBASE REALTIME DATABASE CONFIGURATION ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC4iLzJJ1JC16IMEnvBXZGFJZSlt2V4yGo",
  authDomain: "electrofic-homeautomation.firebaseapp.com",
  databaseURL: "https://electrofic-homeautomation-default-rtdb.firebaseio.com",
  projectId: "electrofic-homeautomation",
  storageBucket: "electrofic-homeautomation.firebasestorage.app",
  messagingSenderId: "393502148816",
  appId: "1:393502148816:web:11ac4f274a0a324b64b6d5",
  measurementId: "G-753V6EZ8XK"
};

let firebaseDb = null;
try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    firebaseDb = firebase.database();
    console.log("⚡ Authenticated with Firebase Project:", FIREBASE_CONFIG.projectId);
  }
} catch (err) {
  console.warn("Firebase initialization notice:", err.message);
}

// ===========================================================================
// LOCAL WEBSOCKET MANAGER
// Tries to connect to the RPi at ws://[RPI_IP]:8765 first.
// connMode: 'connecting' | 'local' | 'remote' | 'offline'
// When LOCAL: all commands go over WebSocket (< 5ms, no internet needed).
// When REMOTE: commands go to Firebase (existing logic unchanged).
// Firebase listeners always run in background for remote access.
// ===========================================================================
const RPI_IP  = localStorage.getItem("rpi_ip") || "192.168.137.185";
const WS_URL  = `ws://${RPI_IP}:8765`;
const WS_CONNECT_TIMEOUT_MS = 3000;   // give up on local after 3s
const WS_RECONNECT_DELAY_MS = 8000;   // retry local connection every 8s

function useWebSocket({ onStateUpdate, onLog }) {
  const wsRef        = useRef(null);
  const modeRef      = useRef('connecting');  // mirrors connMode without re-render lag
  const reconnTimerRef = useRef(null);
  const timeoutRef   = useRef(null);
  const [connMode, setConnMode] = useState('connecting');

  const updateMode = (m) => {
    modeRef.current = m;
    setConnMode(m);
  };

  // Send a raw JSON command — only called when in LOCAL mode
  const sendWS = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  };

  const connect = (isBackgroundRetry = false) => {
    if (wsRef.current) {
      // Avoid triggering onclose when we manually close it for a retry
      wsRef.current.onclose = null;
      try { wsRef.current.close(); } catch (_) {}
    }
    clearTimeout(timeoutRef.current);
    clearTimeout(reconnTimerRef.current);

    console.log('[WS] Trying local connection to', WS_URL);
    if (!isBackgroundRetry && modeRef.current !== 'remote') {
      updateMode('connecting');
    }

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.warn('[WS] WebSocket creation failed:', e);
      if (modeRef.current !== 'remote') updateMode('remote');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    // If no connection within timeout → fall back to remote (Firebase)
    timeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[WS] Connection timeout — switching to REMOTE (Firebase) mode');
        ws.onclose = null; // Prevent onclose from firing
        ws.close();
        if (modeRef.current !== 'remote') {
          updateMode('remote');
          onLog('No local RPi found. Using cloud (Firebase) mode.', 'info');
        }
        // Keep retrying in background
        scheduleReconnect();
      }
    }, WS_CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(timeoutRef.current);
      console.log('[WS] Connected to RPi — LOCAL mode active');
      if (modeRef.current !== 'local') {
        updateMode('local');
        onLog('Connected to RPi via local WebSocket — LOCAL mode active.', 'success');
      }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'state') onStateUpdate(msg);
      } catch (err) {
        console.warn('[WS] Bad message:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };

    ws.onclose = () => {
      clearTimeout(timeoutRef.current);
      if (modeRef.current === 'local') {
        console.warn('[WS] Lost local connection — falling back to Firebase');
        onLog('Lost local connection to RPi. Switching to cloud mode...', 'info');
        updateMode('remote');
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    clearTimeout(reconnTimerRef.current);
    reconnTimerRef.current = setTimeout(() => {
      console.log('[WS] Attempting reconnect to local RPi (silent)...');
      connect(true);
    }, WS_RECONNECT_DELAY_MS);
  };

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timeoutRef.current);
      clearTimeout(reconnTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { connMode, sendWS };
}

// 1. DATA DEFINITIONS (PDF SWITCHBOARDS)
const INITIAL_BOARDS = {
  hall: {
    id: "hall",
    name: "Hall Switchboard",
    floor: "Ground Floor",
    points: [
      { id: "h1", num: 1, name: "FAN", desc: "Controls Main Hall Fan", icon: "fa-fan", type: "fan", state: false },
      { id: "h2", num: 2, name: "LIGHT", desc: "Controls Hall Main Light", icon: "fa-lightbulb", type: "light", state: false },
      { id: "h4", num: 4, name: "CHANDELIER", desc: "Controls Decorative Chandelier", icon: "fa-gem", type: "chandelier", state: false }
    ]
  },
  first_floor: {
    id: "first_floor",
    name: "First Floor Room",
    floor: "1st Floor",
    points: [
      { id: "f2", num: 2, name: "NIGHT BULB", desc: "Controls Night Lamp", icon: "fa-moon", type: "light", state: false },
      { id: "f4", num: 4, name: "FAN (Regulator)", desc: "Controls Fan Speed", icon: "fa-fan", type: "fan", state: false, hasRegulator: true, speed: 0 },
      { id: "f5", num: 5, name: "LIGHT", desc: "Controls Room Light", icon: "fa-lightbulb", type: "light", state: false },
      { id: "f6", num: 6, name: "CHANDELIER", desc: "Controls Room Chandelier", icon: "fa-gem", type: "chandelier", state: false }
    ]
  },
  harry: {
    id: "harry",
    name: "Harry Room",
    floor: "2nd Floor",
    points: [
      { id: "hr3", num: 3, name: "NIGHT BULB", desc: "Controls Night Bulb", icon: "fa-moon", type: "light", state: false },
      { id: "hr4", num: 4, name: "FAN", desc: "Controls Ceiling Fan", icon: "fa-fan", type: "fan", state: false },
      { id: "hr5", num: 5, name: "LIGHT", desc: "Controls Study Light", icon: "fa-lightbulb", type: "light", state: false },
      { id: "hr6", num: 6, name: "FAN REGULATOR", desc: "Controls Fan Speed", icon: "fa-sliders", type: "regulator", state: false, hasRegulator: true, speed: 0 }
    ]
  },
  mom_dad: {
    id: "mom_dad",
    name: "Mom and Dad Room",
    floor: "1st Floor",
    points: [
      { id: "md2", num: 2, name: "SMART LIGHT", desc: "Controls RGB Smart Light", icon: "fa-wand-magic-sparkles", type: "light", state: false },
      { id: "md4", num: 4, name: "FAN", desc: "Controls Master Bed Fan", icon: "fa-fan", type: "fan", state: false },
      { id: "md5", num: 5, name: "LIGHT", desc: "Controls Ambient Light", icon: "fa-lightbulb", type: "light", state: false },
      { id: "md6", num: 6, name: "CHANDELIER", desc: "Controls Chandelier", icon: "fa-gem", type: "chandelier", state: false }
    ]
  },
  ayush: {
    id: "ayush",
    name: "Ayush Room",
    floor: "2nd Floor",
    points: [
      { id: "ay1", num: 1, name: "FAN (Regulator)", desc: "Controls Main Fan", icon: "fa-fan", type: "fan", state: false, hasRegulator: true, speed: 0 },
      { id: "ay2", num: 2, name: "LIGHT MAIN", desc: "Controls Main Light", icon: "fa-lightbulb", type: "light", state: false },
      { id: "ay3", num: 3, name: "NIGHT BULB", desc: "Controls Night Lamp", icon: "fa-star", type: "light", state: false },
      { id: "ay5", num: 5, name: "BROWN FAN", desc: "Controls Secondary Fan", icon: "fa-fan", type: "fan", state: false },
      { id: "ay6", num: 6, name: "CENTRE LIGHT", desc: "Controls Centre Light Socket", icon: "fa-plug", type: "light", state: false }
    ]
  }
};

// 1b. ESP NODE STATUS (one ESP32 per room — will sync live from Firebase/cloud)
const INITIAL_ESP_NODES = [
  { id: "hall", espId: "ESP32-GF-01", name: "Hall Switchboard", floor: "Ground Floor", online: false, ip: "—", lastSeen: "Offline", boardKey: "hall" },
  { id: "first_floor", espId: "ESP32-FF-01", name: "First Floor Room", floor: "1st Floor", online: false, ip: "—", lastSeen: "Offline", boardKey: "first_floor" },
  { id: "harry", espId: "ESP32-SF-01", name: "Harry Room", floor: "2nd Floor", online: false, ip: "—", lastSeen: "Offline", boardKey: "harry" },
  { id: "mom_dad", espId: "ESP32-FF-02", name: "Mom & Dad Room", floor: "1st Floor", online: false, ip: "—", lastSeen: "Offline", boardKey: "mom_dad" },
  { id: "ayush", espId: "ESP32-SF-02", name: "Ayush Room", floor: "2nd Floor", online: false, ip: "—", lastSeen: "Offline", boardKey: "ayush" },
];

// 2. SIDEBAR COMPONENT
function Sidebar({ activeTab, setActiveTab, espNodes, fbConnected, connMode }) {
  const onlineCount = (espNodes || []).filter(n => n.online).length;
  const isHwOnline  = onlineCount > 0;

  // Connection mode badge config
  const modeConfig = {
    local:      { label: 'Local  — RPi Direct',  dot: 'online',   icon: 'fa-house-signal' },
    remote:     { label: 'Remote — Firebase',     dot: 'online',   icon: 'fa-cloud' },
    connecting: { label: 'Connecting...',         dot: 'pending',  icon: 'fa-circle-notch fa-spin' },
    offline:    { label: 'Offline',               dot: 'offline',  icon: 'fa-wifi-slash' },
  };
  const mode = modeConfig[connMode] || modeConfig.connecting;

  return e("aside", { className: "sidebar" },
    e("div", null,
      e("div", { className: "brand" },
        e("div", { className: "brand-logo" }, e("i", { className: "fa-solid fa-house-signal" })),
        e("div", { className: "brand-text" },
          e("h2", null, "AuraHome"),
          e("span", null, "By Electrofic")
        )
      ),
      e("nav", { className: "nav-menu" },
        e("button", { className: `nav-item ${activeTab === 'overview' ? 'active' : ''}`, onClick: () => setActiveTab('overview') },
          e("i", { className: "fa-solid fa-grid-2" }), " Master Dashboard"
        ),
        e("button", { className: `nav-item ${activeTab === 'water' ? 'active' : ''}`, onClick: () => setActiveTab('water') },
          e("i", { className: "fa-solid fa-droplet" }), " Water Monitoring"
        ),
        e("button", { className: `nav-item ${activeTab === 'switchboards' ? 'active' : ''}`, onClick: () => setActiveTab('switchboards') },
          e("i", { className: "fa-solid fa-toggle-on" }), " Floor Switchboards"
        ),
        e("button", { className: `nav-item ${activeTab === 'electricity' ? 'active' : ''}`, onClick: () => setActiveTab('electricity') },
          e("i", { className: "fa-solid fa-bolt" }), " Electricity & Billing"
        )
      )
    ),
    e("div", { className: "gateway-status-card" },
      // Connection mode badge (primary indicator)
      e("div", { className: "status-header" },
        e("span", { className: `status-dot ${mode.dot}` }),
        e("span", { className: "status-title" },
          e("i", { className: `fa-solid ${mode.icon}`, style: { marginRight: '5px', fontSize: '0.8rem' } }),
          mode.label
        )
      ),
      // Hardware nodes
      e("div", { className: "status-sub" },
        e("span", null, "ESP Nodes:"),
        e("strong", null, `${onlineCount}/5 Online`)
      ),
      // Firebase cloud status
      e("div", { className: "status-sub" },
        e("span", null, "Cloud:"),
        e("strong", null, fbConnected ? "Firebase Live" : (connMode === 'local' ? "LAN Only" : "Offline"))
      ),
      // RPi IP (shown only in local mode)
      connMode === 'local' && e("div", { className: "status-sub", style: { opacity: 0.7, fontSize: '0.72rem' } },
        e("span", null, "RPi IP:"),
        e("strong", null, RPI_IP)
      )
    )
  );
}

// 3. MOBILE HEADER COMPONENT (PWA-ready — brand + install + logout + status)
function MobileHeader({ installPromptEvent, onInstallClick, currentUser, onLogout, fbConnected, connMode }) {
  const modeLabel = { local: '⚡ Local', remote: '☁ Remote', connecting: '◌ Connecting', offline: '✕ Offline' };
  const modeColor = { local: '#22c55e', remote: '#06b6d4', connecting: '#f59e0b', offline: '#ef4444' };

  return e("header", { className: "mobile-header" },
    e("div", { className: "mobile-brand" },
      e("div", { className: "mobile-brand-logo" }, e("i", { className: "fa-solid fa-house-signal" })),
      e("div", { className: "mobile-brand-text" },
        e("h2", null, "AuraHome"),
        // Show connection mode inline on mobile header
        e("span", { style: { color: modeColor[connMode] || '#f59e0b', fontWeight: 600, fontSize: '0.7rem' } },
          modeLabel[connMode] || '◌ Connecting'
        )
      )
    ),
    e("div", { className: "mobile-header-right" },
      installPromptEvent && e("button", {
        className: "pwa-install-btn",
        id: "pwa-install-mobile-btn",
        onClick: onInstallClick
      },
        e("i", { className: "fa-solid fa-download" }),
        e("span", { className: "pwa-btn-text" }, "Install")
      ),
      currentUser && e("button", {
        className: "mobile-logout-btn",
        onClick: onLogout,
        title: "Logout from AuraHome",
        "aria-label": "Logout"
      },
        e("i", { className: "fa-solid fa-right-from-bracket" })
      ),
      e("span", {
        className: `mobile-status-dot ${connMode === 'local' || fbConnected ? 'online' : ''}`,
        title: connMode === 'local' ? 'Local RPi' : (fbConnected ? 'Firebase Connected' : 'Offline')
      })
    )
  );
}

// 3b. BOTTOM NAVIGATION BAR COMPONENT (Mobile + Tablet PWA nav)
function BottomNav({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'overview', icon: 'fa-house', label: 'Dashboard' },
    { id: 'water', icon: 'fa-droplet', label: 'Water' },
    { id: 'switchboards', icon: 'fa-toggle-on', label: 'Switches' },
    { id: 'electricity', icon: 'fa-bolt', label: 'Electricity' },
  ];
  return e("nav", { className: "bottom-nav", role: "navigation", "aria-label": "Main navigation" },
    e("div", { className: "bottom-nav-inner" },
      tabs.map(tab =>
        e("button", {
          key: tab.id,
          id: `nav-${tab.id}`,
          type: "button",
          className: `bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`,
          onClick: (evt) => {
            evt.preventDefault();
            setActiveTab(tab.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
          "aria-label": tab.label,
          "aria-current": activeTab === tab.id ? 'page' : undefined
        },
          e("span", { className: "bottom-nav-icon" }, e("i", { className: `fa-solid ${tab.icon}` })),
          e("span", { className: "bottom-nav-label" }, tab.label)
        )
      )
    )
  );
}

// 4. TOPBAR COMPONENT
function Topbar({ totalActiveDevices, estimatedBillRupees, waterData, fbConnected, currentUser, onLogout }) {
  return e("div", { className: "topbar" },
    e("div", { className: "welcome-meta" },
      e("h1", null, "Home Automation Control Center"),
      // e("p", null, "Full control over Water, Climate, Electricity & 5 Floor Switchboards • Developed by Electrofic")
    ),
    e("div", { className: "quick-stats" },
      currentUser && e("div", { className: "stat-badge", style: { border: "1px solid rgba(6, 182, 212, 0.3)" } },
        e("i", { className: "fa-solid fa-user-shield text-cyan" }),
        e("div", null,
          e("span", { className: "stat-val", style: { fontSize: "0.85rem" } }, currentUser.email || "Admin User"),
          e("span", { className: "stat-lbl" }, "Authenticated")
        )
      ),
      currentUser && e("button", {
        className: "logout-badge-btn",
        onClick: onLogout,
        title: "Sign Out from AuraHome"
      },
        e("i", { className: "fa-solid fa-right-from-bracket" }),
        " Logout"
      ),
      e("div", { className: "stat-badge" },
        e("i", { className: `fa-solid fa-cloud ${fbConnected ? 'text-success' : 'text-warning'}` }),
        e("div", null,
          e("span", { className: "stat-val" }, fbConnected ? "Firebase Live" : "Local Demo"),
          e("span", { className: "stat-lbl" }, fbConnected ? "Cloud Sync Active" : "Interactive Mode")
        )
      ),
      e("div", { className: "stat-badge" },
        e("i", { className: "fa-solid fa-plug text-success" }),
        e("div", null,
          e("span", { className: "stat-val" }, `${totalActiveDevices} Points Active`),
          e("span", { className: "stat-lbl" }, "Relays & Appliances")
        )
      ),
      e("div", { className: "stat-badge" },
        e("i", { className: "fa-solid fa-indian-rupee-sign text-warning" }),
        e("div", null,
          e("span", { className: "stat-val" }, `₹ ${estimatedBillRupees}`),
          e("span", { className: "stat-lbl" }, "Est. Monthly Bill")
        )
      ),
      e("div", { className: "stat-badge" },
        e("i", { className: "fa-solid fa-droplet text-cyan" }),
        e("div", null,
          e("span", { className: "stat-val" }, `${waterData.levelPercent}% Full`),
          e("span", { className: "stat-lbl" }, "Water Tank")
        )
      )
    )
  );
}

// 5. WATER MONITORING COMPONENT
function WaterMonitoring({ waterData, setWaterData, addLog, handlePumpToggle }) {
  return e("div", { className: "glass-card water-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-droplet" }), "Tank Status"),
      e("span", { className: "board-badge" }, `${waterData.volumeLitres} / ${waterData.maxCapacity} L`)
    ),
    e("div", { className: "water-content" },
      e("div", { className: "water-tank-wrapper" },
        e("div", { className: "water-tank" },
          e("div", { className: "water-wave", style: { height: `${waterData.levelPercent}%` } }),
          e("div", { className: "tank-overlay-info" },
            e("div", { className: "tank-percentage" }, `${waterData.levelPercent}%`),
            e("div", { className: "tank-capacity" }, "Tank Level")
          )
        )
      ),
      e("div", { className: "water-details-grid" },
        e("div", { className: "water-stat-box" },
          e("div", { className: "water-stat-lbl" }, e("i", { className: "fa-solid fa-clock" }), " Filling Time"),
          e("div", { className: "water-stat-val" }, `${waterData.fillingTimeMin} min`)
        ),
        e("div", { className: "water-stat-box" },
          e("div", { className: "water-stat-lbl" }, e("i", { className: "fa-solid fa-gauge-high" }), " Inflow Speed"),
          e("div", { className: "water-stat-val" }, `${waterData.inflowRate} L/min`)
        ),
        e("div", { className: "water-stat-box" },
          e("div", { className: "water-stat-lbl" }, e("i", { className: "fa-solid fa-bolt" }), " Units Consumed"),
          e("div", { className: "water-stat-val" }, `${waterData.unitsConsumed} kWh`)
        ),
        e("div", { className: "water-stat-box" },
          e("div", { className: "water-stat-lbl" }, e("i", { className: "fa-solid fa-rotate" }), " Runtime / Day"),
          e("div", { className: "water-stat-val" }, `${waterData.runtimePerDay} cycles`)
        )
      )
    ),
    e("div", { className: "pump-control-bar" },
      e("div", { className: "pump-info" },
        e("div", { className: `pump-icon ${waterData.pumpActive ? '' : 'off'}` }, e("i", { className: "fa-solid fa-gears" })),
        e("div", null,
          e("div", { className: "pump-title" }, "Motor Pump"),
          e("div", { className: "pump-status-sub" }, waterData.pumpActive ? 'Pumping Water (Dry Run Safe)' : 'Motor Standby')
        )
      ),
      e("label", { className: "toggle-switch" },
        e("input", {
          type: "checkbox",
          checked: waterData.pumpActive,
          onChange: (evt) => {
            const next = evt.target.checked;
            if (handlePumpToggle) {
              handlePumpToggle(next);
            } else {
              setWaterData(prev => ({ ...prev, pumpActive: next }));
              addLog(`Water Motor Pump turned ${next ? 'ON' : 'OFF'}`, next ? "success" : "info");
            }
          }
        }),
        e("span", { className: "slider" })
      )
    )
  );
}

// 6. CLIMATE SENSORS COMPONENT
function ClimateSensors({ envData }) {
  return e("div", { className: "glass-card env-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-temperature-half" }), " Climate & Air Quality"),
      e("span", { className: "board-badge" }, "DHT22 & MQ-135")
    ),
    e("div", { className: "env-metrics-row" },
      e("div", { className: "env-metric-box" },
        e("div", { className: "env-icon-circle temp-circle" }, e("i", { className: "fa-solid fa-temperature-three-quarters" })),
        e("div", { className: "env-val" }, `${envData.temperature}°C`),
        e("div", { className: "env-lbl" }, "Temperature"),
        e("span", { className: "env-badge badge-good" }, "Comfortable")
      ),
      e("div", { className: "env-metric-box" },
        e("div", { className: "env-icon-circle humidity-circle" }, e("i", { className: "fa-solid fa-droplet-percent" })),
        e("div", { className: "env-val" }, `${envData.humidity}%`),
        e("div", { className: "env-lbl" }, "Humidity"),
        e("span", { className: "env-badge badge-good" }, "Optimal")
      ),
      e("div", { className: "env-metric-box" },
        e("div", { className: "env-icon-circle aqi-circle" }, e("i", { className: "fa-solid fa-wind" })),
        e("div", { className: "env-val" }, `${envData.aqi}`),
        e("div", { className: "env-lbl" }, "AQI Score"),
        e("span", { className: "env-badge badge-good" }, "Good Quality")
      )
    ),
    e("div", { className: "aqi-breakdown" },
      e("div", { className: "aqi-item" }, e("span", null, "PM 2.5"), e("strong", null, `${envData.pm25} µg/m³`)),
      e("div", { className: "aqi-item" }, e("span", null, "PM 10"), e("strong", null, `${envData.pm10} µg/m³`)),
      e("div", { className: "aqi-item" }, e("span", null, "CO₂ Level"), e("strong", null, `${envData.co2} ppm`))
    )
  );
}

// 7. ELECTRICITY BILLING COMPONENT
function ElectricityBilling({ elecData, estimatedBillRupees }) {
  return e("div", { className: "glass-card electricity-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-bolt" }), " Electricity Power Meter & Bill Calculator"),
      e("span", { className: "board-badge" }, `Tariff: ₹ ${elecData.tariffRateRupees} / kWh`)
    ),
    e("div", { className: "power-grid-row" },
      e("div", { className: "power-stat-card" },
        e("div", { className: "power-stat-icon cyan" }, e("i", { className: "fa-solid fa-gauge-high" })),
        e("div", { className: "power-stat-info" }, e("h4", null, "Live Load Demand"), e("p", null, `${elecData.liveWatts} Watts`))
      ),
      e("div", { className: "power-stat-card" },
        e("div", { className: "power-stat-icon green" }, e("i", { className: "fa-solid fa-calendar-day" })),
        e("div", { className: "power-stat-info" }, e("h4", null, "Energy Today"), e("p", null, `${elecData.todayKwh} kWh`))
      ),
      e("div", { className: "power-stat-card" },
        e("div", { className: "power-stat-icon purple" }, e("i", { className: "fa-solid fa-chart-pie" })),
        e("div", { className: "power-stat-info" }, e("h4", null, "Monthly kWh"), e("p", null, `${elecData.monthlyKwh} kWh`))
      ),
      e("div", { className: "power-stat-card" },
        e("div", { className: "power-stat-icon amber" }, e("i", { className: "fa-solid fa-indian-rupee-sign" })),
        e("div", { className: "power-stat-info" }, e("h4", null, "Est. Electricity Bill"), e("p", null, `₹ ${estimatedBillRupees}`))
      )
    ),
    e("div", { className: "power-chart-bar-container" },
      e("div", { className: "chart-header" },
        e("span", null, "Hourly Power Consumption Profile (Today)"),
        e("span", null, "Peak Load: 680 W (07:00 PM)")
      ),
      e("div", { className: "hourly-bars" },
        elecData.hourlyLoad.map((w, idx) => {
          const heightPct = Math.min(100, Math.max(15, (w / 700) * 100));
          const isPeak = w > 500;
          return e("div", { className: "bar-col", key: idx },
            e("div", { className: `bar-fill ${isPeak ? 'peak' : ''}`, style: { height: `${heightPct}%` }, title: `${w} Watts` }),
            e("div", { className: "bar-lbl" }, `${idx * 2}:00`)
          );
        })
      )
    )
  );
}

// 8. FAN REGULATOR COMPONENT
function FanRegulator({ pt, boardId, handleSpeedChange }) {
  return e("div", { className: "regulator-control" },
    e("div", { className: "regulator-label-row" },
      e("span", null, "Fan Speed Regulator"),
      e("span", null, `Level ${pt.speed || 3}`)
    ),
    e("input", {
      type: "range",
      min: "1",
      max: "5",
      value: pt.speed || 3,
      disabled: !pt.state,
      onChange: (evt) => handleSpeedChange(boardId, pt.id, evt.target.value),
      className: "speed-slider-input"
    })
  );
}

// 9. SWITCH CARD COMPONENT
function SwitchCard({ pt, selectedFloor, handleToggleSwitch, handleSpeedChange, boardOffline }) {
  return e("div", { className: `switch-point-card ${pt.state && !boardOffline ? 'active' : ''} ${boardOffline ? 'board-offline-card' : ''}` },
    e("div", { className: "switch-top-row" },
      e("div", { className: "switch-icon-box" }, e("i", { className: `fa-solid ${pt.icon}` })),
      e("label", { className: `toggle-switch ${boardOffline ? 'toggle-disabled' : ''}` },
        e("input", {
          type: "checkbox",
          checked: pt.state,
          disabled: boardOffline,
          onChange: () => !boardOffline && handleToggleSwitch(selectedFloor, pt.id)
        }),
        e("span", { className: "slider" })
      )
    ),
    e("div", null,
      e("div", { className: "switch-name" }, pt.name),
      e("div", { className: "switch-desc" }, pt.desc)
    ),
    pt.hasRegulator && e(FanRegulator, { pt, boardId: selectedFloor, handleSpeedChange: boardOffline ? () => { } : handleSpeedChange }),
    e("div", { className: "switch-status-footer" },
      e("span", null, "Status:"),
      e("strong", null, boardOffline ? 'ESP OFFLINE' : (pt.state ? 'ACTIVE (ON)' : 'OFF'))
    )
  );
}

// 10. SWITCHBOARD SECTION COMPONENT
function SwitchboardSection({ boards, espNodes, selectedFloor, setSelectedFloor, handleToggleSwitch, handleSpeedChange }) {
  const currentBoard = boards[selectedFloor];
  const espNode = espNodes ? espNodes.find(n => n.boardKey === selectedFloor) : null;
  const boardOffline = espNode ? !espNode.online : false;

  return e("div", { className: "glass-card switchboard-section" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-toggle-on" }), " Floor & Room Switchboards"),
      e("span", { className: "board-badge" }, `${Object.keys(boards).length} Boards`)
    ),
    e("div", { className: "floor-tabs-bar" },
      Object.keys(boards).map(bKey => {
        const node = espNodes ? espNodes.find(n => n.boardKey === bKey) : null;
        const offline = node ? !node.online : false;
        return e("button", {
          key: bKey,
          className: `floor-tab ${selectedFloor === bKey ? 'active' : ''} ${offline ? 'tab-offline' : ''}`,
          onClick: () => setSelectedFloor(bKey)
        },
          offline
            ? e("i", { className: "fa-solid fa-circle-xmark" })
            : e("i", { className: "fa-solid fa-layer-group" }),
          ` ${boards[bKey].name}`
        );
      })
    ),
    e("div", { className: "physical-board-container", style: { position: 'relative' } },
      // Offline overlay — blocks all interaction
      boardOffline && e("div", { className: "board-offline-overlay" },
        e("div", { className: "board-offline-content" },
          e("i", { className: "fa-solid fa-wifi-slash" }),
          e("h3", null, `${currentBoard.name} — ESP Offline`),
          e("p", null,
            espNode ? `${espNode.espId} is not responding.` : "ESP32 node not found.",
            " Last seen: ",
            e("strong", null, espNode ? espNode.lastSeen : "Unknown")
          ),
          e("p", { className: "board-offline-sub" }, "Connect the ESP32 to the network to control appliances.")
        )
      ),
      e("div", { className: "board-header" },
        e("div", { className: "board-title" },
          e("h3", null, currentBoard.name),
          e("p", null, `Location: ${currentBoard.floor}`)
        ),
        e("span", { className: `board-badge ${boardOffline ? 'badge-offline' : ''}` },
          boardOffline
            ? e(React.Fragment, null, e("i", { className: "fa-solid fa-circle-xmark" }), " ESP Offline")
            : `${currentBoard.points.filter(p => p.state).length} / ${currentBoard.points.length} Active`
        )
      ),
      e("div", { className: "switches-grid" },
        currentBoard.points.map(pt =>
          e(SwitchCard, {
            key: pt.id,
            pt,
            selectedFloor,
            handleToggleSwitch,
            handleSpeedChange,
            boardOffline
          })
        )
      )
    )
  );
}

// 11. ESP STATUS BOARD COMPONENT (Overview — shows per-room ESP32 connectivity)
function ESPStatusBoard({ espNodes, boards, setActiveTab, setSelectedFloor }) {
  const totalOnline = espNodes.filter(n => n.online).length;
  const totalOffline = espNodes.filter(n => !n.online).length;
  const [shakeId, setShakeId] = useState(null);

  const handleCardClick = (node) => {
    setSelectedFloor(node.boardKey);
    setActiveTab('switchboards');
  };

  return e("div", { className: "glass-card esp-status-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-microchip" }), " ESP32 Node Status"),
      e("span", { className: "board-badge" },
        e("span", { className: "esp-summary-dot online" }),
        `${totalOnline} Online`,
        totalOffline > 0 && e(React.Fragment, null,
          " · ",
          e("span", { className: "esp-summary-dot offline" }),
          `${totalOffline} Offline`
        )
      )
    ),
    e("p", { className: "esp-status-hint" },
      e("i", { className: "fa-solid fa-cloud" }),
      " Status updates automatically when an ESP connects to the cloud"
    ),
    e("div", { className: "esp-nodes-grid" },
      espNodes.map(node => {
        const board = boards[node.boardKey];
        const active = board ? board.points.filter(p => p.state).length : 0;
        const total = board ? board.points.length : 0;
        return e("div", {
          key: node.id,
          className: `esp-node-card ${node.online ? 'esp-online' : 'esp-offline'} ${shakeId === node.id ? 'esp-shake' : ''}`,
          onClick: () => handleCardClick(node),
          title: node.online ? "Click to open switchboard" : "ESP is offline — cannot control appliances"
        },
          e("div", { className: "esp-node-top" },
            e("div", { className: `esp-status-dot ${node.online ? 'online' : ''}` }),
            e("div", { className: "esp-node-id" }, node.espId)
          ),
          e("div", { className: "esp-node-name" }, node.name),
          e("div", { className: "esp-node-floor" }, e("i", { className: "fa-solid fa-layer-group" }), " ", node.floor),
          e("div", { className: "esp-node-meta" },
            node.online
              ? e(React.Fragment, null,
                e("span", null, e("i", { className: "fa-solid fa-wifi" }), " ", node.ip),
                e("span", null, e("i", { className: "fa-solid fa-toggle-on" }), ` ${active}/${total} active`)
              )
              : e(React.Fragment, null,
                e("span", { className: "esp-offline-label" }, e("i", { className: "fa-solid fa-triangle-exclamation" }), " Not responding"),
                e("span", null, e("i", { className: "fa-regular fa-clock" }), " ", node.lastSeen)
              )
          ),
          // Lock icon for offline cards
          !node.online && e("div", { className: "esp-lock-badge" },
            e("i", { className: "fa-solid fa-lock" }),
            " Controls Locked"
          )
        );
      })
    )
  );
}


function QuickScenes({ triggerScene }) {
  return e("div", { className: "glass-card scenes-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-wand-magic-sparkles" }), " Quick Automation Scenes")
    ),
    e("div", { className: "scenes-grid" },
      e("button", { className: "scene-btn danger", onClick: () => triggerScene('all_off') },
        e("i", { className: "fa-solid fa-power-off" }), " Master Power OFF"
      ),
      e("button", { className: "scene-btn blue", onClick: () => triggerScene('night_mode') },
        e("i", { className: "fa-solid fa-moon" }), " Night Lamp Mode"
      )
    )
  );
}

// 12. ACTIVITY LOG COMPONENT
function ActivityLog({ logs }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return e("div", { className: "glass-card log-card" },
    e("div", { className: "section-title" },
      e("span", null, e("i", { className: "fa-solid fa-list-check" }), " System Event Log")
    ),
    e("div", { className: "log-container", ref: containerRef },
      logs.map(log =>
        e("div", { key: log.id, className: "log-entry" },
          e("span", { className: "log-time" }, `[${log.time}]`), ` ${log.text}`
        )
      )
    )
  );
}

// 12.5 LOGIN / AUTHENTICATION COMPONENT (Strict Admin Sign-In)
function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (!firebase || !firebase.auth) {
        throw new Error("Firebase Auth SDK is not available. Please check your network connection.");
      }

      const userCredential = await firebase.auth().signInWithEmailAndPassword(email.trim(), password);

      if (userCredential && userCredential.user) {
        onLoginSuccess(userCredential.user);
      }
    } catch (err) {
      console.error("Auth error:", err);
      let userFriendlyMsg = "Invalid password. Access denied.";
      if (err.code === 'auth/user-not-found') {
        userFriendlyMsg = "Admin account not found in Firebase. Please add user in Firebase Console.";
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        userFriendlyMsg = "Incorrect password. Please try again.";
      }
      setErrorMsg(userFriendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  return e("div", { className: "auth-wrapper" },
    e("div", { className: "auth-card" },
      e("div", { className: "auth-header" },
        e("div", { className: "auth-icon" }, e("i", { className: "fa-solid fa-shield-halved" })),
        e("h2", { className: "auth-title" }, "AuraHome Admin"),
        e("p", { className: "auth-subtitle" }, "Enter Admin Password to Unlock Home Control")
      ),
      e("form", { className: "auth-form", onSubmit: handleSubmit },
        errorMsg && e("div", { className: "auth-error-msg" },
          e("i", { className: "fa-solid fa-circle-exclamation" }),
          e("span", null, errorMsg)
        ),
        e("div", { className: "auth-input-group" },
          e("label", null, "Authorized Admin Email"),
          e("div", { className: "auth-input-wrapper" },
            e("i", { className: "fa-solid fa-envelope" }),
            e("input", {
              type: "email",
              className: "auth-input",
              placeholder: "admin@example.com",
              required: true,
              value: email,
              onChange: (evt) => setEmail(evt.target.value),
              autoComplete: "email"
            })
          )
        ),
        e("div", { className: "auth-input-group" },
          e("label", null, "Password"),
          e("div", { className: "auth-input-wrapper" },
            e("i", { className: "fa-solid fa-lock" }),
            e("input", {
              type: "password",
              className: "auth-input",
              placeholder: "Enter admin password",
              required: true,
              value: password,
              onChange: (evt) => setPassword(evt.target.value),
              autoComplete: "current-password",
              autoFocus: true
            })
          )
        ),
        e("button", {
          type: "submit",
          className: "auth-submit-btn",
          disabled: loading
        },
          loading
            ? e(React.Fragment, null, e("i", { className: "fa-solid fa-spinner fa-spin" }), " Verifying...")
            : e(React.Fragment, null, e("i", { className: "fa-solid fa-key" }), " Unlock Home Control")
        )
      ),
      e("div", { className: "auth-toggle-mode", style: { fontSize: "0.78rem", color: "#64748b" } },
        e("i", { className: "fa-solid fa-lock" }), " End-to-end encrypted • Managed via Firebase Console"
      )
    )
  );
}

// 13. ROOT APP COMPONENT
function App() {
  // PWA Install Prompt state
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [fbConnected, setFbConnected] = useState(false);

  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
        setCurrentUser(user);
        setAuthChecking(false);
      });
      return () => unsubscribe();
    } else {
      setAuthChecking(false);
    }
  }, []);

  const handleLogout = async () => {
    try {
      if (firebase && firebase.auth) {
        await firebase.auth().signOut();
        setCurrentUser(null);
        addLog("Logged out from AuraHome Dashboard.", "info");
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstallPromptEvent(null);
      setShowInstallBanner(false);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') {
      setInstallPromptEvent(null);
      setShowInstallBanner(false);
    }
  };

  const [activeTab, setActiveTab]       = useState("overview");
  const [selectedFloor, setSelectedFloor] = useState("hall");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [boards, setBoards]             = useState(INITIAL_BOARDS);
  const [espNodes, setEspNodes]         = useState(INITIAL_ESP_NODES);

  const [waterData, setWaterData] = useState({
    levelPercent: 0, volumeLitres: 0, maxCapacity: 1000,
    fillingTimeMin: 0, inflowRate: 0, unitsConsumed: 0,
    runtimePerDay: 0, pumpActive: false, autoMode: false
  });

  const [envData, setEnvData] = useState({
    temperature: 0, humidity: 0, aqi: 0, pm25: 0, pm10: 0, co2: 0
  });

  const [elecData, setElecData] = useState({
    liveWatts: 0, todayKwh: 0, monthlyKwh: 0,
    tariffRateRupees: 7.50,
    hourlyLoad: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  });

  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toTimeString().split(' ')[0], text: "AuraHome Engine initialized.", type: "info" }
  ]);

  const addLog = (text, type = "info") => {
    const time = new Date().toTimeString().split(" ")[0];
    setLogs(prev => [...prev.slice(-30), { id: Date.now() + Math.random(), time, text, type }]);
  };

  // ── WebSocket state handler ───────────────────────────────────────────────
  // Called whenever RPi sends a state snapshot over the WebSocket.
  // Maps RPi's { devices, water_system, environment, electricity } into React state.
  const handleWsStateUpdate = (msg) => {
    // 1. ESP node status from devices map
    if (msg.devices) {
      const devMap = msg.devices;
      const nowSec = Math.floor(Date.now() / 1000);
      setEspNodes(prev => prev.map(node => {
        const d = devMap[node.id];
        if (!d) return node;
        const isOnline = d.status === 'online';
        return {
          ...node,
          online:   isOnline,
          ip:       d.ip || '—',
          rssi:     d.rssi || null,
          lastSeen: isOnline ? 'Just now' : 'Disconnected'
        };
      }));

      // 2. Relay state → switch board points
      setBoards(prev => {
        const next = { ...prev };
        Object.keys(devMap).forEach(nodeId => {
          const relays = devMap[nodeId].relays;
          if (!relays || !next[nodeId]) return;
          next[nodeId] = {
            ...next[nodeId],
            points: next[nodeId].points.map(pt => {
              // Relay key pattern: "ay2", "ay2_light_main", etc. — match by prefix
              const relayVal = relays[pt.id] !== undefined
                ? relays[pt.id]
                : Object.keys(relays).find(k => k.startsWith(pt.id + '_')) !== undefined
                  ? relays[Object.keys(relays).find(k => k.startsWith(pt.id + '_'))]
                  : undefined;
              if (relayVal !== undefined) {
                return { ...pt, state: Boolean(relayVal) };
              }
              return pt;
            })
          };
        });
        return next;
      });
    }

    // 3. Water system
    if (msg.water_system) {
      setWaterData(prev => ({ ...prev, ...msg.water_system }));
    }

    // 4. Environment
    if (msg.environment) {
      const env = msg.environment;
      setEnvData(prev => ({
        ...prev,
        temperature: env.temp   !== undefined ? env.temp   : prev.temperature,
        humidity:    env.humidity !== undefined ? env.humidity : prev.humidity
      }));
    }

    // 5. Electricity
    if (msg.electricity) {
      setElecData(prev => ({ ...prev, ...msg.electricity }));
    }
  };

  // ── Initialise WebSocket manager ──────────────────────────────────────────
  const { connMode, sendWS } = useWebSocket({
    onStateUpdate: handleWsStateUpdate,
    onLog:         addLog
  });

  // --- FIREBASE REAL-TIME LISTENERS (always active — power remote mode) ---
  useEffect(() => {
    if (firebaseDb) {
      // 1. Connection status
      const connectedRef = firebaseDb.ref('.info/connected');
      connectedRef.on('value', (snap) => {
        const isOnline = snap.val() === true;
        setFbConnected(isOnline);
        if (isOnline) {
          addLog("Connected to Firebase Realtime Database (Cloud Sync Active).", "success");
        }
      });

      // 2. Real-time Boards Sync
      const boardsRef = firebaseDb.ref('boards');
      boardsRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
          setBoards(prev => {
            const updated = { ...prev };
            Object.keys(data).forEach(bKey => {
              if (updated[bKey]) {
                const fbBoard = data[bKey];
                if (fbBoard.switches) {
                  updated[bKey].points = updated[bKey].points.map(pt => {
                    const sw = fbBoard.switches[pt.id] ||
                      Object.values(fbBoard.switches).find(s => s.id === pt.id || (s.name && pt.name && s.name.toUpperCase() === pt.name.toUpperCase()));
                    if (sw) {
                      return {
                        ...pt,
                        state: sw.state !== undefined ? sw.state : pt.state,
                        speed: sw.speed !== undefined ? sw.speed : pt.speed
                      };
                    }
                    return pt;
                  });
                } else if (Array.isArray(fbBoard.points)) {
                  // Merge static layout from Firebase but PRESERVE live state from UI/telemetry
                  updated[bKey].points = fbBoard.points.map(fbPt => {
                    const existingPt = updated[bKey].points.find(p => p.id === fbPt.id);
                    return {
                      ...fbPt,
                      state: existingPt && existingPt.state !== undefined ? existingPt.state : false,
                      speed: existingPt && existingPt.speed !== undefined ? existingPt.speed : (fbPt.speed || 0)
                    };
                  });
                }
              }
            });
            return updated;
          });
        }
      });

      // 3. Real-time Water System Sync
      const waterRef = firebaseDb.ref('water_system');
      waterRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
          setWaterData(prev => ({ ...prev, ...data }));
        }
      });

      // 4. Real-time Climate Sync
      const envRef = firebaseDb.ref('environment');
      envRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
          setEnvData(prev => ({ ...prev, ...data }));
        }
      });

      // 5. Real-time ESP32 Node Status
      const devicesRef = firebaseDb.ref('devices');
      devicesRef.on('value', (snap) => {
        const data = snap.val() || {};
        const nowSec = Math.floor(Date.now() / 1000);
        
        // Sync live telemetry relays to boards in Remote Mode
        setBoards(prev => {
          const next = { ...prev };
          Object.keys(data).forEach(nodeId => {
            if (data[nodeId] && data[nodeId].telemetry && data[nodeId].telemetry.relays) {
              const relays = data[nodeId].telemetry.relays;
              if (!next[nodeId]) return;
              next[nodeId] = {
                ...next[nodeId],
                points: next[nodeId].points.map(pt => {
                  const relayVal = relays[pt.id] !== undefined
                    ? relays[pt.id]
                    : Object.keys(relays).find(k => k.startsWith(pt.id + '_')) !== undefined
                      ? relays[Object.keys(relays).find(k => k.startsWith(pt.id + '_'))]
                      : undefined;
                  if (relayVal !== undefined) {
                    return { ...pt, state: Boolean(relayVal) };
                  }
                  return pt;
                })
              };
            }
          });
          return next;
        });

        setEspNodes(prev => {
          return prev.map(node => {
            const fbDev = data[node.id];
            if (fbDev && fbDev.status === 'online') {
              const isOnline = true;
              return {
                ...node,
                online: isOnline,
                ip: (fbDev.telemetry && fbDev.telemetry.ip) || "—",
                rssi: (fbDev.telemetry && fbDev.telemetry.rssi) || null,
                lastSeen: isOnline ? 'Just now' : 'Disconnected'
              };
            }
            return {
              ...node,
              online: false,
              ip: "—",
              rssi: null,
              lastSeen: 'Offline'
            };
          });
        });
      });

      // 6. Real-time Electricity Meter Sync
      const elecRef = firebaseDb.ref('electricity');
      elecRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
          setElecData(prev => ({
            ...prev,
            ...data,
            hourlyLoad: data.hourlyLoad || prev.hourlyLoad
          }));
        }
      });
    }
  }, []);

  // --- LIVE REAL-TIME ELECTRICITY LOAD CALCULATION ---
  useEffect(() => {
    let activeCount = 0;
    Object.values(boards).forEach(b => {
      (b.points || []).forEach(p => { if (p.state && !p.isNull) activeCount++; });
    });

    const calculatedWatts = activeCount * 65;
    setElecData(prev => ({
      ...prev,
      liveWatts: calculatedWatts
    }));
  }, [boards]);

  // ── COMMAND ROUTER ────────────────────────────────────────────────────────
  // In LOCAL mode  → send over WebSocket to RPi (< 5ms)
  // In REMOTE mode → write to Firebase /commands (RPi listens via SSE)
  const sendCommand = (msg) => {
    if (connMode === 'local') {
      sendWS(msg);
      return;
    }
    // Firebase fallback
    if (!firebaseDb) return;
    if (msg.type === 'cmd') {
      const { type, target, ...payload } = msg;
      firebaseDb.ref(`commands/${target}`).set({ ...payload, updated_at: Date.now() });
    } else if (msg.type === 'scene') {
      firebaseDb.ref('commands/scene').set({ name: msg.name, timestamp: Date.now() });
    } else if (msg.type === 'pump') {
      firebaseDb.ref('commands/water_pump').set({ pumpActive: msg.pumpActive, timestamp: Date.now() });
      firebaseDb.ref('water_system/pumpActive').set(msg.pumpActive);
    }
  };

  // --- ACTIONS ---
  const handleToggleSwitch = (boardId, pointId) => {
    setBoards(prev => {
      const board = prev[boardId];
      let toggledPoint = null;
      const updatedPoints = board.points.map(pt => {
        if (pt.id === pointId) {
          const nextState = !pt.state;
          toggledPoint = { ...pt, state: nextState };
          addLog(`${board.name} → ${pt.name} turned ${nextState ? 'ON' : 'OFF'}`, nextState ? "success" : "info");
          return toggledPoint;
        }
        return pt;
      });

      if (toggledPoint) {
        // Send via WS (local) or Firebase (remote)
        sendCommand({ type: 'cmd', target: boardId, [pointId]: toggledPoint.state });
        // Also keep Firebase boards state in sync (for remote access history)
        if (firebaseDb && connMode !== 'local') {
          firebaseDb.ref(`boards/${boardId}/points`).set(updatedPoints);
        }
      }

      return { ...prev, [boardId]: { ...board, points: updatedPoints } };
    });
  };

  const handleSpeedChange = (boardId, pointId, speedVal) => {
    const speed = parseInt(speedVal, 10);
    setBoards(prev => {
      const board = prev[boardId];
      let speedPoint = null;
      const updatedPoints = board.points.map(pt => {
        if (pt.id === pointId) {
          speedPoint = { ...pt, speed };
          addLog(`${board.name} → ${pt.name} speed → Level ${speed}`, "cmd");
          return speedPoint;
        }
        return pt;
      });

      if (speedPoint) {
        sendCommand({ type: 'cmd', target: boardId, [pointId]: speedPoint.state, [`${pointId}_speed`]: speed });
        if (firebaseDb && connMode !== 'local') {
          firebaseDb.ref(`boards/${boardId}/points`).set(updatedPoints);
        }
      }

      return { ...prev, [boardId]: { ...board, points: updatedPoints } };
    });
  };

  const triggerScene = (sceneName) => {
    addLog(`Scene: ${sceneName.toUpperCase()}`, "cmd");
    // Apply locally to boards state
    setBoards(prev => {
      const newBoards = { ...prev };
      Object.keys(newBoards).forEach(bKey => {
        newBoards[bKey].points = newBoards[bKey].points.map(pt => {
          if (sceneName === 'all_off')    return { ...pt, state: false };
          if (sceneName === 'all_on')     return { ...pt, state: true };
          if (sceneName === 'night_mode') return { ...pt, state: pt.name.includes('NIGHT') || pt.name.includes('SMART') };
          if (sceneName === 'eco_mode')   return { ...pt, state: pt.type === 'light' };
          return pt;
        });
      });
      return newBoards;
    });
    // Send via WS or Firebase
    sendCommand({ type: 'scene', name: sceneName });
  };

  const handlePumpToggle = (newPumpState) => {
    setWaterData(prev => ({ ...prev, pumpActive: newPumpState }));
    addLog(`Water Motor Pump turned ${newPumpState ? 'ON' : 'OFF'}`, newPumpState ? "success" : "info");
    sendCommand({ type: 'pump', pumpActive: newPumpState });
  };

  const totalActiveDevices = useMemo(() => {
    let count = 0;
    Object.values(boards).forEach(b => {
      b.points.forEach(p => { if (p.state && !p.isNull) count++; });
    });
    return count;
  }, [boards]);

  const estimatedBillRupees = useMemo(() => {
    return (elecData.monthlyKwh * elecData.tariffRateRupees).toFixed(2);
  }, [elecData]);

  // If loading auth state from Firebase
  if (authChecking) {
    return e("div", { className: "auth-wrapper" },
      e("div", { style: { textAlign: "center", color: "#06b6d4" } },
        e("i", { className: "fa-solid fa-circle-notch fa-spin", style: { fontSize: "3rem", marginBottom: "1rem" } }),
        e("div", { style: { fontSize: "1.15rem", color: "#ffffff", fontWeight: "700" } }, "AuraHome Secure Gateway"),
        e("div", { style: { fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.4rem" } }, "Verifying authentication & encryption...")
      )
    );
  }

  // If not logged in, render the Login / Registration screen
  if (!currentUser) {
    return e(LoginScreen, { onLoginSuccess: (user) => setCurrentUser(user) });
  }

  return e("div", { className: "app-container" },
    // Desktop sidebar
    e(Sidebar, { activeTab, setActiveTab, espNodes, fbConnected, connMode }),
    // Mobile top bar (no hamburger — navigation moved to bottom nav)
    e(MobileHeader, { installPromptEvent, onInstallClick: handleInstallClick, currentUser, onLogout: handleLogout, fbConnected, connMode }),
    // Bottom navigation bar (mobile + tablet only, shown via CSS)
    e(BottomNav, { activeTab, setActiveTab }),
    // Main content
    e("main", { className: "main-content" },
      // PWA install banner for desktop
      showInstallBanner && e("div", { className: "pwa-install-banner", id: "pwa-install-banner" },
        e("div", { className: "pwa-banner-text" },
          e("i", { className: "fa-solid fa-mobile-screen" }),
          e("div", null,
            e("strong", null, "Install AuraHome App"),
            "Add to your home screen for instant access, offline support & native feel"
          )
        ),
        e("div", { className: "pwa-banner-actions" },
          e("button", { className: "pwa-banner-install", id: "pwa-banner-install-btn", onClick: handleInstallClick }, "Install App"),
          e("button", { className: "pwa-banner-dismiss", onClick: () => setShowInstallBanner(false) }, "Not now")
        )
      ),
      e(Topbar, { totalActiveDevices, estimatedBillRupees, waterData, fbConnected, currentUser, onLogout: handleLogout }),
      e("div", { className: "dashboard-grid" },
        (activeTab === 'overview' || activeTab === 'water') && e(WaterMonitoring, { waterData, setWaterData, addLog, handlePumpToggle }),
        activeTab === 'overview' && e(ClimateSensors, { envData }),
        (activeTab === 'overview' || activeTab === 'electricity') && e(ElectricityBilling, { elecData, estimatedBillRupees }),
        // Overview shows ESP status board; Switchboards tab shows full switch controls
        activeTab === 'overview' && e(ESPStatusBoard, { espNodes, boards, setActiveTab, setSelectedFloor }),
        activeTab === 'switchboards' && e(SwitchboardSection, {
          boards,
          espNodes,
          selectedFloor,
          setSelectedFloor,
          handleToggleSwitch,
          handleSpeedChange
        }),
        activeTab === 'overview' && e(QuickScenes, { triggerScene }),
        activeTab === 'overview' && e(ActivityLog, { logs })
      )
    )
  );
}

// 14. RENDER APP TO DOM ON LOAD
document.addEventListener("DOMContentLoaded", () => {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
});
