/* -------------------------------------------------------------
 * SwitchboardSection Component — Floor Tabs & Physical Layout
 * ------------------------------------------------------------- */
window.SwitchboardSection = function SwitchboardSection({ boards, selectedFloor, setSelectedFloor, handleToggleSwitch, handleSpeedChange }) {
  const currentBoard = boards[selectedFloor];
  const SwitchCard = window.SwitchCard;

  return (
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
          {currentBoard.points.filter(pt => !pt.isNull).map(pt => (
            <SwitchCard
              key={pt.id}
              pt={pt}
              selectedFloor={selectedFloor}
              handleToggleSwitch={handleToggleSwitch}
              handleSpeedChange={handleSpeedChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
