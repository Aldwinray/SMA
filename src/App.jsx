import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import DistrictLookup from './DistrictLookup.jsx'
import UsageCost from './pages/UsageCost.jsx'
import ExportData from './pages/ExportData.jsx'
import BulkPopulateState from './pages/BulkPopulateState.jsx'
import AllDistricts from './pages/AllDistricts.jsx'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lookup" element={<DistrictLookup />} />
        <Route path="/bulk-populate" element={<BulkPopulateState />} />
        <Route path="/districts" element={<AllDistricts />} />
        <Route path="/usage" element={<UsageCost />} />
        <Route path="/export" element={<ExportData />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
