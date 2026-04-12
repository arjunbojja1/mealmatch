import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin', partner: '/partner' }

const ROLES = [
  {
    value: 'recipient',
    label: 'Recipient',
    desc: 'Browse and claim surplus food listings',
    icon: '🥗',
    accent: '#16A34A',
    bg: 'rgba(22,163,74,.08)',
  },
  {
    value: 'restaurant',
    label: 'Restaurant',
    desc: 'Post surplus food for your community',
    icon: '🍽️',
    accent: '#2563EB',
    bg: 'rgba(37,99,235,.08)',
  },
  {
    value: 'partner',
    label: 'Partner',
    desc: 'Coordinate bulk pickups for your organization',
    icon: '🤝',
    accent: '#7C3AED',
    bg: 'rgba(124,58,237,.08)',
  },
]

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'recipient',
    ebt_card_number: '', ebt_pin: '',
  })
  const [error,   setError]   = useState('')
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
      const user = await signup(
        form.name.trim(), form.email.trim(), form.password, form.role,
        { ebtCardNumber: form.ebt_card_number.trim(), ebtPin: form.ebt_pin.trim() },
      )
      navigate(ROLE_HOME[user.role] || '/browse', { replace: true })
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--mm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 500, animation: 'mm-grow-in .28s var(--mm-ease) both' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <img src="/MealMatch Logo.png" alt="" style={{ height: 66, borderRadius: 14 }} />
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--mm-text-1)', letterSpacing: '-.025em' }}>MealMatch</span>
          </Link>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-.04em', color: 'var(--mm-text-1)', marginBottom: 8 }}>
            Create your account
          </h1>
          <p style={{ color: 'var(--mm-text-3)', fontSize: '.9375rem' }}>
            Join the local food recovery network
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--mm-surface-1)',
          border: '1px solid var(--mm-border)',
          borderRadius: 'var(--mm-r-3xl)',
          padding: '36px 36px',
          boxShadow: 'var(--mm-shadow-lg)',
        }}>
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Name */}
            <div>
              <label className="mm-field-label" htmlFor="su-name">Full name</label>
              <input id="su-name" name="name" type="text" autoComplete="name"
                placeholder="Your name" value={form.name} onChange={handleChange}
                required className="mm-input" />
            </div>

            {/* Email */}
            <div>
              <label className="mm-field-label" htmlFor="su-email">Email address</label>
              <input id="su-email" name="email" type="email" autoComplete="email"
                placeholder="you@example.com" value={form.email} onChange={handleChange}
                required className="mm-input" />
            </div>

            {/* Password */}
            <div>
              <label className="mm-field-label" htmlFor="su-pw">Password</label>
              <input id="su-pw" name="password" type="password" autoComplete="new-password"
                placeholder="At least 8 characters" value={form.password} onChange={handleChange}
                required className="mm-input" />
            </div>

            {/* Role selector */}
            <div>
              <label className="mm-field-label" style={{ marginBottom: 10 }}>I am a…</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {ROLES.map(({ value, label, desc, icon, accent, bg }) => {
                  const active = form.role === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, role: value }))}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '14px 14px', borderRadius: 'var(--mm-r-lg)',
                        border: active ? `1.5px solid ${accent}` : '1.5px solid var(--mm-border-md)',
                        background: active ? bg : 'var(--mm-surface-2)',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'border-color var(--mm-dur), background var(--mm-dur)',
                      }}
                      aria-pressed={active}
                    >
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <span style={{ fontSize: '.875rem', fontWeight: 700, color: active ? accent : 'var(--mm-text-1)' }}>{label}</span>
                      <span style={{ fontSize: '.75rem', color: 'var(--mm-text-3)', lineHeight: 1.4 }}>{desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* EBT for recipients */}
            {form.role === 'recipient' && (
              <div className="mm-ebt-box">
                <p className="mm-ebt-title">Recipient eligibility check</p>
                <p className="mm-ebt-text">This demo requires a simulated EBT card number and PIN.</p>
                <div>
                  <label className="mm-field-label" htmlFor="su-ebt">EBT card number</label>
                  <input id="su-ebt" name="ebt_card_number" type="text" inputMode="numeric"
                    placeholder="6001 0000 0000 2202"
                    value={form.ebt_card_number} onChange={handleChange}
                    required className="mm-input" />
                </div>
                <div>
                  <label className="mm-field-label" htmlFor="su-pin">EBT PIN</label>
                  <input id="su-pin" name="ebt_pin" type="password" inputMode="numeric"
                    placeholder="4-digit PIN"
                    value={form.ebt_pin} onChange={handleChange}
                    required className="mm-input" />
                </div>
                <p style={{ margin: 0, fontSize: '.75rem', color: 'var(--mm-text-4)', lineHeight: 1.55 }}>
                  Try: alex.recipient@mealmatch.dev · card ending 2202 · PIN 1357
                </p>
              </div>
            )}

            {error && (
              <div className="mm-alert mm-alert-error" role="alert">{error}</div>
            )}

            <button
              type="submit" disabled={loading}
              className="mm-btn mm-btn-primary mm-btn-full"
              style={{ padding: '13px', fontSize: '.9375rem', borderRadius: 'var(--mm-r-xl)', marginTop: 4 }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--mm-text-4)', fontSize: '.875rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--mm-brand)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
