/* -------------------------------------------------------------
 * Sidebar Component — Desktop Navigation & System Status
 * ------------------------------------------------------------- */
window.Sidebar = function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <div className="brand-logo">
            <i className="fa-solid fa-house-signal"></i>
          </div>
          <div className="brand-text">
            <h2>AuraHome</h2>
            <span>By Electrofic</span>
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
  );
};
