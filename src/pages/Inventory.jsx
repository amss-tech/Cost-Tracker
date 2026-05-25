import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { Plus, X, AlertTriangle, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const UNITS = ['each', 'ft', 'roll', 'box', 'pair', 'set', 'lb', 'kg', 'm']

// ─── helpers ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function exportInventory(items, suppliers) {
  const rows = items.map(item => [
    item.part_number ?? '',
    item.description,
    suppliers.find(s => s.id === item.supplier_id)?.name ?? '',
    item.unit,
    item.unit_cost ?? '',
    item.qty_on_hand,
    item.is_serialized ? 'yes' : 'no',
    item.location ?? '',
    item.reorder_point ?? '',
    item.notes ?? '',
  ])
  const headers = ['Part #', 'Description', 'Supplier', 'Unit', 'Unit Cost', 'Qty On Hand', 'Serialized', 'Location', 'Reorder Point', 'Notes']
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 16 }, { wch: 14 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
  XLSX.writeFile(wb, `inventory-export-${today()}.xlsx`)
}

function downloadTemplate() {
  const headers = ['Part #', 'Description *', 'Supplier', 'Unit', 'Unit Cost', 'Qty On Hand', 'Serialized (yes/no)', 'Location', 'Reorder Point', 'Notes']
  const sample = [
    ['CAT6-1000BL', 'Cat6 Cable 1000ft Blue', 'Anixter', 'roll', 185.00, 5, 'no', 'Shelf A1', 2, ''],
    ['SNLD-CAM-001', 'IP Camera 4MP Dome', 'Axis', 'each', 220.00, 0, 'yes', 'Cage B', '', 'Serial tracked'],
    ['PATCH-3FT', 'Cat6 Patch Cable 3ft Gray', 'Anixter', 'each', 4.50, 100, 'no', 'Shelf A2', 20, ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
  XLSX.writeFile(wb, 'inventory-import-template.xlsx')
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({ suppliers, onSaved, onClose }) {
  const fileRef = useRef()
  const [rows, setRows] = useState(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setRows(null); setDone(false)
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        // Skip header row
        const parsed = raw.slice(1).map(r => ({
          part_number: String(r[0] || '').trim() || null,
          description: String(r[1] || '').trim(),
          supplier_name: String(r[2] || '').trim(),
          unit: String(r[3] || '').trim() || 'each',
          unit_cost: parseFloat(r[4]) || null,
          qty_on_hand: parseFloat(r[5]) || 0,
          is_serialized: String(r[6] || '').toLowerCase().trim() === 'yes',
          location: String(r[7] || '').trim() || null,
          reorder_point: parseFloat(r[8]) || null,
          notes: String(r[9] || '').trim() || null,
        })).filter(r => r.description)
        if (parsed.length === 0) { setError('No valid rows found. Description is required.'); return }
        setRows(parsed)
      } catch {
        setError('Could not parse file. Use the template format.')
      }
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    setImporting(true); setError('')
    const payload = rows.map(r => {
      const sup = suppliers.find(s => s.name.toLowerCase() === r.supplier_name.toLowerCase())
      return {
        part_number: r.part_number,
        description: r.description,
        supplier_id: sup?.id ?? null,
        unit: UNITS.includes(r.unit) ? r.unit : 'each',
        unit_cost: r.unit_cost,
        qty_on_hand: r.is_serialized ? 0 : r.qty_on_hand,
        is_serialized: r.is_serialized,
        location: r.location,
        reorder_point: r.reorder_point,
        notes: r.notes,
      }
    })
    const { error: err } = await supabase.from('inventory_items').insert(payload)
    setImporting(false)
    if (err) { setError(err.message); return }
    setDone(true)
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 680 }}>
        <div style={modalHeader}>
          <strong>Import Inventory Items</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-success)', marginBottom: 8 }}>
              {rows.length} item{rows.length !== 1 ? 's' : ''} imported successfully.
            </div>
            <button className="btn btn-primary" onClick={onSaved}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
                style={{ flex: 1, fontSize: 13 }} />
              <button className="btn btn-sm" onClick={downloadTemplate}>
                <Download size={13} /> Template
              </button>
            </div>

            {rows && (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 8 }}>
                  {rows.length} row{rows.length !== 1 ? 's' : ''} ready to import
                  {rows.some(r => r.supplier_name && !suppliers.find(s => s.name.toLowerCase() === r.supplier_name.toLowerCase())) && (
                    <span style={{ color: 'var(--color-warning)', marginLeft: 8 }}>
                      — some supplier names not matched (will import without supplier link)
                    </span>
                  )}
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 4 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-2, var(--color-card))' }}>
                        {['Part #', 'Description', 'Supplier', 'Unit', 'Cost', 'Qty', 'Serial', 'Location'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 11, color: 'var(--color-text-3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const supplierMatch = r.supplier_name ? !!suppliers.find(s => s.name.toLowerCase() === r.supplier_name.toLowerCase()) : true
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={tdStyle}>{r.part_number || '—'}</td>
                            <td style={tdStyle}>{r.description}</td>
                            <td style={{ ...tdStyle, color: supplierMatch ? 'inherit' : 'var(--color-warning)' }}>
                              {r.supplier_name || '—'}
                            </td>
                            <td style={tdStyle}>{r.unit}</td>
                            <td style={tdStyle}>{r.unit_cost != null ? fmt.currency(r.unit_cost) : '—'}</td>
                            <td style={tdStyle}>{r.is_serialized ? '—' : r.qty_on_hand}</td>
                            <td style={tdStyle}>{r.is_serialized ? '✓' : ''}</td>
                            <td style={tdStyle}>{r.location || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {error && <p style={errStyle}>{error}</p>}

            <div style={modalFooter}>
              <button className="btn" onClick={onClose}>Cancel</button>
              {rows && (
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Import ${rows.length} Item${rows.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Item form ───────────────────────────────────────────────────────────────

function ItemForm({ item, suppliers, onSaved, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    part_number: item?.part_number ?? '',
    description: item?.description ?? '',
    supplier_id: item?.supplier_id ?? '',
    unit: item?.unit ?? 'each',
    unit_cost: item?.unit_cost?.toString() ?? '',
    qty_on_hand: item?.qty_on_hand?.toString() ?? '0',
    is_serialized: item?.is_serialized ?? false,
    location: item?.location ?? '',
    reorder_point: item?.reorder_point?.toString() ?? '',
    notes: item?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      part_number: form.part_number || null,
      description: form.description.trim(),
      supplier_id: form.supplier_id || null,
      unit: form.unit,
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
      is_serialized: form.is_serialized,
      location: form.location || null,
      reorder_point: form.reorder_point ? parseFloat(form.reorder_point) : null,
      notes: form.notes || null,
    }
    let err
    if (isEdit) {
      ;({ error: err } = await supabase.from('inventory_items').update(payload).eq('id', item.id))
    } else {
      payload.qty_on_hand = form.is_serialized ? 0 : (parseFloat(form.qty_on_hand) || 0)
      ;({ error: err } = await supabase.from('inventory_items').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeader}>
          <strong>{isEdit ? 'Edit Item' : 'Add Inventory Item'}</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group full">
              <label>Description *</label>
              <input value={form.description} onChange={e => set('description', e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label>Part #</label>
              <input value={form.part_number} onChange={e => set('part_number', e.target.value)} placeholder="e.g. SNLD-001" />
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">— None —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unit Cost ($)</label>
              <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="0.00" />
            </div>
            {!isEdit && !form.is_serialized && (
              <div className="form-group">
                <label>Initial Qty On Hand</label>
                <input type="number" step="0.01" min="0" value={form.qty_on_hand} onChange={e => set('qty_on_hand', e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label>Location</label>
              <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Shelf B3, Van 2" />
            </div>
            <div className="form-group">
              <label>Reorder Point</label>
              <input type="number" step="0.01" min="0" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} placeholder="Alert when below..." />
            </div>
            <div className="form-group full">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_serialized} onChange={e => set('is_serialized', e.target.checked)}
                  style={{ width: 14, height: 14 }} />
                Serialized — track individual serial numbers
              </label>
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          {error && <p style={errStyle}>{error}</p>}
          <div style={modalFooter}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Receive form ─────────────────────────────────────────────────────────────

function ReceiveForm({ item, pos, onSaved, onClose }) {
  const [qty, setQty] = useState('1')
  const [unitCost, setUnitCost] = useState(item.unit_cost?.toString() ?? '')
  const [date, setDate] = useState(today())
  const [poId, setPoId] = useState('')
  const [notes, setNotes] = useState('')
  const [serials, setSerials] = useState([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const qtyNum = parseInt(qty) || 0

  useEffect(() => {
    if (item.is_serialized) {
      setSerials(Array.from({ length: Math.max(1, qtyNum) }, (_, i) => serials[i] ?? ''))
    }
  }, [qty, item.is_serialized])

  function setSerial(i, v) {
    setSerials(prev => { const a = [...prev]; a[i] = v; return a })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')

    if (item.is_serialized) {
      const filled = serials.filter(s => s.trim())
      if (filled.length !== qtyNum) {
        setError(`Enter all ${qtyNum} serial numbers.`); setSaving(false); return
      }
      const dupes = filled.filter((s, i) => filled.indexOf(s) !== i)
      if (dupes.length) {
        setError('Duplicate serial numbers detected.'); setSaving(false); return
      }
    }

    const { data: txn, error: e1 } = await supabase.from('inventory_transactions').insert({
      item_id: item.id,
      txn_type: 'receive',
      qty: qtyNum,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      po_id: poId || null,
      txn_date: date,
      notes: notes || null,
    }).select().single()

    if (e1) { setError(e1.message); setSaving(false); return }

    if (item.is_serialized) {
      const rows = serials.map(s => ({
        item_id: item.id,
        serial_number: s.trim(),
        status: 'in_stock',
        receive_txn_id: txn.id,
      }))
      const { error: e2 } = await supabase.from('inventory_serials').insert(rows)
      if (e2) { setError(e2.message); setSaving(false); return }
    }

    const { error: e3 } = await supabase.from('inventory_items')
      .update({ qty_on_hand: item.qty_on_hand + qtyNum })
      .eq('id', item.id)
    if (e3) { setError(e3.message); setSaving(false); return }

    onSaved()
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeader}>
          <strong>Receive Stock — {item.description}</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Qty *</label>
              <input type="number" step="1" min="1" value={qty} onChange={e => setQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Unit Cost ($)</label>
              <input type="number" step="0.01" min="0" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Linked PO</label>
              <select value={poId} onChange={e => setPoId(e.target.value)}>
                <option value="">— None —</option>
                {pos.map(p => <option key={p.id} value={p.id}>{p.po_number || p.id.slice(0, 8)} — {p.vendor}</option>)}
              </select>
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {item.is_serialized && qtyNum > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={liLabel}>Serial Numbers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {serials.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...liLabel, minWidth: 24 }}>#{i + 1}</span>
                    <input style={{ flex: 1, padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text-1)' }}
                      value={s} onChange={e => setSerial(i, e.target.value)} placeholder={`Serial ${i + 1}`} required />
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p style={errStyle}>{error}</p>}
          <div style={modalFooter}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Receive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Issue form ───────────────────────────────────────────────────────────────

function IssueForm({ item, jobs, inStockSerials, onSaved, onClose }) {
  const [qty, setQty] = useState('1')
  const [jobId, setJobId] = useState('')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [selectedSerials, setSelectedSerials] = useState([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const qtyNum = parseInt(qty) || 0

  useEffect(() => {
    if (item.is_serialized) {
      setSelectedSerials(Array.from({ length: Math.max(1, qtyNum) }, (_, i) => selectedSerials[i] ?? ''))
    }
  }, [qty, item.is_serialized])

  function setSerial(i, v) {
    setSelectedSerials(prev => { const a = [...prev]; a[i] = v; return a })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    if (!jobId) { setError('Select a job.'); setSaving(false); return }

    if (item.is_serialized) {
      const chosen = selectedSerials.filter(s => s)
      if (chosen.length !== qtyNum) {
        setError(`Select all ${qtyNum} serial numbers.`); setSaving(false); return
      }
      if (new Set(chosen).size !== chosen.length) {
        setError('Cannot select the same serial twice.'); setSaving(false); return
      }
    }

    if (qtyNum > item.qty_on_hand) {
      setError(`Only ${item.qty_on_hand} ${item.unit} on hand.`); setSaving(false); return
    }

    const { data: txn, error: e1 } = await supabase.from('inventory_transactions').insert({
      item_id: item.id,
      txn_type: 'issue',
      qty: -qtyNum,
      job_id: jobId,
      txn_date: date,
      notes: notes || null,
    }).select().single()

    if (e1) { setError(e1.message); setSaving(false); return }

    if (item.is_serialized) {
      for (const sn of selectedSerials) {
        const serial = inStockSerials.find(s => s.id === sn)
        if (!serial) continue
        const { error: e2 } = await supabase.from('inventory_serials').update({
          status: 'installed',
          issue_txn_id: txn.id,
          job_id: jobId,
          installed_date: date,
        }).eq('id', serial.id)
        if (e2) { setError(e2.message); setSaving(false); return }
      }
    }

    const { error: e3 } = await supabase.from('inventory_items')
      .update({ qty_on_hand: item.qty_on_hand - qtyNum })
      .eq('id', item.id)
    if (e3) { setError(e3.message); setSaving(false); return }

    onSaved()
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeader}>
          <strong>Issue to Job — {item.description}</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group full">
              <label>Job *</label>
              <select value={jobId} onChange={e => setJobId(e.target.value)} required>
                <option value="">— Select Job —</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Qty *</label>
              <input type="number" step="1" min="1" max={item.qty_on_hand} value={qty} onChange={e => setQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {item.is_serialized && qtyNum > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={liLabel}>Select Serial Numbers to Issue</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {Array.from({ length: qtyNum }).map((_, i) => {
                  const usedInOtherSlots = selectedSerials.filter((s, j) => j !== i && s)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...liLabel, minWidth: 24 }}>#{i + 1}</span>
                      <select style={{ flex: 1, padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text-1)' }}
                        value={selectedSerials[i] ?? ''} onChange={e => setSerial(i, e.target.value)} required>
                        <option value="">— Select serial —</option>
                        {inStockSerials.filter(s => !usedInOtherSlots.includes(s.id)).map(s => (
                          <option key={s.id} value={s.id}>{s.serial_number}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {error && <p style={errStyle}>{error}</p>}
          <div style={modalFooter}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Adjust form ──────────────────────────────────────────────────────────────

function AdjustForm({ item, onSaved, onClose }) {
  const [newQty, setNewQty] = useState(item.qty_on_hand.toString())
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const n = parseFloat(newQty)
    const delta = n - item.qty_on_hand

    const { error: e1 } = await supabase.from('inventory_transactions').insert({
      item_id: item.id,
      txn_type: 'adjust',
      qty: delta,
      txn_date: date,
      notes: notes || null,
    })
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('inventory_items')
      .update({ qty_on_hand: n }).eq('id', item.id)
    if (e2) { setError(e2.message); setSaving(false); return }

    onSaved()
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={modalHeader}>
          <strong>Adjust Qty — {item.description}</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>New Qty On Hand *</label>
              <input type="number" step="0.01" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} required autoFocus />
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>Current: {item.qty_on_hand} {item.unit}</div>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group full">
              <label>Reason / Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Physical count, damaged stock..." />
            </div>
          </div>
          {error && <p style={errStyle}>{error}</p>}
          <div style={modalFooter}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Adjust'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('stock')
  const [items, setItems] = useState([])
  const [txns, setTxns] = useState([])
  const [serials, setSerials] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [jobs, setJobs] = useState([])
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { type: 'add'|'edit'|'receive'|'issue'|'adjust', item? }
  const [inStockSerials, setInStockSerials] = useState([])
  const [serialSearch, setSerialSearch] = useState('')
  const [txnSearch, setTxnSearch] = useState('')

  const load = useCallback(async () => {
    const [iv, tx, sr, sup, jb, po] = await Promise.all([
      supabase.from('inventory_items').select('*, supplier:suppliers(name)').order('description'),
      supabase.from('inventory_transactions').select('*, item:inventory_items(description,part_number), job:jobs(job_number,job_description), po:purchase_orders(po_number,vendor)').order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('inventory_serials').select('*, item:inventory_items(description,part_number), job:jobs(id,job_number,job_description)').eq('status', 'installed').order('installed_date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('jobs').select('id, job_number, job_description').order('job_number'),
      supabase.from('purchase_orders').select('id, po_number, vendor').order('created_at', { ascending: false }).limit(200),
    ])
    setItems(iv.data || [])
    setTxns(tx.data || [])
    setSerials(sr.data || [])
    setSuppliers(sup.data || [])
    setJobs(jb.data || [])
    setPos(po.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openIssue(item) {
    const { data } = await supabase.from('inventory_serials')
      .select('id, serial_number').eq('item_id', item.id).eq('status', 'in_stock').order('serial_number')
    setInStockSerials(data || [])
    setModal({ type: 'issue', item })
  }

  function closeModal() { setModal(null) }

  function afterSave() {
    closeModal()
    setLoading(true)
    load()
  }

  const filteredTxns = txnSearch
    ? txns.filter(t =>
        t.item?.description?.toLowerCase().includes(txnSearch.toLowerCase()) ||
        t.item?.part_number?.toLowerCase().includes(txnSearch.toLowerCase()) ||
        t.job?.job_number?.toLowerCase().includes(txnSearch.toLowerCase())
      )
    : txns

  const filteredSerials = serialSearch
    ? serials.filter(s =>
        s.serial_number?.toLowerCase().includes(serialSearch.toLowerCase()) ||
        s.item?.description?.toLowerCase().includes(serialSearch.toLowerCase()) ||
        s.item?.part_number?.toLowerCase().includes(serialSearch.toLowerCase()) ||
        s.job?.job_number?.toLowerCase().includes(serialSearch.toLowerCase())
      )
    : serials

  const totalValue = items.reduce((s, i) => s + (i.qty_on_hand || 0) * (i.unit_cost || 0), 0)
  const lowStockCount = items.filter(i => !i.is_serialized && i.reorder_point != null && i.qty_on_hand <= i.reorder_point).length

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Inventory</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lowStockCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-warning)', fontWeight: 600 }}>
              <AlertTriangle size={13} /> {lowStockCount} low stock
            </span>
          )}
          <button className="btn btn-sm" onClick={() => setModal({ type: 'import' })}>
            <Upload size={13} /> Import
          </button>
          <button className="btn btn-sm" onClick={() => exportInventory(items, suppliers)} disabled={items.length === 0}>
            <Download size={13} /> Export
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'add' })}>
            <Plus size={13} /> Add Item
          </button>
        </div>
      </div>

      <div className="page">
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={statLabel}>Total Items</div>
            <div style={statVal}>{items.length}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={statLabel}>Stock Value</div>
            <div style={statVal}>{fmt.currency(totalValue)}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={statLabel}>Installed Serials</div>
            <div style={statVal}>{serials.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
          {[['stock', 'Stock'], ['txns', 'Transactions'], ['installed', 'Installed Serials']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: tab === key ? 600 : 400, border: 'none', background: 'none',
                cursor: 'pointer', borderBottom: tab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: tab === key ? 'var(--color-primary)' : 'var(--color-text-2)', marginBottom: -1 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Stock tab */}
        {tab === 'stock' && (
          items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-3)' }}>
              No items yet — click "Add Item" to get started.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part #</th>
                    <th>Description</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'center' }}>Serialized</th>
                    <th style={{ textAlign: 'right' }}>On Hand</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isLow = !item.is_serialized && item.reorder_point != null && item.qty_on_hand <= item.reorder_point
                    return (
                      <tr key={item.id} style={isLow ? { background: 'var(--color-warning-bg, rgba(255,180,0,0.07))' } : {}}>
                        <td style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{item.part_number || '—'}</td>
                        <td style={{ fontWeight: 500 }}>
                          {item.description}
                          {isLow && <span style={{ marginLeft: 6, color: 'var(--color-warning)' }}><AlertTriangle size={11} /></span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{item.supplier?.name ?? '—'}</td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>{item.is_serialized ? '✓' : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600,
                          color: isLow ? 'var(--color-warning)' : item.qty_on_hand === 0 ? 'var(--color-text-3)' : 'var(--color-text-1)' }}>
                          {item.qty_on_hand}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.unit}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{item.unit_cost != null ? fmt.currency(item.unit_cost) : '—'}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>
                          {item.unit_cost != null ? fmt.currency(item.qty_on_hand * item.unit_cost) : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.location || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm" onClick={() => setModal({ type: 'receive', item })}>Receive</button>
                            <button className="btn btn-sm" onClick={() => openIssue(item)} disabled={item.qty_on_hand === 0}>Issue</button>
                            {!item.is_serialized && (
                              <button className="btn btn-sm" onClick={() => setModal({ type: 'adjust', item })}>Adjust</button>
                            )}
                            <button className="btn btn-sm" onClick={() => setModal({ type: 'edit', item })}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Transactions tab */}
        {tab === 'txns' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <input placeholder="Filter by item or job..." value={txnSearch} onChange={e => setTxnSearch(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text-1)', width: 280 }} />
            </div>
            {filteredTxns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-3)' }}>No transactions yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th>Job</th>
                      <th>PO</th>
                      <th style={{ textAlign: 'right' }}>Unit Cost</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: 12 }}>{fmt.date(t.txn_date)}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                            background: t.txn_type === 'receive' ? 'var(--color-success-bg, rgba(0,180,80,0.1))' :
                              t.txn_type === 'issue' ? 'rgba(220,50,50,0.1)' : 'rgba(100,100,200,0.1)',
                            color: t.txn_type === 'receive' ? 'var(--color-success)' :
                              t.txn_type === 'issue' ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                            {t.txn_type}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {t.item?.description}
                          {t.item?.part_number && <span style={{ color: 'var(--color-text-3)', fontSize: 11, marginLeft: 4 }}>#{t.item.part_number}</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600,
                          color: t.qty > 0 ? 'var(--color-success)' : t.qty < 0 ? 'var(--color-danger)' : 'var(--color-text-1)' }}>
                          {t.qty > 0 ? `+${t.qty}` : t.qty}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {t.job ? (
                            <button onClick={() => navigate(`/jobs/${t.job_id}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0, fontSize: 12 }}>
                              {t.job.job_number}
                            </button>
                          ) : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                          {t.po ? (t.po.po_number || t.po.vendor) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{t.unit_cost != null ? fmt.currency(t.unit_cost) : '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{t.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Installed Serials tab */}
        {tab === 'installed' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <input placeholder="Filter by serial, part, or job..." value={serialSearch} onChange={e => setSerialSearch(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text-1)', width: 300 }} />
            </div>
            {filteredSerials.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-3)' }}>
                {serialSearch ? 'No results match that filter.' : 'No installed serials yet.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Serial #</th>
                      <th>Part #</th>
                      <th>Description</th>
                      <th>Job #</th>
                      <th>Job Name</th>
                      <th>Installed Date</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSerials.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{s.serial_number}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{s.item?.part_number || '—'}</td>
                        <td style={{ fontSize: 13 }}>{s.item?.description}</td>
                        <td>
                          {s.job ? (
                            <button onClick={() => navigate(`/jobs/${s.job_id}`)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0, fontSize: 13 }}>
                              {s.job.job_number}
                            </button>
                          ) : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{s.job?.job_description || '—'}</td>
                        <td style={{ fontSize: 12 }}>{s.installed_date ? fmt.date(s.installed_date) : '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{s.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'import' && (
        <ImportModal suppliers={suppliers} onSaved={afterSave} onClose={closeModal} />
      )}
      {modal?.type === 'add' && (
        <ItemForm suppliers={suppliers} onSaved={afterSave} onClose={closeModal} />
      )}
      {modal?.type === 'edit' && (
        <ItemForm item={modal.item} suppliers={suppliers} onSaved={afterSave} onClose={closeModal} />
      )}
      {modal?.type === 'receive' && (
        <ReceiveForm item={modal.item} pos={pos} onSaved={afterSave} onClose={closeModal} />
      )}
      {modal?.type === 'issue' && (
        <IssueForm item={modal.item} jobs={jobs} inStockSerials={inStockSerials} onSaved={afterSave} onClose={closeModal} />
      )}
      {modal?.type === 'adjust' && (
        <AdjustForm item={modal.item} onSaved={afterSave} onClose={closeModal} />
      )}
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const modalStyle = {
  background: 'var(--color-card)', borderRadius: 8, padding: 20, width: '100%', maxWidth: 520,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
}
const modalHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
}
const modalFooter = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12,
  borderTop: '1px solid var(--color-border)',
}
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', padding: 2,
}
const errStyle = { color: 'var(--color-danger)', fontSize: 12, marginTop: 8 }
const liLabel = { fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const statLabel = { fontSize: 11, color: 'var(--color-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const statVal = { fontSize: 20, fontWeight: 700, color: 'var(--color-text-1)' }
const tdStyle = { padding: '5px 8px', color: 'var(--color-text-1)' }
