/**
 * EmptyState — consistent empty / loading / error presentation.
 */
export function EmptyState({ icon = '📭', title, text, action }) {
  return (
    <div className="mm-empty mm-fade-in">
      <div className="mm-empty-icon">{icon}</div>
      {title && <p className="mm-empty-title">{title}</p>}
      {text  && <p className="mm-empty-text">{text}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="mm-empty mm-fade-in" style={{ borderColor: 'var(--mm-error-ring)', background: 'var(--mm-error-dim)' }}>
      <div className="mm-empty-icon">⚠️</div>
      <p className="mm-empty-title" style={{ color: 'var(--mm-error)' }}>Something went wrong</p>
      <p className="mm-empty-text">{message}</p>
      {onRetry && (
        <div style={{ marginTop: 20 }}>
          <button className="mm-btn mm-btn-secondary mm-btn-sm" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  )
}

export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mm-card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="mm-skeleton" style={{ height: 14, width: '55%' }} />
            <div className="mm-skeleton" style={{ height: 11, width: '80%' }} />
            <div className="mm-skeleton" style={{ height: 11, width: '40%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
