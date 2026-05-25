import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/utils'
import { downloadCSV, printReport } from '../../lib/reportUtils'
import { Download, Printer } from 'lucide-react'

export default function InventoryReport() {
  const [items, setItems] = useState([])
  const [txns, setTxns] = useState([])
  const [serials, setSerials] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('stock')
  const [filterJob, setFilterJob] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterItem, setFilterItem] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('inventory_items').select('*, supplier:suppliers(name)').order('description'),
      supabase.from('inventory_transactions')
        .select('*, item:inventory_items(description, part_number, unit, unit_cost)')
        .eq('txn_type', 'issue')
        .order('txn_date', { ascending: false }),
      supabase.from('inventory_serials')
        .select('*, item:inventory_items(description, part_number), job:jobs(job_number, job_description)')
        .eq('status', 'installed')
        .order('installed_date', { ascending: false }),
      supabase.from('jobs').select('id, job_number, job_description').order('job_number'),
    ]).then(([iv, tx, sr, jb]) => {
      setItems(iv.data || [])
      setTxns(tx.data || [])
      setSerials(sr.data || [])
      setJobs(jb.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const jobMap = {}
  jobs.forEach(j => { jobMap[j.id] = j })

  const totalStockValue = items.reduce((s, i) => s + (i.qty_on_hand || 0) * (i.unit_cost || 0), 0)
  const lowStockItems = items.filter(i => !i.is_serialized && i.reorder_point != null && i.qty_on_hand <= i.reorder_point)

  // ── Usage by Job ──────────────────────────────────────────────────────────
  const filteredTxns = txns.filter(t => {
    if (filterJob && t.job_id !== filterJob) return false
    if (filterDateFrom && t.txn_date < filterDateFrom) return false
    if (filterDateTo && t.txn_date > filterDateTo) return false
    return true
  })

  const byJob = {}
  for (const t of filteredTxns) {
    if (!t.job_id) continue
    if (!byJob[t.job_id]) byJob[t.job_id] = { units: 0, value: 0, txnCount: 0 }
    const qty = Math.abs(t.qty || 0)
    byJob[t.job_id].units += qty
    byJob[t.job_id].value += qty * (t.item?.unit_cost || 0)
    byJob[t.job_id].txnCount += 1
  }
  const jobUsageRows = Object.entries(byJob)
    .map(([jobId, data]) => ({ job: jobMap[jobId], jobId, ...data }))
    .sort((a, b) => b.value - a.value || b.units - a.units)

  // ── Serial log filters ────────────────────────────────────────────────────
  const filteredSerials = serials.filter(s => {
    if (filterJob && s.job_id !== filterJob) return false
    if (filterItem && s.item_id !== filterItem) return false
    if (filterDateFrom && s.installed_date && s.installed_date < filterDateFrom) return false
    if (filterDateTo && s.installed_date && s.installed_date > filterDateTo) return false
    return true
  })

  // ── CSV exports ───────────────────────────────────────────────────────────
  function exportStock() {
    downloadCSV('inventory-stock.csv',
      ['Part #', 'Description', 'Supplier', 'Serialized', 'Unit', 'On Hand', 'Unit Cost', 'Total Value', 'Location', 'Reorder Point'],
      items.map(i => [
        i.part_number ?? '',
        i.description,
        i.supplier?.name ?? '',
        i.is_serialized ? 'Yes' : 'No',
        i.unit,
        i.qty_on_hand,
        i.unit_cost ?? '',
        i.unit_cost != null ? (i.qty_on_hand * i.unit_cost).toFixed(2) : '',
        i.location ?? '',
        i.reorder_point ?? '',
      ])
    )
  }

  function exportUsage() {
    downloadCSV('inventory-usage-by-job.csv',
      ['Job #', 'Job Description', 'Transactions', 'Units Issued', 'Est. Value'],
      jobUsageRows.map(r => [
        r.job?.job_number ?? '?',
        r.job?.job_description ?? 'Unknown',
        r.txnCount,
        r.units,
        r.value.toFixed(2),
      ])
    )
  }

  function exportSerials() {
    downloadCSV('inventory-installed-serials.csv',
      ['Serial #', 'Part #', 'Description', 'Job #', 'Job Description', 'Installed Date'],
      filteredSerials.map(s => [
        s.serial_number,
        s.item?.part_number ?? '',
        s.item?.description ?? '',
        s.job?.job_number ?? '?',
        s.job?.job_description ?? '',
        s.installed_date ?? '',
      ])
    )
  }

  const filterBar = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
      <div>
        <div style={flabel}>Job</div>
        <select style={finp} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
        </select>
      </div>
      <div>
        <div style={flabel}>From</div>
        <input type="date" style={finp} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
      </div>
      <div>
        <div style={flabel}>To</div>
        <input type="date" style={finp} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </div>
      {(filterJob || filterDateFrom || filterDateTo || filterItem) && (
        <button className="btn btn-sm" onClick={() => { setFilterJob(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterItem('') }}>
          Clear
        </button>
      )}
    </div>
  )

  return (
    <div>
      {/* Section tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
        {[['stock', 'Stock Valuation'], ['usage', 'Usage by Job'], ['serials', 'Installed Serials']].map(([key, label]) => (
          <button key={key} onClick={() => setSection(key)} className="btn"
            style={{ borderRadius: 6, fontWeight: section === key ? 600 : 400,
              background: section === key ? 'var(--color-primary)' : 'transparent',
              color: section === key ? '#fff' : 'var(--color-text-2)',
              border: section === key ? 'none' : '1px solid var(--color-border)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Stock Valuation ─────────────────────────────────────────────────── */}
      {section === 'stock' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
              <div className="metric-label">Total Items</div>
              <div className="metric-value">{items.length}</div>
            </div>
            <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
              <div className="metric-label">Stock Value</div>
              <div className="metric-value">{fmt.currency(totalStockValue)}</div>
            </div>
            <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
              <div className="metric-label">Low Stock</div>
              <div className="metric-value" style={{ color: lowStockItems.length > 0 ? 'var(--color-warning)' : 'inherit' }}>
                {lowStockItems.length}
              </div>
            </div>
            <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
              <div className="metric-label">Serialized Items</div>
              <div className="metric-value">{items.filter(i => i.is_serialized).length}</div>
            </div>
          </div>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={exportStock}><Download size={13} /> CSV</button>
            <button className="btn btn-sm" onClick={() => printReport('Inventory — Stock Valuation')}><Printer size={13} /> Print</button>
          </div>

          {items.length === 0
            ? <div className="empty-state"><p>No inventory items.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Part #</th>
                    <th>Description</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'center' }}>Serialized</th>
                    <th style={{ textAlign: 'right' }}>On Hand</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Total Value</th>
                    <th>Location</th>
                    <th>Reorder</th>
                  </tr></thead>
                  <tbody>
                    {items.map(i => {
                      const isLow = !i.is_serialized && i.reorder_point != null && i.qty_on_hand <= i.reorder_point
                      const value = (i.qty_on_hand || 0) * (i.unit_cost || 0)
                      return (
                        <tr key={i.id} style={isLow ? { background: 'rgba(255,180,0,0.07)' } : {}}>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{i.part_number || '—'}</td>
                          <td className="fw-500" style={{ color: isLow ? 'var(--color-warning)' : undefined }}>{i.description}</td>
                          <td style={{ fontSize: 12 }}>{i.supplier?.name ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: 12 }}>{i.is_serialized ? '✓' : ''}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600,
                            color: isLow ? 'var(--color-warning)' : i.qty_on_hand === 0 ? 'var(--color-text-3)' : undefined }}>
                            {i.qty_on_hand}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{i.unit}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{i.unit_cost != null ? fmt.currency(i.unit_cost) : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{i.unit_cost != null ? fmt.currency(value) : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{i.location || '—'}</td>
                          <td style={{ fontSize: 12, color: isLow ? 'var(--color-warning)' : 'var(--color-text-3)' }}>
                            {i.reorder_point != null ? `≤ ${i.reorder_point}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {totalStockValue > 0 && (
                      <tr style={{ background: 'var(--color-sidebar)', fontWeight: 500 }}>
                        <td colSpan={7} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)' }}>Total Stock Value</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.currency(totalStockValue)}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div></div>
          }
        </>
      )}

      {/* ── Usage by Job ─────────────────────────────────────────────────────── */}
      {section === 'usage' && (
        <>
          {filterBar}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={exportUsage}><Download size={13} /> CSV</button>
            <button className="btn btn-sm" onClick={() => printReport('Inventory — Usage by Job')}><Printer size={13} /> Print</button>
          </div>

          {jobUsageRows.length === 0
            ? <div className="empty-state"><p>No inventory issues match the selected filters.</p></div>
            : <>
                <div className="card" style={{ marginBottom: 16 }}><div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Job #</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Transactions</th>
                      <th style={{ textAlign: 'right' }}>Units Issued</th>
                      <th style={{ textAlign: 'right' }}>Est. Value</th>
                    </tr></thead>
                    <tbody>
                      {jobUsageRows.map(r => (
                        <tr key={r.jobId}>
                          <td className="fw-500">{r.job?.job_number ?? '?'}</td>
                          <td>{r.job?.job_description ?? 'Unknown'}</td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-3)' }}>{r.txnCount}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{r.units}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{r.value > 0 ? fmt.currency(r.value) : '—'}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--color-sidebar)', fontWeight: 500 }}>
                        <td colSpan={3} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)' }}>Total</td>
                        <td style={{ textAlign: 'right' }}>{jobUsageRows.reduce((s, r) => s + r.units, 0)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt.currency(jobUsageRows.reduce((s, r) => s + r.value, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div></div>

                {/* Detail transactions when a job is filtered */}
                {filterJob && filteredTxns.length > 0 && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--color-text-2)' }}>
                      Transaction Detail — {jobMap[filterJob]?.job_number}
                    </div>
                    <div className="card"><div className="table-wrap">
                      <table>
                        <thead><tr>
                          <th>Date</th><th>Item</th><th>Part #</th>
                          <th style={{ textAlign: 'right' }}>Qty</th><th>Unit</th>
                          <th style={{ textAlign: 'right' }}>Unit Cost</th>
                          <th style={{ textAlign: 'right' }}>Value</th>
                          <th>Notes</th>
                        </tr></thead>
                        <tbody>
                          {filteredTxns.map(t => {
                            const qty = Math.abs(t.qty || 0)
                            const uc = t.item?.unit_cost
                            return (
                              <tr key={t.id}>
                                <td style={{ fontSize: 12 }}>{fmt.date(t.txn_date)}</td>
                                <td className="fw-500">{t.item?.description ?? '—'}</td>
                                <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{t.item?.part_number || '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 500 }}>{qty}</td>
                                <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{t.item?.unit ?? '—'}</td>
                                <td style={{ textAlign: 'right', fontSize: 12 }}>{uc != null ? fmt.currency(uc) : '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 500 }}>{uc != null ? fmt.currency(qty * uc) : '—'}</td>
                                <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t.notes || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div></div>
                  </>
                )}
              </>
          }
        </>
      )}

      {/* ── Installed Serials ─────────────────────────────────────────────────── */}
      {section === 'serials' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
            <div>
              <div style={flabel}>Job</div>
              <select style={finp} value={filterJob} onChange={e => setFilterJob(e.target.value)}>
                <option value="">All Jobs</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
              </select>
            </div>
            <div>
              <div style={flabel}>Item</div>
              <select style={finp} value={filterItem} onChange={e => setFilterItem(e.target.value)}>
                <option value="">All Items</option>
                {items.filter(i => i.is_serialized).map(i => (
                  <option key={i.id} value={i.id}>{i.description}{i.part_number ? ` (${i.part_number})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={flabel}>Installed From</div>
              <input type="date" style={finp} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <div style={flabel}>Installed To</div>
              <input type="date" style={finp} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            {(filterJob || filterDateFrom || filterDateTo || filterItem) && (
              <button className="btn btn-sm" onClick={() => { setFilterJob(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterItem('') }}>
                Clear
              </button>
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 10 }}>
            {filteredSerials.length} serial{filteredSerials.length !== 1 ? 's' : ''} installed
          </div>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={exportSerials}><Download size={13} /> CSV</button>
            <button className="btn btn-sm" onClick={() => printReport('Inventory — Installed Serials')}><Printer size={13} /> Print</button>
          </div>

          {filteredSerials.length === 0
            ? <div className="empty-state"><p>No installed serials match the selected filters.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Serial #</th>
                    <th>Part #</th>
                    <th>Description</th>
                    <th>Job #</th>
                    <th>Job Description</th>
                    <th>Installed Date</th>
                  </tr></thead>
                  <tbody>
                    {filteredSerials.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.serial_number}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{s.item?.part_number || '—'}</td>
                        <td>{s.item?.description ?? '—'}</td>
                        <td className="fw-500">{s.job?.job_number ?? '?'}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{s.job?.job_description ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{s.installed_date ? fmt.date(s.installed_date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
          }
        </>
      )}
    </div>
  )
}

const flabel = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }
const finp = { padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text-1)', height: 32 }
