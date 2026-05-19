import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { downloadCSV } from '../lib/reportUtils'
import { Download } from 'lucide-react'

export default function OverheadHours() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterEarnCode, setFilterEarnCode] = useState('')
  const [filterWeek, setFilterWeek] = useState('')

  useEffect(() => {
    supabase.from('overhead_time_entries').select('*').order('work_date', { ascending: false })
      .then(({ data }) => { setEntries(data || []); setLoading(false) })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const employees = [...new Set(entries.map(e => e.employee))].sort()
  const earnCodes = [...new Set(entries.map(e => e.earn_code))].sort()
  const weeks = [...new Set(entries.map(e => e.week_period).filter(Boolean))].sort().reverse()

  const filtered = entries.filter(e => {
    if (filterEmployee && e.employee !== filterEmployee) return false
    if (filterEarnCode && e.earn_code !== filterEarnCode) return false
    if (filterWeek && e.week_period !== filterWeek) return false
    return true
  })

  const totalHours = filtered.reduce((s, e) => s + (e.hours || 0), 0)
  const trainHours = filtered.filter(e => e.earn_code === 'TRAIN').reduce((s, e) => s + (e.hours || 0), 0)
  const vacHours = filtered.filter(e => e.earn_code === 'VAC').reduce((s, e) => s + (e.hours || 0), 0)

  function handleCSV() {
    const headers = ['Date', 'Employee', 'Job / Activity', 'Earn Code', 'Cost Code', 'Hours', 'Week Period', 'Status']
    const rows = filtered.map(e => [
      e.work_date, e.employee, e.job_name || '', e.earn_code,
      e.cost_code || '', e.hours, e.week_period || '', e.status,
    ])
    downloadCSV(`overhead-hours-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Overhead Hours</span>
        <div className="topbar-actions">
          <button className="btn" onClick={handleCSV}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      <div className="page">
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="metric-card">
            <div className="metric-label">Total Hours (filtered)</div>
            <div className="metric-value">{totalHours.toFixed(1)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Training (TRAIN)</div>
            <div className="metric-value">{trainHours.toFixed(1)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Vacation (VAC)</div>
            <div className="metric-value">{vacHours.toFixed(1)}</div>
          </div>
        </div>

        <div className="filter-row">
          <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(em => <option key={em}>{em}</option>)}
          </select>
          <select value={filterEarnCode} onChange={e => setFilterEarnCode(e.target.value)}>
            <option value="">All Earn Codes</option>
            {earnCodes.map(ec => <option key={ec}>{ec}</option>)}
          </select>
          <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)}>
            <option value="">All Weeks</option>
            {weeks.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>

        <div className="card"><div className="table-wrap">
          <table>
            <thead><tr>
              <th>Date</th><th>Employee</th><th>Job / Activity</th>
              <th>Earn Code</th><th>Cost Code</th>
              <th className="text-right">Hours</th><th>Week</th><th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No overhead entries found.</td></tr>
                : filtered.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12 }}>{fmt.date(e.work_date)}</td>
                    <td>{e.employee}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{e.job_name || '—'}</td>
                    <td>
                      <span className={`badge ${e.earn_code === 'TRAIN' ? 'badge-blue' : e.earn_code === 'VAC' ? 'badge-amber' : 'badge-gray'}`}>
                        {e.earn_code}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{e.cost_code || '—'}</td>
                    <td className="text-right fw-500">{e.hours}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{e.week_period || '—'}</td>
                    <td>
                      <span className={`badge ${e.status === 'Approved' ? 'badge-green' : 'badge-amber'}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))
              }
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--color-sidebar)', fontWeight: 600 }}>
                  <td colSpan={5} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)', padding: '8px 12px' }}>Total</td>
                  <td className="text-right" style={{ padding: '8px 12px' }}>{totalHours.toFixed(1)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div></div>
      </div>
    </>
  )
}
