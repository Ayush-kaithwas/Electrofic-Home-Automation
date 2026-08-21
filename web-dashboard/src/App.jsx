/* -------------------------------------------------------------
 * App Component — Root Layout & State Manager
 * ------------------------------------------------------------- */
const { useState, useEffect, useMemo } = React;

window.App = function App() {
  const INITIAL_BOARDS = window.INITIAL_BOARDS;
  const Sidebar = window.Sidebar;
  const MobileHeader = window.MobileHeader;
  const Topbar = window.Topbar;
  const WaterMonitoring = window.WaterMonitoring;
  const ClimateSensors = window.ClimateSensors;
  const ElectricityBilling = window.ElectricityBilling;
  const SwitchboardSection = window.SwitchboardSection;
  const QuickScenes = window.QuickScenes;
  const ActivityLog = window.ActivityLog;

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

  return (
    <div className="app-container">
      {/* DESKTOP SIDEBAR */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* MOBILE HEADER & DRAWER */}
      <MobileHeader 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        mobileMenuOpen={mobileMenuOpen} 
        setMobileMenuOpen={setMobileMenuOpen} 
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <Topbar 
          totalActiveDevices={totalActiveDevices} 
          estimatedBillRupees={estimatedBillRupees} 
          waterData={waterData} 
        />

        <div className="dashboard-grid">
          {(activeTab === 'overview' || activeTab === 'water') && (
            <WaterMonitoring 
              waterData={waterData} 
              setWaterData={setWaterData} 
              addLog={addLog} 
            />
          )}

          {activeTab === 'overview' && (
            <ClimateSensors envData={envData} />
          )}

          {(activeTab === 'overview' || activeTab === 'electricity') && (
            <ElectricityBilling 
              elecData={elecData} 
              estimatedBillRupees={estimatedBillRupees} 
            />
          )}

          {(activeTab === 'overview' || activeTab === 'switchboards') && (
            <SwitchboardSection 
              boards={boards} 
              selectedFloor={selectedFloor} 
              setSelectedFloor={setSelectedFloor} 
              handleToggleSwitch={handleToggleSwitch} 
              handleSpeedChange={handleSpeedChange} 
            />
          )}

          {activeTab === 'overview' && (
            <QuickScenes triggerScene={triggerScene} />
          )}

          {activeTab === 'overview' && (
            <ActivityLog logs={logs} />
          )}
        </div>
      </main>
    </div>
  );
};
