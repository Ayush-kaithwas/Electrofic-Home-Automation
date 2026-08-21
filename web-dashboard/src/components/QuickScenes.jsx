/* -------------------------------------------------------------
 * QuickScenes Component — Automation Scenes Buttons
 * ------------------------------------------------------------- */
window.QuickScenes = function QuickScenes({ triggerScene }) {
  return (
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
  );
};
