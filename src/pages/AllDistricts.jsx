import { Fragment, useEffect, useMemo, useState } from 'react'
import '../DistrictLookup.css'
import './AllDistricts.css'

const API_BASE = 'http://localhost:3001'
const PAGE_SIZE = 15

const COLUMNS = [
  { key: 'District', label: 'District' },
  { key: 'State', label: 'State' },
  { key: 'Approx. students', label: 'Approx. students' },
  { key: 'Superintendent', label: 'Superintendent' },
  { key: 'Interest Status', label: 'Interest Status' },
]

function parseApprox(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : -1
}

function rowKey(row) {
  return `${row['District']}__${row['State']}`
}

function getPageNumbers(current, total) {
  const delta = 1
  const pages = []

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i)
    }
  }

  const withGaps = []
  let previous
  for (const page of pages) {
    if (previous !== undefined && page - previous > 1) {
      withGaps.push('gap')
    }
    withGaps.push(page)
    previous = page
  }

  return withGaps
}

export default function AllDistricts() {
  const [districts, setDistricts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [viewMode, setViewMode] = useState('table')
  const [query, setQuery] = useState('')

  const [sortKey, setSortKey] = useState('District')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedKey, setExpandedKey] = useState(null)
  const [page, setPage] = useState(1)

  const [expandedStates, setExpandedStates] = useState(() => new Set())
  const [expandedDistrict, setExpandedDistrict] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/districts`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load districts')
        if (!cancelled) setDistricts(data.districts)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const rows = useMemo(() => {
    if (!districts) return []

    const q = query.trim().toLowerCase()
    let filtered = districts
    if (q) {
      filtered = districts.filter(
        (r) =>
          (r['District'] || '').toLowerCase().includes(q) ||
          (r['State'] || '').toLowerCase().includes(q)
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let av, bv
      if (sortKey === 'Approx. students') {
        av = parseApprox(a[sortKey])
        bv = parseApprox(b[sortKey])
      } else {
        av = (a[sortKey] || '').toString().toLowerCase()
        bv = (b[sortKey] || '').toString().toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [districts, query, sortKey, sortDir])

  useEffect(() => {
    // Resetting to page 1 whenever the filtered/sorted set changes, so a
    // narrowed search never leaves you stranded on a now-empty page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [query, sortKey, sortDir, districts])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, rows.length)

  const grouped = useMemo(() => {
    if (!districts) return []
    const q = query.trim().toLowerCase()

    const byState = new Map()
    for (const row of districts) {
      const state = row['State'] || 'Unknown'
      if (q) {
        const matchesDistrict = (row['District'] || '').toLowerCase().includes(q)
        const matchesState = state.toLowerCase().includes(q)
        if (!matchesDistrict && !matchesState) continue
      }
      if (!byState.has(state)) byState.set(state, [])
      byState.get(state).push(row)
    }

    return [...byState.entries()]
      .map(([state, groupRows]) => ({
        state,
        rows: [...groupRows].sort((a, b) => a['District'].localeCompare(b['District'])),
      }))
      .sort((a, b) => a.state.localeCompare(b.state))
  }, [districts, query])

  function toggleGroupState(state) {
    setExpandedStates((prev) => {
      const next = new Set(prev)
      if (next.has(state)) next.delete(state)
      else next.add(state)
      return next
    })
  }

  function toggleGroupDistrict(key) {
    setExpandedDistrict((prev) => (prev === key ? null : key))
  }

  const filtering = Boolean(query.trim())

  return (
    <div className="dl-page ad-page-wide">
      <header className="dl-header">
        <h1>All Districts</h1>
        <p className="dl-subtitle">Every district currently on file, across all states.</p>
      </header>

      {loading && <p className="dl-list-count">Loading…</p>}
      {error && <p className="dl-error">{error}</p>}

      {!loading && !error && districts && districts.length === 0 && (
        <p className="dl-empty">No districts yet. Try Bulk Populate or District Lookup.</p>
      )}

      {!loading && !error && districts && districts.length > 0 && (
        <>
          <div className="ad-toolbar">
            <input
              type="text"
              placeholder="Filter by district or state"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className="ad-view-toggle">
              <button
                type="button"
                className={`ad-view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
              <button
                type="button"
                className={`ad-view-toggle-btn${viewMode === 'grouped' ? ' active' : ''}`}
                onClick={() => setViewMode('grouped')}
              >
                By state
              </button>
            </div>

            {viewMode === 'table' && (
              <span className="dl-list-count">
                {rangeStart}-{rangeEnd} of {rows.length}
                {rows.length !== districts.length && ` (filtered from ${districts.length})`}
              </span>
            )}
          </div>

          {viewMode === 'table' && (
            <>
              <div className="ad-table-scroll">
                <table className="ad-table">
                  <thead>
                    <tr>
                      {COLUMNS.map((col) => (
                        <th key={col.key} onClick={() => handleSort(col.key)}>
                          {col.label}
                          {sortKey === col.key && (
                            <span className="ad-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => {
                      const key = rowKey(row)
                      const expanded = expandedKey === key
                      const hasStatus = Boolean((row['Interest Status'] || '').trim())
                      return (
                        <Fragment key={key}>
                          <tr
                            className={`ad-row${hasStatus ? '' : ' ad-row-uncontacted'}`}
                            onClick={() => setExpandedKey(expanded ? null : key)}
                          >
                            <td>{row['District']}</td>
                            <td className="dl-value">{row['State']}</td>
                            <td className="dl-value">{row['Approx. students'] || '—'}</td>
                            <td className="dl-value">{row['Superintendent'] || '—'}</td>
                            <td className="dl-value">{row['Interest Status'] || 'Not set'}</td>
                          </tr>
                          <tr className="ad-detail-row">
                            <td colSpan={COLUMNS.length}>
                              <div className={`ad-detail-collapse${expanded ? ' expanded' : ''}`}>
                                <div className="ad-detail-inner">
                                  <div className="ad-detail">
                                    <div>
                                      <dt>Email</dt>
                                      <dd className="dl-value">{row['Email'] || '—'}</dd>
                                    </div>
                                    <div>
                                      <dt>Contact no.</dt>
                                      <dd className="dl-value">{row['Contact no.'] || '—'}</dd>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ad-pagination">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>

                <div className="ad-pagination-numbers">
                  {getPageNumbers(currentPage, pageCount).map((item, i) =>
                    item === 'gap' ? (
                      <span key={`gap-${i}`} className="ad-pagination-gap">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`ad-pagination-number${item === currentPage ? ' active' : ''}`}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Next
                </button>
              </div>
            </>
          )}

          {viewMode === 'grouped' && (
            <div className="sb-tree">
              {grouped.map(({ state, rows: groupRows }) => {
                const stateExpanded = filtering || expandedStates.has(state)
                return (
                  <section key={state} className="sb-state">
                    <button
                      type="button"
                      className="sb-state-header"
                      onClick={() => toggleGroupState(state)}
                    >
                      <span className={`sb-caret${stateExpanded ? ' expanded' : ''}`}>▸</span>
                      <span className="sb-state-name">{state}</span>
                      <span className="sb-state-count">{groupRows.length}</span>
                    </button>

                    {stateExpanded && (
                      <ul className="sb-district-list">
                        {groupRows.map((row) => {
                          const key = rowKey(row)
                          const districtExpanded = expandedDistrict === key
                          const hasStatus = Boolean((row['Interest Status'] || '').trim())
                          return (
                            <li key={key}>
                              <button
                                type="button"
                                className={`sb-district-row${hasStatus ? '' : ' sb-uncontacted'}`}
                                onClick={() => toggleGroupDistrict(key)}
                              >
                                {row['District']}
                              </button>

                              <div
                                className={`sb-detail-collapse${districtExpanded ? ' expanded' : ''}`}
                              >
                                <div className="sb-detail-inner">
                                  <dl className="dl-fields sb-detail-fields">
                                    <div className="dl-field">
                                      <dt>Approx. students</dt>
                                      <dd>
                                        <span className="dl-value">
                                          {row['Approx. students'] || '—'}
                                        </span>
                                      </dd>
                                    </div>
                                    <div className="dl-field">
                                      <dt>Superintendent</dt>
                                      <dd>
                                        <span className="dl-value">{row['Superintendent'] || '—'}</span>
                                      </dd>
                                    </div>
                                    <div className="dl-field">
                                      <dt>Email</dt>
                                      <dd>
                                        <span className="dl-value">{row['Email'] || '—'}</span>
                                      </dd>
                                    </div>
                                    <div className="dl-field">
                                      <dt>Contact no.</dt>
                                      <dd>
                                        <span className="dl-value">{row['Contact no.'] || '—'}</span>
                                      </dd>
                                    </div>
                                    <div className="dl-field dl-field-locked">
                                      <dt>Interest Status</dt>
                                      <dd>
                                        <span className="dl-value">
                                          {row['Interest Status'] || 'Not set'}
                                        </span>
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
