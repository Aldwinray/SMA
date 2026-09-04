import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './AppShell.css'

const API_BASE = 'http://localhost:3001'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/lookup': 'District Lookup',
  '/bulk-populate': 'Bulk Populate State',
  '/districts': 'All Districts',
  '/usage': 'Usage & Cost',
  '/export': 'Export Data',
}

function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage may be unavailable, fall through to default
  }
  return 'light'
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="2" x2="10" y2="4" strokeLinecap="round" />
      <line x1="10" y1="16" x2="10" y2="18" strokeLinecap="round" />
      <line x1="2" y1="10" x2="4" y2="10" strokeLinecap="round" />
      <line x1="16" y1="10" x2="18" y2="10" strokeLinecap="round" />
      <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" strokeLinecap="round" />
      <line x1="14.4" y1="14.4" x2="15.8" y2="15.8" strokeLinecap="round" />
      <line x1="4.2" y1="15.8" x2="5.6" y2="14.4" strokeLinecap="round" />
      <line x1="14.4" y1="5.6" x2="15.8" y2="4.2" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z" strokeLinejoin="round" />
    </svg>
  )
}

const NAV_ITEMS = [
  {
    to: '/',
    end: true,
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.2" />
        <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.2" />
        <rect x="11" y="11" width="6.5" height="6.5" rx="1.2" />
      </svg>
    ),
  },
  {
    to: '/lookup',
    end: false,
    label: 'District Lookup',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <line x1="17" y1="17" x2="12.8" y2="12.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/bulk-populate',
    end: false,
    label: 'Bulk Populate State',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 2.5 L17 6.5 L10 10.5 L3 6.5 Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 10.5 L10 14.5 L17 10.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 14.5 L10 18.5 L17 14.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/districts',
    end: false,
    label: 'All Districts',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
        <line x1="2.5" y1="8" x2="17.5" y2="8" strokeLinecap="round" />
        <line x1="2.5" y1="12" x2="17.5" y2="12" strokeLinecap="round" />
        <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/usage',
    end: false,
    label: 'Usage & Cost',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <line x1="3" y1="17" x2="3" y2="11" strokeLinecap="round" />
        <line x1="8.5" y1="17" x2="8.5" y2="7" strokeLinecap="round" />
        <line x1="14" y1="17" x2="14" y2="9" strokeLinecap="round" />
        <path d="M3 8 L8.5 4 L14 6 L17 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 3 L17 3 L17 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/export',
    end: false,
    label: 'Export Data',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 3 V12" strokeLinecap="round" />
        <path d="M6.5 8.5 L10 12 L13.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 14 V16.5 H16.5 V14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [allDistricts, setAllDistricts] = useState(null)
  const [quickQuery, setQuickQuery] = useState('')
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem('theme', theme)
    } catch {
      // localStorage may be unavailable, ignore
    }
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/districts`)
        const data = await res.json()
        if (res.ok && !cancelled) setAllDistricts(data.districts)
      } catch {
        // quick search is a nice-to-have, ignore failures silently
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleQuickSearch(e) {
    e.preventDefault()
    const q = quickQuery.trim()
    if (!q) return

    const match = allDistricts?.find((r) =>
      (r['District'] || '').toLowerCase().includes(q.toLowerCase())
    )

    if (match) {
      navigate('/lookup', { state: { district: match['District'], state: match['State'], auto: true } })
    } else {
      navigate('/lookup', { state: { district: q, state: '' } })
    }

    setQuickQuery('')
  }

  const pageTitle = PAGE_TITLES[location.pathname] || 'District Research'

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <span className="shell-mark" aria-hidden="true" />
          <div>
            <div className="shell-brand-name">District Research</div>
            <div className="shell-brand-sub">Local, Express + xlsx</div>
          </div>
        </div>

        <nav className="shell-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `shell-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="shell-nav-icon">{item.icon}</span>
              <span className="shell-nav-label">{item.label}</span>
            </NavLink>
          ))}

          <span className="shell-nav-item disabled" aria-disabled="true">
            <span className="shell-nav-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="4.5" y="2.5" width="11" height="15" rx="1.5" />
                <line x1="7" y1="7" x2="13" y2="7" strokeLinecap="round" />
                <line x1="7" y1="10.5" x2="13" y2="10.5" strokeLinecap="round" />
                <line x1="7" y1="14" x2="10.5" y2="14" strokeLinecap="round" />
              </svg>
            </span>
            <span className="shell-nav-label">State Memo</span>
            <span className="shell-soon-badge">soon</span>
          </span>
        </nav>

        <div className="shell-footer">Server: localhost:3001</div>
      </aside>

      <main className="shell-main">
        <header className="shell-topbar">
          <h1 className="shell-topbar-title">{pageTitle}</h1>
          <div className="shell-topbar-right">
            <form className="shell-search" onSubmit={handleQuickSearch}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <line x1="17" y1="17" x2="12.8" y2="12.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Jump to a district…"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
              />
            </form>
            <button
              type="button"
              className="shell-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <div className="shell-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
