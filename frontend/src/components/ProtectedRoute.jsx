import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_HOME = {
  recipient: '/browse',
  restaurant: '/restaurant',
  admin: '/admin',
  partner: '/partner',
}

/**
 * Wraps a route with auth + optional role checks.
 *
 * - No token    → redirect to /login (preserves intended destination)
 * - Wrong role  → redirect to user's role home (handles role-switch gracefully)
 * - OK          → render children
 *
 * /unauthorized is reserved for explicit 403 responses from the API.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { token, user } = useAuth()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/browse'} replace />
  }

  return children
}
