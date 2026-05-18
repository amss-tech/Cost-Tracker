import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge } from '../lib/utils'
import { Upload } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [loading, setLoading] = useState(true)
  const [wipPeriod, setWipPeriod] = useState('')

  useEffect(() => {
    async function load() {
      const [j, p, inv, uc, wi] = await Promise.all([
        supabase.from('jobs').select('*').order('job_number'),
        supabase.from('purchase_orders').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('uncommitted_costs').select('*'),
        supabase.from('wip_imports').select('period').order('imported_at', { ascending: false }).limit(1),
      ])
      setJobs(j.data || [])
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setWipPeriod(wi.data?.[0]?.period || '')
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  // Metrics
  const totalContract = jobs.reduce((s, j) => s + (j.estimated_revenue || 0), 0)
  const openPOs = pos.reduce((s, p) => s + (p.amount || 0), 0)

  // Uninvoiced = PO amount minus invoiced amount against that PO
  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })
  const uninvoiced = pos.reduce((s, p) => {
    const invoicedAmt = invoicedByPO[p.id] || 0
    return s + Math.max(0, (p.amount || 0) - invoicedAmt)
  }, 0)

  const unpostedLabor = uncommitted.filter(u => u.category === 'Labor — Hours × Rate').reduce((s, u) => s + (u.amount || 0), 0)

  // Build per-job tracked cost for risk table
  const posByJob = {}, ucByJob = {}
  pos.forEach(p => { posByJob[p.job_id] = (posByJob[p.job_id] || 0) + (p.amount || 0) })
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })

  const jobsWithVariance = jobs.map(j => {
    const tracked = (posByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const variance = (j.estimated_cost || 0) - tracked
    return { ...j, tracked, variance }
  }).filter(j => j.tracked > 0).sort((a, b) => a.variance - b.variance).slice(0, 6)

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
        <div className="metric-grid">
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
                <th className="text-right">Est. Cost (WIP)</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Variance</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {jobsWithVariance.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--color-text-3)', padding:32 }}>No cost data yet — start by entering POs against your jobs.</td></tr>
                  : jobsWithVariance.map(j => (
                    <tr key={j.id} className="clickable" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <td className="fw-500">{j.job_number}</td>
                      <td>{j.job_description}</td>
                      <td>{j.project_manager}</td>
                      <td className="text-right">{fmt.currency(j.estimated_cost)}</td>
                      <td className="text-right">{fmt.currency(j.tracked)}</td>
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
