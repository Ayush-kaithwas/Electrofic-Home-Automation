/* -------------------------------------------------------------
 * Topbar Component — Quick Stats Header & Welcome Meta
 * ------------------------------------------------------------- */
window.Topbar = function Topbar({ totalActiveDevices, estimatedBillRupees, waterData }) {
  return (
    <div className="topbar">
      <div className="welcome-meta">
        <h1>Home Automation Control Center</h1>
        <p>Full control over Water, Climate, Electricity & 5 Floor Switchboards • Developed by Electrofic</p>
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
  );
};
