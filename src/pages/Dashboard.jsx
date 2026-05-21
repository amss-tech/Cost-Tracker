import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge, gmPct, gmCell } from '../lib/utils'
import { Upload } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [cos, setCOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [wipPeriod, setWipPeriod] = useState('')

  useEffect(() => {
    async function load() {
      const [j, p, inv, uc, wi, bil, co] = await Promise.all([
        supabase.from('jobs').select('*').order('job_number'),
        supabase.from('purchase_orders').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('uncommitted_costs').select('*'),
        supabase.from('wip_imports').select('period').order('imported_at', { ascending: false }).limit(1),
        supabase.from('billings').select('job_id, amount'),
        supabase.from('change_orders').select('job_id, revenue_amount, cost_amount, status'),
      ])
      setJobs(j.data || [])
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setBillings(bil.data || [])
      setCOs(co.data || [])
      setWipPeriod(wi.data?.[0]?.period || '')
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  // Metrics
  const openPOs = pos.reduce((s, p) => s + (p.amount || 0), 0)

  // Uninvoiced = PO amount minus invoiced amount against that PO
  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })
  const uninvoiced = pos.reduce((s, p) => {
    const invoicedAmt = invoicedByPO[p.id] || 0
    return s + Math.max(0, (p.amount || 0) - invoicedAmt)
  }, 0)

  const unpostedLabor = uncommitted.filter(u => u.category === 'Labor — Hours × Rate' && !u.posted).reduce((s, u) => s + (u.amount || 0), 0)
  const postedInvoices = invoices.filter(inv => inv.foundation_status === 'Posted in Foundation').reduce((s, inv) => s + (inv.amount || 0), 0)
  const postedInvoiceCount = invoices.filter(inv => inv.foundation_status === 'Posted in Foundation').length
  const postedLabor = uncommitted.filter(u => u.category === 'Labor — Hours × Rate' && u.posted).reduce((s, u) => s + (u.amount || 0), 0)

  // Build per-job aggregates for risk table
  const ucByJob = {}, billedByJob = {}, coRevenueByJob = {}, coCostByJob = {}
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })
  billings.forEach(b => { billedByJob[b.job_id] = (billedByJob[b.job_id] || 0) + (b.amount || 0) })
  cos.filter(c => c.status === 'Approved').forEach(c => {
    coRevenueByJob[c.job_id] = (coRevenueByJob[c.job_id] || 0) + (c.revenue_amount || 0)
    coCostByJob[c.job_id] = (coCostByJob[c.job_id] || 0) + (c.cost_amount || 0)
  })

  // Tracked cost: uninvoiced PO balance + all invoices + uncommitted
  // invoicedByPO is already built above for the dashboard uninvoiced metric
  const uninvPoByJob = {}
  pos.forEach(p => { uninvPoByJob[p.job_id] = (uninvPoByJob[p.job_id] || 0) + Math.max(0, (p.amount || 0) - (invoicedByPO[p.id] || 0)) })
  const allInvByJob = {}
  invoices.forEach(inv => { allInvByJob[inv.job_id] = (allInvByJob[inv.job_id] || 0) + (inv.amount || 0) })

  const totalContract = jobs.reduce((s, j) => s + (j.estimated_revenue || 0) + (coRevenueByJob[j.id] || 0), 0)

  const totalBilledAllJobs = billings.reduce((s, b) => s + (b.amount || 0), 0)
  const totalLeftToBill = totalContract - totalBilledAllJobs

  const jobsWithVariance = jobs.map(j => {
    const tracked = (uninvPoByJob[j.id] || 0) + (allInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const revisedRevenue = (j.estimated_revenue || 0) + (coRevenueByJob[j.id] || 0)
    const revisedCost = (j.estimated_cost || 0) + (coCostByJob[j.id] || 0)
    const variance = revisedCost - tracked
    const estGM = gmPct(revisedRevenue, revisedCost)
    const actualGM = tracked > 0 ? gmPct(revisedRevenue, tracked) : null
    const billed = billedByJob[j.id] || 0
    const leftToBill = revisedRevenue - billed
    return { ...j, tracked, variance, estGM, actualGM, billed, leftToBill, revisedRevenue, revisedCost }
  }).filter(j => j.tracked > 0 && j.status !== 'Complete').sort((a, b) => a.variance - b.variance).slice(0, 10)

  // PM chart data
  const pmUninvoiced = {}
  pos.forEach(p => {
    const job = jobs.find(j => j.id === p.job_id)
    if (!job) return
    const uninv = Math.max(0, (p.amount || 0) - (invoicedByPO[p.id] || 0))
    pmUninvoiced[job.project_manager] = (pmUninvoiced[job.project_manager] || 0) + uninv
  })

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-actions">
          {wipPeriod && <span style={{ fontSize: 12, color: 'var(--color-text-3)', marginRight: 4 }}>WIP: {wipPeriod}</span>}
          <button className="btn btn-primary" onClick={() => navigate('/wip-import')}>
            <Upload size={14} /> Import WIP
          </button>
        </div>
      </div>

      <div className="page">
        <div className="metric-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
          <div className="metric-card">
            <div className="metric-label">Total Contract Value</div>
            <div className="metric-value">{fmt.currency(totalContract)}</div>
            <div className="metric-sub">{jobs.length} active jobs</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Open PO Commitments</div>
            <div className="metric-value">{fmt.currency(openPOs)}</div>
            <div className="metric-sub">{pos.length} purchase orders</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Uninvoiced POs</div>
            <div className="metric-value" style={{ color: uninvoiced > 50000 ? 'var(--color-warning)' : 'inherit' }}>
              {fmt.currency(uninvoiced)}
            </div>
            <div className="metric-sub">Cost gap vs Foundation</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Billed to Date</div>
            <div className="metric-value" style={{ color: totalBilledAllJobs > 0 ? 'var(--color-primary)' : 'inherit' }}>
              {fmt.currency(totalBilledAllJobs)}
            </div>
            <div className="metric-sub">Left to bill: {fmt.currency(totalLeftToBill)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Posted Invoices</div>
            <div className="metric-value" style={{ color:'var(--color-success)' }}>
              {fmt.currency(postedInvoices)}
            </div>
            <div className="metric-sub">{postedInvoiceCount} invoice{postedInvoiceCount !== 1 ? 's' : ''} confirmed in Foundation</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Posted Labor</div>
            <div className="metric-value" style={{ color: postedLabor > 0 ? 'var(--color-success)' : 'inherit' }}>
              {fmt.currency(postedLabor)}
            </div>
            <div className="metric-sub">Labor confirmed in Foundation</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Unposted Labor</div>
            <div className="metric-value" style={{ color: unpostedLabor > 0 ? 'var(--color-danger)' : 'inherit' }}>
              {fmt.currency(unpostedLabor)}
            </div>
            <div className="metric-sub">Not yet in Foundation</div>
          </div>
        </div>

        {/* PM Uninvoiced */}
        {Object.keys(pmUninvoiced).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="section-header"><span className="section-title">Uninvoiced exposure by PM</span></div>
            <div style={{ display: 'flex', gap: 12 }}>
              {Object.entries(pmUninvoiced).sort((a,b) => b[1]-a[1]).map(([pm, amt]) => (
                <div key={pm} className="metric-card" style={{ minWidth: 120 }}>
                  <div className="metric-label">{pm}</div>
                  <div className="metric-value" style={{ fontSize: 18 }}>{fmt.currency(amt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk table */}
        <div className="section-header">
          <span className="section-title">Jobs with cost activity</span>
          <button className="btn btn-sm" onClick={() => navigate('/jobs')}>View all</button>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th>
                <th className="text-right">Est. Revenue</th>
                <th className="text-right">Est. Total Cost</th>
                <th className="text-right">Est GM%</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Actual GM%</th>
                <th className="text-right">Billed to Date</th>
                <th className="text-right">Left to Bill</th>
                <th className="text-right">Variance (Over/Under)</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {jobsWithVariance.length === 0
                  ? <tr><td colSpan={12} style={{ textAlign:'center', color:'var(--color-text-3)', padding:32 }}>No cost data yet — start by entering POs against your jobs.</td></tr>
                  : jobsWithVariance.map(j => (
                    <tr key={j.id} className="clickable" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <td className="fw-500">{j.job_number}</td>
                      <td>{j.job_description}</td>
                      <td>{j.project_manager}</td>
                      <td className="text-right">{fmt.currency(j.revisedRevenue)}</td>
                      <td className="text-right">{fmt.currency(j.revisedCost)}</td>
                      <td className="text-right">{gmCell(j.estGM)}</td>
                      <td className="text-right">{fmt.currency(j.tracked)}</td>
                      <td className="text-right">{gmCell(j.actualGM, j.estGM)}</td>
                      <td className="text-right fw-500" style={{ color: j.billed > 0 ? 'var(--color-primary)' : undefined }}>
                        {j.billed > 0 ? fmt.currency(j.billed) : '—'}
                      </td>
                      <td className={`text-right fw-500 ${j.leftToBill < 0 ? 'text-danger' : ''}`}>
                        {fmt.currency(j.leftToBill)}
                      </td>
                      <td className={`text-right fw-500 ${j.variance < 0 ? 'text-danger' : 'text-success'}`}>
                        {j.variance >= 0 ? '+' : ''}{fmt.currency(j.variance)}
                      </td>
                      <td>{riskBadge(j.variance)}</td>
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
