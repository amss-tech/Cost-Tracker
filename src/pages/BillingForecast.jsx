import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { downloadCSV, printReport } from '../lib/reportUtils'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'

function getMonths(startYear, startMonth, count = 12) {
  const months = []
  for (let i = 0; i < count; i++) {
    const d = new Date(startYear, startMonth + i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    })
  }
  return months
}

const INPUT_STYLE = {
  width: '100%', padding: '3px 5px', fontSize: 12, borderRadius: 3,
  background: 'var(--color-bg)', color: 'var(--color-text)', textAlign: 'right',
}

function BillingCell({ value, actualValue, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value != null ? value : '')
  useEffect(() => { setVal(value != null ? value : '') }, [value])

  function commit() {
    onSave(val === '' ? null : parseFloat(val) || 0)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number" step="0.01" value={val} autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setVal(value != null ? value : ''); setEditing(false) }
        }}
        style={{ ...INPUT_STYLE, border: '2px solid var(--color-primary)' }}
      />
    )
  }
  return (
    <>
      <span
        onClick={() => setEditing(true)} title="Click to edit"
        style={{
          display: 'block', textAlign: 'right', cursor: 'pointer', fontSize: 12, padding: '3px 4px', borderRadius: 3,
          color: value > 0 ? 'var(--color-text)' : 'var(--color-text-3)',
          background: actualValue > 0 && value > 0 ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
        }}
      >
        {value > 0 ? fmt.currency(value) : '—'}
      </span>
      {actualValue > 0 && (
        <div style={{ fontSize: 10, textAlign: 'right', color: 'var(--color-success)', paddingRight: 4, marginTop: -2 }}>
          ✓ {fmt.currency(actualValue)}
        </div>
      )}
    </>
  )
}

function CostCell({ manualValue, autoValue, actualValue, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(manualValue != null ? manualValue : '')
  useEffect(() => { setVal(manualValue != null ? manualValue : '') }, [manualValue])

  const isAuto = manualValue == null
  const displayValue = manualValue != null ? manualValue : (autoValue || 0)

  function commit() {
    onSave(val === '' ? null : parseFloat(val) || 0)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number" step="0.01" value={val} autoFocus
        placeholder={autoValue > 0 ? autoValue.toFixed(0) : ''}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setVal(manualValue != null ? manualValue : ''); setEditing(false) }
        }}
        style={{ ...INPUT_STYLE, border: '2px solid var(--color-warning)' }}
      />
    )
  }
  return (
    <>
      <span
        onClick={() => setEditing(true)}
        title={isAuto && autoValue > 0 ? 'Auto from uncommitted costs — click to override' : 'Click to edit'}
        style={{
          display: 'block', textAlign: 'right', cursor: 'pointer', fontSize: 12, padding: '3px 4px', borderRadius: 3,
          fontStyle: isAuto ? 'italic' : 'normal',
          color: displayValue > 0 ? (isAuto ? 'var(--color-text-2)' : 'var(--color-text)') : 'var(--color-text-3)',
        }}
      >
        {displayValue > 0
          ? <>{fmt.currency(displayValue)}{isAuto && <span style={{ fontSize: 9, color: 'var(--color-text-3)', marginLeft: 3 }}>auto</span>}</>
          : '—'
        }
      </span>
      {actualValue > 0 && (
        <div style={{ fontSize: 10, textAlign: 'right', color: 'var(--color-success)', paddingRight: 4, marginTop: -2 }}>
          ✓ {fmt.currency(actualValue)}
        </div>
      )}
    </>
  )
}

export default function Forecast() {
  const [jobs, setJobs] = useState([])
  const [forecast, setForecast] = useState({})
  const [billings, setBillings] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [poLineItems, setPoLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [filterPM, setFilterPM] = useState('')
  const [filterStatus, setFilterStatus] = useState('active-pipeline')
  const [startOffset, setStartOffset] = useState(0)

  const today = new Date()
  const months = getMonths(today.getFullYear(), today.getMonth() + startOffset)

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('id, job_number, job_description, project_manager, status').order('job_number'),
      supabase.from('billing_forecast').select('*'),
      supabase.from('billings').select('job_id, amount, date_submitted'),
      supabase.from('uncommitted_costs').select('job_id, amount, cost_date, posted'),
      supabase.from('po_line_items').select('qty, price_each, invoiced, invoice_date, purchase_orders(job_id)'),
    ]).then(([j, f, bil, uc, pli]) => {
      setJobs(j.data || [])
      const map = {}
      for (const row of f.data || []) {
        if (!map[row.job_id]) map[row.job_id] = {}
        map[row.job_id][row.month] = row
      }
      setForecast(map)
      setBillings(bil.data || [])
      setUncommitted(uc.data || [])
      setPoLineItems(pli.data || [])
      setLoading(false)
    })
  }, [])

  const pms = [...new Set(jobs.map(j => j.project_manager).filter(Boolean))].sort()

  const filteredJobs = jobs.filter(j => {
    if (filterPM && j.project_manager !== filterPM) return false
    if (filterStatus === 'active-pipeline') return j.status === 'Active' || j.status === 'Pipeline'
    if (filterStatus === 'active') return j.status === 'Active'
    if (filterStatus === 'pipeline') return j.status === 'Pipeline'
    return true
  })

  // Actual billings by job+month
  const actualBilByJobMonth = {}
  billings.forEach(b => {
    if (!b.date_submitted) return
    const m = b.date_submitted.slice(0, 7)
    if (!actualBilByJobMonth[b.job_id]) actualBilByJobMonth[b.job_id] = {}
    actualBilByJobMonth[b.job_id][m] = (actualBilByJobMonth[b.job_id][m] || 0) + (b.amount || 0)
  })

  // Auto cost forecast — unposted uncommitted costs by job+month
  const autoForecastByJobMonth = {}
  uncommitted.forEach(u => {
    if (!u.posted && u.cost_date) {
      const m = u.cost_date.slice(0, 7)
      if (!autoForecastByJobMonth[u.job_id]) autoForecastByJobMonth[u.job_id] = {}
      autoForecastByJobMonth[u.job_id][m] = (autoForecastByJobMonth[u.job_id][m] || 0) + (u.amount || 0)
    }
  })

  // Actual costs — posted uncommitted + invoiced PO lines, by job+month
  const actualCostsByJobMonth = {}
  uncommitted.forEach(u => {
    if (u.posted && u.cost_date) {
      const m = u.cost_date.slice(0, 7)
      if (!actualCostsByJobMonth[u.job_id]) actualCostsByJobMonth[u.job_id] = {}
      actualCostsByJobMonth[u.job_id][m] = (actualCostsByJobMonth[u.job_id][m] || 0) + (u.amount || 0)
    }
  })
  poLineItems.forEach(li => {
    if (li.invoiced && li.invoice_date && li.purchase_orders?.job_id) {
      const m = li.invoice_date.slice(0, 7)
      const jid = li.purchase_orders.job_id
      const amt = (parseFloat(li.qty) || 0) * (parseFloat(li.price_each) || 0)
      if (!actualCostsByJobMonth[jid]) actualCostsByJobMonth[jid] = {}
      actualCostsByJobMonth[jid][m] = (actualCostsByJobMonth[jid][m] || 0) + amt
    }
  })

  function getPlannedCostForCell(jobId, monthKey) {
    const manual = forecast[jobId]?.[monthKey]?.planned_cost ?? null
    const auto = autoForecastByJobMonth[jobId]?.[monthKey] || 0
    return manual != null ? manual : auto
  }

  // Monthly summary for the 6-month header cards
  const monthSummary = months.map(m => {
    const rev = filteredJobs.reduce((s, j) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0)
    const cost = filteredJobs.reduce((s, j) => s + getPlannedCostForCell(j.id, m.key), 0)
    return { ...m, rev, cost, net: rev - cost }
  })

  // Column totals
  const bilColTotals = months.map(m => filteredJobs.reduce((s, j) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0))
  const costColTotals = months.map(m => filteredJobs.reduce((s, j) => s + getPlannedCostForCell(j.id, m.key), 0))
  const bilGrandTotal = bilColTotals.reduce((s, v) => s + v, 0)
  const costGrandTotal = costColTotals.reduce((s, v) => s + v, 0)

  const handleSaveBilling = useCallback(async (jobId, month, planned_billing) => {
    const key = `${jobId}:${month}:bil`
    setSaving(s => ({ ...s, [key]: true }))
    const existing = forecast[jobId]?.[month]
    if (planned_billing == null && !existing) { setSaving(s => { const n = { ...s }; delete n[key]; return n }); return }
    const payload = { job_id: jobId, month, planned_billing, planned_cost: existing?.planned_cost ?? null, notes: existing?.notes ?? null }
    const { data, error } = existing
      ? await supabase.from('billing_forecast').update({ planned_billing }).eq('id', existing.id).select().single()
      : await supabase.from('billing_forecast').insert(payload).select().single()
    if (!error && data) setForecast(f => { const n = { ...f }; if (!n[jobId]) n[jobId] = {}; n[jobId] = { ...n[jobId], [month]: data }; return n })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
  }, [forecast])

  const handleSaveCost = useCallback(async (jobId, month, planned_cost) => {
    const key = `${jobId}:${month}:cost`
    setSaving(s => ({ ...s, [key]: true }))
    const existing = forecast[jobId]?.[month]
    if (planned_cost == null && !existing) { setSaving(s => { const n = { ...s }; delete n[key]; return n }); return }
    const payload = { job_id: jobId, month, planned_cost, planned_billing: existing?.planned_billing ?? null, notes: existing?.notes ?? null }
    const { data, error } = existing
      ? await supabase.from('billing_forecast').update({ planned_cost }).eq('id', existing.id).select().single()
      : await supabase.from('billing_forecast').insert(payload).select().single()
    if (!error && data) setForecast(f => { const n = { ...f }; if (!n[jobId]) n[jobId] = {}; n[jobId] = { ...n[jobId], [month]: data }; return n })
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
  }, [forecast])

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', 'Status', ...months.map(m => m.label + ' Rev'), ...months.map(m => m.label + ' Cost')]
    const rows = filteredJobs.map(j => [
      j.job_number, j.job_description, j.project_manager, j.status,
      ...months.map(m => forecast[j.id]?.[m.key]?.planned_billing ?? ''),
      ...months.map(m => {
        const v = getPlannedCostForCell(j.id, m.key)
        return v > 0 ? v : ''
      }),
    ])
    downloadCSV(`forecast-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const TH = { textAlign: 'right', padding: '8px 8px', fontSize: 11, minWidth: 90, fontWeight: 600 }
  const STICKY_JOB = {
    textAlign: 'left', padding: '8px 12px', fontSize: 12, position: 'sticky', left: 0,
    background: 'var(--color-sidebar)', zIndex: 1, minWidth: 220, borderRight: '1px solid var(--color-border)',
  }

  function renderTable(type) {
    const colTotals = type === 'billing' ? bilColTotals : costColTotals
    const grandTotal = type === 'billing' ? bilGrandTotal : costGrandTotal
    return (
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 900, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--color-sidebar)' }}>
                <th style={STICKY_JOB}>Job</th>
                {months.map(m => <th key={m.key} style={TH}>{m.label}</th>)}
                <th style={{ ...TH, minWidth: 100, borderLeft: '1px solid var(--color-border)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-3)' }}>No jobs found.</td></tr>
              ) : filteredJobs.map((j, ji) => {
                const rowBg = ji % 2 === 0 ? 'var(--color-bg)' : 'var(--color-sidebar)'
                const rowTotal = type === 'billing'
                  ? months.reduce((s, m) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0)
                  : months.reduce((s, m) => s + getPlannedCostForCell(j.id, m.key), 0)
                return (
                  <tr key={j.id} style={{ borderTop: '1px solid var(--color-border)', background: ji % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-sidebar) 40%, transparent)' }}>
                    <td style={{ padding: '6px 12px', position: 'sticky', left: 0, zIndex: 1, background: rowBg, borderRight: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {j.job_number}
                        {j.status === 'Pipeline' && <span className="badge badge-blue" style={{ fontSize: 9 }}>Pipeline</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {j.job_description}
                      </div>
                    </td>
                    {months.map(m => {
                      const bKey = `${j.id}:${m.key}`
                      return (
                        <td key={m.key} style={{ padding: '2px 4px', verticalAlign: 'top', position: 'relative' }}>
                          {(saving[bKey + ':bil'] || saving[bKey + ':cost']) && (
                            <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 9, color: 'var(--color-text-3)' }}>…</span>
                          )}
                          {type === 'billing' ? (
                            <BillingCell
                              value={forecast[j.id]?.[m.key]?.planned_billing ?? null}
                              actualValue={actualBilByJobMonth[j.id]?.[m.key] || 0}
                              onSave={val => handleSaveBilling(j.id, m.key, val)}
                            />
                          ) : (
                            <CostCell
                              manualValue={forecast[j.id]?.[m.key]?.planned_cost ?? null}
                              autoValue={autoForecastByJobMonth[j.id]?.[m.key] || 0}
                              actualValue={actualCostsByJobMonth[j.id]?.[m.key] || 0}
                              onSave={val => handleSaveCost(j.id, m.key, val)}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, borderLeft: '1px solid var(--color-border)', color: rowTotal > 0 ? 'var(--color-text)' : 'var(--color-text-3)' }}>
                      {rowTotal > 0 ? fmt.currency(rowTotal) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border-strong)', fontWeight: 700, background: 'var(--color-sidebar)' }}>
                <td style={{ padding: '8px 12px', fontSize: 12, position: 'sticky', left: 0, background: 'var(--color-sidebar)', borderRight: '1px solid var(--color-border)' }}>
                  Monthly Total
                </td>
                {colTotals.map((total, i) => (
                  <td key={months[i].key} style={{ textAlign: 'right', padding: '8px 8px', fontSize: 12 }}>
                    {total > 0 ? fmt.currency(total) : <span style={{ color: 'var(--color-text-3)' }}>—</span>}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12, borderLeft: '1px solid var(--color-border)' }}>
                  {fmt.currency(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="topbar no-print">
        <span className="topbar-title">Forecast</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('Forecast')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="page">
        <div className="filter-row no-print" style={{ marginBottom: 16, alignItems: 'center' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="active-pipeline">Active + Pipeline</option>
            <option value="active">Active Only</option>
            <option value="pipeline">Pipeline Only</option>
            <option value="all">All Jobs</option>
          </select>
          <select value={filterPM} onChange={e => setFilterPM(e.target.value)}>
            <option value="">All PMs</option>
            {pms.map(pm => <option key={pm}>{pm}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button className="btn btn-sm" onClick={() => setStartOffset(o => o - 1)}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13, color: 'var(--color-text-2)', minWidth: 180, textAlign: 'center' }}>
              {months[0].label} — {months[11].label}
            </span>
            <button className="btn btn-sm" onClick={() => setStartOffset(o => o + 1)}><ChevronRight size={14} /></button>
            {startOffset !== 0 && (
              <button className="btn btn-sm" onClick={() => setStartOffset(0)} style={{ fontSize: 11 }}>Today</button>
            )}
          </div>
        </div>

        <div className="print-area">
          <div className="print-header">
            <strong>Forecast</strong>
            <span>{months[0].label} — {months[11].label}</span>
          </div>

          {/* 6-month summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
            {monthSummary.slice(0, 6).map(m => {
              const hasData = m.rev > 0 || m.cost > 0
              const netColor = !hasData ? 'var(--color-text-3)'
                : m.net >= 0 ? 'var(--color-success)'
                : m.net > -5000 ? 'var(--color-warning)'
                : 'var(--color-danger)'
              return (
                <div key={m.key} style={{ background: 'var(--color-sidebar)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: 'var(--color-text-2)', borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}>
                    {m.label}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'var(--color-text-3)' }}>Rev</span>
                    <span style={{ fontWeight: 500 }}>{m.rev > 0 ? fmt.currency(m.rev) : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'var(--color-text-3)' }}>Cost</span>
                    <span style={{ fontWeight: 500 }}>{m.cost > 0 ? fmt.currency(m.cost) : '—'}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--color-text-3)' }}>Net</span>
                    <span style={{ fontWeight: 700, color: netColor }}>
                      {hasData ? (m.net >= 0 ? '+' : '') + fmt.currency(m.net) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Revenue Forecast */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="section-title">Revenue Forecast</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }} className="no-print">
              Click any cell to enter planned billing — ✓ actuals appear below when billed
            </span>
          </div>
          {renderTable('billing')}

          {/* Cost Forecast */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 8 }}>
            <span className="section-title">Cost Forecast</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }} className="no-print">
              Auto-populated from uncommitted costs (by cost date) — click to override — ✓ actuals appear when posted
            </span>
          </div>
          {renderTable('cost')}

          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-3)' }} className="no-print">
            <em>Italic auto</em> = pulled from uncommitted cost entries with a future cost date. Clear a cell to revert to auto.
          </div>
        </div>
      </div>
    </>
  )
}
