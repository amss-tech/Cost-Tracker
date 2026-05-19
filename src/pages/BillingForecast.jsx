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

function EditableCell({ value, onSave, highlight }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value != null ? value : '')

  useEffect(() => { setVal(value != null ? value : '') }, [value])

  function commit() {
    const num = val === '' ? null : parseFloat(val) || 0
    onSave(num)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        step="0.01"
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setVal(value != null ? value : ''); setEditing(false) }
        }}
        style={{ width: '100%', padding: '3px 5px', fontSize: 12, border: '2px solid var(--color-primary)',
          borderRadius: 3, background: 'var(--color-bg)', color: 'var(--color-text)', textAlign: 'right' }}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        display: 'block', textAlign: 'right', cursor: 'pointer', fontSize: 12, padding: '3px 4px',
        borderRadius: 3, color: value > 0 ? (highlight ? 'var(--color-primary)' : 'var(--color-text)') : 'var(--color-text-3)',
        background: value > 0 && highlight ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      }}
    >
      {value > 0 ? fmt.currency(value) : '—'}
    </span>
  )
}

export default function BillingForecast() {
  const [jobs, setJobs] = useState([])
  const [forecast, setForecast] = useState({})
  const [billings, setBillings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [filterPM, setFilterPM] = useState('')
  const [startOffset, setStartOffset] = useState(0)

  const today = new Date()
  const months = getMonths(today.getFullYear(), today.getMonth() + startOffset)

  useEffect(() => {
    Promise.all([
      supabase.from('jobs').select('id, job_number, job_description, project_manager').order('job_number'),
      supabase.from('billing_forecast').select('*'),
      supabase.from('billings').select('job_id, amount, date_submitted'),
    ]).then(([j, f, bil]) => {
      setJobs(j.data || [])
      const map = {}
      for (const row of f.data || []) {
        if (!map[row.job_id]) map[row.job_id] = {}
        map[row.job_id][row.month] = row
      }
      setForecast(map)
      setBillings(bil.data || [])
      setLoading(false)
    })
  }, [])

  const pms = [...new Set(jobs.map(j => j.project_manager).filter(Boolean))].sort()

  const filteredJobs = jobs.filter(j => {
    if (filterPM && j.project_manager !== filterPM) return false
    return true
  })

  // Actual billings by job+month
  const actualByJobMonth = {}
  billings.forEach(b => {
    if (!b.date_submitted) return
    const m = b.date_submitted.slice(0, 7)
    if (!actualByJobMonth[b.job_id]) actualByJobMonth[b.job_id] = {}
    actualByJobMonth[b.job_id][m] = (actualByJobMonth[b.job_id][m] || 0) + (b.amount || 0)
  })

  const handleSave = useCallback(async (jobId, month, plannedBilling) => {
    const key = `${jobId}:${month}`
    setSaving(s => ({ ...s, [key]: true }))

    const existing = forecast[jobId]?.[month]
    if (plannedBilling == null && !existing) {
      setSaving(s => { const n = { ...s }; delete n[key]; return n })
      return
    }

    const payload = {
      job_id: jobId,
      month,
      planned_billing: plannedBilling,
      planned_earned_revenue: existing?.planned_earned_revenue ?? null,
      notes: existing?.notes ?? null,
    }

    const { data, error } = existing
      ? await supabase.from('billing_forecast').update({ planned_billing: plannedBilling }).eq('id', existing.id).select().single()
      : await supabase.from('billing_forecast').insert(payload).select().single()

    if (!error && data) {
      setForecast(f => {
        const next = { ...f }
        if (!next[jobId]) next[jobId] = {}
        next[jobId] = { ...next[jobId], [month]: data }
        return next
      })
    }
    setSaving(s => { const n = { ...s }; delete n[key]; return n })
  }, [forecast])

  // Column totals
  const colTotals = months.map(m =>
    filteredJobs.reduce((s, j) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0)
  )
  const grandTotal = colTotals.reduce((s, v) => s + v, 0)

  function handleCSV() {
    const headers = ['Job #', 'Description', 'PM', ...months.map(m => m.label), 'Total']
    const rows = filteredJobs.map(j => {
      const rowTotal = months.reduce((s, m) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0)
      return [
        j.job_number, j.job_description, j.project_manager,
        ...months.map(m => forecast[j.id]?.[m.key]?.planned_billing ?? ''),
        rowTotal,
      ]
    })
    downloadCSV(`billing-forecast-${new Date().toISOString().slice(0,10)}.csv`, headers, rows)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar no-print">
        <span className="topbar-title">Billing Forecast</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={handleCSV}><Download size={13} /> CSV</button>
          <button className="btn btn-sm" onClick={() => printReport('Billing Forecast')}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="page">
        <div className="filter-row no-print" style={{ marginBottom: 16, alignItems: 'center' }}>
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

        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 10 }} className="no-print">
          Click any cell to enter or edit a planned billing amount. Press Enter or click away to save.
        </div>

        <div className="print-area">
          <div className="print-header">
            <strong>Billing Forecast</strong>
            <span>{months[0].label} — {months[11].label}</span>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 900, borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--color-sidebar)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, position: 'sticky', left: 0, background: 'var(--color-sidebar)', zIndex: 1, minWidth: 220, borderRight: '1px solid var(--color-border)' }}>
                      Job
                    </th>
                    {months.map(m => (
                      <th key={m.key} style={{ textAlign: 'right', padding: '8px 8px', fontSize: 11, minWidth: 90, fontWeight: 600 }}>
                        {m.label}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, minWidth: 100, borderLeft: '1px solid var(--color-border)' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.length === 0 ? (
                    <tr><td colSpan={14} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-3)' }}>No jobs found.</td></tr>
                  ) : filteredJobs.map((j, ji) => {
                    const rowTotal = months.reduce((s, m) => s + (forecast[j.id]?.[m.key]?.planned_billing || 0), 0)
                    return (
                      <tr key={j.id} style={{ borderTop: '1px solid var(--color-border)', background: ji % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--color-sidebar) 40%, transparent)' }}>
                        <td style={{ padding: '6px 12px', position: 'sticky', left: 0, zIndex: 1, background: ji % 2 === 0 ? 'var(--color-bg)' : 'var(--color-sidebar)', borderRight: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{j.job_number}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.job_description}</div>
                        </td>
                        {months.map(m => {
                          const key = `${j.id}:${m.key}`
                          const planned = forecast[j.id]?.[m.key]?.planned_billing ?? null
                          const actual = actualByJobMonth[j.id]?.[m.key] ?? null
                          return (
                            <td key={m.key} style={{ padding: '2px 4px', verticalAlign: 'middle', position: 'relative' }}>
                              {saving[key] && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 9, color: 'var(--color-text-3)' }}>…</span>}
                              <EditableCell
                                value={planned}
                                onSave={val => handleSave(j.id, m.key, val)}
                                highlight={actual != null && actual > 0}
                              />
                              {actual > 0 && (
                                <div style={{ fontSize: 10, textAlign: 'right', color: 'var(--color-success)', paddingRight: 4, marginTop: -2 }}>
                                  ✓ {fmt.currency(actual)}
                                </div>
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

          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-3)' }} className="no-print">
            Green ✓ amounts below a cell show actual billings already submitted for that month.
          </div>
        </div>
      </div>
    </>
  )
}
