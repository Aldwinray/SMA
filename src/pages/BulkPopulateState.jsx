import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../DistrictLookup.css'
import './BulkPopulateState.css'

const API_BASE = 'http://localhost:3001'

const FIELD_ORDER = [
  { key: 'Approx. students', label: 'Approx. students' },
  { key: 'Superintendent', label: 'Superintendent' },
  { key: 'Email', label: 'Email' },
  { key: 'Contact no.', label: 'Contact no.' },
]

function DistrictCard({ district, state, row, source, changedFields = [] }) {
  return (
    <section className="dl-result bp-card">
      <div className="dl-result-header">
        <div className="dl-result-title">
          <h2>{district}</h2>
          <span className="dl-result-state">{state}</span>
        </div>
        <p className="dl-meta">{source === 'search' ? 'Fresh search' : 'From database'}</p>
      </div>

      <dl className="dl-fields">
        {FIELD_ORDER.map(({ key, label }) => {
          const changed = changedFields.includes(key)
          return (
            <div key={key} className={`dl-field${changed ? ' dl-field-changed' : ''}`}>
              <dt>{label}</dt>
              <dd>
                <span className="dl-value">{row[key] || '—'}</span>
                {changed && <span className="dl-changed-tag">changed</span>}
              </dd>
            </div>
          )
        })}
        <div className="dl-field dl-field-locked">
          <dt>Interest Status</dt>
          <dd>
            <span className="dl-value">{row['Interest Status'] || 'Not set'}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}

export default function BulkPopulateState() {
  const location = useLocation()
  const navigate = useNavigate()

  const [stateInput, setStateInput] = useState('')

  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [progress, setProgress] = useState(null)
  const [usageSummary, setUsageSummary] = useState(null)

  const pollRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    const incomingState = location.state?.stateName
    if (!incomingState) return
    // Syncing from React Router's navigation state (an external source), not
    // computing derived render state, so setState-in-effect is intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStateInput(incomingState)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  async function handlePreview(e) {
    e.preventDefault()
    if (!stateInput.trim()) return
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    setRunResult(null)
    setRunError(null)
    setProgress(null)
    setUsageSummary(null)

    try {
      const res = await fetch(`${API_BASE}/api/districts/bulk-lookup/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: stateInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data)
    } catch (err) {
      setPreviewError(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleStartPopulate() {
    if (!preview || preview.missing === 0) return
    setRunLoading(true)
    setRunError(null)
    setRunResult(null)
    setProgress(null)
    setUsageSummary(null)

    const runId = `${stateInput.trim()}-${Date.now()}`

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/districts/bulk-lookup/progress/${runId}`)
        if (res.ok) setProgress(await res.json())
      } catch {
        // transient poll failure, next tick retries
      }
    }, 1200)

    try {
      const res = await fetch(`${API_BASE}/api/districts/bulk-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: stateInput,
          districts: preview.districts.map((d) => d.district),
          runId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk populate failed')
      setRunResult(data)

      try {
        const summaryRes = await fetch(`${API_BASE}/api/run/${runId}/summary`)
        if (summaryRes.ok) setUsageSummary(await summaryRes.json())
      } catch {
        // usage summary is a nice-to-have, ignore failures
      }
    } catch (err) {
      setRunError(err.message)
    } finally {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      setRunLoading(false)
    }
  }

  const pct = progress && progress.totalBatches > 0
    ? Math.round((progress.completedBatches / progress.totalBatches) * 100)
    : 0

  const allProcessed = runResult
    ? [
        ...runResult.alreadyOnFile.map((d) => ({ ...d, source: 'cache' })),
        ...runResult.searched.filter((d) => !d.error).map((d) => ({ ...d, source: 'search' })),
      ]
    : []

  const newlySearchedCount = runResult ? runResult.searched.filter((d) => !d.error).length : 0
  const failedCount = runResult ? runResult.searched.filter((d) => d.error).length : 0

  return (
    <div className="dl-page">
      <header className="dl-header">
        <h1>Bulk Populate State</h1>
        <p className="dl-subtitle">
          Searches every not-yet-known district for a state, in batches. Districts already
          on file are skipped automatically, at no cost.
        </p>
      </header>

      <form className="dl-browse" onSubmit={handlePreview}>
        <input
          type="text"
          placeholder="State (e.g. Montana)"
          value={stateInput}
          onChange={(e) => setStateInput(e.target.value)}
        />
        <button type="submit" disabled={previewLoading}>
          {previewLoading ? 'Checking…' : 'Preview'}
        </button>
      </form>

      {previewError && <p className="dl-error">{previewError}</p>}

      {preview && (
        <div className="bp-preview">
          <p className="dl-list-count">
            {preview.known} already on file · {preview.missing} missing (of {preview.total} found)
          </p>
          <p className="dl-hint bp-preview-hint">
            Based on a working district list, not a certified NCES export, so the total is an
            estimate, not a guaranteed-complete count.
          </p>
          <button
            type="button"
            className="dl-primary"
            onClick={handleStartPopulate}
            disabled={runLoading || preview.missing === 0}
          >
            {runLoading ? 'Populating…' : `Start Populate (${preview.missing})`}
          </button>
        </div>
      )}

      {runLoading && (
        <div className="bp-progress">
          {progress ? (
            <>
              <p className="dl-list-count">
                Batch {progress.completedBatches} of {progress.totalBatches}
              </p>
              <div className="bp-progress-track">
                <div className="bp-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
              </div>
            </>
          ) : (
            <p className="dl-list-count">Starting…</p>
          )}
        </div>
      )}

      {runError && <p className="dl-error">{runError}</p>}

      {runResult && (
        <div className="bp-summary">
          {runResult.halted && (
            <p className="bp-warning">
              Stopped early: {runResult.reason} Processed {allProcessed.length} of{' '}
              {preview?.districts.length ?? allProcessed.length} districts before stopping.
            </p>
          )}

          <p className="dl-list-count">
            {runResult.alreadyOnFile.length} already on file · {newlySearchedCount} newly searched
            {failedCount > 0 && ` · ${failedCount} couldn't be parsed`}
            {usageSummary && ` · ${usageSummary.totalCalls} model call${usageSummary.totalCalls === 1 ? '' : 's'} used`}
          </p>

          {usageSummary && Object.keys(usageSummary.callsByModel).length > 0 && (
            <dl className="dl-fields bp-usage-fields">
              {Object.entries(usageSummary.callsByModel).map(([model, count]) => (
                <div key={model} className="dl-field">
                  <dt>{model}</dt>
                  <dd>
                    <span className="dl-value">{count}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="bp-result-list">
            {allProcessed.map((d) => (
              <DistrictCard
                key={d.district}
                district={d.district}
                state={d.row['State'] || stateInput}
                row={d.row}
                source={d.source}
                changedFields={d.changedFields}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
