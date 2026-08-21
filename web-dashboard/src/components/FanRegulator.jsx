/* -------------------------------------------------------------
 * FanRegulator Component — Interactive Fan Speed Regulator Slider
 * ------------------------------------------------------------- */
window.FanRegulator = function FanRegulator({ pt, boardId, handleSpeedChange }) {
  return (
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
        onChange={(e) => handleSpeedChange(boardId, pt.id, e.target.value)}
        className="speed-slider-input"
      />
    </div>
  );
};
