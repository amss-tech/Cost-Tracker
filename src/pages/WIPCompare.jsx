import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge, gmCell, gmPct } from '../lib/utils'
import { Download, Layers } from 'lucide-react'


export default function WIPCompare() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [poLineItems, setPoLineItems] = useState([])
  const [cos, setCOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterFlag, setFilterFlag] = useState('')
  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const defaultTo = now.toISOString().split('T')[0]
  const [periodFrom, setPeriodFrom] = useState(defaultFrom)
  const [periodTo, setPeriodTo] = useState(defaultTo)
  const [seeding, setSeeding] = useState(false)
  const [seedPreview, setSeedPreview] = useState(null)
  const [seedResult, setSeedResult] = useState(null)

  async function load() {
    const [j, p, inv, uc, bil, pli, co] = await Promise.all([
      supabase.from('jobs').select('*').order('job_number'),
      supabase.from('purchase_orders').select('job_id, id, amount, date_issued'),
      supabase.from('invoices').select('job_id, amount, po_id, date_received, foundation_status'),
      supabase.from('uncommitted_costs').select('job_id, amount, cost_date, posted'),
      supabase.from('billings').select('job_id, amount, date_submitted'),
      supabase.from('po_line_items').select('po_id, qty, price_each, invoiced, invoice_date, purchase_orders(job_id)'),
      supabase.from('change_orders').select('job_id, revenue_amount, cost_amount, status'),
    ])
    setJobs(j.data || [])
    setPOs(p.data || [])
    setInvoices(inv.data || [])
    setUncommitted(uc.data || [])
    setBillings(bil.data || [])
    setPoLineItems(pli.data || [])
    setCOs(co.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const ucByJob = {}, billedByJob = {}, coCostByJob = {}, coRevenueByJob = {}
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })
  billings.forEach(b => { billedByJob[b.job_id] = (billedByJob[b.job_id] || 0) + (b.amount || 0) })
  cos.filter(c => c.status === 'Approved').forEach(c => {
    coCostByJob[c.job_id] = (coCostByJob[c.job_id] || 0) + (c.cost_amount || 0)
    coRevenueByJob[c.job_id] = (coRevenueByJob[c.job_id] || 0) + (c.revenue_amount || 0)
  })

  // Tracked cost: uninvoiced PO balance + all invoices + uncommitted
  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })
  const uninvPoByJob = {}
  pos.forEach(p => { uninvPoByJob[p.job_id] = (uninvPoByJob[p.job_id] || 0) + Math.max(0, (p.amount || 0) - (invoicedByPO[p.id] || 0)) })
  const allInvByJob = {}
  invoices.forEach(inv => { allInvByJob[inv.job_id] = (allInvByJob[inv.job_id] || 0) + (inv.amount || 0) })
  // posByJob still needed for unseeded check (has any POs at all)
  const posByJob = {}
  pos.forEach(p => { posByJob[p.job_id] = (posByJob[p.job_id] || 0) + (p.amount || 0) })

  const unseededCosts = jobs.filter(j =>
    (j.jtd_cost || 0) > 0 &&
    !posByJob[j.id] && !ucByJob[j.id] && !(allInvByJob[j.id])
  )
  const unseededBillings = jobs.filter(j =>
    (j.jtd_billing || 0) > 0 && !billedByJob[j.id]
  )

  function buildPreview() { setSeedPreview({ costs: unseededCosts, billings: unseededBillings }) }

  async function confirmSeed() {
    setSeeding(true)
    const today = new Date().toISOString().split('T')[0]
    let costCount = 0, billingCount = 0

    for (const j of seedPreview.costs) {
      const { error } = await supabase.from('uncommitted_costs').insert({
        job_id: j.id,
        category: 'Prior Costs — WIP Opening Balance',
        description: `Opening balance — costs to date from WIP import (${j.wip_period || 'prior period'})`,
        amount: j.jtd_cost,
        cost_date: today,
        posted: true,
      })
      if (!error) costCount++
    }

    for (const j of seedPreview.billings) {
      const { error } = await supabase.from('billings').insert({
        job_id: j.id,
        billing_number: 'Opening Balance',
        description: `Prior billings to date from WIP import (${j.wip_period || 'prior period'})`,
        amount: j.jtd_billing,
        date_submitted: today,
        status: 'Paid',
      })
      if (!error) billingCount++
    }

    setSeedResult({ costCount, billingCount })
    setSeedPreview(null)
    setSeeding(false)
    await load()
  }

  // Open commitments per job — un-invoiced PO line items
  const openCommitByJob = {}
  for (const li of poLineItems) {
    if (!li.invoiced && li.purchase_orders?.job_id) {
      const jid = li.purchase_orders.job_id
      const lineAmt = (parseFloat(li.qty) || 0) * (parseFloat(li.price_each) || 0)
      openCommitByJob[jid] = (openCommitByJob[jid] || 0) + lineAmt
    }
  }

  const rows = jobs.map(j => {
    const tracked = (uninvPoByJob[j.id] || 0) + (allInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const revisedCost = (j.estimated_cost || 0) + (coCostByJob[j.id] || 0)
    const variance = revisedCost - tracked
    const variancePct = revisedCost > 0 ? variance / revisedCost : 0
    const billedToDate = billedByJob[j.id] || 0
    const openCommit = openCommitByJob[j.id] || 0
    const revisedRevenue = (j.estimated_revenue || 0) + (coRevenueByJob[j.id] || 0)
    const leftToBill = revisedRevenue - billedToDate
    const estGM = gmPct(revisedRevenue, revisedCost)
    const actualGM = (revisedRevenue > 0 && tracked > 0) ? gmPct(revisedRevenue, tracked) : null
    let flag = 'No data'
    if (estGM != null && actualGM != null) {
      flag = actualGM < estGM ? 'Over' : 'On Track'
    } else if (tracked > 0 && estGM == null) {
      flag = 'No Est. Rev.'
    } else if (tracked > 0) {
      flag = 'Watch'
    }
    return { ...j, tracked, variance, variancePct, flag, billedToDate, openCommit, leftToBill, estGM, actualGM, revisedCost, revisedRevenue }
  })

  const filtered = filterFlag ? rows.filter(r => r.flag === filterFlag) : rows

  // Portfolio totals
  const totalRevenue = rows.reduce((s, r) => s + (r.revisedRevenue || 0), 0)
  const totalEstCost = rows.reduce((s, r) => s + (r.revisedCost || 0), 0)
  const totalVariance = rows.reduce((s, r) => s + r.variance, 0)
  const totalBilled = rows.reduce((s, r) => s + r.billedToDate, 0)
  const totalTracked = rows.reduce((s, r) => s + r.tracked, 0)
  const totalActualGMdollar = totalBilled - totalTracked
  const totalActualGMpct = totalBilled > 0 ? totalActualGMdollar / totalBilled : null

  // Period activity — per job, based on Posted in Foundation dates
  const periodBillingsByJob = {}
  billings.forEach(b => {
    if (b.date_submitted && b.date_submitted >= periodFrom && b.date_submitted <= periodTo)
      periodBillingsByJob[b.job_id] = (periodBillingsByJob[b.job_id] || 0) + (b.amount || 0)
  })

  const periodCostsByJob = {}
  poLineItems.forEach(li => {
    if (li.invoiced && li.invoice_date && li.invoice_date >= periodFrom && li.invoice_date <= periodTo && li.purchase_orders?.job_id) {
      const jid = li.purchase_orders.job_id
      periodCostsByJob[jid] = (periodCostsByJob[jid] || 0) + (parseFloat(li.qty) || 0) * (parseFloat(li.price_each) || 0)
    }
  })
  invoices.forEach(inv => {
    if (!inv.po_id && inv.foundation_status === 'Posted in Foundation' && inv.date_received && inv.date_received >= periodFrom && inv.date_received <= periodTo)
      periodCostsByJob[inv.job_id] = (periodCostsByJob[inv.job_id] || 0) + (inv.amount || 0)
  })
  uncommitted.forEach(u => {
    if (u.posted && u.cost_date && u.cost_date >= periodFrom && u.cost_date <= periodTo)
      periodCostsByJob[u.job_id] = (periodCostsByJob[u.job_id] || 0) + (u.amount || 0)
  })

  const periodRows = jobs
    .map(j => ({ ...j, periodBillings: periodBillingsByJob[j.id] || 0, periodCosts: periodCostsByJob[j.id] || 0 }))
    .filter(r => r.periodBillings > 0 || r.periodCosts > 0)
    .sort((a, b) => b.periodBillings - a.periodBillings)

  const periodTotalBillings = periodRows.reduce((s, r) => s + r.periodBillings, 0)
  const periodTotalCosts = periodRows.reduce((s, r) => s + r.periodCosts, 0)

  const overJobs = rows.filter(r => r.flag === 'Over')

  function exportCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Est Revenue', 'WIP Est Cost', 'Tracked Cost',
      'Open Commits', 'Variance $', 'Variance %', 'Est GM%', 'Actual GM%', 'Billed to Date', 'Left to Bill', 'Flag']
    const csvRows = rows.map(r => [
      r.job_number, `"${r.job_description}"`, r.project_manager,
      r.revisedRevenue || '', r.revisedCost, r.tracked.toFixed(2),
      r.openCommit.toFixed(2), r.variance.toFixed(2), (r.variancePct * 100).toFixed(1) + '%',
      r.estGM != null ? (r.estGM * 100).toFixed(1) + '%' : '',
      r.actualGM != null ? (r.actualGM * 100).toFixed(1) + '%' : '',
      r.billedToDate.toFixed(2), r.leftToBill.toFixed(2), r.flag,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'wip-compare.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">WIP Comparison</span>
        <div className="topbar-actions">
          {(unseededCosts.length > 0 || unseededBillings.length > 0) && !seedResult && (
            <button className="btn btn-primary" onClick={buildPreview}>
              <Layers size={14} /> Seed Opening Balances
            </button>
          )}
          <button className="btn" onClick={exportCSV}><Download size={14} /> Export CSV</button>
        </div>
      </div>
      <div className="page">

        {seedResult && (
          <div style={{ background: 'var(--color-success)', color: '#fff', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            Opening balances seeded — {seedResult.costCount} cost {seedResult.costCount === 1 ? 'entry' : 'entries'} and {seedResult.billingCount} billing {seedResult.billingCount === 1 ? 'entry' : 'entries'} created. All marked as posted/paid.
            <button className="btn btn-sm" style={{ marginLeft: 16, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff' }} onClick={() => setSeedResult(null)}>Dismiss</button>
          </div>
        )}

        {seedPreview && (
          <div className="card" style={{ marginBottom: 20, padding: '16px 20px', border: '2px solid var(--color-primary)' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Confirm Opening Balance Seed</div>
            {seedPreview.costs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Cost entries to create ({seedPreview.costs.length} jobs):</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {seedPreview.costs.map(j => (
                    <div key={j.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: 'var(--color-sidebar)', borderRadius: 4 }}>
                      <span className="fw-500">{j.job_number}</span>
                      <span style={{ color: 'var(--color-text-2)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.job_description}</span>
                      <span className="fw-500">{fmt.currency(j.jtd_cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {seedPreview.billings.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Billing entries to create ({seedPreview.billings.length} jobs):</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {seedPreview.billings.map(j => (
                    <div key={j.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: 'var(--color-sidebar)', borderRadius: 4 }}>
                      <span className="fw-500">{j.job_number}</span>
                      <span style={{ color: 'var(--color-text-2)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.job_description}</span>
                      <span className="fw-500">{fmt.currency(j.jtd_billing)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {seedPreview.costs.length === 0 && seedPreview.billings.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No jobs need seeding — all jobs with WIP data already have entries.</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={confirmSeed} disabled={seeding || (seedPreview.costs.length === 0 && seedPreview.billings.length === 0)}>
                {seeding ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirm — Create Entries'}
              </button>
              <button className="btn" onClick={() => setSeedPreview(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Portfolio Summary */}
        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Total Contract Revenue</div>
            <div className="metric-value">{fmt.currency(totalRevenue)}</div>
            <div className="metric-sub">Estimated across all active jobs</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Est. Cost</div>
            <div className="metric-value">{fmt.currency(totalEstCost)}</div>
            <div className="metric-sub">WIP estimate total</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Cost Variance</div>
            <div className="metric-value" style={{ color: totalVariance < -10000 ? 'var(--color-danger)' : totalVariance < 0 ? 'var(--color-warning)' : 'inherit' }}>
              {(totalVariance >= 0 ? '+' : '') + fmt.currency(totalVariance)}
            </div>
            <div className="metric-sub">Est. cost vs tracked costs</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Actual GM $</div>
            <div className="metric-value" style={{ color: totalActualGMdollar < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {fmt.currency(totalActualGMdollar)}
            </div>
            <div className="metric-sub">Billed minus tracked costs</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Actual GM %</div>
            <div className="metric-value" style={{ color: totalActualGMpct != null && totalActualGMpct < 0.15 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {totalActualGMpct != null ? (totalActualGMpct * 100).toFixed(1) + '%' : '—'}
            </div>
            <div className="metric-sub">On {fmt.currency(totalBilled)} billed</div>
          </div>
        </div>

        <div className="filter-row" style={{ marginBottom: 14 }}>
          <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}>
            <option value="">All Jobs</option>
            <option>Over</option><option>Watch</option><option>On Track</option><option>No Est. Rev.</option><option>No data</option>
          </select>
          {overJobs.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--color-danger)', marginLeft: 8 }}>
              {overJobs.length} job{overJobs.length > 1 ? 's' : ''} over budget
            </span>
          )}
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th>
                <th className="text-right">Est. Revenue</th>
                <th className="text-right">WIP Est. Cost</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Open Commits</th>
                <th className="text-right">Variance $</th>
                <th className="text-right">Variance %</th>
                <th className="text-right">Est GM%</th>
                <th className="text-right">Actual GM%</th>
                <th className="text-right">Billed to Date</th>
                <th className="text-right">Left to Bill</th>
                <th>Flag</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No jobs match this filter.</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/jobs/${r.id}`)}>
                      <td className="fw-500">{r.job_number}</td>
                      <td>{r.job_description}</td>
                      <td>{r.project_manager}</td>
                      <td className="text-right" style={{ color: !r.revisedRevenue ? 'var(--color-warning)' : 'inherit' }}>
                        {r.revisedRevenue ? fmt.currency(r.revisedRevenue) : <span style={{ fontSize: 11 }}>missing</span>}
                      </td>
                      <td className="text-right">{fmt.currency(r.revisedCost)}</td>
                      <td className="text-right">{r.tracked > 0 ? fmt.currency(r.tracked) : <span className="text-muted">—</span>}</td>
                      <td className="text-right" style={{ color: r.openCommit > 0 ? 'var(--color-warning)' : 'inherit' }}>
                        {r.openCommit > 0 ? fmt.currency(r.openCommit) : <span className="text-muted">—</span>}
                      </td>
                      <td className={`text-right fw-500 ${r.tracked > 0 && r.variance < 0 ? 'text-danger' : r.tracked > 0 && r.variance > 0 ? 'text-success' : ''}`}>
                        {r.tracked > 0 ? (r.variance >= 0 ? '+' : '') + fmt.currency(r.variance) : '—'}
                      </td>
                      <td className={`text-right ${r.tracked > 0 && r.variancePct < 0 ? 'text-danger' : r.tracked > 0 ? 'text-success' : ''}`}>
                        {r.tracked > 0 ? (r.variancePct >= 0 ? '+' : '') + (r.variancePct * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td className="text-right">{gmCell(r.estGM, null)}</td>
                      <td className="text-right">{gmCell(r.actualGM, r.estGM)}</td>
                      <td className="text-right">{r.billedToDate > 0 ? fmt.currency(r.billedToDate) : <span className="text-muted">—</span>}</td>
                      <td className="text-right" style={{ color: r.leftToBill < 0 ? 'var(--color-danger)' : r.leftToBill === 0 ? 'var(--color-success)' : 'inherit' }}>
                        {fmt.currency(r.leftToBill)}
                      </td>
                      <td>
                        {r.flag === 'Over' && <span className="badge badge-red">Over</span>}
                        {r.flag === 'Watch' && <span className="badge badge-amber">Watch</span>}
                        {r.flag === 'On Track' && <span className="badge badge-green">On Track</span>}
                        {r.flag === 'No Est. Rev.' && <span className="badge badge-amber" title="Has billing but no estimated revenue — edit job to add Est. Revenue">No Est. Rev.</span>}
                        {r.flag === 'No data' && <span className="badge badge-gray">No data</span>}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Period Activity */}
        <div style={{ marginTop: 32 }}>
          <div className="section-header">
            <span className="section-title">Period Activity</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-2)' }}>From</label>
            <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={{ fontSize: 13 }} />
            <label style={{ fontSize: 12, color: 'var(--color-text-2)' }}>To</label>
            <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={{ fontSize: 13 }} />
            <button className="btn btn-sm" onClick={() => { setPeriodFrom(defaultFrom); setPeriodTo(defaultTo) }}>
              This Month
            </button>
          </div>
          {periodRows.length === 0 ? (
            <div style={{ color: 'var(--color-text-3)', fontSize: 13, padding: '16px 0' }}>
              No billing or posted cost activity in this period.
            </div>
          ) : (
            <div className="card"><div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Job #</th>
                  <th>Description</th>
                  <th className="text-right">Billings</th>
                  <th className="text-right">Costs</th>
                  <th className="text-right">Net</th>
                </tr></thead>
                <tbody>
                  {periodRows.map(r => {
                    const net = r.periodBillings - r.periodCosts
                    return (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/jobs/${r.id}`)}>
                        <td className="fw-500">{r.job_number}</td>
                        <td>{r.job_description}</td>
                        <td className="text-right">{r.periodBillings > 0 ? fmt.currency(r.periodBillings) : <span className="text-muted">—</span>}</td>
                        <td className="text-right">{r.periodCosts > 0 ? fmt.currency(r.periodCosts) : <span className="text-muted">—</span>}</td>
                        <td className={`text-right fw-500 ${net < 0 ? 'text-danger' : 'text-success'}`}>
                          {(net >= 0 ? '+' : '') + fmt.currency(net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border)', fontWeight: 600 }}>
                    <td colSpan={2} style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Period Total</td>
                    <td className="text-right">{fmt.currency(periodTotalBillings)}</td>
                    <td className="text-right">{fmt.currency(periodTotalCosts)}</td>
                    <td className={`text-right ${periodTotalBillings - periodTotalCosts < 0 ? 'text-danger' : 'text-success'}`}>
                      {(periodTotalBillings - periodTotalCosts >= 0 ? '+' : '') + fmt.currency(periodTotalBillings - periodTotalCosts)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div></div>
          )}
        </div>

      </div>
    </>
  )
}
