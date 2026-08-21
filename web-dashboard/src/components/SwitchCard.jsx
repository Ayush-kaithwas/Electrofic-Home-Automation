/* -------------------------------------------------------------
 * SwitchCard Component — Physical Switchboard Point Tile
 * ------------------------------------------------------------- */
window.SwitchCard = function SwitchCard({ pt, selectedFloor, handleToggleSwitch, handleSpeedChange }) {
  const FanRegulator = window.FanRegulator;

  return (
    <div 
      className={`switch-point-card ${pt.state && !pt.isNull ? 'active' : ''} ${pt.isNull ? 'null-point' : ''}`}
    >
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

      {pt.hasRegulator && !pt.isNull && FanRegulator && (
        <FanRegulator 
          pt={pt} 
          boardId={selectedFloor} 
          handleSpeedChange={handleSpeedChange} 
        />
      )}

      <div className="switch-status-footer">
        <span>Status:</span>
        <strong>{pt.isNull ? 'NULL (Unused)' : (pt.state ? 'ACTIVE (ON)' : 'OFF')}</strong>
      </div>
    </div>
  );
};
