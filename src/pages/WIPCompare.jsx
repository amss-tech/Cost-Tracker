import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge, gmCell, gmPct } from '../lib/utils'
import { Download, Layers } from 'lucide-react'

const MONTHLY_REV_TARGET = 400_000
const MONTHLY_COST_TARGET = 300_000
const YEARLY_REV_TARGET = 6_000_000
const YEARLY_COST_TARGET = 3_600_000

function ProgressCard({ label, value, target, targetLabel }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const remaining = Math.max(0, target - value)
  const over = value >= target
  const barColor = over ? 'var(--color-success)'
    : pct >= 75 ? 'var(--color-primary)'
    : pct >= 40 ? 'var(--color-warning)'
    : 'var(--color-danger)'
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ fontSize: 20 }}>{fmt.currency(value)}</div>
      <div style={{ margin: '8px 0 3px', height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <div className="metric-sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{pct.toFixed(1)}% of {targetLabel}</span>
        <span style={{ color: over ? 'var(--color-success)' : 'inherit' }}>
          {over ? 'Target met' : `${fmt.currency(remaining)} left`}
        </span>
      </div>
    </div>
  )
}

export default function WIPCompare() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [billings, setBillings] = useState([])
  const [poLineItems, setPoLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterFlag, setFilterFlag] = useState('')
  const [periodView, setPeriodView] = useState('mtd')
  const [seeding, setSeeding] = useState(false)
  const [seedPreview, setSeedPreview] = useState(null)
  const [seedResult, setSeedResult] = useState(null)

  async function load() {
    const [j, p, inv, uc, bil, pli] = await Promise.all([
      supabase.from('jobs').select('*').order('job_number'),
      supabase.from('purchase_orders').select('job_id, amount, date_issued'),
      supabase.from('invoices').select('job_id, amount, po_id, date_received, foundation_status'),
      supabase.from('uncommitted_costs').select('job_id, amount, cost_date, posted'),
      supabase.from('billings').select('job_id, amount, date_submitted'),
      supabase.from('po_line_items').select('po_id, qty, price_each, invoiced, invoice_date, purchase_orders(job_id)'),
    ])
    setJobs(j.data || [])
    setPOs(p.data || [])
    setInvoices(inv.data || [])
    setUncommitted(uc.data || [])
    setBillings(bil.data || [])
    setPoLineItems(pli.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const posByJob = {}, ucByJob = {}, directInvByJob = {}, billedByJob = {}
  pos.forEach(p => { posByJob[p.job_id] = (posByJob[p.job_id] || 0) + (p.amount || 0) })
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })
  invoices.filter(inv => !inv.po_id).forEach(inv => { directInvByJob[inv.job_id] = (directInvByJob[inv.job_id] || 0) + (inv.amount || 0) })
  billings.forEach(b => { billedByJob[b.job_id] = (billedByJob[b.job_id] || 0) + (b.amount || 0) })

  const unseededCosts = jobs.filter(j =>
    (j.jtd_cost || 0) > 0 &&
    !posByJob[j.id] && !ucByJob[j.id] && !directInvByJob[j.id]
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
    const tracked = (posByJob[j.id] || 0) + (directInvByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const variance = (j.estimated_cost || 0) - tracked
    const variancePct = j.estimated_cost > 0 ? variance / j.estimated_cost : 0
    const billedToDate = billedByJob[j.id] || 0
    const openCommit = openCommitByJob[j.id] || 0
    const leftToBill = (j.estimated_revenue || 0) - billedToDate
    const estGM = gmPct(j.estimated_revenue, j.estimated_cost)
    const actualGM = billedToDate > 0 ? gmPct(billedToDate, tracked) : null
    let flag = 'No data'
    if (tracked > 0) {
      if (variance <= -5000) flag = 'Over'
      else if (variance < 0) flag = 'Watch'
      else flag = 'On Track'
    }
    return { ...j, tracked, variance, variancePct, flag, billedToDate, openCommit, leftToBill, estGM, actualGM }
  })

  const filtered = filterFlag ? rows.filter(r => r.flag === filterFlag) : rows

  // Portfolio totals
  const totalRevenue = rows.reduce((s, r) => s + (r.estimated_revenue || 0), 0)
  const totalEstCost = rows.reduce((s, r) => s + (r.estimated_cost || 0), 0)
  const totalVariance = rows.reduce((s, r) => s + r.variance, 0)
  const totalBilled = rows.reduce((s, r) => s + r.billedToDate, 0)
  const totalTracked = rows.reduce((s, r) => s + r.tracked, 0)
  const totalActualGMdollar = totalBilled - totalTracked
  const totalActualGMpct = totalBilled > 0 ? totalActualGMdollar / totalBilled : null

  // Period calculations — ISO string comparison is safe for YYYY-MM-DD
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStart = `${now.getFullYear()}-01-01`

  // MTD/YTD cost = invoiced PO lines + posted direct invoices + posted uncommitted
  function lineItemPeriodSum(cutoff) {
    return poLineItems
      .filter(li => li.invoiced && li.invoice_date && li.invoice_date >= cutoff)
      .reduce((s, li) => s + (parseFloat(li.qty) || 0) * (parseFloat(li.price_each) || 0), 0)
  }

  const mtdRevenue = billings.filter(b => b.date_submitted && b.date_submitted >= monthStart).reduce((s, b) => s + (b.amount || 0), 0)
  const mtdCosts = lineItemPeriodSum(monthStart)
    + invoices.filter(inv => !inv.po_id && inv.foundation_status === 'Posted in Foundation' && inv.date_received >= monthStart).reduce((s, i) => s + (i.amount || 0), 0)
    + uncommitted.filter(u => u.posted && u.cost_date && u.cost_date >= monthStart).reduce((s, u) => s + (u.amount || 0), 0)

  const ytdRevenue = billings.filter(b => b.date_submitted && b.date_submitted >= yearStart).reduce((s, b) => s + (b.amount || 0), 0)
  const ytdCosts = lineItemPeriodSum(yearStart)
    + invoices.filter(inv => !inv.po_id && inv.foundation_status === 'Posted in Foundation' && inv.date_received >= yearStart).reduce((s, i) => s + (i.amount || 0), 0)
    + uncommitted.filter(u => u.posted && u.cost_date && u.cost_date >= yearStart).reduce((s, u) => s + (u.amount || 0), 0)

  const overJobs = rows.filter(r => r.flag === 'Over')

  function exportCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Est Revenue', 'WIP Est Cost', 'Tracked Cost',
      'Open Commits', 'Variance $', 'Variance %', 'Est GM%', 'Actual GM%', 'Billed to Date', 'Left to Bill', 'Flag']
    const csvRows = rows.map(r => [
      r.job_number, `"${r.job_description}"`, r.project_manager,
      r.estimated_revenue, r.estimated_cost, r.tracked.toFixed(2),
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

        {/* Period Performance */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)' }}>Period Performance</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPeriodView('mtd')}
                className="btn btn-sm"
                style={{
                  background: periodView === 'mtd' ? 'var(--color-primary)' : 'transparent',
                  color: periodView === 'mtd' ? '#fff' : 'var(--color-text-2)',
                  border: periodView === 'mtd' ? 'none' : '1px solid var(--color-border)',
                }}>
                MTD
              </button>
              <button
                onClick={() => setPeriodView('ytd')}
                className="btn btn-sm"
                style={{
                  background: periodView === 'ytd' ? 'var(--color-primary)' : 'transparent',
                  color: periodView === 'ytd' ? '#fff' : 'var(--color-text-2)',
                  border: periodView === 'ytd' ? 'none' : '1px solid var(--color-border)',
                }}>
                YTD
              </button>
            </div>
          </div>
          {periodView === 'mtd' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ProgressCard label="MTD Revenue" value={mtdRevenue} target={MONTHLY_REV_TARGET} targetLabel="$400k" />
              <ProgressCard label="MTD Cost" value={mtdCosts} target={MONTHLY_COST_TARGET} targetLabel="$300k" />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ProgressCard label="YTD Revenue" value={ytdRevenue} target={YEARLY_REV_TARGET} targetLabel="$6M" />
              <ProgressCard label="YTD Earned Revenue" value={ytdCosts} target={YEARLY_COST_TARGET} targetLabel="$3.6M" />
            </div>
          )}
        </div>

        <div className="filter-row" style={{ marginBottom: 14 }}>
          <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}>
            <option value="">All Jobs</option>
            <option>Over</option><option>Watch</option><option>On Track</option><option>No data</option>
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
                  ? <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 32 }}>No jobs match this filter.</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/jobs/${r.id}`)}>
                      <td className="fw-500">{r.job_number}</td>
                      <td>{r.job_description}</td>
                      <td>{r.project_manager}</td>
                      <td className="text-right">{fmt.currency(r.estimated_cost)}</td>
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
                      <td>{r.tracked > 0 ? riskBadge(r.variance) : <span className="badge badge-gray">No data</span>}</td>
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
