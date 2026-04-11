import { useEffect, useState } from 'react'
import { getApiBaseUrl, getHealth } from './api/client'
import RestaurantDashboard from './RestaurantDashboard'
import './App.css'
import RecipientFeed from "./components/RecipientFeed";

function App() {
  const [backendHealthy, setBackendHealthy] = useState(null)
  const [activeTab, setActiveTab] = useState('browse')

  useEffect(() => {
    getHealth()
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false))
  }, [])

  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <span style={styles.brandEmoji}>🍽</span>
            <div>
              <span style={styles.brandName}>MealMatch</span>
              <span style={styles.brandTagline}>Connecting communities through food</span>
            </div>
          </div>

          <nav style={styles.tabNav}>
            <button
              onClick={() => setActiveTab('browse')}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'browse' ? styles.tabBtnActive : {}),
              }}
            >
              Browse Food
            </button>
            <button
              onClick={() => setActiveTab('restaurant')}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'restaurant' ? styles.tabBtnActive : {}),
              }}
            >
              Restaurant Portal
            </button>
          </nav>

          <div style={styles.statusPill}>
            <span
              style={{
                ...styles.statusDot,
                background:
                  backendHealthy === null
                    ? '#94a3b8'
                    : backendHealthy
                    ? '#22c55e'
                    : '#ef4444',
              }}
            />
            <span style={styles.statusText}>
              {backendHealthy === null
                ? 'Checking...'
                : backendHealthy
                ? 'Live'
                : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {activeTab === 'browse' ? <RecipientFeed /> : <RestaurantDashboard />}
      </main>
    </div>
  )
}

const styles = {
  appShell: {
    minHeight: '100svh',
    display: 'flex',
    flexDirection: 'column',
    background: '#020817',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    height: '64px',
    background: 'rgba(2,8,23,0.82)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(148,163,184,0.12)',
  },
  headerInner: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 24px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  brandEmoji: {
    fontSize: '26px',
    lineHeight: 1,
  },
  brandName: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 800,
    color: '#f1f5f9',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  brandTagline: {
    display: 'block',
    fontSize: '11px',
    color: 'rgba(148,163,184,0.7)',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },
  tabNav: {
    display: 'flex',
    gap: '4px',
    flex: 1,
    justifyContent: 'center',
  },
  tabBtn: {
    padding: '8px 18px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(148,163,184,0.7)',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'inherit',
  },
  tabBtnActive: {
    background: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 14px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(148,163,184,0.14)',
    flexShrink: 0,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#cbd5e1',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
}

export default App