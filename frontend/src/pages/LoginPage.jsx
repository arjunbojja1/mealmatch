import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin', partner: '/browse' }

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email.trim(), password)
      const intended = location.state?.from?.pathname
      navigate(intended || ROLE_HOME[user.role] || '/browse', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoRow}>
          <img src="/MealMatch Logo.png" alt="MealMatch" style={s.logo} />
          <span style={s.brand}>MealMatch</span>
        </div>
        <h1 style={s.heading}>Welcome back</h1>
        <p style={s.sub}>Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={s.input}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={s.input}
            />
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" disabled={loading} style={s.btn}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={s.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/signup" style={s.link}>Create one</Link>
        </p>

        <div style={s.demoBox}>
          <p style={s.demoTitle}>Demo credentials</p>
          {[
            { label: 'Admin', email: 'admin@mealmatch.dev', pw: 'Admin1234!' },
            { label: 'Restaurant', email: 'restaurant@mealmatch.dev', pw: 'Restaurant1!' },
            { label: 'Recipient', email: 'recipient@mealmatch.dev', pw: 'Recipient1!' },
          ].map(({ label, email: e, pw }) => (
            <button
              key={label}
              type="button"
              style={s.demoBtn}
              onClick={() => {
                setEmail(e)
                setPassword(pw)
              }}
            >
              {label}
            </button>
          ))}
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
    background: 'radial-gradient(circle at top left, rgba(34,197,94,0.15), transparent 35%), radial-gradient(circle at bottom right, rgba(249,115,22,0.2), transparent 35%), #020817',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'rgba(15,23,42,0.88)',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: 28,
    padding: '36px 32px',
    boxShadow: '0 32px 80px rgba(2,6,23,0.6)',
    backdropFilter: 'blur(20px)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logo: { height: 36, borderRadius: 8 },
  brand: { fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' },
  heading: { margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#f8fafc' },
  sub: { margin: '0 0 28px', color: '#94a3b8', fontSize: 15 },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  field: { display: 'flex', flexDirection: 'column', gap: 7 },
  label: { fontSize: 13, fontWeight: 600, color: '#cbd5e1' },
  input: {
    background: 'rgba(2,6,23,0.6)',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 14,
    padding: '13px 16px',
    color: '#f8fafc',
    fontSize: 15,
    outline: 'none',
    fontFamily: 'inherit',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: '11px 14px',
    color: '#fca5a5',
    fontSize: 14,
  },
  btn: {
    background: '#f97316',
    border: 'none',
    borderRadius: 14,
    padding: '14px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 14px 28px rgba(249,115,22,0.28)',
  },
  footer: { marginTop: 20, textAlign: 'center', color: '#64748b', fontSize: 14 },
  link: { color: '#f97316', textDecoration: 'none', fontWeight: 600 },
  demoBox: {
    marginTop: 24,
    padding: '14px 16px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(148,163,184,0.1)',
  },
  demoTitle: { margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' },
  demoBtn: {
    display: 'inline-block',
    marginRight: 8,
    marginBottom: 4,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid rgba(249,115,22,0.25)',
    background: 'rgba(249,115,22,0.08)',
    color: '#fb923c',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
