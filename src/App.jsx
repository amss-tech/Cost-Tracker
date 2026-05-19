import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Shell from './components/Shell'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import NewJob from './pages/NewJob'
import EditJob from './pages/EditJob'
import POEntry from './pages/POEntry'
import InvoiceEntry from './pages/InvoiceEntry'
import BillingEntry from './pages/BillingEntry'
import UncommittedCosts from './pages/UncommittedCosts'
import WIPImport from './pages/WIPImport'
import WIPCompare from './pages/WIPCompare'
import Reports from './pages/Reports'
import BillingForecast from './pages/BillingForecast'
import TimecardImport from './pages/TimecardImport'
import OverheadHours from './pages/OverheadHours'

function PrivateRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*" element={
          <PrivateRoute session={session}>
            <Shell session={session}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/new" element={<NewJob />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/jobs/:id/edit" element={<EditJob />} />
                <Route path="/po-entry" element={<POEntry />} />
                <Route path="/invoice-entry" element={<InvoiceEntry />} />
                <Route path="/billing-entry" element={<BillingEntry />} />
                <Route path="/uncommitted" element={<UncommittedCosts />} />
                <Route path="/wip-import" element={<WIPImport />} />
                <Route path="/wip-compare" element={<WIPCompare />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/billing-forecast" element={<BillingForecast />} />
                <Route path="/timecard-import" element={<TimecardImport />} />
                <Route path="/overhead-hours" element={<OverheadHours />} />
              </Routes>
            </Shell>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
