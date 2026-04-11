import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = {
  recipient: '/browse',
  restaurant: '/restaurant',
  admin: '/admin',
  partner: '/browse',
}

const missionPillars = [
  {
    title: 'Rescue surplus food',
    text: 'Turn end-of-day inventory into real meals instead of landfill waste.',
  },
  {
    title: 'Match it fast',
    text: 'Give recipients a simple path to discover nearby pickups and reserve them quickly.',
  },
  {
    title: 'Strengthen local care',
    text: 'Help restaurants, neighbors, and administrators coordinate around shared impact.',
  },
]

const impactStats = [
  { label: 'Mission', value: 'Food recovery', accent: '#f97316' },
  { label: 'Who it serves', value: 'Recipients in need', accent: '#22c55e' },
  { label: 'Who contributes', value: 'Restaurants + admins', accent: '#38bdf8' },
]

export default function HomePage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const primaryHref = isAuthenticated ? ROLE_HOME[user?.role] || '/browse' : '/signup'
  const primaryLabel = isAuthenticated ? 'Open Dashboard' : 'Get Started'

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <Link to="/" style={s.brandLink}>
            <div style={s.brand}>
            <img src="/MealMatch Logo.png" alt="MealMatch" style={s.logo} />
            <div>
              <div style={s.brandName}>MealMatch</div>
              <div style={s.brandTag}>Food recovery for stronger communities</div>
            </div>
            </div>
          </Link>

          <div style={s.headerActions}>
            {isAuthenticated ? (
              <button onClick={() => navigate(primaryHref)} style={s.headerPrimary}>
                {primaryLabel}
              </button>
            ) : (
              <>
                <Link to="/login" style={s.headerLink}>Sign In</Link>
                <Link to="/signup" style={s.headerPrimaryLink}>Create Account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={s.main}>
        <section style={s.hero}>
          <div style={s.heroCopy}>
            <div style={s.kicker}>MealMatch Mission</div>
            <h1 style={s.title}>Keep good food moving to people who need it most.</h1>
            <p style={s.subtitle}>
              MealMatch helps restaurants post surplus meals, lets recipients
              discover and reserve pickups, and gives administrators visibility
              into the system-wide impact of every saved listing.
            </p>

            <div style={s.ctaRow}>
              <Link to={primaryHref} style={s.primaryCtaLink}>
                {primaryLabel}
              </Link>
            </div>

            <div style={s.statRow}>
              {impactStats.map((stat) => (
                <div key={stat.label} style={s.statCard}>
                  <div style={s.statLabel}>{stat.label}</div>
                  <div style={{ ...s.statValue, color: stat.accent }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.heroPanel}>
            <div style={s.panelGlow} />
            <div style={s.panelCard}>
              <div style={s.panelHeader}>How MealMatch works</div>
              <div style={s.panelStep}>
                <span style={s.stepNumber}>1</span>
                <div>
                  <div style={s.stepTitle}>Restaurants publish surplus food</div>
                  <div style={s.stepText}>
                    Listings include quantity, timing, location, and dietary details.
                  </div>
                </div>
              </div>
              <div style={s.panelStep}>
                <span style={{ ...s.stepNumber, background: 'rgba(34,197,94,0.14)', color: '#86efac' }}>2</span>
                <div>
                  <div style={s.stepTitle}>Recipients claim what fits their needs</div>
                  <div style={s.stepText}>
                    Clear pickup windows and map-based browsing reduce friction and waste.
                  </div>
                </div>
              </div>
              <div style={s.panelStep}>
                <span style={{ ...s.stepNumber, background: 'rgba(56,189,248,0.14)', color: '#7dd3fc' }}>3</span>
                <div>
                  <div style={s.stepTitle}>Admins track health and impact</div>
                  <div style={s.stepText}>
                    Operations, activity, and recovery metrics stay visible in one place.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={s.storySection}>
          <div style={s.sectionIntro}>
            <div style={s.sectionKicker}>Why it matters</div>
            <h2 style={s.sectionTitle}>A platform built around dignity, urgency, and local coordination.</h2>
            <p style={s.sectionText}>
              The goal is not just logistics. It is making surplus food recovery
              feel trustworthy, fast, and human for every person involved.
            </p>
          </div>

          <div style={s.pillarGrid}>
            {missionPillars.map((pillar) => (
              <article key={pillar.title} style={s.pillarCard}>
                <h3 style={s.pillarTitle}>{pillar.title}</h3>
                <p style={s.pillarText}>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={s.audienceSection}>
          <div style={s.audienceCard}>
            <div style={s.audienceTitle}>For recipients</div>
            <div style={s.audienceText}>
              Browse nearby meals, view timing clearly, and track claims without
              getting lost in clutter.
            </div>
          </div>
          <div style={s.audienceCard}>
            <div style={s.audienceTitle}>For restaurants</div>
            <div style={s.audienceText}>
              Post inventory quickly, manage listing status, and communicate dietary
              needs and pickup windows accurately.
            </div>
          </div>
          <div style={s.audienceCard}>
            <div style={s.audienceTitle}>For admins</div>
            <div style={s.audienceText}>
              Monitor claims, system activity, login verification, and impact metrics
              across the whole network.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background:
      'radial-gradient(circle at top left, rgba(249,115,22,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(34,197,94,0.14), transparent 30%), linear-gradient(180deg, #030712 0%, #0b1120 54%, #111827 100%)',
    color: '#f8fafc',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    background: 'rgba(3,7,18,0.72)',
    borderBottom: '1px solid rgba(148,163,184,0.12)',
  },
  headerInner: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
  },
  brandLink: {
    textDecoration: 'none',
  },
  logo: {
    height: 54,
    borderRadius: 12,
  },
  brandName: {
    fontSize: 21,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#f8fafc',
  },
  brandTag: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.78)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerLink: {
    color: '#cbd5e1',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    padding: '10px 14px',
  },
  headerPrimaryLink: {
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 14,
    padding: '10px 16px',
    borderRadius: 999,
    background: '#f97316',
    boxShadow: '0 14px 28px rgba(249,115,22,0.24)',
  },
  headerPrimary: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    padding: '10px 16px',
    borderRadius: 999,
    background: '#f97316',
    boxShadow: '0 14px 28px rgba(249,115,22,0.24)',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  main: {
    maxWidth: 1240,
    margin: '0 auto',
    padding: '32px 24px 56px',
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
    gap: 24,
    alignItems: 'stretch',
    marginBottom: 32,
  },
  heroCopy: {
    padding: '32px',
    borderRadius: 32,
    background: 'rgba(15,23,42,0.62)',
    border: '1px solid rgba(148,163,184,0.12)',
    boxShadow: '0 32px 80px rgba(2,6,23,0.34)',
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#fdba74',
    marginBottom: 14,
  },
  title: {
    fontSize: 'clamp(2.6rem, 6vw, 4.8rem)',
    lineHeight: 0.96,
    letterSpacing: '-0.05em',
    marginBottom: 18,
    maxWidth: 700,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 1.7,
    color: 'rgba(226,232,240,0.84)',
    maxWidth: 680,
    marginBottom: 24,
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  primaryCtaLink: {
    textDecoration: 'none',
    color: '#fff',
    background: '#f97316',
    padding: '14px 20px',
    borderRadius: 999,
    fontWeight: 800,
    boxShadow: '0 16px 32px rgba(249,115,22,0.26)',
  },
  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  },
  statCard: {
    padding: '16px 18px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(148,163,184,0.1)',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.78)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 8,
    fontWeight: 700,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  heroPanel: {
    position: 'relative',
    display: 'flex',
  },
  panelGlow: {
    position: 'absolute',
    inset: '18px 12px auto auto',
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: 'rgba(56,189,248,0.16)',
    filter: 'blur(40px)',
  },
  panelCard: {
    position: 'relative',
    width: '100%',
    borderRadius: 32,
    padding: '28px',
    background:
      'linear-gradient(180deg, rgba(8,15,30,0.96) 0%, rgba(15,23,42,0.92) 100%)',
    border: '1px solid rgba(148,163,184,0.12)',
    boxShadow: '0 32px 80px rgba(2,6,23,0.38)',
  },
  panelHeader: {
    fontSize: 15,
    fontWeight: 800,
    color: '#e2e8f0',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 18,
  },
  panelStep: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    gap: 14,
    padding: '16px 0',
    borderTop: '1px solid rgba(148,163,184,0.08)',
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(249,115,22,0.14)',
    color: '#fdba74',
    fontWeight: 800,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
  },
  stepText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'rgba(203,213,225,0.76)',
  },
  storySection: {
    marginBottom: 24,
    padding: '28px',
    borderRadius: 28,
    background: 'rgba(15,23,42,0.58)',
    border: '1px solid rgba(148,163,184,0.12)',
  },
  sectionIntro: {
    marginBottom: 18,
    maxWidth: 760,
  },
  sectionKicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#7dd3fc',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
    lineHeight: 1.08,
    letterSpacing: '-0.03em',
    marginBottom: 10,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'rgba(203,213,225,0.78)',
  },
  pillarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
  },
  pillarCard: {
    padding: '22px',
    borderRadius: 22,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(148,163,184,0.1)',
  },
  pillarTitle: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 10,
  },
  pillarText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(203,213,225,0.76)',
  },
  audienceSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
  },
  audienceCard: {
    padding: '22px',
    borderRadius: 22,
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.76) 0%, rgba(2,6,23,0.8) 100%)',
    border: '1px solid rgba(148,163,184,0.1)',
  },
  audienceTitle: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 10,
  },
  audienceText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'rgba(203,213,225,0.76)',
  },
}
