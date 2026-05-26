import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge, jobTypeBadge, gmPct, gmCell } from '../lib/utils'
import { Plus, Download } from 'lucide-react'

export default function Jobs() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [cos, setCOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [glByJob, setGlByJob] = useState({})
  const [search, setSearch] = useState('')
  const [filterPM, setFilterPM] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    async function load() {
      const [j, p, inv, uc, bil, co, gl] = await Promise.all([
        supabase.from('jobs').select('*').order('job_number'),
        supabase.from('purchase_orders').select('id, job_id, amount'),
        supabase.from('invoices').select('job_id, amount, po_id'),
        supabase.from('uncommitted_costs').select('job_id, amount'),
        supabase.from('billings').select('job_id, amount'),
        supabase.from('change_orders').select('job_id, revenue_amount, cost_amount, status'),
        supabase.from('gl_totals_by_job').select('job_id, gl_total'),
      ])
      setJobs(j.data || [])
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setBillings(bil.data || [])
      setCOs(co.data || [])
      const glMap = {}
      gl.data?.forEach(r => { glMap[r.job_id] = r.gl_total || 0 })
      setGlByJob(glMap)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const ucByJob = {}, billedByJob = {}, coRevenueByJob = {}, coCostByJob = {}
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })
  billings.forEach(b => { billedByJob[b.job_id] = (billedByJob[b.job_id] || 0) + (b.amount || 0) })
  cos.filter(c => c.status === 'Approved').forEach(c => {
    coRevenueByJob[c.job_id] = (coRevenueByJob[c.job_id] || 0) + (c.revenue_amount || 0)
    coCostByJob[c.job_id] = (coCostByJob[c.job_id] || 0) + (c.cost_amount || 0)
  })

  // Tracked cost: uninvoiced PO balance + all invoices + uncommitted
  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })
  const uninvPoByJob = {}
  pos.forEach(p => { uninvPoByJob[p.job_id] = (uninvPoByJob[p.job_id] || 0) + Math.max(0, (p.amount || 0) - (invoicedByPO[p.id] || 0)) })
  const allInvByJob = {}
  invoices.forEach(inv => { allInvByJob[inv.job_id] = (allInvByJob[inv.job_id] || 0) + (inv.amount || 0) })

  const pms = [...new Set(jobs.map(j => j.project_manager).filter(Boolean))].sort()
  const types = [...new Set(jobs.map(j => j.job_type).filter(Boolean))].sort()

  const filtered = jobs.map(j => {
    const tracked = (uninvPoByJob[j.id] || 0) + (allInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const revisedRevenue = (j.estimated_revenue || 0) + (coRevenueByJob[j.id] || 0)
    const revisedCost = (j.estimated_cost || 0) + (coCostByJob[j.id] || 0)
    const variance = revisedCost - tracked
    const estGM = gmPct(revisedRevenue, revisedCost)
    const forecastGM = tracked > 0 ? gmPct(revisedRevenue, tracked) : null
    const glCost = glByJob[j.id] || 0
    const actualGLGM = glCost > 0 ? gmPct(revisedRevenue, glCost) : null
    const billed = billedByJob[j.id] || 0
    const leftToBill = revisedRevenue - billed
    return { ...j, tracked, glCost, variance, estGM, forecastGM, actualGLGM, billed, leftToBill, revisedRevenue, revisedCost }
  }).filter(j => {
    if (!showCompleted && j.status === 'Complete') return false
    if (showCompleted && j.status !== 'Complete') return false
    if (search && !j.job_number?.toLowerCase().includes(search.toLowerCase()) &&
        !j.job_description?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterPM && j.project_manager !== filterPM) return false
    if (filterType && j.job_type !== filterType) return false
    if (filterStatus) {
      if (filterStatus === 'Over' && j.variance >= -5000) return false
      if (filterStatus === 'Watch' && (j.variance < -5000 || j.variance >= 0)) return false
      if (filterStatus === 'On Track' && j.variance < 0) return false
    }
    return true
  })

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">
          {showCompleted ? 'Completed Jobs' : 'Active Jobs'} ({filtered.length})
        </span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => setShowCompleted(v => !v)}>
            {showCompleted ? 'Show Active' : 'Show Completed'}
          </button>
          {!showCompleted && (
            <button className="btn btn-primary" onClick={() => navigate('/jobs/new')}>
              <Plus size={14} /> New Job
            </button>
          )}
        </div>
      </div>
      <div className="page">
        <div className="filter-row">
          <input type="text" placeholder="Search job # or description..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={filterPM} onChange={e => setFilterPM(e.target.value)}>
            <option value="">All PMs</option>
            {pms.map(pm => <option key={pm}>{pm}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option>Over</option><option>Watch</option><option>On Track</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th><th>Type</th>
                <th>% Complete</th>
                <th className="text-right">Est. Revenue</th>
                <th className="text-right">Est. Cost</th>
                <th className="text-right">Est GM%</th>
                <th className="text-right">Forecast Cost</th>
                <th className="text-right">Forecast GM%</th>
                <th className="text-right">Actual GM% (GL)</th>
                <th className="text-right">Billed to Date</th>
                <th className="text-right">Left to Bill</th>
                <th className="text-right">Variance</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={15} style={{ textAlign:'center', color:'var(--color-text-3)', padding:32 }}>No jobs found.</td></tr>
                  : filtered.map(j => (
                    <tr key={j.id} className="clickable" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <td className="fw-500">{j.job_number}</td>
                      <td>{j.job_description}</td>
                      <td>{j.project_manager}</td>
                      <td>{jobTypeBadge(j.job_type)}</td>
                      <td>
                        <div className="progress-wrap">
                          <div className="progress-bar">
                            <div className={`progress-fill ${j.pct_complete > 1 ? 'over' : ''}`}
                              style={{ width: `${Math.min(100, (j.pct_complete || 0) * 100)}%` }} />
                          </div>
                          <span style={{ fontSize:12, color:'var(--color-text-2)' }}>{fmt.pct(j.pct_complete)}</span>
                        </div>
                      </td>
                      <td className="text-right">{fmt.currency(j.revisedRevenue)}</td>
                      <td className="text-right">{fmt.currency(j.revisedCost)}</td>
                      <td className="text-right">{gmCell(j.estGM)}</td>
                      <td className="text-right">{j.tracked > 0 ? fmt.currency(j.tracked) : <span className="text-muted">—</span>}</td>
                      <td className="text-right">{gmCell(j.forecastGM, j.estGM)}</td>
                      <td className="text-right">{j.actualGLGM != null ? gmCell(j.actualGLGM, j.estGM) : <span className="text-muted">—</span>}</td>
                      <td className="text-right fw-500" style={{ color: j.billed > 0 ? 'var(--color-primary)' : undefined }}>
                        {j.billed > 0 ? fmt.currency(j.billed) : <span className="text-muted">—</span>}
                      </td>
                      <td className={`text-right fw-500 ${j.leftToBill < 0 ? 'text-danger' : ''}`}>
                        {fmt.currency(j.leftToBill)}
                      </td>
                      <td className={`text-right fw-500 ${j.tracked > 0 && j.variance < 0 ? 'text-danger' : j.tracked > 0 ? 'text-success' : ''}`}>
                        {j.tracked > 0 ? (j.variance >= 0 ? '+' : '') + fmt.currency(j.variance) : '—'}
                      </td>
                      <td>{j.tracked > 0 ? riskBadge(j.variance) : <span className="badge badge-gray">No data</span>}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
