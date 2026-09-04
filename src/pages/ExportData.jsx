import '../DistrictLookup.css'
import './ExportData.css'

const API_BASE = 'http://localhost:3001'

export default function ExportData() {
  return (
    <div className="dl-page">
      <header className="dl-header">
        <h1>Export Data</h1>
        <p className="dl-subtitle">
          Download the current districts.xlsx file directly from the server.
        </p>
      </header>

      <section className="dl-result export-card">
        <span className="export-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M5 2.5h7L15.5 6v11.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
            <path d="M12 2.5V6h3.5" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="export-filename dl-value">districts.xlsx</span>
        <a
          className="dl-primary export-button"
          href={`${API_BASE}/api/download-xlsx`}
          download="districts.xlsx"
        >
          Download
        </a>
      </section>
    </div>
  )
}
