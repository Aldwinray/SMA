import { useEffect, useState } from 'react'
import '../DistrictLookup.css'

const API_BASE = 'http://localhost:3001'
const RUN_ID = 'default'

export default function UsageCost() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`${API_BASE}/api/run/${RUN_ID}/summary`)
        if (res.status === 404) {
          if (!cancelled) setSummary(null)
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load usage summary')
        if (!cancelled) setSummary(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSummary()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="dl-page">
      <header className="dl-header">
        <h1>Usage &amp; Cost</h1>
        <p className="dl-subtitle">
          Live totals for the current server session. Resets if the backend restarts.
        </p>
      </header>

      {loading && <p className="dl-list-count">Loading…</p>}
      {error && <p className="dl-error">{error}</p>}

      {!loading && !error && !summary && (
        <p className="dl-empty">No usage recorded yet this session.</p>
      )}

      {summary && (
        <section className="dl-result">
          <dl className="dl-fields">
            <div className="dl-field">
              <dt>Total calls</dt>
              <dd>
                <span className="dl-value">{summary.totalCalls}</span>
              </dd>
            </div>
            <div className="dl-field">
              <dt>Escalations</dt>
              <dd>
                <span className="dl-value">{summary.escalations}</span>
              </dd>
            </div>
            {Object.entries(summary.callsByModel || {}).map(([model, count]) => (
              <div key={model} className="dl-field">
                <dt>{model}</dt>
                <dd>
                  <span className="dl-value">{count}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
