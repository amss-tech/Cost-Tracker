import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

const STATUSES = ['Pending — Not in Foundation', 'Submitted to Accounting', 'Posted in Foundation']

export default function InvoiceEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [jobPOs, setJobPOs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    po_id: '', vendor_invoice_number: '', vendor: '',
    amount: '', date_received: '',
    foundation_status: 'Pending — Not in Foundation', notes: ''
  })

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  useEffect(() => {
    if (!form.job_id) { setJobPOs([]); return }
    supabase.from('purchase_orders').select('*').eq('job_id', form.job_id).order('created_at')
      .then(({ data }) => setJobPOs(data || []))
  }, [form.job_id])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }

    const { error: err } = await supabase.from('invoices').insert({
      ...form,
      po_id: form.po_id || null,
      amount: parseFloat(form.amount) || 0,
      date_received: form.date_received || null,
    })
    if (err) { setError(err.message); setSaving(false); return }

    setSuccess('Invoice saved!')
    setForm(f => ({ ...f, po_id:'', vendor_invoice_number:'', vendor:'', amount:'', date_received:'', notes:'' }))
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  return (
    <>
      <div className="topbar"><span className="topbar-title">Enter Invoice</span></div>
      <div className="page" style={{ maxWidth: 680 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom:16 }}>{error}</div>}
          {success && <div style={{ background:'#EAF3DE', color:'#3B6D11', padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>{success}</div>}

          <div className="form-section">
            <div className="form-section-title">Link to Job & PO</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Job *</label>
                <select value={form.job_id} onChange={e => { set('job_id', e.target.value); set('po_id', '') }} required>
                  <option value="">— Select Job —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Against PO (optional)</label>
                <select value={form.po_id} onChange={e => set('po_id', e.target.value)} disabled={!form.job_id}>
                  <option value="">— No PO / Direct Invoice —</option>
                  {jobPOs.map(p => <option key={p.id} value={p.id}>{p.po_number || 'No #'} · {p.vendor} · {fmt.currency(p.amount)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Invoice Details</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Vendor Invoice #</label>
                <input type="text" placeholder="e.g. INV-88421" value={form.vendor_invoice_number} onChange={e => set('vendor_invoice_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Vendor</label>
                <input type="text" placeholder="Who sent this invoice?" value={form.vendor} onChange={e => set('vendor', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Invoice Amount ($) *</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Date Received</label>
                <input type="date" value={form.date_received} onChange={e => set('date_received', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Foundation Status</label>
                <select value={form.foundation_status} onChange={e => set('foundation_status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input type="text" placeholder="Any notes about this invoice..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Save Invoice'}
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
