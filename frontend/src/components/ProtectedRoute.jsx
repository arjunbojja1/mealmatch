import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * Wraps a route with auth + optional role checks.
 *
 * - No token  → redirect to /login (preserves intended destination)
 * - Wrong role → redirect to /unauthorized
 * - OK         → render children
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { token, user } = useAuth()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
