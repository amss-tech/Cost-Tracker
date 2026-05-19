import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, gmPct, gmCell } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

export default function JobCostReport() {
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [cos, setCOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterPM, setFilterPM] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('*').order('job_number'),
      supabase.from('purchase_orders').select('job_id, amount'),
      supabase.from('invoices').select('job_id, amount, po_id'),
      supabase.from('uncommitted_costs').select('job_id, amount'),
      supabase.from('billings').select('job_id, amount'),
      supabase.from('change_orders').select('job_id, revenue_amount, cost_amount, status'),
    ]).then(([j, p, inv, uc, bil, co]) => {
      setJobs(j.data || [])
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setBillings(bil.data || [])
      setCOs(co.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const posByJob = {}, ucByJob = {}, directInvByJob = {}, billedByJob = {}, coRevByJob = {}, coCostByJob = {}
  pos.forEach(p => { posByJob[p.job_id] = (posByJob[p.job_id] || 0) + (p.amount || 0) })
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })
  invoices.filter(i => !i.po_id).forEach(i => { directInvByJob[i.job_id] = (directInvByJob[i.job_id] || 0) + (i.amount || 0) })
  billings.forEach(b => { billedByJob[b.job_id] = (billedByJob[b.job_id] || 0) + (b.amount || 0) })
  cos.filter(c => c.status === 'Approved').forEach(c => {
    coRevByJob[c.job_id] = (coRevByJob[c.job_id] || 0) + (c.revenue_amount || 0)
    coCostByJob[c.job_id] = (coCostByJob[c.job_id] || 0) + (c.cost_amount || 0)
  })

  const pms = [...new Set(jobs.map(j => j.project_manager).filter(Boolean))].sort()
  const types = [...new Set(jobs.map(j => j.job_type).filter(Boolean))].sort()

  const rows = jobs.map(j => {
    const tracked = (posByJob[j.id] || 0) + (directInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const revisedRevenue = (j.estimated_revenue || 0) + (coRevByJob[j.id] || 0)
    const revisedCost = (j.estimated_cost || 0) + (coCostByJob[j.id] || 0)
    const variance = revisedCost - tracked
    const estGM = gmPct(revisedRevenue, revisedCost)
    const actualGM = tracked > 0 ? gmPct(revisedRevenue, tracked) : null
    const billed = billedByJob[j.id] || 0
    const leftToBill = revisedRevenue - billed
    return { ...j, tracked, revisedRevenue, revisedCost, variance, estGM, actualGM, billed, leftToBill }
  }).filter(j => {
    if (search && !j.job_number?.toLowerCase().includes(search.toLowerCase()) &&
        !j.job_description?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterPM && j.project_manager !== filterPM) return false
    if (filterType && j.job_type !== filterType) return false
    return true
  })

  const totals = rows.reduce((acc, j) => ({
    revisedRevenue: acc.revisedRevenue + j.revisedRevenue,
    revisedCost: acc.revisedCost + j.revisedCost,
    tracked: acc.tracked + j.tracked,
    variance: acc.variance + j.variance,
    billed: acc.billed + j.billed,
    leftToBill: acc.leftToBill + j.leftToBill,
  }), { revisedRevenue: 0, revisedCost: 0, tracked: 0, variance: 0, billed: 0, leftToBill: 0 })

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Type', 'Contract Value', 'Est. Cost', 'Est GM%', 'Tracked Cost', 'Actual GM%', 'Variance', 'Billed', 'Left to Bill']
    const csvRows = rows.map(j => [
      j.job_number, j.job_description, j.project_manager, j.job_type,
      j.revisedRevenue, j.revisedCost,
      j.estGM != null ? (j.estGM * 100).toFixed(1) + '%' : '',
      j.tracked,
      j.actualGM != null ? (j.actualGM * 100).toFixed(1) + '%' : '',
      j.variance, j.billed, j.leftToBill,
    ])
    downloadCSV(`job-cost-summary-${new Date().toISOString().slice(0,10)}.csv`, headers, csvRows)
  }

  return (
    <div>
      <div className="filter-row no-print" style={{ marginBottom: 16 }}>
        <input type="text" placeholder="Search job # or description..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filterPM} onChange={e => setFilterPM(e.target.value)}>
          <option value="">All PMs</option>
          {pms.map(pm => <option key={pm}>{pm}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('Job Cost Summary')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="print-area">
        <div className="print-header">
          <strong>Job Cost Summary</strong>
          <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th><th>Type</th>
                <th className="text-right">Contract Value</th>
                <th className="text-right">Est. Cost</th>
                <th className="text-right">Est GM%</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Actual GM%</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Billed</th>
                <th className="text-right">Left to Bill</th>
              </tr></thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No jobs match the current filters.</td></tr>
                  : rows.map(j => (
                    <tr key={j.id}>
                      <td className="fw-500">{j.job_number}</td>
                      <td>{j.job_description}</td>
                      <td>{j.project_manager}</td>
                      <td>{j.job_type}</td>
                      <td className="text-right">{fmt.currency(j.revisedRevenue)}</td>
                      <td className="text-right">{fmt.currency(j.revisedCost)}</td>
                      <td className="text-right">{gmCell(j.estGM)}</td>
                      <td className="text-right">{j.tracked > 0 ? fmt.currency(j.tracked) : <span className="text-muted">—</span>}</td>
                      <td className="text-right">{gmCell(j.actualGM, j.estGM)}</td>
                      <td className={`text-right fw-500 ${j.tracked > 0 && j.variance < 0 ? 'text-danger' : j.tracked > 0 ? 'text-success' : ''}`}>
                        {j.tracked > 0 ? (j.variance >= 0 ? '+' : '') + fmt.currency(j.variance) : '—'}
                      </td>
                      <td className="text-right">{j.billed > 0 ? fmt.currency(j.billed) : <span className="text-muted">—</span>}</td>
                      <td className={`text-right ${j.leftToBill < 0 ? 'text-danger' : ''}`}>{fmt.currency(j.leftToBill)}</td>
                    </tr>
                  ))
                }
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border-strong)', fontWeight: 600 }}>
                    <td colSpan={4}>Totals ({rows.length} jobs)</td>
                    <td className="text-right">{fmt.currency(totals.revisedRevenue)}</td>
                    <td className="text-right">{fmt.currency(totals.revisedCost)}</td>
                    <td className="text-right">{gmCell(gmPct(totals.revisedRevenue, totals.revisedCost))}</td>
                    <td className="text-right">{fmt.currency(totals.tracked)}</td>
                    <td className="text-right">{gmCell(totals.tracked > 0 ? gmPct(totals.revisedRevenue, totals.tracked) : null, gmPct(totals.revisedRevenue, totals.revisedCost))}</td>
                    <td className={`text-right ${totals.variance < 0 ? 'text-danger' : 'text-success'}`}>
                      {totals.variance >= 0 ? '+' : ''}{fmt.currency(totals.variance)}
                    </td>
                    <td className="text-right">{fmt.currency(totals.billed)}</td>
                    <td className={`text-right ${totals.leftToBill < 0 ? 'text-danger' : ''}`}>{fmt.currency(totals.leftToBill)}</td>
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
