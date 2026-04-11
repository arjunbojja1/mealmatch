import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin' }

const ROLES = [
  { value: 'recipient', label: 'Recipient', desc: 'Browse and claim surplus food' },
  { value: 'restaurant', label: 'Restaurant', desc: 'Post surplus food listings' },
]

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'recipient' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const user = await signup(form.name.trim(), form.email.trim(), form.password, form.role)
      navigate(ROLE_HOME[user.role] || '/browse', { replace: true })
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
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
        <h1 style={s.heading}>Create your account</h1>
        <p style={s.sub}>Join the food recovery network</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Full name</label>
            <input
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
              style={s.input}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              style={s.input}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={handleChange}
              required
              style={s.input}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>I am a…</label>
            <div style={s.roleRow}>
              {ROLES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, role: value }))}
                  style={{
                    ...s.roleCard,
                    ...(form.role === value ? s.roleCardActive : {}),
                  }}
                >
                  <span style={s.roleLabel}>{label}</span>
                  <span style={s.roleDesc}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" disabled={loading} style={s.btn}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={s.footer}>
          Already have an account?{' '}
          <Link to="/login" style={s.link}>Sign in</Link>
        </p>
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
    background: 'radial-gradient(circle at top right, rgba(249,115,22,0.18), transparent 35%), radial-gradient(circle at bottom left, rgba(34,197,94,0.15), transparent 35%), #020817',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    background: 'rgba(15,23,42,0.88)',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: 28,
    padding: '36px 32px',
    boxShadow: '0 32px 80px rgba(2,6,23,0.6)',
    backdropFilter: 'blur(20px)',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
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
  roleRow: { display: 'flex', gap: 12 },
  roleCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 12px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, background 0.15s',
  },
  roleCardActive: {
    border: '1px solid rgba(249,115,22,0.5)',
    background: 'rgba(249,115,22,0.1)',
  },
  roleLabel: { fontSize: 14, fontWeight: 700, color: '#f8fafc' },
  roleDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.4 },
  errorBox: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: '11px 14px',
    color: '#fca5a5',
    fontSize: 14,
  },
  btn: {
    background: 'linear-gradient(135deg, #22c55e, #f97316)',
    border: 'none',
    borderRadius: 14,
    padding: '14px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 14px 28px rgba(34,197,94,0.22)',
  },
  footer: { marginTop: 20, textAlign: 'center', color: '#64748b', fontSize: 14 },
  link: { color: '#f97316', textDecoration: 'none', fontWeight: 600 },
}
