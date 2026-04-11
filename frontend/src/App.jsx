import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import HomePage from './pages/HomePage'

import RecipientFeed from './components/RecipientFeed'
import RestaurantDashboard from './RestaurantDashboard'
import AdminDashboard from './AdminDashboard'
import MyClaimsPage from './pages/MyClaimsPage'
import PartnerPage from './pages/PartnerPage'

import { getHealth } from './api/client'
import './App.css'

// ---------------------------------------------------------------------------
// Authenticated app shell (header + outlet)
// ---------------------------------------------------------------------------
function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [backendHealthy, setBackendHealthy] = useState(null)

  useEffect(() => {
    getHealth()
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false))
  }, [])

  // Build tab list based on role
  const allTabs = [
    { key: 'browse',     label: 'Browse Food',       path: '/browse',      roles: ['recipient', 'admin'] },
    { key: 'my-claims',  label: 'My Claims',          path: '/my-claims',   roles: ['recipient'] },
    { key: 'restaurant', label: 'Restaurant Portal',  path: '/restaurant',  roles: ['restaurant', 'admin'] },
    { key: 'admin',      label: 'Admin',              path: '/admin',       roles: ['admin'] },
    { key: 'partner',    label: 'Partner Portal',     path: '/partner',     roles: ['partner', 'admin'] },
  ]
  const visibleTabs = allTabs.filter(t => t.roles.includes(user?.role))
  const activeKey = visibleTabs.find(t => location.pathname.startsWith(t.path))?.key

  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          {/* Brand */}
          <div style={styles.brand}>
            <img src="/MealMatch Logo.png" alt="MealMatch" style={styles.logo} />
            <div>
              <span style={styles.brandName}>MealMatch</span>
              <span style={styles.brandTagline}>Connecting communities through food</span>
            </div>
          </div>

          {/* Tab nav */}
          <nav style={styles.tabNav}>
            {visibleTabs.map(({ key, label, path }) => (
              <button
                key={key}
                onClick={() => navigate(path)}
                style={{
                  ...styles.tabBtn,
                  ...(activeKey === key ? styles.tabBtnActive : {}),
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Right section: user pill + status */}
          <div style={styles.rightSection}>
            <div style={styles.userPill}>
              <span style={{ ...styles.roleDot, background: roleColor(user?.role) }} />
              <span style={styles.userName}>{user?.name || 'User'}</span>
              <span style={styles.roleTag}>{user?.role}</span>
              <button
                onClick={() => { logout(); navigate('/login', { replace: true }) }}
                style={styles.logoutBtn}
              >
                Sign out
              </button>
            </div>

            <div style={styles.statusPill}>
              <span style={{
                ...styles.statusDot,
                background: backendHealthy === null ? '#94a3b8' : backendHealthy ? '#22c55e' : '#ef4444',
              }} />
              <span style={styles.statusText}>
                {backendHealthy === null ? 'Checking…' : backendHealthy ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function roleColor(role) {
  return { admin: '#f97316', restaurant: '#3b82f6', recipient: '#22c55e', partner: '#a855f7' }[role] || '#94a3b8'
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Authenticated shell — pathless layout, wraps all protected sub-routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            {/* Browse food: recipient + admin */}
            <Route
              path="browse"
              element={
                <ProtectedRoute allowedRoles={['recipient', 'admin']}>
                  <RecipientFeed />
                </ProtectedRoute>
              }
            />

            {/* Restaurant portal: restaurant + admin */}
            <Route
              path="restaurant"
              element={
                <ProtectedRoute allowedRoles={['restaurant', 'admin']}>
                  <RestaurantDashboard />
                </ProtectedRoute>
              }
            />

            {/* My Claims: recipient only */}
            <Route
              path="my-claims"
              element={
                <ProtectedRoute allowedRoles={['recipient']}>
                  <MyClaimsPage />
                </ProtectedRoute>
              }
            />

            {/* Admin dashboard: admin only */}
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            {/* Partner portal: partner + admin */}
            <Route
              path="partner"
              element={
                <ProtectedRoute allowedRoles={['partner', 'admin']}>
                  <PartnerPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  appShell: { minHeight: '100svh', display: 'flex', flexDirection: 'column', background: '#020817' },
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
    gap: '16px',
  },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  logo: { height: '38px', width: 'auto', borderRadius: '8px' },
  brandName: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 800,
    color: '#f1f5f9',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  brandTagline: { display: 'block', fontSize: '11px', color: 'rgba(148,163,184,0.7)', fontWeight: 500 },
  tabNav: { display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' },
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
  tabBtnActive: { background: 'rgba(249,115,22,0.12)', color: '#f97316' },
  rightSection: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  userPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '6px 10px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(148,163,184,0.14)',
  },
  roleDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  userName: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleTag: { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' },
  logoutBtn: {
    border: 'none',
    background: 'none',
    color: 'rgba(148,163,184,0.6)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '2px 4px',
    borderRadius: 4,
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
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  statusText: { fontSize: '13px', fontWeight: 700, color: '#cbd5e1' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
}
