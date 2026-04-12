/**
 * ui.jsx — MealMatch shared UI primitives (v2 design system)
 *
 * These components use className for hover/focus/responsive behaviour
 * and inline styles only for dynamic/computed values.
 */

/* ── Spinner ─────────────────────────────────────────────────── */
export function Spinner({ size = 20, color = 'var(--mm-brand)' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid rgba(255,255,255,.15)',
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin .65s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

/* ── Skeleton bar ────────────────────────────────────────────── */
export function Skeleton({ height = 14, width = '100%', style }) {
  return (
    <div
      className="mm-skeleton"
      style={{ height, width, ...style }}
      aria-hidden="true"
    />
  )
}

/* ── Skeleton card ───────────────────────────────────────────── */
export function SkeletonCard({ lines = 3, style }) {
  const widths = ['55%', '85%', '42%', '68%', '30%']
  return (
    <div className="mm-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  )
}

/* ── Alert / notification ────────────────────────────────────── */
export function Alert({ type = 'info', children, onDismiss, style }) {
  const cls = {
    success: 'mm-alert-success',
    error:   'mm-alert-error',
    warning: 'mm-alert-warning',
    info:    'mm-alert-info',
  }[type] || 'mm-alert-info'

  return (
    <div className={`mm-alert ${cls}`} style={style} role="alert">
      {children}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 2px',
            opacity: .7,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

/* ── Badge ───────────────────────────────────────────────────── */
export function Badge({ variant = 'neutral', children, style }) {
  const cls = {
    success: 'mm-badge-success',
    warning: 'mm-badge-warning',
    error:   'mm-badge-error',
    info:    'mm-badge-info',
    neutral: 'mm-badge-neutral',
    brand:   'mm-badge-brand',
    partner: 'mm-badge-partner',
    urgent:  'mm-badge-urgent',
  }[variant] || 'mm-badge-neutral'

  return <span className={`mm-badge ${cls}`} style={style}>{children}</span>
}

/* ── Button ──────────────────────────────────────────────────── */
export function Btn({
  variant = 'secondary',
  size,
  full,
  className = '',
  disabled,
  children,
  style,
  type = 'button',
  onClick,
  ...rest
}) {
  const variantCls = {
    primary:   'mm-btn-primary',
    secondary: 'mm-btn-secondary',
    ghost:     'mm-btn-ghost',
    danger:    'mm-btn-danger',
    warning:   'mm-btn-warning',
    success:   'mm-btn-success',
    partner:   'mm-btn-partner',
    info:      'mm-btn-info',
  }[variant] || 'mm-btn-secondary'

  const sizeCls  = size === 'sm' ? 'mm-btn-sm' : size === 'lg' ? 'mm-btn-lg' : size === 'xl' ? 'mm-btn-xl' : ''
  const fullCls  = full ? 'mm-btn-full' : ''

  return (
    <button
      type={type}
      className={`mm-btn ${variantCls} ${sizeCls} ${fullCls} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Form field wrapper ──────────────────────────────────────── */
export function Field({ label, htmlFor, children, helper, style, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label className="mm-label" htmlFor={htmlFor}>
          {label}
          {required && <span style={{ color: 'var(--mm-brand)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {helper && (
        <span style={{ fontSize: 12, color: 'var(--mm-text-4)', lineHeight: 1.5 }}>
          {helper}
        </span>
      )}
    </div>
  )
}

/* ── Input ───────────────────────────────────────────────────── */
export function Input({ style, className = '', ...props }) {
  return <input className={`mm-input ${className}`} style={style} {...props} />
}

/* ── Select ──────────────────────────────────────────────────── */
export function Select({ children, style, className = '', ...props }) {
  return (
    <select className={`mm-select ${className}`} style={style} {...props}>
      {children}
    </select>
  )
}

/* ── Textarea ────────────────────────────────────────────────── */
export function Textarea({ style, className = '', ...props }) {
  return <textarea className={`mm-textarea ${className}`} style={style} {...props} />
}

/* ── Card ────────────────────────────────────────────────────── */
export function Card({ lift, children, style, className = '', onClick }) {
  return (
    <div
      className={`mm-card ${lift ? 'mm-card-lift' : ''} ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────── */
export function EmptyState({ icon, title, text, action }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '52px 24px',
      background: 'rgba(255,255,255,.02)',
      border: '1px dashed var(--mm-border-md)',
      borderRadius: 'var(--mm-r-2xl)',
    }}>
      {icon && (
        <div style={{ fontSize: 40, marginBottom: 16, opacity: .65 }} aria-hidden="true">
          {icon}
        </div>
      )}
      {title && (
        <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: 'var(--mm-text-1)' }}>
          {title}
        </h3>
      )}
      {text && (
        <p style={{
          margin: action ? '0 0 20px' : 0,
          color: 'var(--mm-text-4)',
          lineHeight: 1.65,
          maxWidth: 380,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {text}
        </p>
      )}
      {action}
    </div>
  )
}

/* ── Page hero banner ────────────────────────────────────────── */
export function PageHero({ eyebrow, title, subtitle, badge, accent = 'rgba(249,115,22,.16)', children }) {
  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${accent}, transparent 32%), linear-gradient(135deg, var(--mm-surface-1) 0%, var(--mm-surface-2) 100%)`,
      border: '1px solid var(--mm-border)',
      borderRadius: 'var(--mm-r-2xl)',
      padding: '28px 32px',
      marginBottom: 24,
      boxShadow: 'var(--mm-shadow-lg)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
    }}>
      <div>
        {eyebrow && (
          <p style={{
            margin: '0 0 10px',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'rgba(148,163,184,.7)',
          }}>
            {eyebrow}
          </p>
        )}
        <h1 style={{
          margin: '0 0 10px',
          fontSize: 'clamp(1.6rem,3.5vw,2.6rem)',
          fontWeight: 800,
          color: 'var(--mm-text-1)',
          letterSpacing: '-.025em',
          lineHeight: 1.1,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            margin: 0,
            maxWidth: 640,
            color: 'var(--mm-text-3)',
            lineHeight: 1.65,
            fontSize: 15,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {badge && (
        <div style={{
          minWidth: 136,
          padding: '18px 22px',
          borderRadius: 'var(--mm-r-xl)',
          background: 'rgba(255,255,255,.05)',
          border: '1px solid var(--mm-border-md)',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {badge.value}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mm-text-3)', marginTop: 6 }}>
            {badge.label}
          </div>
        </div>
      )}

      {children}
    </div>
  )
}

/* ── Stats grid ──────────────────────────────────────────────── */
export function StatsGrid({ stats, columns, style }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns || 'repeat(auto-fit, minmax(156px, 1fr))',
      gap: 12,
      marginBottom: 24,
      ...style,
    }}>
      {stats.map((stat) => (
        <div key={stat.label} style={{
          background: 'var(--mm-surface-1)',
          border: '1px solid var(--mm-border)',
          borderRadius: 'var(--mm-r-xl)',
          padding: '18px 20px',
          boxShadow: 'var(--mm-shadow-sm)',
        }}>
          <p style={{
            margin: '0 0 6px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            color: stat.accent || 'var(--mm-text-4)',
          }}>
            {stat.label}
          </p>
          <p style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            color: stat.accent || 'var(--mm-text-1)',
            lineHeight: 1,
          }}>
            {stat.value}
          </p>
          {stat.caption && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--mm-text-4)', lineHeight: 1.4 }}>
              {stat.caption}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Meta box (label + value pair inside a card) ─────────────── */
export function MetaBox({ label, value, small, accent }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.03)',
      border: '1px solid var(--mm-border)',
      borderRadius: 'var(--mm-r-lg)',
      padding: '10px 12px',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: accent || 'var(--mm-text-4)',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        color: 'var(--mm-text-1)',
        fontSize: small ? 13 : 22,
        fontWeight: small ? 600 : 800,
        lineHeight: small ? 1.4 : 1,
      }}>
        {value}
      </div>
    </div>
  )
}

/* ── Section header (kicker + title + subtitle) ──────────────── */
export function SectionHead({ kicker, title, text, kickerColor = 'var(--mm-brand)', style }) {
  return (
    <div style={{ marginBottom: 18, ...style }}>
      {kicker && (
        <p style={{
          margin: '0 0 6px',
          fontSize: 11,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '.12em',
          color: kickerColor,
        }}>
          {kicker}
        </p>
      )}
      <h2 style={{ margin: '0 0 6px', fontSize: 'clamp(1.3rem,2.5vw,1.8rem)', fontWeight: 800, color: 'var(--mm-text-1)', letterSpacing: '-.02em' }}>
        {title}
      </h2>
      {text && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--mm-text-3)', lineHeight: 1.65, maxWidth: 680 }}>
          {text}
        </p>
      )}
    </div>
  )
}
