import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './DistrictLookup.css'

const API_BASE = 'http://localhost:3001'

const FIELD_ORDER = [
  { key: 'Approx. students', label: 'Approx. students' },
  { key: 'Superintendent', label: 'Superintendent' },
  { key: 'Email', label: 'Email' },
  { key: 'Contact no.', label: 'Contact no.' },
]

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
  )
}

function metaLabel(result) {
  if (result.source !== 'search') return 'From database'
  if (result.isNew) return 'Fresh search · new record'

  const count = result.changedFields?.length || 0
  if (count === 0) return 'Fresh search · no changes found'
  return `Fresh search · ${count} field${count === 1 ? '' : 's'} changed`
}

export default function DistrictLookup() {
  const location = useLocation()
  const navigate = useNavigate()

  const [browseState, setBrowseState] = useState('')
  const [districtList, setDistrictList] = useState(null)
  const [listForceRefresh, setListForceRefresh] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState(null)

  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState(null)
  const [bulkSummary, setBulkSummary] = useState(null)
  const [tableExpanded, setTableExpanded] = useState(false)

  const [searchDistrict, setSearchDistrict] = useState('')
  const [searchState, setSearchState] = useState('')
  const [force, setForce] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [result, setResult] = useState(null)

  async function handleLoadDistricts(e) {
    e.preventDefault()
    if (!browseState.trim()) return
    setListLoading(true)
    setListError(null)
    setDistrictList(null)
    setBulkError(null)
    setBulkSummary(null)
    setTableExpanded(false)

    try {
      const res = await fetch(`${API_BASE}/api/districts/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: browseState, refresh: listForceRefresh }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load district list')
      setDistrictList(data.districts)
    } catch (err) {
      setListError(err.message)
    } finally {
      setListLoading(false)
    }
  }

  function handleExport() {
    if (!browseState.trim()) return
    window.open(`${API_BASE}/api/districts/export?state=${encodeURIComponent(browseState.trim())}`, '_blank')
  }

  async function handleBulkSearch() {
    if (!districtList || districtList.length === 0) return
    setBulkLoading(true)
    setBulkError(null)
    setBulkSummary(null)

    try {
      const res = await fetch(`${API_BASE}/api/districts/bulk-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: browseState,
          districts: districtList.map((d) => d.district),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk search failed')
      setBulkSummary(data)
    } catch (err) {
      setBulkError(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  function pickDistrict(name) {
    setSearchDistrict(name)
    setSearchState(browseState)
  }

  async function runSearch(district, state, forceFlag) {
    if (!district.trim() || !state.trim()) return
    setSearchLoading(true)
    setSearchError(null)

    try {
      const res = await fetch(`${API_BASE}/api/district-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ district, state, force: forceFlag }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setResult(data)
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    await runSearch(searchDistrict, searchState, force)
  }

  useEffect(() => {
    const incoming = location.state
    if (!incoming?.district) return

    // Syncing from React Router's navigation state (an external source), not
    // computing derived render state, so setState-in-effect is intentional here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchDistrict(incoming.district)
    setSearchState(incoming.state || '')
    if (incoming.auto && incoming.state) {
      runSearch(incoming.district, incoming.state, false)
    }

    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    if (!tableExpanded) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') setTableExpanded(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tableExpanded])

  const row = result?.row
  const changedFields = result?.changedFields || []

  const bulkRows = bulkSummary
    ? [...bulkSummary.alreadyOnFile, ...bulkSummary.searched.filter((s) => !s.error)]
    : []
  const bulkErrorCount = bulkSummary?.searched.filter((s) => s.error).length || 0

  const bulkTable = (
    <table className="dl-bulk-table">
      <thead>
        <tr>
          <th>District</th>
          <th>Approx. students</th>
          <th>Superintendent</th>
          <th>Email</th>
          <th>Contact no.</th>
          <th>Interest Status</th>
        </tr>
      </thead>
      <tbody>
        {bulkRows.map(({ district, row: r }) => (
          <tr key={district}>
            <td>{district}</td>
            <td className="dl-value">{r['Approx. students'] || '—'}</td>
            <td className="dl-value">{r['Superintendent'] || '—'}</td>
            <td className="dl-value">{r['Email'] || '—'}</td>
            <td className="dl-value">{r['Contact no.'] || '—'}</td>
            <td className="dl-value dl-bulk-muted">{r['Interest Status'] || 'Not set'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const hasActivity = Boolean(districtList || result)

  return (
    <div className="dl-page dl-page-wide">
      <header className="dl-header">
        <h1>District Research Lookup</h1>
        <p className="dl-subtitle">
          Districts already on file return instantly at no cost. New districts, or
          an explicit force refresh, trigger a live search.
        </p>
      </header>

      <section className="dl-panel">
        <h2 className="dl-panel-title">Browse by state</h2>
        <form className="dl-browse" onSubmit={handleLoadDistricts}>
          <input
            type="text"
            placeholder="State (e.g. Alaska)"
            value={browseState}
            onChange={(e) => setBrowseState(e.target.value)}
          />
          <label className="dl-checkbox">
            <input
              type="checkbox"
              checked={listForceRefresh}
              onChange={(e) => setListForceRefresh(e.target.checked)}
            />
            Force refresh
          </label>
          <button type="submit" disabled={listLoading}>
            {listLoading ? 'Loading…' : 'Load districts'}
          </button>
          <button type="button" onClick={handleExport} disabled={!browseState.trim()}>
            Download .xlsx
          </button>
        </form>

        {listError && <p className="dl-error">{listError}</p>}

        {districtList && (
          <>
            <p className="dl-list-count">
              {districtList.length} district{districtList.length === 1 ? '' : 's'} found
            </p>

            <ul className="dl-listbox">
              {districtList.map((d) => (
                <li key={d.district}>
                  <button type="button" onClick={() => pickDistrict(d.district)}>
                    <span className="dl-listbox-name">{d.district}</span>
                    <span className="dl-listbox-count">
                      {d.approxEnrollment != null ? d.approxEnrollment.toLocaleString() : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="dl-bulk-row">
              <button type="button" onClick={handleBulkSearch} disabled={bulkLoading}>
                {bulkLoading ? 'Searching all…' : 'Search all unsearched'}
              </button>
              <span className="dl-hint">
                Batches unsearched districts a few at a time. Already-searched ones are skipped, free.
              </span>
            </div>
          </>
        )}
      </section>

      {bulkError && <p className="dl-error">{bulkError}</p>}

      {bulkSummary && (
        <div className="dl-bulk-table-wrap">
          <div className="dl-bulk-table-header">
            <div>
              <p className="dl-list-count">
                {bulkSummary.alreadyOnFile.length} already on file · {bulkSummary.searched.length} newly searched
              </p>
              {bulkSummary.halted && (
                <p className="dl-error">Stopped early: {bulkSummary.reason}</p>
              )}
            </div>
            <div className="dl-bulk-table-actions">
              <button type="button" className="dl-icon-btn" onClick={() => setTableExpanded(true)}>
                <MaximizeIcon />
                Maximize
              </button>
              <button
                type="button"
                className="dl-primary"
                onClick={handleExport}
                disabled={!browseState.trim()}
              >
                Download .xlsx
              </button>
            </div>
          </div>

          <div className="dl-bulk-table-scroll">{bulkTable}</div>

          {bulkErrorCount > 0 && (
            <p className="dl-error">
              {bulkErrorCount} district{bulkErrorCount === 1 ? '' : 's'} couldn't be parsed from the
              batch result. Try "Search all unsearched" again to retry just those.
            </p>
          )}
        </div>
      )}

      {tableExpanded && bulkSummary && (
        <div className="dl-modal-backdrop" onClick={() => setTableExpanded(false)}>
          <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dl-modal-header">
              <div>
                <h2>{browseState || 'Districts'}</h2>
                <p className="dl-list-count">
                  {bulkSummary.alreadyOnFile.length} already on file · {bulkSummary.searched.length} newly searched
                </p>
              </div>
              <div className="dl-bulk-table-actions">
                <button
                  type="button"
                  className="dl-primary"
                  onClick={handleExport}
                  disabled={!browseState.trim()}
                >
                  Download .xlsx
                </button>
                <button type="button" className="dl-icon-btn" onClick={() => setTableExpanded(false)}>
                  <MinimizeIcon />
                  Minimize
                </button>
              </div>
            </div>
            <div className="dl-bulk-table-scroll dl-modal-table-scroll">{bulkTable}</div>
          </div>
        </div>
      )}

      <section className="dl-panel">
        <h2 className="dl-panel-title">Search a district directly</h2>
        <form className="dl-search-row" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="District name"
            value={searchDistrict}
            onChange={(e) => setSearchDistrict(e.target.value)}
          />
          <input
            type="text"
            placeholder="State"
            value={searchState}
            onChange={(e) => setSearchState(e.target.value)}
          />
          <label className="dl-checkbox">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Force refresh
          </label>
          <button type="submit" className="dl-primary" disabled={searchLoading}>
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searchError && <p className="dl-error">{searchError}</p>}
      </section>

      {!hasActivity && !searchError && (
        <div className="dl-idle-hint">
          <p>Browse a state above to pick from its districts, or search a specific one directly.</p>
          <p className="dl-hint">
            Interest Status is always set by hand in the exported Excel file, never from this app.
          </p>
        </div>
      )}

      {row && (
        <section className="dl-result" key={result.runId}>
          <div className="dl-result-header">
            <div className="dl-result-title">
              <h2>{row['District']}</h2>
              <span className="dl-result-state">{row['State']}</span>
            </div>
            <p className="dl-meta">{metaLabel(result)}</p>
          </div>

          <dl className="dl-fields">
            {FIELD_ORDER.map(({ key, label }) => {
              const changed = !result.isNew && changedFields.includes(key)
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
                <span className="dl-hint">Set manually in the exported Excel file</span>
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  )
}
