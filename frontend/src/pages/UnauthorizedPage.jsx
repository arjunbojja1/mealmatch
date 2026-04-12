import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = { recipient: '/browse', restaurant: '/restaurant', admin: '/admin' }

export default function UnauthorizedPage() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--mm-bg)',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: '100%',
        background: 'var(--mm-surface-1)',
        border: '1px solid var(--mm-border)',
        borderRadius: 'var(--mm-r-3xl)',
        padding: '52px 44px',
        textAlign: 'center',
        boxShadow: 'var(--mm-shadow-lg)',
        animation: 'mm-grow-in .28s var(--mm-ease) both',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'var(--mm-error-dim)',
          border: '1px solid var(--mm-error-ring)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: 32,
        }} aria-hidden="true">
          🔒
        </div>

        <h1 style={{ margin: '0 0 12px', fontSize: '1.75rem', fontWeight: 800, color: 'var(--mm-text-1)', letterSpacing: '-.035em' }}>
          Access restricted
        </h1>

        <p style={{ margin: '0 0 10px', color: 'var(--mm-text-3)', fontSize: '.9375rem', lineHeight: 1.65 }}>
          Your role{' '}
          <strong style={{ color: 'var(--mm-brand)', fontWeight: 700 }}>
            {user?.role || 'unknown'}
          </strong>{' '}
          doesn&apos;t have permission to view this page.
        </p>
        <p style={{ margin: '0 0 36px', color: 'var(--mm-text-4)', fontSize: '.875rem', lineHeight: 1.6 }}>
          You can return to your dashboard or sign in with a different account.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => navigate(ROLE_HOME[user?.role] || '/browse', { replace: true })}
            className="mm-btn mm-btn-primary mm-btn-full"
            style={{ padding: '13px', fontSize: '.9375rem', borderRadius: 'var(--mm-r-xl)' }}
          >
            Go to my dashboard
          </button>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }) }}
            className="mm-btn mm-btn-ghost mm-btn-full"
            style={{ borderRadius: 'var(--mm-r-xl)' }}
          >
            Sign in as a different user
          </button>
        </div>
      </div>
    </div>
  )
}
