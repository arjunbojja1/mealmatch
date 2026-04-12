import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin', partner: '/browse' }

const DEMO_USERS = [
  { label: 'Admin',      email: 'admin@mealmatch.dev',      pw: 'Admin1234!' },
  { label: 'Restaurant', email: 'restaurant@mealmatch.dev', pw: 'Restaurant1!' },
  { label: 'Recipient',  email: 'recipient@mealmatch.dev',  pw: 'Recipient1!', ebtCard: '6001000000001201', ebtPin: '2468' },
]

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [ebtCard,     setEbtCard]     = useState('')
  const [ebtPin,      setEbtPin]      = useState('')
  const [requiresEbt, setRequiresEbt] = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const options = requiresEbt ? { ebtCardNumber: ebtCard.trim(), ebtPin: ebtPin.trim() } : {}
      const user = await login(email.trim(), password, options)
      const intended = location.state?.from?.pathname
      navigate(intended || ROLE_HOME[user.role] || '/browse', { replace: true })
    } catch (err) {
      if (err.code === 'EBT_VERIFICATION_REQUIRED') {
        setRequiresEbt(true)
        setError('This account requires EBT verification. Enter your card number and PIN below.')
      } else {
        setError(err.message || 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function fillDemo({ email: e, pw, ebtCard: card = '', ebtPin: pin = '' }) {
    setEmail(e)
    setPassword(pw)
    if (card) { setEbtCard(card); setEbtPin(pin); setRequiresEbt(true) }
    else      { setEbtCard(''); setEbtPin(''); setRequiresEbt(false) }
    setError('')
  }

  return (
    <div style={{ minHeight: '100svh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--mm-bg)' }}>
      {/* ── Left panel — brand ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 56px',
          background: 'linear-gradient(145deg, #F0FDF4 0%, #DCFCE7 50%, #BBF7D0 100%)',
          borderRight: '1px solid var(--mm-border)',
        }}
        className="mm-hide-mobile"
        aria-hidden="true"
      >
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <img src="/MealMatch Logo.png" alt="" style={{ height: 72, borderRadius: 16 }} />
          <span style={{ fontSize: 26, fontWeight: 800, color: '#1C1C1E', letterSpacing: '-.025em' }}>MealMatch</span>
        </Link>
        <div>
          <p style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: '#16A34A', marginBottom: 12 }}>
            Local food recovery
          </p>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05, color: '#1C1C1E', marginBottom: 16 }}>
            Good food,<br />close to home.
          </h2>
          <p style={{ color: '#636366', lineHeight: 1.7, fontSize: '.9375rem', maxWidth: 380 }}>
            Connect with surplus meals from local restaurants. Claim what you need and pick it up on your schedule.
          </p>
        </div>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: '🥗', text: 'Browse nearby listings on a live map' },
            { icon: '⏱️', text: 'Claim with a single tap — slots confirmed instantly' },
            { icon: '📋', text: 'Track all your reservations in My Claims' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(22,163,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: '.8125rem', color: '#3A3A3C', fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400, animation: 'mm-grow-in .28s var(--mm-ease) both' }}>

          {/* Mobile logo */}
          <div className="mm-show-mobile" style={{ alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <img src="/MealMatch Logo.png" alt="" style={{ height: 54, borderRadius: 12 }} />
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--mm-text-1)', letterSpacing: '-.025em' }}>MealMatch</span>
          </div>

          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-.04em', color: 'var(--mm-text-1)', marginBottom: 8 }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--mm-text-3)', fontSize: '.9375rem', marginBottom: 32 }}>
            Sign in to continue
          </p>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="mm-field-label" htmlFor="login-email">Email address</label>
              <input
                id="login-email" type="email" autoComplete="email"
                placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required className="mm-input"
              />
            </div>

            <div>
              <label className="mm-field-label" htmlFor="login-pw">Password</label>
              <input
                id="login-pw" type="password" autoComplete="current-password"
                placeholder="Your password"
                value={password} onChange={e => setPassword(e.target.value)}
                required className="mm-input"
              />
            </div>

            {requiresEbt && (
              <div className="mm-ebt-box">
                <p className="mm-ebt-title">EBT verification required</p>
                <p className="mm-ebt-text">Recipients must verify eligibility with EBT card number and PIN.</p>
                <div>
                  <label className="mm-field-label" htmlFor="login-ebt">EBT card number</label>
                  <input
                    id="login-ebt" type="text" inputMode="numeric"
                    placeholder="6001 0000 0000 1201"
                    value={ebtCard} onChange={e => setEbtCard(e.target.value)}
                    className="mm-input" autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mm-field-label" htmlFor="login-ebt-pin">EBT PIN</label>
                  <input
                    id="login-ebt-pin" type="password" inputMode="numeric"
                    placeholder="4-digit PIN"
                    value={ebtPin} onChange={e => setEbtPin(e.target.value)}
                    className="mm-input" autoComplete="off"
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                className={`mm-alert ${requiresEbt && error.includes('EBT') ? 'mm-alert-warning' : 'mm-alert-error'}`}
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="mm-btn mm-btn-primary mm-btn-full"
              style={{ padding: '13px', fontSize: '.9375rem', borderRadius: 'var(--mm-r-xl)', marginTop: 4 }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--mm-text-4)', fontSize: '.875rem' }}>
            No account?{' '}
            <Link to="/signup" style={{ color: 'var(--mm-brand)', fontWeight: 600, textDecoration: 'none' }}>
              Create one free
            </Link>
          </p>

          {/* Demo shortcuts */}
          <div style={{
            marginTop: 32, padding: '16px 18px',
            background: 'var(--mm-surface-2)',
            border: '1px solid var(--mm-border)',
            borderRadius: 'var(--mm-r-xl)',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: '.6875rem', fontWeight: 700, color: 'var(--mm-text-4)', textTransform: 'uppercase', letterSpacing: '.10em' }}>
              Demo credentials
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.label}
                  type="button"
                  className="mm-btn mm-btn-ghost mm-btn-sm"
                  onClick={() => fillDemo(demo)}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
