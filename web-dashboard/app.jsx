/* -------------------------------------------------------------
 * AuraHome — React 18 Smart Home Dashboard Application
 * Featuring Floor-wise Switchboards (from PDF), Water Monitoring System,
 * Environment Parameters, Electricity Billing, and Responsive UI
 * ------------------------------------------------------------- */

const { useState, useEffect, useMemo, useRef } = React;

// --- INITIAL DEFAULT SWITCHBOARD STATES (PARSED FROM PDF) ---
const INITIAL_BOARDS = {
  hall: {
    id: "hall",
    name: "Hall Switchboard",
    floor: "Ground Floor",
    points: [
      { id: "h1", num: 1, name: "FAN", desc: "Controls Main Hall Fan", icon: "fa-fan", type: "fan", state: true, isNull: false },
      { id: "h2", num: 2, name: "LIGHT", desc: "Controls Hall Main Light", icon: "fa-lightbulb", type: "light", state: true, isNull: false },
      { id: "h3", num: 3, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "h4", num: 4, name: "CHANDELIER", desc: "Controls Decorative Chandelier", icon: "fa-gem", type: "chandelier", state: false, isNull: false },
      { id: "h5", num: 5, name: "NULL (Socket)", desc: "Nothing Connected", icon: "fa-plug", type: "null", state: false, isNull: true }
    ]
  },
  first_floor: {
    id: "first_floor",
    name: "First Floor Room",
    floor: "1st Floor",
    points: [
      { id: "f1", num: 1, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "f2", num: 2, name: "NIGHT BULB", desc: "Controls Night Lamp", icon: "fa-moon", type: "light", state: true, isNull: false },
      { id: "f3", num: 3, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "f4", num: 4, name: "FAN (Regulator)", desc: "Controls Fan Speed", icon: "fa-fan", type: "fan", state: true, isNull: false, hasRegulator: true, speed: 3 },
      { id: "f5", num: 5, name: "LIGHT", desc: "Controls Room Light", icon: "fa-lightbulb", type: "light", state: false, isNull: false },
      { id: "f6", num: 6, name: "CHANDELIER", desc: "Controls Room Chandelier", icon: "fa-gem", type: "chandelier", state: false, isNull: false },
      { id: "f7", num: 7, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true }
    ]
  },
  harry: {
    id: "harry",
    name: "Harry Room",
    floor: "2nd Floor",
    points: [
      { id: "hr1", num: 1, name: "NULL (Socket)", desc: "Nothing Connected", icon: "fa-plug", type: "null", state: false, isNull: true },
      { id: "hr2", num: 2, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "hr3", num: 3, name: "NIGHT BULB", desc: "Controls Night Bulb", icon: "fa-moon", type: "light", state: true, isNull: false },
      { id: "hr4", num: 4, name: "FAN", desc: "Controls Ceiling Fan", icon: "fa-fan", type: "fan", state: true, isNull: false },
      { id: "hr5", num: 5, name: "LIGHT", desc: "Controls Study Light", icon: "fa-lightbulb", type: "light", state: true, isNull: false },
      { id: "hr6", num: 6, name: "FAN REGULATOR", desc: "Controls Fan Speed", icon: "fa-sliders", type: "regulator", state: true, isNull: false, hasRegulator: true, speed: 4 }
    ]
  },
  mom_dad: {
    id: "mom_dad",
    name: "Mom and Dad Room",
    floor: "1st Floor",
    points: [
      { id: "md1", num: 1, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "md2", num: 2, name: "SMART LIGHT", desc: "Controls RGB Smart Light", icon: "fa-wand-magic-sparkles", type: "light", state: true, isNull: false },
      { id: "md3", num: 3, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "md4", num: 4, name: "FAN", desc: "Controls Master Bed Fan", icon: "fa-fan", type: "fan", state: false, isNull: false },
      { id: "md5", num: 5, name: "LIGHT", desc: "Controls Ambient Light", icon: "fa-lightbulb", type: "light", state: true, isNull: false },
      { id: "md6", num: 6, name: "CHANDELIER", desc: "Controls Chandelier", icon: "fa-gem", type: "chandelier", state: false, isNull: false },
      { id: "md7", num: 7, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true }
    ]
  },
  ayush: {
    id: "ayush",
    name: "Ayush Room",
    floor: "2nd Floor",
    points: [
      { id: "ay1", num: 1, name: "FAN (Regulator)", desc: "Controls Main Fan", icon: "fa-fan", type: "fan", state: true, isNull: false, hasRegulator: true, speed: 5 },
      { id: "ay2", num: 2, name: "LIGHT MAIN", desc: "Controls Main Light", icon: "fa-lightbulb", type: "light", state: true, isNull: false },
      { id: "ay3", num: 3, name: "NIGHT BULB", desc: "Controls Night Lamp", icon: "fa-star", type: "light", state: false, isNull: false },
      { id: "ay4", num: 4, name: "NULL", desc: "Nothing Connected", icon: "fa-ban", type: "null", state: false, isNull: true },
      { id: "ay5", num: 5, name: "BROWN FAN", desc: "Controls Secondary Fan", icon: "fa-fan", type: "fan", state: false, isNull: false },
      { id: "ay6", num: 6, name: "CENTRE LIGHT", desc: "Controls Centre Light Socket", icon: "fa-plug", type: "light", state: true, isNull: false }
    ]
  }
};

function App() {
  // --- STATE DEFINITIONS ---
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFloor, setSelectedFloor] = useState("hall");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [boards, setBoards] = useState(INITIAL_BOARDS);

  // Water System State
  const [waterData, setWaterData] = useState({
    levelPercent: 78,
    volumeLitres: 780,
    maxCapacity: 1000,
    depthMeters: 1.85,
    maxDepth: 2.30,
    inflowRate: 18.5,
    outflowRate: 4.2,
    pH: 7.2,
    tdsPpm: 142,
    pumpActive: true,
    autoMode: true
  });

  // Climate Environment State
  const [envData, setEnvData] = useState({
    temperature: 24.5,
    humidity: 58,
    aqi: 42,
    pm25: 11,
    pm10: 26,
    co2: 425
  });

  // Electricity Billing State
  const [elecData, setElecData] = useState({
    liveWatts: 485,
    todayKwh: 6.4,
    monthlyKwh: 184.2,
    tariffRateRupees: 7.50, // ₹ / kWh
    hourlyLoad: [220, 180, 150, 140, 190, 310, 520, 680, 480, 510, 490, 485]
  });

  // Live Event Logs
  const [logs, setLogs] = useState([
    { id: 1, time: "13:00:15", text: "React App Mounted. AuraHome Engine initialized.", type: "info" },
    { id: 2, time: "13:00:28", text: "Water Monitoring telemetry connected (Tank Level: 78%).", type: "success" },
    { id: 3, time: "13:00:45", text: "Synced 5 Floor Switchboards from PDF Specs.", type: "cmd" }
  ]);

  // Add Log Helper
  const addLog = (text, type = "info") => {
    const time = new Date().toTimeString().split(" ")[0];
    setLogs(prev => [...prev.slice(-30), { id: Date.now() + Math.random(), time, text, type }]);
  };

  // --- TELEMETRY FLUCTUATION SIMULATOR ---
  useEffect(() => {
    const interval = setInterval(() => {
      // Fluctuate temp slightly
      setEnvData(prev => ({
        ...prev,
        temperature: +(prev.temperature + (Math.random() * 0.2 - 0.1)).toFixed(1)
      }));

      // Fluctuate live wattage based on active switches
      let activeCount = 0;
      Object.values(boards).forEach(b => {
        b.points.forEach(p => { if (p.state && !p.isNull) activeCount++; });
      });

      const calculatedWatts = activeCount * 65 + Math.floor(Math.random() * 20);
      setElecData(prev => ({
        ...prev,
        liveWatts: calculatedWatts
      }));
    }, 4000);

    return () => clearInterval(interval);
  }, [boards]);

  // --- SWITCH TOGGLE HANDLER ---
  const handleToggleSwitch = (boardId, pointId) => {
    setBoards(prev => {
      const board = prev[boardId];
      const updatedPoints = board.points.map(pt => {
        if (pt.id === pointId) {
          const nextState = !pt.state;
          addLog(`${board.name} → ${pt.name} turned ${nextState ? 'ON' : 'OFF'}`, nextState ? "success" : "info");
          return { ...pt, state: nextState };
        }
        return pt;
      });
      return { ...prev, [boardId]: { ...board, points: updatedPoints } };
    });
  };

  // --- FAN SPEED CHANGE HANDLER ---
  const handleSpeedChange = (boardId, pointId, speedVal) => {
    setBoards(prev => {
      const board = prev[boardId];
      const updatedPoints = board.points.map(pt => {
        if (pt.id === pointId) {
          addLog(`${board.name} → ${pt.name} speed set to Level ${speedVal}`, "cmd");
          return { ...pt, speed: parseInt(speedVal, 10) };
        }
        return pt;
      });
      return { ...prev, [boardId]: { ...board, points: updatedPoints } };
    });
  };

  // --- SCENE TRIGGER HANDLER ---
  const triggerScene = (sceneName) => {
    addLog(`Automation Scene Triggered: ${sceneName.toUpperCase()}`, "cmd");
    setBoards(prev => {
      const newBoards = { ...prev };
      Object.keys(newBoards).forEach(bKey => {
        newBoards[bKey].points = newBoards[bKey].points.map(pt => {
          if (pt.isNull) return pt;
          if (sceneName === 'all_on') return { ...pt, state: true };
          if (sceneName === 'all_off') return { ...pt, state: false };
          if (sceneName === 'night_mode') {
            return { ...pt, state: pt.name.includes("NIGHT") || pt.name.includes("SMART") };
          }
          if (sceneName === 'eco_mode') {
            return { ...pt, state: pt.type === "light" };
          }
          return pt;
        });
      });
      return newBoards;
    });
  };

  // --- CALCULATED SUMMARY METRICS ---
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

  // Selected board details
  const currentBoard = boards[selectedFloor];

  return (
    <div className="app-container">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-logo">
              <i className="fa-solid fa-house-signal"></i>
            </div>
            <div className="brand-text">
              <h2>AuraHome</h2>
              <span>Smart Hub React</span>
            </div>
          </div>

          <nav className="nav-menu">
            <button 
              className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <i className="fa-solid fa-grid-2"></i> Master Dashboard
            </button>
            <button 
              className={`nav-item ${activeTab === 'water' ? 'active' : ''}`}
              onClick={() => setActiveTab('water')}
            >
              <i className="fa-solid fa-droplet"></i> Water Monitoring
            </button>
            <button 
              className={`nav-item ${activeTab === 'switchboards' ? 'active' : ''}`}
              onClick={() => setActiveTab('switchboards')}
            >
              <i className="fa-solid fa-toggle-on"></i> Floor Switchboards
            </button>
            <button 
              className={`nav-item ${activeTab === 'electricity' ? 'active' : ''}`}
              onClick={() => setActiveTab('electricity')}
            >
              <i className="fa-solid fa-bolt"></i> Electricity & Billing
            </button>
          </nav>
        </div>

        <div className="gateway-status-card">
          <div className="status-header">
            <span className="status-dot online"></span>
            <span className="status-title">System Online</span>
          </div>
          <div className="status-sub">
            <span>RPi Node:</span>
            <strong>192.168.1.100</strong>
          </div>
          <div className="status-sub">
            <span>Sync:</span>
            <strong>Realtime DB</strong>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <div className="mobile-brand-logo">
            <i className="fa-solid fa-house-signal"></i>
          </div>
          <h2>AuraHome</h2>
        </div>
        <button 
          className="mobile-nav-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
        </button>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="mobile-drawer open">
          <button 
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
          >
            <i className="fa-solid fa-grid-2"></i> Master Dashboard
          </button>
          <button 
            className={`nav-item ${activeTab === 'water' ? 'active' : ''}`}
            onClick={() => { setActiveTab('water'); setMobileMenuOpen(false); }}
          >
            <i className="fa-solid fa-droplet"></i> Water Monitoring
          </button>
          <button 
            className={`nav-item ${activeTab === 'switchboards' ? 'active' : ''}`}
            onClick={() => { setActiveTab('switchboards'); setMobileMenuOpen(false); }}
          >
            <i className="fa-solid fa-toggle-on"></i> Floor Switchboards
          </button>
          <button 
            className={`nav-item ${activeTab === 'electricity' ? 'active' : ''}`}
            onClick={() => { setActiveTab('electricity'); setMobileMenuOpen(false); }}
          >
            <i className="fa-solid fa-bolt"></i> Electricity & Billing
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        
        {/* TOPBAR */}
        <div className="topbar">
          <div className="welcome-meta">
            <h1>Home Automation Control Center</h1>
            <p>Full control over Water, Climate, Electricity & 5 Floor Switchboards</p>
          </div>

          <div className="quick-stats">
            <div className="stat-badge">
              <i className="fa-solid fa-plug text-success"></i>
              <div>
                <span className="stat-val">{totalActiveDevices} Points Active</span>
                <span className="stat-lbl">Relays & Appliances</span>
              </div>
            </div>

            <div className="stat-badge">
              <i className="fa-solid fa-indian-rupee-sign text-warning"></i>
              <div>
                <span className="stat-val">₹ {estimatedBillRupees}</span>
                <span className="stat-lbl">Est. Monthly Bill</span>
              </div>
            </div>

            <div className="stat-badge">
              <i className="fa-solid fa-droplet text-cyan"></i>
              <div>
                <span className="stat-val">{waterData.levelPercent}% Full</span>
                <span className="stat-lbl">Water Overhead Tank</span>
              </div>
            </div>
          </div>
        </div>

        {/* DASHBOARD GRID CONTENT */}
        <div className="dashboard-grid">
          
          {/* WATER MONITORING SYSTEM CARD */}
          {(activeTab === 'overview' || activeTab === 'water') && (
            <div className="glass-card water-card">
              <div className="section-title">
                <span><i className="fa-solid fa-droplet"></i> Water Overhead Monitoring System</span>
                <span className="board-badge">Tank ID: TANK-MAIN-01</span>
              </div>

              <div className="water-content">
                <div className="water-tank-wrapper">
                  <div className="water-tank">
                    <div 
                      className="water-wave" 
                      style={{ height: `${waterData.levelPercent}%` }}
                    ></div>
                    <div className="tank-overlay-info">
                      <div className="tank-percentage">{waterData.levelPercent}%</div>
                      <div className="tank-capacity">{waterData.volumeLitres} / {waterData.maxCapacity} L</div>
                    </div>
                  </div>
                </div>

                <div className="water-details-grid">
                  <div className="water-stat-box">
                    <div className="water-stat-lbl">
                      <i className="fa-solid fa-arrows-up-to-line"></i> Water Depth
                    </div>
                    <div className="water-stat-val">{waterData.depthMeters} m / {waterData.maxDepth} m</div>
                  </div>

                  <div className="water-stat-box">
                    <div className="water-stat-lbl">
                      <i className="fa-solid fa-gauge-high"></i> Inflow Speed
                    </div>
                    <div className="water-stat-val">{waterData.inflowRate} L/min</div>
                  </div>

                  <div className="water-stat-box">
                    <div className="water-stat-lbl">
                      <i className="fa-solid fa-flask"></i> Water Purity (pH)
                    </div>
                    <div className="water-stat-val">{waterData.pH} (Optimal)</div>
                  </div>

                  <div className="water-stat-box">
                    <div className="water-stat-lbl">
                      <i className="fa-solid fa-filter"></i> TDS Level
                    </div>
                    <div className="water-stat-val">{waterData.tdsPpm} ppm (Pure)</div>
                  </div>
                </div>
              </div>

              <div className="pump-control-bar">
                <div className="pump-info">
                  <div className={`pump-icon ${waterData.pumpActive ? '' : 'off'}`}>
                    <i className="fa-solid fa-gears"></i>
                  </div>
                  <div>
                    <div className="pump-title">Overhead Motor Pump</div>
                    <div className="pump-status-sub">
                      {waterData.pumpActive ? 'Pumping Water (Dry Run Safe)' : 'Motor Standby'}
                    </div>
                  </div>
                </div>

                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={waterData.pumpActive}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setWaterData(prev => ({ ...prev, pumpActive: next }));
                      addLog(`Water Motor Pump turned ${next ? 'ON' : 'OFF'}`, next ? "success" : "info");
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          )}

          {/* ENVIRONMENT & CLIMATE SENSORS CARD */}
          {(activeTab === 'overview') && (
            <div className="glass-card env-card">
              <div className="section-title">
                <span><i className="fa-solid fa-temperature-half"></i> Climate & Air Quality</span>
                <span className="board-badge">DHT22 & MQ-135</span>
              </div>

              <div className="env-metrics-row">
                <div className="env-metric-box">
                  <div className="env-icon-circle temp-circle">
                    <i className="fa-solid fa-temperature-three-quarters"></i>
                  </div>
                  <div className="env-val">{envData.temperature}°C</div>
                  <div className="env-lbl">Temperature</div>
                  <span className="env-badge badge-good">Comfortable</span>
                </div>

                <div className="env-metric-box">
                  <div className="env-icon-circle humidity-circle">
                    <i className="fa-solid fa-droplet-percent"></i>
                  </div>
                  <div className="env-val">{envData.humidity}%</div>
                  <div className="env-lbl">Humidity</div>
                  <span className="env-badge badge-good">Optimal</span>
                </div>

                <div className="env-metric-box">
                  <div className="env-icon-circle aqi-circle">
                    <i className="fa-solid fa-wind"></i>
                  </div>
                  <div className="env-val">{envData.aqi}</div>
                  <div className="env-lbl">AQI Score</div>
                  <span className="env-badge badge-good">Good Quality</span>
                </div>
              </div>

              <div className="aqi-breakdown">
                <div className="aqi-item">
                  <span>PM 2.5</span>
                  <strong>{envData.pm25} µg/m³</strong>
                </div>
                <div className="aqi-item">
                  <span>PM 10</span>
                  <strong>{envData.pm10} µg/m³</strong>
                </div>
                <div className="aqi-item">
                  <span>CO₂ Level</span>
                  <strong>{envData.co2} ppm</strong>
                </div>
              </div>
            </div>
          )}

          {/* ELECTRICITY USAGE & BILL ESTIMATION CARD */}
          {(activeTab === 'overview' || activeTab === 'electricity') && (
            <div className="glass-card electricity-card">
              <div className="section-title">
                <span><i className="fa-solid fa-bolt"></i> Electricity Power Meter & Bill Calculator</span>
                <span className="board-badge">Tariff: ₹ {elecData.tariffRateRupees} / kWh</span>
              </div>

              <div className="power-grid-row">
                <div className="power-stat-card">
                  <div className="power-stat-icon cyan">
                    <i className="fa-solid fa-gauge-high"></i>
                  </div>
                  <div className="power-stat-info">
                    <h4>Live Load Demand</h4>
                    <p>{elecData.liveWatts} Watts</p>
                  </div>
                </div>

                <div className="power-stat-card">
                  <div className="power-stat-icon green">
                    <i className="fa-solid fa-calendar-day"></i>
                  </div>
                  <div className="power-stat-info">
                    <h4>Energy Today</h4>
                    <p>{elecData.todayKwh} kWh</p>
                  </div>
                </div>

                <div className="power-stat-card">
                  <div className="power-stat-icon purple">
                    <i className="fa-solid fa-chart-pie"></i>
                  </div>
                  <div className="power-stat-info">
                    <h4>Monthly kWh</h4>
                    <p>{elecData.monthlyKwh} kWh</p>
                  </div>
                </div>

                <div className="power-stat-card">
                  <div className="power-stat-icon amber">
                    <i className="fa-solid fa-indian-rupee-sign"></i>
                  </div>
                  <div className="power-stat-info">
                    <h4>Est. Electricity Bill</h4>
                    <p>₹ {estimatedBillRupees}</p>
                  </div>
                </div>
              </div>

              <div className="power-chart-bar-container">
                <div className="chart-header">
                  <span>Hourly Power Consumption Profile (Today)</span>
                  <span>Peak Load: 680 W (07:00 PM)</span>
                </div>
                <div className="hourly-bars">
                  {elecData.hourlyLoad.map((w, idx) => {
                    const heightPct = Math.min(100, Math.max(15, (w / 700) * 100));
                    const isPeak = w > 500;
                    return (
                      <div className="bar-col" key={idx}>
                        <div 
                          className={`bar-fill ${isPeak ? 'peak' : ''}`}
                          style={{ height: `${heightPct}%` }}
                          title={`${w} Watts`}
                        ></div>
                        <div className="bar-lbl">{idx * 2}:00</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* FLOOR SWITCHBOARDS SECTION (EXACT MAPPING FROM PDF) */}
          {(activeTab === 'overview' || activeTab === 'switchboards') && (
            <div className="glass-card switchboard-section">
              <div className="section-title">
                <span><i className="fa-solid fa-toggle-on"></i> Floor & Room Switchboards (PDF Mapped)</span>
                <span className="board-badge">{Object.keys(boards).length} Boards Configured</span>
              </div>

              {/* FLOOR TAB CONTROLS */}
              <div className="floor-tabs-bar">
                {Object.keys(boards).map(bKey => (
                  <button
                    key={bKey}
                    className={`floor-tab ${selectedFloor === bKey ? 'active' : ''}`}
                    onClick={() => setSelectedFloor(bKey)}
                  >
                    <i className="fa-solid fa-layer-group"></i>
                    {boards[bKey].name} ({boards[bKey].floor})
                  </button>
                ))}
              </div>

              {/* PHYSICAL SWITCHBOARD LAYOUT */}
              <div className="physical-board-container">
                <div className="board-header">
                  <div className="board-title">
                    <h3>{currentBoard.name}</h3>
                    <p>Location: {currentBoard.floor} • Switch points left-to-right as per wiring diagram</p>
                  </div>
                  <span className="board-badge">
                    {currentBoard.points.filter(p => p.state && !p.isNull).length} / {currentBoard.points.filter(p => !p.isNull).length} Active Points
                  </span>
                </div>

                <div className="switches-grid">
                  {currentBoard.points.map(pt => (
                    <div 
                      key={pt.id}
                      className={`switch-point-card ${pt.state && !pt.isNull ? 'active' : ''} ${pt.isNull ? 'null-point' : ''}`}
                    >
                      <span className="point-number-tag">POINT {pt.num}</span>

                      <div className="switch-top-row">
                        <div className="switch-icon-box">
                          <i className={`fa-solid ${pt.icon}`}></i>
                        </div>

                        {!pt.isNull && (
                          <label className="toggle-switch">
                            <input 
                              type="checkbox"
                              checked={pt.state}
                              onChange={() => handleToggleSwitch(selectedFloor, pt.id)}
                            />
                            <span className="slider"></span>
                          </label>
                        )}
                      </div>

                      <div>
                        <div className="switch-name">{pt.name}</div>
                        <div className="switch-desc">{pt.desc}</div>
                      </div>

                      {/* FAN SPEED SLIDER FOR REGULATOR POINTS */}
                      {pt.hasRegulator && !pt.isNull && (
                        <div className="regulator-control">
                          <div className="regulator-label-row">
                            <span>Fan Speed Regulator</span>
                            <span>Level {pt.speed || 3}</span>
                          </div>
                          <input 
                            type="range"
                            min="1"
                            max="5"
                            value={pt.speed || 3}
                            disabled={!pt.state}
                            onChange={(e) => handleSpeedChange(selectedFloor, pt.id, e.target.value)}
                            className="speed-slider-input"
                          />
                        </div>
                      )}

                      <div className="switch-status-footer">
                        <span>Status:</span>
                        <strong>{pt.isNull ? 'NULL (Unused)' : (pt.state ? 'ACTIVE (ON)' : 'OFF')}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* QUICK AUTOMATION SCENES */}
          {activeTab === 'overview' && (
            <div className="glass-card scenes-card">
              <div className="section-title">
                <span><i className="fa-solid fa-wand-magic-sparkles"></i> Quick Automation Scenes</span>
              </div>

              <div className="scenes-grid">
                <button className="scene-btn" onClick={() => triggerScene('all_on')}>
                  <i className="fa-solid fa-sun"></i> All Devices ON
                </button>
                <button className="scene-btn danger" onClick={() => triggerScene('all_off')}>
                  <i className="fa-solid fa-power-off"></i> Master Power OFF
                </button>
                <button className="scene-btn blue" onClick={() => triggerScene('night_mode')}>
                  <i className="fa-solid fa-moon"></i> Night Lamp Mode
                </button>
                <button className="scene-btn purple" onClick={() => triggerScene('eco_mode')}>
                  <i className="fa-solid fa-leaf"></i> Eco Energy Save
                </button>
              </div>
            </div>
          )}

          {/* REALTIME SYSTEM ACTIVITY LOG */}
          {activeTab === 'overview' && (
            <div className="glass-card log-card">
              <div className="section-title">
                <span><i className="fa-solid fa-list-check"></i> System Event Log</span>
              </div>

              <div className="log-container">
                {logs.map(log => (
                  <div key={log.id} className="log-entry">
                    <span className="log-time">[{log.time}]</span> {log.text}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// Render React App to DOM
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
