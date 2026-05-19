import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, gmPct } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

export default function WIPReport() {
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [cos, setCOs] = useState([])
  const [wipPeriod, setWipPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterPM, setFilterPM] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('*').order('job_number'),
      supabase.from('purchase_orders').select('job_id, amount'),
      supabase.from('invoices').select('job_id, amount, po_id'),
      supabase.from('uncommitted_costs').select('job_id, amount'),
      supabase.from('billings').select('job_id, amount'),
      supabase.from('change_orders').select('job_id, revenue_amount, cost_amount, status'),
      supabase.from('wip_imports').select('period').order('imported_at', { ascending: false }).limit(1),
    ]).then(([j, p, inv, uc, bil, co, wi]) => {
      setJobs(j.data || [])
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setBillings(bil.data || [])
      setCOs(co.data || [])
      setWipPeriod(wi.data?.[0]?.period || '')
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

  const rows = jobs.map(j => {
    const tracked = (posByJob[j.id] || 0) + (directInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const revisedRevenue = (j.estimated_revenue || 0) + (coRevByJob[j.id] || 0)
    const revisedCost = (j.estimated_cost || 0) + (coCostByJob[j.id] || 0)
    const pctComplete = j.pct_complete || 0
    const earnedRevenue = pctComplete * revisedRevenue
    const billed = billedByJob[j.id] || 0
    const billingPosition = billed - earnedRevenue
    const costToComplete = revisedCost - tracked
    return { ...j, tracked, revisedRevenue, revisedCost, pctComplete, earnedRevenue, billed, billingPosition, costToComplete }
  }).filter(j => {
    if (filterPM && j.project_manager !== filterPM) return false
    return j.revisedRevenue > 0
  })

  const totals = rows.reduce((acc, j) => ({
    revisedRevenue: acc.revisedRevenue + j.revisedRevenue,
    revisedCost: acc.revisedCost + j.revisedCost,
    tracked: acc.tracked + j.tracked,
    earnedRevenue: acc.earnedRevenue + j.earnedRevenue,
    billed: acc.billed + j.billed,
    billingPosition: acc.billingPosition + j.billingPosition,
    costToComplete: acc.costToComplete + j.costToComplete,
  }), { revisedRevenue: 0, revisedCost: 0, tracked: 0, earnedRevenue: 0, billed: 0, billingPosition: 0, costToComplete: 0 })

  const overbilled = rows.filter(j => j.billingPosition > 0).reduce((s, j) => s + j.billingPosition, 0)
  const underbilled = rows.filter(j => j.billingPosition < 0).reduce((s, j) => s + j.billingPosition, 0)

  function billingPositionCell(val) {
    if (val === 0) return <span>—</span>
    const cls = val > 0 ? 'text-danger' : 'text-success'
    const label = val > 0 ? 'Overbilled' : 'Underbilled'
    return <span className={`fw-500 ${cls}`} title={label}>{val > 0 ? '+' : ''}{fmt.currency(val)}</span>
  }

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Contract Value', 'Est. Cost', '% Complete', 'Tracked Cost', 'Earned Revenue', 'Billed to Date', 'Billing Position', 'Cost to Complete']
    const csvRows = rows.map(j => [
      j.job_number, j.job_description, j.project_manager,
      j.revisedRevenue, j.revisedCost,
      (j.pctComplete * 100).toFixed(1) + '%',
      j.tracked, j.earnedRevenue, j.billed, j.billingPosition, j.costToComplete,
    ])
    downloadCSV(`wip-report-${new Date().toISOString().slice(0,10)}.csv`, headers, csvRows)
  }

  return (
    <div>
      <div className="filter-row no-print" style={{ marginBottom: 16 }}>
        <select value={filterPM} onChange={e => setFilterPM(e.target.value)}>
          <option value="">All PMs</option>
          {pms.map(pm => <option key={pm}>{pm}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('WIP Report')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="print-area">
        <div className="print-header">
          <strong>Work in Progress (WIP) Report</strong>
          <span>{wipPeriod ? `Period: ${wipPeriod}` : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div className="metric-grid no-print" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="metric-card">
            <div className="metric-label">Total Contract Value</div>
            <div className="metric-value">{fmt.currency(totals.revisedRevenue)}</div>
            <div className="metric-sub">{rows.length} jobs</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Earned Revenue</div>
            <div className="metric-value">{fmt.currency(totals.earnedRevenue)}</div>
            <div className="metric-sub">{totals.revisedRevenue > 0 ? ((totals.earnedRevenue / totals.revisedRevenue) * 100).toFixed(1) : 0}% of contract</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Billed to Date</div>
            <div className="metric-value">{fmt.currency(totals.billed)}</div>
            <div className="metric-sub">vs {fmt.currency(totals.earnedRevenue)} earned</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Net WIP Position</div>
            <div className="metric-value" style={{ color: totals.billingPosition > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {totals.billingPosition >= 0 ? '+' : ''}{fmt.currency(totals.billingPosition)}
            </div>
            <div className="metric-sub">{totals.billingPosition > 0 ? 'Overbilled overall' : 'Underbilled overall'}</div>
          </div>
        </div>

        {overbilled > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="metric-card" style={{ flex: 1, borderLeft: '3px solid var(--color-danger)' }}>
              <div className="metric-label">Overbilled Exposure</div>
              <div className="metric-value text-danger">{fmt.currency(overbilled)}</div>
              <div className="metric-sub">Billed ahead of earned revenue</div>
            </div>
            <div className="metric-card" style={{ flex: 1, borderLeft: '3px solid var(--color-success)' }}>
              <div className="metric-label">Underbilled Opportunity</div>
              <div className="metric-value text-success">{fmt.currency(Math.abs(underbilled))}</div>
              <div className="metric-sub">Earned but not yet billed</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th>
                <th className="text-right">Contract</th>
                <th className="text-right">Est. Cost</th>
                <th className="text-right">% Complete</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Earned Revenue</th>
                <th className="text-right">Billed to Date</th>
                <th className="text-right">Billing Position</th>
                <th className="text-right">Cost to Complete</th>
              </tr></thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No jobs found.</td></tr>
                  : rows.map(j => (
                    <tr key={j.id}>
                      <td className="fw-500">{j.job_number}</td>
                      <td>{j.job_description}</td>
                      <td>{j.project_manager}</td>
                      <td className="text-right">{fmt.currency(j.revisedRevenue)}</td>
                      <td className="text-right">{fmt.currency(j.revisedCost)}</td>
                      <td className="text-right">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <div style={{ width: 48, height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, j.pctComplete * 100)}%`, height: '100%', background: j.pctComplete > 1 ? 'var(--color-danger)' : 'var(--color-success)' }} />
                          </div>
                          {fmt.pct(j.pctComplete)}
                        </div>
                      </td>
                      <td className="text-right">{j.tracked > 0 ? fmt.currency(j.tracked) : <span className="text-muted">—</span>}</td>
                      <td className="text-right">{fmt.currency(j.earnedRevenue)}</td>
                      <td className="text-right">{j.billed > 0 ? fmt.currency(j.billed) : <span className="text-muted">—</span>}</td>
                      <td className="text-right">{billingPositionCell(j.billingPosition)}</td>
                      <td className="text-right">{fmt.currency(j.costToComplete)}</td>
                    </tr>
                  ))
                }
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border-strong)', fontWeight: 600 }}>
                    <td colSpan={3}>Totals ({rows.length} jobs)</td>
                    <td className="text-right">{fmt.currency(totals.revisedRevenue)}</td>
                    <td className="text-right">{fmt.currency(totals.revisedCost)}</td>
                    <td />
                    <td className="text-right">{fmt.currency(totals.tracked)}</td>
                    <td className="text-right">{fmt.currency(totals.earnedRevenue)}</td>
                    <td className="text-right">{fmt.currency(totals.billed)}</td>
                    <td className={`text-right ${totals.billingPosition > 0 ? 'text-danger' : 'text-success'}`}>
                      {totals.billingPosition >= 0 ? '+' : ''}{fmt.currency(totals.billingPosition)}
                    </td>
                    <td className="text-right">{fmt.currency(totals.costToComplete)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-3)' }}>
          Billing Position = Billed to Date minus Earned Revenue. Positive = overbilled (risk). Negative = underbilled (opportunity).
        </div>
      </div>
    </div>
  )
}
