/* -------------------------------------------------------------
 * ClimateSensors Component — Temperature, Humidity & AQI Score
 * ------------------------------------------------------------- */
window.ClimateSensors = function ClimateSensors({ envData }) {
  return (
    <div className="glass-card env-card">
      <div className="section-title">
        <span><i className="fa-solid fa-temperature-half"></i> Climate & Air Quality</span>
        <span className="board-badge">DHT22 & MQ-135</span>
      </div>

      <div className="env-metrics-row">
        <div className="env-metric-box">
          <div className="env-icon-circle temp-circle">
            <i className="fa-solid fa-temperature-three-quarters"></i>
          </div>
          <div className="env-val">{envData.temperature}°C</div>
          <div className="env-lbl">Temperature</div>
          <span className="env-badge badge-good">Comfortable</span>
        </div>

        <div className="env-metric-box">
          <div className="env-icon-circle humidity-circle">
            <i className="fa-solid fa-droplet-percent"></i>
          </div>
          <div className="env-val">{envData.humidity}%</div>
          <div className="env-lbl">Humidity</div>
          <span className="env-badge badge-good">Optimal</span>
        </div>

        <div className="env-metric-box">
          <div className="env-icon-circle aqi-circle">
            <i className="fa-solid fa-wind"></i>
          </div>
          <div className="env-val">{envData.aqi}</div>
          <div className="env-lbl">AQI Score</div>
          <span className="env-badge badge-good">Good Quality</span>
        </div>
      </div>

      <div className="aqi-breakdown">
        <div className="aqi-item">
          <span>PM 2.5</span>
          <strong>{envData.pm25} µg/m³</strong>
        </div>
        <div className="aqi-item">
          <span>PM 10</span>
          <strong>{envData.pm10} µg/m³</strong>
        </div>
        <div className="aqi-item">
          <span>CO₂ Level</span>
          <strong>{envData.co2} ppm</strong>
        </div>
      </div>
    </div>
  );
};
