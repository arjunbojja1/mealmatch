import { useEffect, useState } from 'react'
import { getApiBaseUrl, getHealth, getHello, postEcho } from './api/client'
import './App.css'
import RecipientFeed from "./components/RecipientFeed";

function App() {
  const apiBaseUrl = getApiBaseUrl()
  const [apiMessage, setApiMessage] = useState('Checking backend...')
  const [echoInput, setEchoInput] = useState('hello')
  const [echoResult, setEchoResult] = useState('')
  const [echoError, setEchoError] = useState('')

  async function checkBackend() {
    try {
      const [health, hello] = await Promise.all([getHealth(), getHello()])
      setApiMessage(`${hello.message} (${health.status})`)
    } catch {
      setApiMessage(`Backend unavailable at ${getApiBaseUrl()}`)
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
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>bitcamp-2026</h1>
        <p>Hackathon Dashboard</p>
      </header>

      <section className="panel">
        <h2>Backend Status</h2>
        <p>{apiMessage}</p>
        <p>
          API base URL: <code>{apiBaseUrl}</code>
        </p>
        <div className="actions">
          <button className="counter" onClick={checkBackend}>
            Refresh status
          </button>
          <a className="counter" href={`${apiBaseUrl}/docs`} target="_blank">
            Open API docs
          </a>
        </div>
      </section>

      <section className="panel">
        <h2>Quick Start</h2>
        <ul>
          <li>
            <code>make setup</code>
          </li>
          <li>
            <code>make dev-backend</code>
          </li>
          <li>
            <code>make dev-frontend</code>
          </li>
          <li>
            <code>make lint && make smoke</code>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Pydantic Echo Demo</h2>
        <div className="actions">
          <input
            className="text-input"
            type="text"
            value={echoInput}
            onChange={(event) => setEchoInput(event.target.value)}
            placeholder="Type text (1-200 chars)"
          />
          <button className="counter" onClick={sendEcho}>
            Send echo
          </button>
        </div>
        {echoResult ? <p>Response: {echoResult}</p> : null}
        {echoError ? <p>{echoError}</p> : null}
      </section>

      <section className="panel">
        <RecipientFeed />;
        <h2>Hackathon Targets</h2>
        <ul>
          <li>Define API contract for first feature.</li>
          <li>Ship one vertical slice end-to-end.</li>
          <li>Keep PRs small and CI green.</li>
        </ul>
      </section>
    </main>
  )
  

}

export default App
