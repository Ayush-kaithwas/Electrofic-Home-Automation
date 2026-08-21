/* -------------------------------------------------------------
 * ElectricityBilling Component — Power Meter & ₹ Bill Estimator
 * ------------------------------------------------------------- */
window.ElectricityBilling = function ElectricityBilling({ elecData, estimatedBillRupees }) {
  return (
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
  );
};
