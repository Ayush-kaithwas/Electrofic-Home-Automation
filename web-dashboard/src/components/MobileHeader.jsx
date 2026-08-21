/* -------------------------------------------------------------
 * MobileHeader Component — Mobile Navigation Bar & Drawer
 * ------------------------------------------------------------- */
window.MobileHeader = function MobileHeader({ activeTab, setActiveTab, mobileMenuOpen, setMobileMenuOpen }) {
  return (
    <React.Fragment>
      <header className="mobile-header">
        <div className="mobile-brand">
          <div className="mobile-brand-logo">
            <i className="fa-solid fa-house-signal"></i>
          </div>
          <div className="mobile-brand-text">
            <h2>AuraHome</h2>
            <span>By Electrofic</span>
          </div>
        </div>
        <button 
          className="mobile-nav-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <i className={`fa-solid ${mobileMenuOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
        </button>
      </header>

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
    </React.Fragment>
  );
};
