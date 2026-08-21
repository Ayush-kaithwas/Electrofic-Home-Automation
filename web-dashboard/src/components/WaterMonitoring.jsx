/* -------------------------------------------------------------
 * WaterMonitoring Component — Tank Visualizer & Purity Telemetry
 * ------------------------------------------------------------- */
window.WaterMonitoring = function WaterMonitoring({ waterData, setWaterData, addLog }) {
  return (
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
              <i className="fa-solid fa-clock"></i> Filling Time
            </div>
            <div className="water-stat-val">{waterData.fillingTimeMin} min</div>
          </div>

          <div className="water-stat-box">
            <div className="water-stat-lbl">
              <i className="fa-solid fa-gauge-high"></i> Inflow Speed
            </div>
            <div className="water-stat-val">{waterData.inflowRate} L/min</div>
          </div>

          <div className="water-stat-box">
            <div className="water-stat-lbl">
              <i className="fa-solid fa-bolt"></i> Units Consumed
            </div>
            <div className="water-stat-val">{waterData.unitsConsumed} kWh</div>
          </div>

          <div className="water-stat-box">
            <div className="water-stat-lbl">
              <i className="fa-solid fa-rotate"></i> Runtime / Day
            </div>
            <div className="water-stat-val">{waterData.runtimePerDay} cycles</div>
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
  );
};
