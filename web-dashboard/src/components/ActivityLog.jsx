/* -------------------------------------------------------------
 * ActivityLog Component — System Event Logger
 * ------------------------------------------------------------- */
window.ActivityLog = function ActivityLog({ logs }) {
  return (
    <div className="glass-card log-card">
      <div className="section-title">
        <span><i className="fa-solid fa-list-check"></i> System Event Log</span>
      </div>

      <div className="log-container">
        {logs.map(log => (
          <div key={log.id} className="log-entry">
            <span className="log-time">[{log.time}]</span> {log.text}
          </div>
        ))}
      </div>
    </div>
  );
};
