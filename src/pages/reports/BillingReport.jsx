import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

const STATUS_COLOR = {
  Paid: 'badge-green',
  Approved: 'badge-amber',
  Submitted: 'badge-blue',
  Pending: 'badge-gray',
  Disputed: 'badge-red',
}

export default function BillingReport() {
  const [billings, setBillings] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPM, setFilterPM] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('billings').select('*').order('date_submitted', { ascending: false }),
      supabase.from('jobs').select('id, job_number, job_description, project_manager').order('job_number'),
    ]).then(([bil, j]) => {
      setBillings(bil.data || [])
      setJobs(j.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const jobMap = {}
  jobs.forEach(j => { jobMap[j.id] = j })
  const pms = [...new Set(jobs.map(j => j.project_manager).filter(Boolean))].sort()
  const today = new Date()

  const rows = billings.map(b => {
    const job = jobMap[b.job_id] || {}
    const submitted = b.date_submitted ? new Date(b.date_submitted) : null
    const daysOut = submitted && b.status !== 'Paid' ? Math.floor((today - submitted) / 86400000) : null
    return { ...b, job, daysOut }
  }).filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (filterPM && b.job?.project_manager !== filterPM) return false
    if (dateFrom && b.date_submitted && b.date_submitted < dateFrom) return false
    if (dateTo && b.date_submitted && b.date_submitted > dateTo) return false
    return true
  })

  const byStatus = {}
  rows.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + (b.amount || 0) })
  const totalOutstanding = rows.filter(b => b.status !== 'Paid').reduce((s, b) => s + (b.amount || 0), 0)
  const totalPaid = rows.filter(b => b.status === 'Paid').reduce((s, b) => s + (b.amount || 0), 0)
  const aging30 = rows.filter(b => b.daysOut != null && b.daysOut > 30).reduce((s, b) => s + (b.amount || 0), 0)
  const aging60 = rows.filter(b => b.daysOut != null && b.daysOut > 60).reduce((s, b) => s + (b.amount || 0), 0)

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Billing #', 'Description', 'Amount', 'Date Submitted', 'Date Approved', 'Days Outstanding', 'Status']
    const csvRows = rows.map(b => [
      b.job?.job_number, b.job?.job_description, b.job?.project_manager,
      b.billing_number, b.description, b.amount,
      b.date_submitted, b.date_approved,
      b.daysOut != null ? b.daysOut : '',
      b.status,
    ])
    downloadCSV(`billing-status-${new Date().toISOString().slice(0,10)}.csv`, headers, csvRows)
  }

  return (
    <div>
      <div className="filter-row no-print" style={{ marginBottom: 16 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['Submitted', 'Approved', 'Paid', 'Pending', 'Disputed'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterPM} onChange={e => setFilterPM(e.target.value)}>
          <option value="">All PMs</option>
          {pms.map(pm => <option key={pm}>{pm}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('Billing Status Report')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="print-area">
        <div className="print-header">
          <strong>Billing Status Report</strong>
          <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="metric-card">
            <div className="metric-label">Outstanding</div>
            <div className="metric-value" style={{ color: 'var(--color-warning)' }}>{fmt.currency(totalOutstanding)}</div>
            <div className="metric-sub">{rows.filter(b => b.status !== 'Paid').length} billings not yet paid</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Collected (Paid)</div>
            <div className="metric-value" style={{ color: 'var(--color-success)' }}>{fmt.currency(totalPaid)}</div>
            <div className="metric-sub">{rows.filter(b => b.status === 'Paid').length} billings paid</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Aging 30+ Days</div>
            <div className="metric-value" style={{ color: aging30 > 0 ? 'var(--color-warning)' : 'inherit' }}>{fmt.currency(aging30)}</div>
            <div className="metric-sub">{rows.filter(b => b.daysOut != null && b.daysOut > 30).length} billings</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Aging 60+ Days</div>
            <div className="metric-value" style={{ color: aging60 > 0 ? 'var(--color-danger)' : 'inherit' }}>{fmt.currency(aging60)}</div>
            <div className="metric-sub">{rows.filter(b => b.daysOut != null && b.daysOut > 60).length} billings</div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>PM</th><th>Billing #</th><th>Description</th>
                <th className="text-right">Amount</th>
                <th>Submitted</th><th>Approved / Paid</th>
                <th className="text-right">Days Out</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No billings match the current filters.</td></tr>
                  : rows.map(b => (
                    <tr key={b.id}>
                      <td className="fw-500">{b.job?.job_number}</td>
                      <td>{b.job?.project_manager}</td>
                      <td>{b.billing_number}</td>
                      <td>{b.description}</td>
                      <td className="text-right fw-500">{fmt.currency(b.amount)}</td>
                      <td>{fmt.date(b.date_submitted)}</td>
                      <td>{fmt.date(b.date_approved)}</td>
                      <td className={`text-right ${b.daysOut > 60 ? 'text-danger' : b.daysOut > 30 ? 'text-warning' : ''}`}>
                        {b.daysOut != null ? b.daysOut : '—'}
                      </td>
                      <td><span className={`badge ${STATUS_COLOR[b.status] || 'badge-gray'}`}>{b.status}</span></td>
                    </tr>
                  ))
                }
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border-strong)', fontWeight: 600 }}>
                    <td colSpan={4}>Total ({rows.length} billings)</td>
                    <td className="text-right">{fmt.currency(rows.reduce((s, b) => s + (b.amount || 0), 0))}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
