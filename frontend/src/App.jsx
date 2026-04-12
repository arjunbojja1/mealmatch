import { useEffect, useRef, useState } from 'react'
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

import './App.css'

// ── Role colors (light-mode safe) ──────────────────────────────────────────
const ROLE_COLOR = {
  admin:      '#DC2626',
  restaurant: '#2563EB',
  recipient:  '#16A34A',
  partner:    '#7C3AED',
}

// ── Authenticated app shell ─────────────────────────────────────────────────
function AppShell() {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const menuRef   = useRef(null)
  const [menuOpen,       setMenuOpen]       = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    const t = setTimeout(() => setMenuOpen(false), 0)
    return () => clearTimeout(t)
  }, [location.pathname])

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  const allTabs = [
    { key: 'browse',     label: 'Browse Food',   path: '/browse',     roles: ['recipient', 'admin'] },
    { key: 'my-claims',  label: 'My Claims',      path: '/my-claims',  roles: ['recipient'] },
    { key: 'restaurant', label: 'Restaurant',     path: '/restaurant', roles: ['restaurant', 'admin'] },
    { key: 'admin',      label: 'Admin',          path: '/admin',      roles: ['admin'] },
    { key: 'partner',    label: 'Partner Portal', path: '/partner',    roles: ['partner', 'admin'] },
  ]
  const visibleTabs = allTabs.filter(t => t.roles.includes(user?.role))
  const activeKey   = visibleTabs.find(t => location.pathname.startsWith(t.path))?.key

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--mm-bg)' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        ref={menuRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--mm-border)',
          boxShadow: '0 1px 0 var(--mm-border)',
        }}
      >
        <div style={{
          maxWidth: 'var(--mm-max-w)',
          margin: '0 auto',
          padding: '0 20px',
          height: 'var(--mm-header-h)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          {/* Brand */}
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 6px', borderRadius: 'var(--mm-r-md)',
            }}
            aria-label="MealMatch home"
          >
            <img src="/MealMatch Logo.png" alt="" style={{ height: 'var(--mm-header-logo-h)', width: 'auto', borderRadius: 12 }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-.025em', whiteSpace: 'nowrap' }}>
              MealMatch
            </span>
          </button>

          {/* Desktop nav tabs */}
          <nav style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }} aria-label="Main navigation">
            {visibleTabs.map(({ key, label, path }) => (
              <button
                key={key}
                onClick={() => navigate(path)}
                className={`mm-nav-tab${activeKey === key ? ' mm-nav-tab-active' : ''}`}
                aria-current={activeKey === key ? 'page' : undefined}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* User pill — desktop */}
            <div
              className="mm-hide-mobile"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 'var(--mm-r-full)',
                background: 'rgba(22,163,74,.12)',
                border: '1px solid rgba(22,163,74,.24)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: '#E2FBE8', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'User'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#86EFAC', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {user?.role}
              </span>
              <button
                onClick={() => { logout(); window.location.assign('/') }}
                style={{ background: 'none', border: 'none', color: 'rgba(226,251,232,.78)', fontSize: 12, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'color var(--mm-dur)' }}
              >
                Sign out
              </button>
            </div>

            {/* Hamburger — mobile */}
            <button
              className="mm-show-mobile mm-btn mm-btn-ghost mm-btn-sm"
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              style={{ padding: '7px 10px', color: 'var(--mm-text-2)' }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 18 }}>
                {[0,1,2].map((i) => (
                  <span key={i} style={{
                    display: 'block', height: 2,
                    background: 'var(--mm-text-2)', borderRadius: 2,
                    transition: 'transform var(--mm-dur) var(--mm-ease), opacity var(--mm-dur)',
                    ...(menuOpen && i === 0 ? { transform: 'rotate(45deg) translate(4px, 4px)' } : {}),
                    ...(menuOpen && i === 1 ? { opacity: 0 } : {}),
                    ...(menuOpen && i === 2 ? { transform: 'rotate(-45deg) translate(4px, -4px)' } : {}),
                  }} />
                ))}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div
            style={{
              position: 'absolute', top: 'var(--mm-header-h)', left: 0, right: 0,
              background: 'rgba(0,0,0,0.98)',
              backdropFilter: 'blur(20px)',
              borderBottom: '1px solid var(--mm-border)',
              padding: '12px 16px 16px',
              display: 'flex', flexDirection: 'column', gap: 4,
              animation: 'mm-slide-in .18s var(--mm-ease)',
              zIndex: 190,
              boxShadow: 'var(--mm-shadow-md)',
            }}
            role="menu"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{user?.name || 'User'}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--mm-text-4)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{user?.role}</span>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--mm-border)', margin: '4px 0' }} />
            {visibleTabs.map(({ key, label, path }) => (
              <button
                key={key}
                onClick={() => navigate(path)}
                className={`mm-nav-tab${activeKey === key ? ' mm-nav-tab-active' : ''}`}
                style={{ width: '100%', textAlign: 'left', borderRadius: 'var(--mm-r-md)', padding: '10px 14px' }}
                role="menuitem"
              >
                {label}
              </button>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid var(--mm-border)', margin: '4px 0' }} />
            <button
              onClick={() => { logout(); window.location.assign('/') }}
              style={{ background: 'none', border: 'none', color: '#FCA5A5', fontSize: 13, cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--mm-r-md)', textAlign: 'left', width: '100%', fontWeight: 500 }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  )
}

// ── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="browse" element={<ProtectedRoute allowedRoles={['recipient', 'admin']}><RecipientFeed /></ProtectedRoute>} />
            <Route path="restaurant" element={<ProtectedRoute allowedRoles={['restaurant', 'admin']}><RestaurantDashboard /></ProtectedRoute>} />
            <Route path="my-claims" element={<ProtectedRoute allowedRoles={['recipient']}><MyClaimsPage /></ProtectedRoute>} />
            <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="partner" element={<ProtectedRoute allowedRoles={['partner', 'admin']}><PartnerPage /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
