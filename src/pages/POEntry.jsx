import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, trackingUrl } from '../lib/utils'
import { Plus, X } from 'lucide-react'
import RecordNotes from '../components/RecordNotes'

const CATEGORIES = ['Material — Hardware', 'Material — Cabling', 'Subcontractor', 'Equipment Rental', 'Other']
const DELIVERY = ['Not Ordered', 'Ordered — In Transit', 'Partially Delivered', 'Delivered — Not Invoiced', 'Invoiced']

const emptyLine = () => ({
  _key: Math.random(),
  id: null,
  part_number: '', description: '', qty: '1', price_each: '',
  qty_ordered: '', qty_in_transit: '', qty_delivered: '',
  estimated_ship_date: '', tracking_number: '',
  invoiced: false, invoice_date: '',
})

export default function POEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [jobs, setJobs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    supplier_id: '',
    po_number: '', vendor: '', amount: '',
    category: 'Material — Hardware', date_issued: '',
    expected_invoice_date: '', delivery_status: 'Not Ordered',
    description: ''
  })
  const [lines, setLines] = useState([])
  const [deletedLineIds, setDeletedLineIds] = useState([])

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
    supabase.from('suppliers').select('id, name').order('name')
      .then(({ data }) => setSuppliers(data || []))
  }, [])

  useEffect(() => {
    if (!editId) return
    Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', editId).single(),
      supabase.from('po_line_items').select('*').eq('po_id', editId).order('created_at'),
    ]).then(([{ data: po }, { data: lineData }]) => {
      if (po) setForm({
        job_id: po.job_id || '',
        supplier_id: po.supplier_id || '',
        po_number: po.po_number || '',
        vendor: po.vendor || '',
        amount: po.amount ?? '',
        category: po.category || 'Material — Hardware',
        date_issued: po.date_issued || '',
        expected_invoice_date: po.expected_invoice_date || '',
        delivery_status: po.delivery_status || 'Not Ordered',
        description: po.description || '',
      })
      setLines((lineData || []).map(l => ({ ...l, _key: Math.random(), invoiced: l.invoiced ?? false, invoice_date: l.invoice_date ?? '' })))
      setLoading(false)
    })
  }, [editId])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function updateLine(key, field, val) {
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: val } : l))
  }

  function removeLine(key) {
    const line = lines.find(l => l._key === key)
    if (line?.id) setDeletedLineIds(prev => [...prev, line.id])
    setLines(prev => prev.filter(l => l._key !== key))
  }

  const lineItemsTotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price_each) || 0), 0)
  const invoicedTotal = lines.filter(l => l.invoiced).reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price_each) || 0), 0)
  const openTotal = lineItemsTotal - invoicedTotal

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }
    if (!form.vendor.trim()) { setError('Vendor is required.'); setSaving(false); return }

    const payload = {
      po_number: form.po_number,
      supplier_id: form.supplier_id || null,
      vendor: form.vendor,
      amount: parseFloat(form.amount) || 0,
      category: form.category,
      date_issued: form.date_issued || null,
      expected_invoice_date: form.expected_invoice_date || null,
      delivery_status: form.delivery_status,
      description: form.description,
    }

    let poId = editId
    let err
    if (editId) {
      ;({ error: err } = await supabase.from('purchase_orders').update(payload).eq('id', editId))
    } else {
      const { data, error: e2 } = await supabase.from('purchase_orders')
        .insert({ ...payload, job_id: form.job_id }).select().single()
      err = e2
      if (data) poId = data.id
    }
    if (err) { setError(err.message); setSaving(false); return }

    // Save line items
    if (deletedLineIds.length > 0) {
      await supabase.from('po_line_items').delete().in('id', deletedLineIds)
    }
    for (const line of lines) {
      const lp = {
        po_id: poId,
        part_number: line.part_number || null,
        description: line.description || null,
        qty: parseFloat(line.qty) || 0,
        price_each: parseFloat(line.price_each) || 0,
        qty_ordered: parseFloat(line.qty_ordered) || 0,
        qty_in_transit: parseFloat(line.qty_in_transit) || 0,
        qty_delivered: parseFloat(line.qty_delivered) || 0,
        estimated_ship_date: line.estimated_ship_date || null,
        tracking_number: line.tracking_number || null,
        invoiced: line.invoiced ?? false,
        invoice_date: line.invoiced && line.invoice_date ? line.invoice_date : null,
      }
      if (line.id) {
        await supabase.from('po_line_items').update(lp).eq('id', line.id)
      } else {
        await supabase.from('po_line_items').insert(lp)
      }
    }

    navigate(`/jobs/${form.job_id}`)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{editId ? 'Edit Purchase Order' : 'Enter Purchase Order'}</span>
      </div>
      <div className="page" style={{ maxWidth: 900 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom:16 }}>{error}</div>}

          <div className="form-section">
            <div className="form-section-title">Job Assignment</div>
            <div className="form-grid">
              <div className="form-group full">
                <label>Job *</label>
                <select value={form.job_id} onChange={e => set('job_id', e.target.value)} required disabled={!!editId}>
                  <option value="">— Select Job —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>PO Number</label>
                <input type="text" placeholder="PO-2026-XXXX" value={form.po_number} onChange={e => set('po_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Date Issued</label>
                <input type="date" value={form.date_issued} onChange={e => set('date_issued', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Vendor & Amount</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Supplier</label>
                <select value={form.supplier_id} onChange={e => {
                  const id = e.target.value
                  set('supplier_id', id)
                  if (id) {
                    const s = suppliers.find(s => s.id === id)
                    if (s) set('vendor', s.name)
                  }
                }}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Vendor Name *</label>
                <input type="text" placeholder="e.g. Anixter, Graybar..." value={form.vendor} onChange={e => set('vendor', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>PO Amount ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
                {lineItemsTotal > 0 && (
                  <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
                    Line items total: {fmt.currency(lineItemsTotal)}
                    <button type="button" style={{ fontSize:11, color:'var(--color-primary)', background:'none', border:'none', cursor:'pointer', padding:0 }}
                      onClick={() => set('amount', lineItemsTotal.toFixed(2))}>
                      Use this
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Delivery Status</label>
                <select value={form.delivery_status} onChange={e => set('delivery_status', e.target.value)}>
                  {DELIVERY.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Description</label>
                <input type="text" placeholder="What is being ordered?" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Invoice Expectation</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Expected Invoice Date</label>
                <input type="date" value={form.expected_invoice_date} onChange={e => set('expected_invoice_date', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="form-section">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div className="form-section-title" style={{ margin:0 }}>Line Items ({lines.length})</div>
              <button type="button" className="btn btn-sm" onClick={() => setLines(prev => [...prev, emptyLine()])}>
                <Plus size={13} /> Add Line
              </button>
            </div>

            {lines.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--color-text-3)', fontSize:13 }}>
                No line items — click "Add Line" to itemize this PO.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {lines.map(line => {
                  const lineTotal = (parseFloat(line.qty) || 0) * (parseFloat(line.price_each) || 0)
                  return (
                    <div key={line._key} style={{ border:'1px solid var(--color-border)', borderRadius:6, padding:'10px 12px', background:'var(--color-bg)' }}>
                      {/* Row 1: Part #, Description, Qty, Price, Total, Delete */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr 90px 120px 110px 32px', gap:8, alignItems:'end' }}>
                        <div>
                          <div style={liLabel}>Part #</div>
                          <input style={inp} value={line.part_number} onChange={e => updateLine(line._key, 'part_number', e.target.value)} placeholder="Part number" />
                        </div>
                        <div>
                          <div style={liLabel}>Description</div>
                          <input style={inp} value={line.description} onChange={e => updateLine(line._key, 'description', e.target.value)} placeholder="Item description" />
                        </div>
                        <div>
                          <div style={liLabel}>Qty</div>
                          <input style={{ ...inp, textAlign:'right' }} type="number" step="0.01" min="0" value={line.qty} onChange={e => updateLine(line._key, 'qty', e.target.value)} />
                        </div>
                        <div>
                          <div style={liLabel}>$ Each</div>
                          <input style={{ ...inp, textAlign:'right' }} type="number" step="0.01" min="0" value={line.price_each} onChange={e => updateLine(line._key, 'price_each', e.target.value)} placeholder="0.00" />
                        </div>
                        <div>
                          <div style={liLabel}>Total</div>
                          <div style={{ padding:'4px 6px', fontSize:12, fontWeight:500, textAlign:'right', border:'1px solid transparent', color: lineTotal > 0 ? 'var(--color-text-1)' : 'var(--color-text-3)' }}>
                            {lineTotal > 0 ? fmt.currency(lineTotal) : '—'}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2 }}>
                          <button type="button" onClick={() => removeLine(line._key)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-danger)', padding:'4px' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Row 2: Ordered, In Transit, Received, Est. Ship, Tracking # */}
                      <div style={{ display:'grid', gridTemplateColumns:'100px 100px 100px 160px 1fr', gap:8, marginTop:8, alignItems:'end' }}>
                        <div>
                          <div style={liLabel}>Ordered</div>
                          <input style={{ ...inp, textAlign:'right' }} type="number" step="1" min="0" value={line.qty_ordered} onChange={e => updateLine(line._key, 'qty_ordered', e.target.value)} placeholder="0" />
                        </div>
                        <div>
                          <div style={liLabel}>In Transit</div>
                          <input style={{ ...inp, textAlign:'right' }} type="number" step="1" min="0" value={line.qty_in_transit} onChange={e => updateLine(line._key, 'qty_in_transit', e.target.value)} placeholder="0" />
                        </div>
                        <div>
                          <div style={liLabel}>Received</div>
                          <input style={{ ...inp, textAlign:'right' }} type="number" step="1" min="0" value={line.qty_delivered} onChange={e => updateLine(line._key, 'qty_delivered', e.target.value)} placeholder="0" />
                        </div>
                        <div>
                          <div style={liLabel}>Est. Ship Date</div>
                          <input style={inp} type="date" value={line.estimated_ship_date} onChange={e => updateLine(line._key, 'estimated_ship_date', e.target.value)} />
                        </div>
                        <div>
                          <div style={liLabel}>Tracking #</div>
                          <input style={inp} value={line.tracking_number} onChange={e => updateLine(line._key, 'tracking_number', e.target.value)} placeholder="Tracking number" />
                          {line.tracking_number && (
                            <a href={trackingUrl(line.tracking_number)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:11, color:'var(--color-primary)', display:'block', marginTop:3 }}>
                              Track ↗
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Row 3: Invoiced by Vendor */}
                      <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:8, paddingTop:8, borderTop:'1px solid var(--color-border)' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, fontWeight: line.invoiced ? 600 : 400, color: line.invoiced ? 'var(--color-success)' : 'var(--color-text-2)' }}>
                          <input
                            type="checkbox"
                            checked={!!line.invoiced}
                            onChange={e => updateLine(line._key, 'invoiced', e.target.checked)}
                            style={{ width:14, height:14, cursor:'pointer' }}
                          />
                          Invoiced by Vendor
                        </label>
                        {line.invoiced && (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={liLabel}>Invoice Date</span>
                            <input
                              type="date"
                              style={{ ...inp, width:150, fontSize:12 }}
                              value={line.invoice_date}
                              onChange={e => updateLine(line._key, 'invoice_date', e.target.value)}
                            />
                          </div>
                        )}
                        {line.invoiced && lineTotal > 0 && (
                          <span style={{ marginLeft:'auto', fontSize:12, fontWeight:600, color:'var(--color-success)' }}>
                            {fmt.currency(lineTotal)} invoiced
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {lineItemsTotal > 0 && (
                  <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:20, padding:'8px 4px', fontSize:13 }}>
                    {invoicedTotal > 0 && (
                      <span style={{ color:'var(--color-success)', fontWeight:500 }}>
                        Invoiced: {fmt.currency(invoicedTotal)}
                      </span>
                    )}
                    {openTotal > 0 && (
                      <span style={{ color:'var(--color-warning)', fontWeight:500 }}>
                        Open: {fmt.currency(openTotal)}
                      </span>
                    )}
                    <span style={{ fontWeight:600, color:'var(--color-text-1)', borderLeft:'1px solid var(--color-border)', paddingLeft:20 }}>
                      Total: {fmt.currency(lineItemsTotal)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : editId ? 'Save Changes' : 'Save PO'}
            </button>
            <button type="button" className="btn" onClick={() => form.job_id ? navigate(`/jobs/${form.job_id}`) : navigate('/jobs')}>
              Cancel
            </button>
          </div>
        </form>

        {editId && <RecordNotes entityType="purchase_order" entityId={editId} />}
      </div>
    </>
  )
}

const inp = { width:'100%', padding:'5px 8px', fontSize:13, border:'1px solid var(--color-border)', borderRadius:4, background:'var(--color-bg)', color:'var(--color-text-1)' }
const liLabel = { fontSize:10, fontWeight:600, color:'var(--color-text-3)', marginBottom:3, textTransform:'uppercase', letterSpacing:'0.04em' }
