/**
 * Notification — floating toast notification for success/error/info feedback.
 */
export function Notification({ notification }) {
  if (!notification) return null

  const colors = {
    success: { bg: 'var(--mm-success-dim)', border: 'var(--mm-success-ring)', color: '#14532D', icon: '✓' },
    error:   { bg: 'var(--mm-error-dim)',   border: 'var(--mm-error-ring)',   color: '#7F1D1D', icon: '✕' },
    warning: { bg: 'var(--mm-warning-dim)', border: 'var(--mm-warning-ring)', color: '#78350F', icon: '!' },
    info:    { bg: 'var(--mm-info-dim)',     border: 'var(--mm-info-ring)',    color: '#1E3A8A', icon: 'i' },
  }
  const c = colors[notification.type] || colors.info

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        borderRadius: 'var(--mm-r-full)',
        background: 'var(--mm-surface-1)',
        border: `1px solid ${c.border}`,
        color: c.color,
        fontSize: '.875rem',
        fontWeight: 600,
        boxShadow: 'var(--mm-shadow-lg)',
        animation: 'mm-grow-in .2s var(--mm-ease) both',
        whiteSpace: 'nowrap',
        maxWidth: '90vw',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: c.bg, border: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {c.icon}
      </span>
      {notification.message}
    </div>
  )
}
