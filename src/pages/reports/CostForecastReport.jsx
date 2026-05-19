import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

function monthKey(dateStr) {
  if (!dateStr) return null
  return dateStr.slice(0, 7)
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function CostForecastReport() {
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [forecastData, setForecastData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterJob, setFilterJob] = useState('')
  const [months, setMonths] = useState(6)

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('id, job_number, job_description').order('job_number'),
      supabase.from('purchase_orders').select('id, job_id, vendor, po_number, amount, expected_invoice_date'),
      supabase.from('po_line_items').select('po_id, description, qty, price_each, estimated_ship_date'),
      supabase.from('uncommitted_costs').select('job_id, category, description, amount, cost_date'),
      supabase.from('billing_forecast').select('job_id, month, planned_billing'),
    ]).then(([j, p, li, uc, fc]) => {
      setJobs(j.data || [])
      setPOs(p.data || [])
      setLineItems(li.data || [])
      setUncommitted(uc.data || [])
      setForecastData(fc.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const jobMap = {}
  jobs.forEach(j => { jobMap[j.id] = j })

  const poMap = {}
  pos.forEach(p => { poMap[p.id] = p })

  const today = new Date()
  const cutoff = new Date(today.getFullYear(), today.getMonth() + months, 1).toISOString().slice(0, 7)
  const todayKey = today.toISOString().slice(0, 7)

  // Build forecast events from PO line items with estimated_ship_date
  const poLineEvents = lineItems
    .filter(li => li.estimated_ship_date && monthKey(li.estimated_ship_date) >= todayKey && monthKey(li.estimated_ship_date) <= cutoff)
    .map(li => {
      const po = poMap[li.po_id] || {}
      const job = jobMap[po.job_id] || {}
      return {
        type: 'PO Line Item',
        month: monthKey(li.estimated_ship_date),
        date: li.estimated_ship_date,
        job_id: po.job_id,
        job_number: job.job_number || '—',
        job_description: job.job_description || '—',
        source: po.vendor || po.po_number || 'PO',
        description: li.description,
        amount: (li.qty || 0) * (li.price_each || 0),
      }
    })

  // Build forecast events from POs with expected_invoice_date (POs without line item dates)
  const poIdsWithLineItems = new Set(lineItems.filter(li => li.estimated_ship_date).map(li => li.po_id))
  const poHeaderEvents = pos
    .filter(p => p.expected_invoice_date && !poIdsWithLineItems.has(p.id))
    .filter(p => monthKey(p.expected_invoice_date) >= todayKey && monthKey(p.expected_invoice_date) <= cutoff)
    .map(p => {
      const job = jobMap[p.job_id] || {}
      return {
        type: 'PO Invoice',
        month: monthKey(p.expected_invoice_date),
        date: p.expected_invoice_date,
        job_id: p.job_id,
        job_number: job.job_number || '—',
        job_description: job.job_description || '—',
        source: p.vendor || p.po_number,
        description: `PO ${p.po_number || ''} — ${p.vendor || ''}`.trim(),
        amount: p.amount || 0,
      }
    })

  // Uncommitted costs with cost_date
  const ucEvents = uncommitted
    .filter(u => u.cost_date && monthKey(u.cost_date) >= todayKey && monthKey(u.cost_date) <= cutoff)
    .map(u => {
      const job = jobMap[u.job_id] || {}
      return {
        type: 'Uncommitted',
        month: monthKey(u.cost_date),
        date: u.cost_date,
        job_id: u.job_id,
        job_number: job.job_number || '—',
        job_description: job.job_description || '—',
        source: u.category,
        description: u.description,
        amount: u.amount || 0,
      }
    })

  let allEvents = [...poLineEvents, ...poHeaderEvents, ...ucEvents]
    .filter(e => !filterJob || e.job_id === filterJob)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Build planned billing by month from forecast table
  const plannedBillingByMonth = {}
  forecastData
    .filter(f => !filterJob || f.job_id === filterJob)
    .forEach(f => {
      if (f.month >= todayKey && f.month <= cutoff && f.planned_billing > 0)
        plannedBillingByMonth[f.month] = (plannedBillingByMonth[f.month] || 0) + (f.planned_billing || 0)
    })

  // Build monthly summary
  const monthSummary = {}
  allEvents.forEach(e => {
    if (!monthSummary[e.month]) monthSummary[e.month] = { po: 0, uncommitted: 0, total: 0 }
    if (e.type === 'Uncommitted') monthSummary[e.month].uncommitted += e.amount
    else monthSummary[e.month].po += e.amount
    monthSummary[e.month].total += e.amount
  })
  // Merge in months that only have planned billing
  Object.keys(plannedBillingByMonth).forEach(m => {
    if (!monthSummary[m]) monthSummary[m] = { po: 0, uncommitted: 0, total: 0 }
  })

  const sortedMonths = Object.keys(monthSummary).sort()
  const grandTotal = allEvents.reduce((s, e) => s + e.amount, 0)

  function handleCSV() {
    const headers = ['Month', 'Type', 'Job #', 'Job Description', 'Source', 'Description', 'Date', 'Amount']
    const csvRows = allEvents.map(e => [
      monthLabel(e.month), e.type, e.job_number, e.job_description,
      e.source, e.description, e.date, e.amount,
    ])
    downloadCSV(`cost-forecast-${new Date().toISOString().slice(0,10)}.csv`, headers, csvRows)
  }

  return (
    <div>
      <div className="filter-row no-print" style={{ marginBottom: 16 }}>
        <select value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
        </select>
        <select value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={3}>Next 3 months</option>
          <option value={6}>Next 6 months</option>
          <option value={12}>Next 12 months</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('Cost Forecast')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="print-area">
        <div className="print-header">
          <strong>Cost Forecast</strong>
          <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {sortedMonths.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)' }}>
            No upcoming costs found with scheduled dates in the selected window.
            <div style={{ marginTop: 8, fontSize: 12 }}>Add estimated ship dates to PO line items or cost dates to uncommitted costs to populate this forecast.</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <div className="section-header"><span className="section-title">Monthly Summary</span></div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Month</th>
                      <th className="text-right">PO / Vendor Costs</th>
                      <th className="text-right">Uncommitted Costs</th>
                      <th className="text-right">Total Expected Cost</th>
                      <th className="text-right" style={{ borderLeft: '2px solid var(--color-border-strong)', color: 'var(--color-primary)' }}>Planned Billing</th>
                      <th className="text-right" style={{ color: 'var(--color-text-2)' }}>Net Cash Position</th>
                    </tr></thead>
                    <tbody>
                      {sortedMonths.map(m => {
                        const planned = plannedBillingByMonth[m] || 0
                        const netPosition = planned - monthSummary[m].total
                        return (
                          <tr key={m}>
                            <td className="fw-500">{monthLabel(m)}</td>
                            <td className="text-right">{monthSummary[m].po > 0 ? fmt.currency(monthSummary[m].po) : <span className="text-muted">—</span>}</td>
                            <td className="text-right">{monthSummary[m].uncommitted > 0 ? fmt.currency(monthSummary[m].uncommitted) : <span className="text-muted">—</span>}</td>
                            <td className="text-right fw-500">{monthSummary[m].total > 0 ? fmt.currency(monthSummary[m].total) : <span className="text-muted">—</span>}</td>
                            <td className="text-right fw-500" style={{ borderLeft: '2px solid var(--color-border-strong)', color: planned > 0 ? 'var(--color-primary)' : 'var(--color-text-3)' }}>
                              {planned > 0 ? fmt.currency(planned) : '—'}
                            </td>
                            <td className={`text-right fw-500 ${planned > 0 || monthSummary[m].total > 0 ? (netPosition >= 0 ? 'text-success' : 'text-danger') : ''}`}>
                              {planned > 0 || monthSummary[m].total > 0 ? (netPosition >= 0 ? '+' : '') + fmt.currency(netPosition) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--color-border-strong)', fontWeight: 600 }}>
                        <td>Total</td>
                        <td className="text-right">{fmt.currency(allEvents.filter(e => e.type !== 'Uncommitted').reduce((s, e) => s + e.amount, 0))}</td>
                        <td className="text-right">{fmt.currency(allEvents.filter(e => e.type === 'Uncommitted').reduce((s, e) => s + e.amount, 0))}</td>
                        <td className="text-right">{fmt.currency(grandTotal)}</td>
                        <td className="text-right" style={{ borderLeft: '2px solid var(--color-border-strong)' }}>{fmt.currency(Object.values(plannedBillingByMonth).reduce((s, v) => s + v, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div>
              <div className="section-header"><span className="section-title">Detail — {allEvents.length} items</span></div>
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Date</th><th>Job #</th><th>Type</th><th>Source / Category</th><th>Description</th>
                      <th className="text-right">Amount</th>
                    </tr></thead>
                    <tbody>
                      {allEvents.map((e, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmt.date(e.date)}</td>
                          <td className="fw-500">{e.job_number}</td>
                          <td><span className={`badge ${e.type === 'Uncommitted' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: 10 }}>{e.type}</span></td>
                          <td style={{ color: 'var(--color-text-2)', fontSize: 13 }}>{e.source}</td>
                          <td>{e.description}</td>
                          <td className="text-right fw-500">{fmt.currency(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
