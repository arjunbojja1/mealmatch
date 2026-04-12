/**
 * StatCard — a single metric tile used in dashboard stats grids.
 */
export function StatCard({ label, value, accent, icon }) {
  return (
    <div className="mm-stats-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <p className="mm-stats-card-label">{label}</p>
        {icon && (
          <span style={{
            fontSize: 16,
            width: 32, height: 32,
            borderRadius: 10,
            background: accent ? `${accent}18` : 'var(--mm-brand-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </span>
        )}
      </div>
      <p className="mm-stats-card-value" style={accent ? { color: accent } : {}}>{value}</p>
    </div>
  )
}

export function StatsGrid({ children }) {
  return <div className="mm-stats-grid">{children}</div>
}
