import { useEffect, useState } from 'react'
import { getApiBaseUrl, getHealth, getHello, postEcho } from './api/client'
import RestaurantDashboard from './RestaurantDashboard'
import './App.css'

function App() {
  const apiBaseUrl = getApiBaseUrl()
  const [apiMessage, setApiMessage] = useState('Checking backend...')
  const [backendHealthy, setBackendHealthy] = useState(false)
  const [echoInput, setEchoInput] = useState('hello')
  const [echoResult, setEchoResult] = useState('')
  const [echoError, setEchoError] = useState('')

  async function checkBackend() {
    try {
      const [health, hello] = await Promise.all([getHealth(), getHello()])
      setApiMessage(`${hello.message} • ${health.status}`)
      setBackendHealthy(true)
    } catch {
      setApiMessage(`Backend unavailable at ${getApiBaseUrl()}`)
      setBackendHealthy(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      checkBackend()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  async function sendEcho() {
    const text = echoInput.trim()

    if (!text) {
      setEchoError('Enter text before sending.')
      setEchoResult('')
      return
    }

    try {
      const data = await postEcho(text)
      setEchoResult(`${data.echoed_text} (${data.length} chars)`)
      setEchoError('')
    } catch {
      setEchoError('Echo request failed. Check backend server.')
      setEchoResult('')
    }
  }

  return (
    <div style={styles.appShell}>
      <header style={styles.topbar}>
        <div>
          <p style={styles.brandKicker}>Bitcamp 2026 • MealMatch</p>
          <h1 style={styles.brandTitle}>Restaurant Operations Portal</h1>
          <p style={styles.brandSubtitle}>
            Manage surplus food listings, monitor backend health, and demo your product in one place.
          </p>
        </div>

        <div style={styles.topbarRight}>
          <div
            style={{
              ...styles.statusPill,
              ...(backendHealthy ? styles.statusHealthy : styles.statusOffline),
            }}
          >
            <span style={styles.statusDot} />
            {backendHealthy ? 'Backend Connected' : 'Backend Offline'}
          </div>

          <a
            href={`${apiBaseUrl}/docs`}
            target="_blank"
            rel="noreferrer"
            style={styles.primaryLink}
          >
            Open API Docs
          </a>
        </div>
      </header>

      <main style={styles.mainLayout}>
        <section style={styles.dashboardPanel}>
          <RestaurantDashboard />
        </section>

        <aside style={styles.sidePanel}>
          <div style={styles.devCard}>
            <h2 style={styles.cardTitle}>System Status</h2>
            <p style={styles.cardText}>{apiMessage}</p>
            <p style={styles.mutedLabel}>API Base URL</p>
            <code style={styles.codeBlock}>{apiBaseUrl}</code>

            <button style={styles.actionButton} onClick={checkBackend}>
              Refresh Status
            </button>
          </div>

          <div style={styles.devCard}>
            <h2 style={styles.cardTitle}>Echo Test</h2>
            <p style={styles.cardText}>
              Quick backend check for request and response flow.
            </p>

            <input
              style={styles.input}
              type="text"
              value={echoInput}
              onChange={(event) => setEchoInput(event.target.value)}
              placeholder="Type text"
            />

            <button style={styles.actionButton} onClick={sendEcho}>
              Send Echo
            </button>

            {echoResult ? <p style={styles.successText}>Response: {echoResult}</p> : null}
            {echoError ? <p style={styles.errorText}>{echoError}</p> : null}
          </div>

          <div style={styles.devCard}>
            <h2 style={styles.cardTitle}>Hackathon Focus</h2>
            <ul style={styles.list}>
              <li>Restaurant listing creation</li>
              <li>Real-time active listing visibility</li>
              <li>Clean API integration for demo day</li>
              <li>Fast, simple operations workflow</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}

const styles = {
  appShell: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #111827 20%, #f8fafc 20%, #eef2ff 100%)',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#0f172a',
  },
  topbar: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '32px 24px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
    flexWrap: 'wrap',
  },
  brandKicker: {
    margin: '0 0 8px 0',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '12px',
    fontWeight: 700,
  },
  brandTitle: {
    margin: '0 0 10px 0',
    color: '#ffffff',
    fontSize: '38px',
    lineHeight: 1.1,
    fontWeight: 800,
  },
  brandSubtitle: {
    margin: 0,
    color: 'rgba(255,255,255,0.82)',
    maxWidth: '760px',
    fontSize: '16px',
    lineHeight: 1.6,
  },
  topbarRight: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: 700,
  },
  statusHealthy: {
    background: 'rgba(34,197,94,0.16)',
    color: '#dcfce7',
    border: '1px solid rgba(34,197,94,0.28)',
  },
  statusOffline: {
    background: 'rgba(239,68,68,0.16)',
    color: '#fee2e2',
    border: '1px solid rgba(239,68,68,0.28)',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: 'currentColor',
  },
  primaryLink: {
    textDecoration: 'none',
    background: '#ffffff',
    color: '#0f172a',
    padding: '10px 14px',
    borderRadius: '12px',
    fontWeight: 700,
    fontSize: '14px',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
  },
  mainLayout: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 24px 32px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: '24px',
    alignItems: 'start',
  },
  dashboardPanel: {
    minWidth: 0,
  },
  sidePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    position: 'sticky',
    top: '20px',
  },
  devCard: {
    background: 'rgba(255,255,255,0.88)',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
    backdropFilter: 'blur(10px)',
  },
  cardTitle: {
    margin: '0 0 10px 0',
    fontSize: '20px',
    fontWeight: 700,
  },
  cardText: {
    margin: '0 0 14px 0',
    color: '#475569',
    lineHeight: 1.6,
    fontSize: '14px',
  },
  mutedLabel: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#64748b',
  },
  codeBlock: {
    display: 'block',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '13px',
    marginBottom: '14px',
    wordBreak: 'break-all',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #dbe3ef',
    background: '#f8fafc',
    fontSize: '14px',
    marginBottom: '12px',
  },
  actionButton: {
    width: '100%',
    padding: '12px 14px',
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.22)',
  },
  successText: {
    marginTop: '12px',
    marginBottom: 0,
    color: '#166534',
    fontSize: '14px',
  },
  errorText: {
    marginTop: '12px',
    marginBottom: 0,
    color: '#b91c1c',
    fontSize: '14px',
  },
  list: {
    margin: 0,
    paddingLeft: '18px',
    color: '#475569',
    lineHeight: 1.8,
    fontSize: '14px',
  },
}

export default App