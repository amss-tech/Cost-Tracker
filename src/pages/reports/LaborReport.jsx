import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

export default function LaborReport() {
  const [entries, setEntries] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('time_entries').select('*').order('work_date'),
      supabase.from('jobs').select('id, job_number, job_description, project_manager'),
    ]).then(([e, j]) => {
      setEntries(e.data || [])
      setJobs(j.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const jobMap = {}
  jobs.forEach(j => { jobMap[j.id] = j })

  const employees = [...new Set(entries.map(e => e.employee))].sort()

  const filtered = entries.filter(e => {
    if (filterEmployee && e.employee !== filterEmployee) return false
    if (filterDateFrom && e.work_date < filterDateFrom) return false
    if (filterDateTo && e.work_date > filterDateTo) return false
    return true
  })

  // Group by job
  const byJob = {}
  for (const e of filtered) {
    if (!byJob[e.job_id]) byJob[e.job_id] = { reg: 0, wken2: 0, regpm: 0, total: 0, empSet: new Set() }
    byJob[e.job_id].total += e.hours || 0
    if (e.earn_code === 'REG') byJob[e.job_id].reg += e.hours || 0
    if (e.earn_code === 'WKEN2') byJob[e.job_id].wken2 += e.hours || 0
    if (e.earn_code === 'REGPM') byJob[e.job_id].regpm += e.hours || 0
    byJob[e.job_id].empSet.add(e.employee)
  }

  const totalHours = filtered.reduce((s, e) => s + (e.hours || 0), 0)
  const totalReg = filtered.filter(e => e.earn_code === 'REG').reduce((s, e) => s + (e.hours || 0), 0)
  const totalWken2 = filtered.filter(e => e.earn_code === 'WKEN2').reduce((s, e) => s + (e.hours || 0), 0)
  const totalRegpm = filtered.filter(e => e.earn_code === 'REGPM').reduce((s, e) => s + (e.hours || 0), 0)

  const jobRows = Object.entries(byJob).map(([jobId, data]) => ({
    job: jobMap[jobId] || { job_number: '?', job_description: 'Unknown', project_manager: '—' },
    ...data,
    employees: [...data.empSet].join(', '),
  })).sort((a, b) => b.total - a.total)

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Total Hours', 'REG', 'WKEN2', 'REGPM', 'Employees']
    const rows = jobRows.map(r => [
      r.job.job_number, r.job.job_description, r.job.project_manager,
      r.total.toFixed(2), r.reg.toFixed(2), r.wken2.toFixed(2), r.regpm.toFixed(2), r.employees,
    ])
    downloadCSV(`labor-report-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  return (
    <>
      <div className="filter-row no-print" style={{ marginBottom: 16 }}>
        <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(em => <option key={em}>{em}</option>)}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="To date" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn no-print" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn no-print" onClick={() => printReport('Labor Hours Report')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="metric-card">
          <div className="metric-label">Total Project Hours</div>
          <div className="metric-value">{totalHours.toFixed(1)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Regular (REG)</div>
          <div className="metric-value">{totalReg.toFixed(1)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Wage Det. (WKEN2)</div>
          <div className="metric-value">{totalWken2.toFixed(1)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">PM Time (REGPM)</div>
          <div className="metric-value">{totalRegpm.toFixed(1)}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Job #</th><th>Description</th><th>PM</th>
              <th className="text-right">Total Hrs</th>
              <th className="text-right">REG</th>
              <th className="text-right">WKEN2</th>
              <th className="text-right">REGPM</th>
              <th>Employees</th>
            </tr></thead>
            <tbody>
              {jobRows.length === 0
                ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No time entries found for the selected filters.</td></tr>
                : jobRows.map(r => (
                  <tr key={r.job.id || r.job.job_number}>
                    <td className="fw-500">{r.job.job_number}</td>
                    <td>{r.job.job_description}</td>
                    <td>{r.job.project_manager}</td>
                    <td className="text-right fw-500">{r.total.toFixed(1)}</td>
                    <td className="text-right">{r.reg > 0 ? r.reg.toFixed(1) : '—'}</td>
                    <td className="text-right">{r.wken2 > 0 ? r.wken2.toFixed(1) : '—'}</td>
                    <td className="text-right">{r.regpm > 0 ? r.regpm.toFixed(1) : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{r.employees}</td>
                  </tr>
                ))
              }
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-sidebar)', fontWeight: 600 }}>
                <td colSpan={3} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)', padding: '8px 12px' }}>Totals</td>
                <td className="text-right" style={{ padding: '8px 12px' }}>{totalHours.toFixed(1)}</td>
                <td className="text-right" style={{ padding: '8px 12px' }}>{totalReg.toFixed(1)}</td>
                <td className="text-right" style={{ padding: '8px 12px' }}>{totalWken2.toFixed(1)}</td>
                <td className="text-right" style={{ padding: '8px 12px' }}>{totalRegpm.toFixed(1)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}
