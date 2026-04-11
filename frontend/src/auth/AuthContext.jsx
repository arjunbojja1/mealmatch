import { createContext, useContext, useEffect, useState } from 'react'
import { loginUser, signupUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('mm_token'))
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('mm_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  // Listen for 401 events dispatched by the API client
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener('mm:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('mm:unauthorized', handleUnauthorized)
  }, [])

  async function login(email, password) {
    const data = await loginUser(email, password)
    localStorage.setItem('mm_token', data.access_token)
    localStorage.setItem('mm_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  async function signup(name, email, password, role) {
    const data = await signupUser(name, email, password, role)
    localStorage.setItem('mm_token', data.access_token)
    localStorage.setItem('mm_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  function logout() {
    localStorage.removeItem('mm_token')
    localStorage.removeItem('mm_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, user, login, signup, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
