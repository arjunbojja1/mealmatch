import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin' }

export default function UnauthorizedPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleGoHome() {
    navigate(ROLE_HOME[user?.role] || '/browse', { replace: true })
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.icon}>⛔</div>
        <h1 style={s.heading}>Access denied</h1>
        <p style={s.text}>
          Your role <strong style={s.role}>{user?.role || 'unknown'}</strong> does not have
          permission to view this page.
        </p>
        <div style={s.actions}>
          <button onClick={handleGoHome} style={s.homeBtn}>
            Go to my dashboard
          </button>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }) }}
            style={s.logoutBtn}
          >
            Sign in as a different user
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#020817',
    padding: 24,
  },
  card: {
    maxWidth: 420,
    width: '100%',
    background: 'rgba(15,23,42,0.88)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 28,
    padding: '48px 36px',
    textAlign: 'center',
    boxShadow: '0 32px 80px rgba(2,6,23,0.5)',
  },
  icon: { fontSize: 52, marginBottom: 20 },
  heading: { margin: '0 0 12px', fontSize: 28, fontWeight: 800, color: '#f8fafc' },
  text: { margin: '0 0 32px', color: '#94a3b8', fontSize: 16, lineHeight: 1.6 },
  role: { color: '#fb923c' },
  actions: { display: 'flex', flexDirection: 'column', gap: 12 },
  homeBtn: {
    padding: '13px 20px',
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #22c55e)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  logoutBtn: {
    padding: '13px 20px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.2)',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
