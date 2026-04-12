/**
 * PageLayout — consistent page wrapper with optional hero section.
 */
export function PageLayout({ children, style }) {
  return (
    <div className="mm-page-wrap" style={style}>
      {children}
    </div>
  )
}

export function PageHero({ eyebrow, title, subtitle, actions, stats }) {
  return (
    <div className="mm-page-hero">
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <p className="mm-page-hero-eyebrow">{eyebrow}</p>}
        {title && <h1 className="mm-page-hero-title">{title}</h1>}
        {subtitle && <p className="mm-page-hero-subtitle">{subtitle}</p>}
        {actions && <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          {stats.map(({ num, label, accent }) => (
            <div key={label} className="mm-page-hero-stat">
              <div className="mm-page-hero-stat-num" style={accent ? { color: accent } : {}}>
                {num}
              </div>
              <div className="mm-page-hero-stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SectionHeader({ kicker, title, text, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {kicker && <p className="mm-section-kicker">{kicker}</p>}
      {title  && <h2 className="mm-section-title">{title}</h2>}
      {text   && <p  className="mm-section-text">{text}</p>}
      {children}
    </div>
  )
}
