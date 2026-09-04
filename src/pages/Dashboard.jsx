import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../DistrictLookup.css'
import './Dashboard.css'

const API_BASE = 'http://localhost:3001'
const TOP_STATES_LIMIT = 8

const BANDS = [
  { key: 'unknown', label: 'Unknown enrollment', test: (n) => n == null },
  { key: 'exclude-small', label: 'Under 250', test: (n) => n < 250 },
  { key: 'c', label: '250-499', test: (n) => n < 500 },
  { key: 'b', label: '500-999', test: (n) => n < 1000 },
  { key: 'a', label: '1,000-2,499', test: (n) => n < 2500 },
  { key: 'a-plus', label: '2,500-4,999', test: (n) => n < 5000 },
  { key: 'd', label: '5,000-9,999', test: (n) => n < 10000 },
  { key: 'exclude-large', label: '10,000+', test: () => true },
]

function parseApprox(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function bandFor(enrollment) {
  for (const band of BANDS) {
    if (band.test(enrollment)) return band
  }
  return BANDS[0]
}

// Mirrors server/bandEnrollment.js's bandDistrict() cohort output exactly.
function cohortFor(enrollment) {
  if (enrollment < 250) return 'Exclude'
  if (enrollment < 500) return 'C'
  if (enrollment < 1000) return 'B'
  if (enrollment < 2500) return 'A'
  if (enrollment < 5000) return 'A+'
  if (enrollment < 10000) return 'D'
  return 'Exclude / Watch list'
}

const TEAL_COHORTS = new Set(['A', 'A+'])
const FOLLOW_UP_LIMIT = 5

function IconDistricts() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <line x1="7" y1="7" x2="13" y2="7" strokeLinecap="round" />
      <line x1="7" y1="10.5" x2="13" y2="10.5" strokeLinecap="round" />
      <line x1="7" y1="14" x2="10.5" y2="14" strokeLinecap="round" />
    </svg>
  )
}

function IconStates() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 17.5s6-5.2 6-9.5a6 6 0 1 0-12 0c0 4.3 6 9.5 6 9.5Z" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.2l2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <line x1="17" y1="17" x2="12.8" y2="12.8" strokeLinecap="round" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5 L17 6.5 L10 10.5 L3 6.5 Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10.5 L10 14.5 L17 10.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 14.5 L10 18.5 L17 14.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" strokeLinecap="round" />
      <line x1="2.5" y1="12" x2="17.5" y2="12" strokeLinecap="round" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" strokeLinecap="round" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3 V12" strokeLinecap="round" />
      <path d="M6.5 8.5 L10 12 L13.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 14 V16.5 H16.5 V14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const QUICK_ACTIONS = [
  { to: '/lookup', icon: <IconSearch />, colorClass: 'dash-icon-teal', label: 'Search a district', desc: 'Look up one district directly' },
  { to: '/bulk-populate', icon: <IconLayers />, colorClass: 'dash-icon-amber', label: 'Bulk populate', desc: 'Fill in a whole state at once' },
  { to: '/districts', icon: <IconGrid />, colorClass: 'dash-icon-green', label: 'Browse all districts', desc: 'Sort, filter, or group by state' },
  { to: '/export', icon: <IconDownload />, colorClass: 'dash-icon-red', label: 'Export data', desc: 'Download the current .xlsx' },
]

function ContactedGauge({ pct }) {
  const size = 120
  const stroke = 10
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct / 100)

  return (
    <div className="dash-gauge-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          className="dash-gauge-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dash-gauge-center">
        <span className="dash-gauge-pct">{pct}%</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [districts, setDistricts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  const summary = useMemo(() => {
    if (!districts) return null

    const stateCounts = new Map()
    const bandCounts = new Map(BANDS.map((b) => [b.key, 0]))
    let contacted = 0
    let notSet = 0
    let interested = 0
    let uninterested = 0
    let knownEnrollment = 0
    const followUpCandidates = []

    for (const row of districts) {
      const state = row['State'] || 'Unknown'
      stateCounts.set(state, (stateCounts.get(state) || 0) + 1)

      const enrollment = parseApprox(row['Approx. students'])
      if (enrollment != null) knownEnrollment += 1
      const band = bandFor(enrollment)
      bandCounts.set(band.key, bandCounts.get(band.key) + 1)

      const status = (row['Interest Status'] || '').trim()
      if (status) {
        contacted += 1
        const normalized = status.toLowerCase()
        if (normalized === 'interested') interested += 1
        else if (normalized === 'uninterested') uninterested += 1
      } else {
        notSet += 1
        if (enrollment != null) {
          const cohort = cohortFor(enrollment)
          if (cohort !== 'Exclude / Watch list') {
            followUpCandidates.push({ ...row, _enrollment: enrollment, _cohort: cohort })
          }
        }
      }
    }

    const byState = [...stateCounts.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)

    const byBand = BANDS.map((b) => ({ label: b.label, count: bandCounts.get(b.key) })).filter(
      (b) => b.count > 0
    )

    const followUp = followUpCandidates
      .sort((a, b) => b._enrollment - a._enrollment)
      .slice(0, FOLLOW_UP_LIMIT)

    return {
      total: districts.length,
      states: stateCounts.size,
      contacted,
      notContacted: districts.length - contacted,
      byState,
      byBand,
      knownEnrollment,
      interestBreakdown: { notSet, interested, uninterested },
      followUp,
    }
  }, [districts])

  function goToState(stateName) {
    navigate('/bulk-populate', { state: { stateName } })
  }

  function goToDistrict(row) {
    navigate('/lookup', { state: { district: row['District'], state: row['State'], auto: true } })
  }

  const maxStateCount = summary?.byState[0]?.count || 1
  const maxBandCount = summary ? Math.max(...summary.byBand.map((b) => b.count), 1) : 1
  const topStates = summary?.byState.slice(0, TOP_STATES_LIMIT) || []
  const remainingStates = summary ? summary.byState.length - topStates.length : 0

  const interestRows = summary
    ? [
        { key: 'notSet', label: 'Not set', count: summary.interestBreakdown.notSet, dotClass: 'dash-dot-amber', segClass: 'dash-segment-amber' },
        { key: 'interested', label: 'Interested', count: summary.interestBreakdown.interested, dotClass: 'dash-dot-green', segClass: 'dash-segment-green' },
        { key: 'uninterested', label: 'Uninterested', count: summary.interestBreakdown.uninterested, dotClass: 'dash-dot-red', segClass: 'dash-segment-red' },
      ]
    : []
  const interestTotal = summary ? summary.total || 1 : 1
  const contactedPct = summary && summary.total > 0 ? Math.round((summary.contacted / summary.total) * 100) : 0

  const STAT_TILES = summary
    ? [
        { key: 'total', icon: <IconDistricts />, colorClass: 'dash-icon-teal', value: summary.total, label: `district${summary.total === 1 ? '' : 's'}` },
        { key: 'states', icon: <IconStates />, colorClass: 'dash-icon-amber', value: summary.states, label: `state${summary.states === 1 ? '' : 's'}` },
        { key: 'contacted', icon: <IconCheck />, colorClass: 'dash-icon-green', value: summary.contacted, label: 'marked contacted' },
        { key: 'notContacted', icon: <IconClock />, colorClass: 'dash-icon-red', value: summary.notContacted, label: 'not yet contacted' },
      ]
    : []

  return (
    <div className="dl-page dash-page-wide">
      <header className="dl-header">
        <h1>Dashboard</h1>
        <p className="dl-subtitle">An at-a-glance view of everything currently on file.</p>
      </header>

      {loading && <p className="dl-list-count">Loading…</p>}
      {error && <p className="dl-error">{error}</p>}

      {!loading && !error && summary && summary.total === 0 && (
        <div className="dl-idle-hint">
          <p>No districts on file yet.</p>
          <p className="dl-hint">
            Start with <Link to="/lookup">District Lookup</Link> for a single district, or{' '}
            <Link to="/bulk-populate">Bulk Populate State</Link> to fill in a whole state at once.
          </p>
        </div>
      )}

      {!loading && !error && summary && summary.total > 0 && (
        <>
          <div className="dash-tile-grid">
            {STAT_TILES.map(({ key, icon, colorClass, value, label }) => (
              <section key={key} className="dl-panel dash-tile">
                <span className={`dash-tile-icon ${colorClass}`}>{icon}</span>
                <div className="dl-stat">
                  <span className="dl-stat-value">{value}</span>
                  <span className="dl-stat-label">{label}</span>
                </div>
              </section>
            ))}
          </div>

          <div className="dash-grid">
            <section className="dl-panel dash-grid-card">
              <h2 className="dl-panel-title">Districts by state</h2>
              <div className="dash-bars">
                {topStates.map(({ state, count }) => (
                  <button
                    key={state}
                    type="button"
                    className="dash-bar-row dash-bar-row-clickable"
                    onClick={() => goToState(state)}
                    title={`Bulk populate ${state}`}
                  >
                    <span className="dash-bar-label">{state}</span>
                    <div className="dash-bar-track">
                      <div
                        className="dash-bar-fill"
                        style={{ transform: `scaleX(${count / maxStateCount})` }}
                      />
                    </div>
                    <span className="dash-bar-count">{count}</span>
                  </button>
                ))}
              </div>
              <p className="dl-hint dash-more-link">
                {remainingStates > 0 ? (
                  <>
                    +{remainingStates} more state{remainingStates === 1 ? '' : 's'} in{' '}
                    <Link to="/districts">All Districts</Link>
                  </>
                ) : (
                  'Click a state to bulk populate it'
                )}
              </p>
            </section>

            <section className="dl-panel dash-grid-card">
              <h2 className="dl-panel-title">Enrollment bands</h2>
              <div className="dash-bars">
                {summary.byBand.map(({ label, count }) => (
                  <div key={label} className="dash-bar-row">
                    <span className="dash-bar-label">{label}</span>
                    <div className="dash-bar-track">
                      <div
                        className="dash-bar-fill dash-bar-fill-amber"
                        style={{ transform: `scaleX(${count / maxBandCount})` }}
                      />
                    </div>
                    <span className="dash-bar-count">{count}</span>
                  </div>
                ))}
              </div>
              <p className="dl-hint dash-more-link">
                {summary.knownEnrollment} of {summary.total} district
                {summary.total === 1 ? '' : 's'} have a known enrollment figure
              </p>
            </section>
          </div>

          <section className="dl-panel">
            <h2 className="dl-panel-title">Quick actions</h2>
            <div className="dash-quick-grid">
              {QUICK_ACTIONS.map(({ to, icon, colorClass, label, desc }) => (
                <Link key={to} className="dash-quick-tile" to={to}>
                  <span className={`dash-tile-icon ${colorClass}`}>{icon}</span>
                  <span className="dash-quick-text">
                    <span className="dash-quick-label">{label}</span>
                    <span className="dash-quick-desc">{desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <div className="dash-grid">
            <section className="dl-panel dash-grid-card">
              <h2 className="dl-panel-title">Interest Status</h2>
              <div className="dash-legend-row">
                {interestRows.map(({ key, label, count, dotClass }) => (
                  <div key={key} className="dash-legend-item">
                    <span className={`dash-legend-dot ${dotClass}`} />
                    <span className="dash-legend-label">{label}</span>
                    <span className="dash-legend-count">{count}</span>
                  </div>
                ))}
              </div>
              <div className="dash-segmented-track">
                {interestRows.map(
                  ({ key, count, segClass }) =>
                    count > 0 && (
                      <div
                        key={key}
                        className={`dash-segment ${segClass}`}
                        style={{ flexBasis: `${(count / interestTotal) * 100}%` }}
                      />
                    )
                )}
              </div>
              <p className="dash-static-note">Open exported file to update →</p>
            </section>

            <section className="dl-panel dash-grid-card dash-gauge-card">
              <h2 className="dl-panel-title">Contacted rate</h2>
              <div className="dash-gauge-body">
                <ContactedGauge pct={contactedPct} />
                <p className="dash-gauge-caption">
                  {summary.contacted} of {summary.total} districts contacted
                </p>
              </div>
            </section>
          </div>

          <section className="dl-panel">
            <h2 className="dl-panel-title">Needs follow-up</h2>
            {summary.followUp.length === 0 ? (
              <p className="dl-empty dash-empty-inline">Nothing waiting on follow-up.</p>
            ) : (
              <>
                <ul className="dash-followup-list">
                  {summary.followUp.map((row) => {
                    const teal = TEAL_COHORTS.has(row._cohort)
                    return (
                      <li key={`${row['District']}__${row['State']}`}>
                        <button
                          type="button"
                          className="dash-followup-row dash-followup-row-clickable"
                          onClick={() => goToDistrict(row)}
                          title={`Open ${row['District']}`}
                        >
                          <span className={`dash-avatar${teal ? ' dash-avatar-teal' : ' dash-avatar-amber'}`}>
                            {row['District'].charAt(0)}
                          </span>
                          <span className="dash-followup-name">
                            {row['District']}
                            <span className="dash-followup-state">{row['State']}</span>
                          </span>
                          <span className="dash-followup-meta">
                            <span className="dash-followup-enrollment">
                              {row._enrollment.toLocaleString()}
                            </span>
                            <span className={`dash-tier-badge${teal ? ' dash-tier-teal' : ' dash-tier-amber'}`}>
                              {row._cohort}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <Link className="dash-more-link-solo" to="/districts">
                  View all {summary.notContacted} →
                </Link>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
