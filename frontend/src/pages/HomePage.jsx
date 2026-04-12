import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = {
  recipient:  '/browse',
  restaurant: '/restaurant',
  admin:      '/admin',
  partner:    '/browse',
}

const HOW_IT_WORKS = [
  {
    num: '1',
    title: 'Restaurants post surplus',
    text: 'Listing includes quantity, timing, location, and dietary notes.',
    bg: 'rgba(22,163,74,.10)',
    color: '#15803D',
  },
  {
    num: '2',
    title: 'Recipients claim what fits',
    text: 'Pickup windows and map-based browsing reduce friction.',
    bg: 'rgba(37,99,235,.10)',
    color: '#1D4ED8',
  },
  {
    num: '3',
    title: 'Admins track impact',
    text: 'Operations, activity, and recovery metrics in one place.',
    bg: 'rgba(124,58,237,.10)',
    color: '#6D28D9',
  },
]

const PILLARS = [
  { title: 'Rescue surplus food',    text: 'Turn end-of-day inventory into real meals instead of waste.' },
  { title: 'Match it fast',          text: 'Simple discovery and claim flow for every recipient.' },
  { title: 'Strengthen local care',  text: 'Restaurants, neighbors, and admins coordinating around impact.' },
]

const AUDIENCE = [
  {
    role: 'Recipients',
    title: 'Find meals near you',
    text: 'Browse nearby surplus food, view timing, and track your reservations.',
  },
  {
    role: 'Restaurants',
    title: 'Post your surplus',
    text: 'Publish inventory fast, manage status, and communicate pickup windows.',
  },
  {
    role: 'Admins',
    title: 'Oversee the network',
    text: 'Monitor claims, activity, login verification, and impact metrics.',
  },
]

export default function HomePage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const primaryHref  = isAuthenticated ? ROLE_HOME[user?.role] || '/browse' : '/signup'
  const primaryLabel = isAuthenticated ? 'Open Dashboard' : 'Get Started Free'

  return (
    <div className="mm-home-page">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="mm-home-nav">
        <div className="mm-home-nav-inner">
          <Link to="/" className="mm-home-brand-link" aria-label="MealMatch home">
            <img src="/MealMatch Logo.png" alt="" className="mm-home-brand-logo" />
            <span className="mm-home-brand-name">MealMatch</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAuthenticated ? (
              <button onClick={() => navigate(primaryHref)} className="mm-btn mm-btn-primary mm-btn-sm">
                {primaryLabel}
              </button>
            ) : (
              <>
                <Link to="/login" style={{ color: 'rgba(241,245,249,.88)', textDecoration: 'none', fontWeight: 600, fontSize: '.875rem', padding: '8px 12px' }}>
                  Sign In
                </Link>
                <Link to="/signup" className="mm-btn mm-btn-primary mm-btn-sm" style={{ textDecoration: 'none' }}>
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mm-home-main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mm-hero-grid">
          <div className="mm-hero-copy">
            <div className="mm-hero-kicker">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', display: 'inline-block', animation: 'mm-pulse 2s infinite' }} />
              Live food recovery network
            </div>

            <h1 className="mm-hero-title">
              Less waste.<br />
              <span style={{ color: 'var(--mm-brand)' }}>More meals.</span>
            </h1>

            <p className="mm-hero-subtitle">
              MealMatch connects restaurants with surplus food to the people who need it
              fast, transparent, and built for everyone.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to={primaryHref} className="mm-btn mm-btn-primary mm-btn-lg" style={{ textDecoration: 'none' }}>
                {primaryLabel}
              </Link>
              {!isAuthenticated && (
                <Link to="/login" className="mm-btn mm-btn-secondary mm-btn-lg" style={{ textDecoration: 'none' }}>
                  Sign in
                </Link>
              )}
            </div>
          </div>

          {/* How it works panel */}
          <div className="mm-hero-panel">
            <p className="mm-hero-panel-title">How it works</p>
            {HOW_IT_WORKS.map((step) => (
              <div key={step.num} className="mm-hero-step">
                <span
                  className="mm-hero-step-num"
                  style={{ background: step.bg, color: step.color }}
                >
                  {step.num}
                </span>
                <div>
                  <div className="mm-hero-step-title">{step.title}</div>
                  <div className="mm-hero-step-text">{step.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Mission pillars ───────────────────────────────────────────── */}
        <section className="mm-home-section">
          <div className="mm-home-section-intro">
            <p style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mm-brand)', margin: '0 0 10px' }}>
              Why it matters
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.05, margin: '0 0 14px', color: 'var(--mm-text-1)' }}>
              A platform built around dignity, urgency, and local coordination.
            </h2>
            <p style={{ fontSize: '.9375rem', color: 'var(--mm-text-3)', lineHeight: 1.7, margin: 0 }}>
              Not just logistics making surplus food recovery feel trustworthy,
              fast, and human for every role.
            </p>
          </div>
          <div className="mm-home-pillars">
            {PILLARS.map((p) => (
              <div key={p.title} className="mm-home-pillar">
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--mm-brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontSize: 16 }}>
                  🌱
                </div>
                <p className="mm-home-pillar-title">{p.title}</p>
                <p className="mm-home-pillar-text">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Audience ──────────────────────────────────────────────────── */}
        <section className="mm-home-section" style={{ paddingBottom: 0 }}>
          <div className="mm-home-section-intro">
            <p style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--mm-info)', margin: '0 0 10px' }}>
              Who uses MealMatch
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.05, margin: 0, color: 'var(--mm-text-1)' }}>
              Built for every role in the network.
            </h2>
          </div>
          <div className="mm-home-audience">
            {AUDIENCE.map((a) => (
              <div key={a.role} className="mm-home-audience-card">
                <p className="mm-home-audience-role">{a.role}</p>
                <p className="mm-home-audience-title">{a.title}</p>
                <p className="mm-home-audience-text">{a.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA footer ────────────────────────────────────────────────── */}
        {!isAuthenticated && (
          <section style={{ padding: '56px 0 0', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
              gap: 20, padding: '48px 52px',
              background: 'var(--mm-surface-1)',
              border: '1px solid var(--mm-border)',
              borderRadius: 'var(--mm-r-3xl)',
              boxShadow: 'var(--mm-shadow-md)',
              maxWidth: 520, width: '100%',
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--mm-brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                🍽️
              </div>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 10px' }}>Ready to help?</h3>
                <p style={{ color: 'var(--mm-text-3)', lineHeight: 1.65, margin: 0, fontSize: '.9375rem' }}>
                  Join the local food recovery network today.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link to="/signup" className="mm-btn mm-btn-primary mm-btn-lg" style={{ textDecoration: 'none' }}>
                  Create free account
                </Link>
                <Link to="/login" className="mm-btn mm-btn-secondary mm-btn-lg" style={{ textDecoration: 'none' }}>
                  Sign in
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
