import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Material — Hardware', 'Material — Cabling', 'Subcontractor', 'Equipment Rental', 'Other']
const DELIVERY = ['Not Ordered', 'Ordered — In Transit', 'Delivered — Not Invoiced', 'Invoiced']

export default function POEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    po_number: '', vendor: '', amount: '',
    category: 'Material — Hardware', date_issued: '',
    expected_invoice_date: '', delivery_status: 'Not Ordered',
    description: ''
  })

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }
    if (!form.vendor.trim()) { setError('Vendor is required.'); setSaving(false); return }

    const { error: err } = await supabase.from('purchase_orders').insert({
      ...form,
      amount: parseFloat(form.amount) || 0,
      date_issued: form.date_issued || null,
      expected_invoice_date: form.expected_invoice_date || null,
    })
    if (err) { setError(err.message); setSaving(false); return }

    setSuccess('PO saved!')
    setForm(f => ({ ...f, po_number:'', vendor:'', amount:'', description:'', date_issued:'', expected_invoice_date:'' }))
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  return (
    <>
      <div className="topbar"><span className="topbar-title">Enter Purchase Order</span></div>
      <div className="page" style={{ maxWidth: 680 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom:16 }}>{error}</div>}
          {success && <div style={{ background:'#EAF3DE', color:'#3B6D11', padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>{success}</div>}

          <div className="form-section">
            <div className="form-section-title">Job Assignment</div>
            <div className="form-grid">
              <div className="form-group full">
                <label>Job *</label>
                <select value={form.job_id} onChange={e => set('job_id', e.target.value)} required>
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
                <label>Vendor Name *</label>
                <input type="text" placeholder="e.g. Anixter, Graybar..." value={form.vendor} onChange={e => set('vendor', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>PO Amount ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
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

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Save PO'}
            </button>
            <button type="button" className="btn" onClick={() => form.job_id ? navigate(`/jobs/${form.job_id}`) : navigate('/jobs')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
