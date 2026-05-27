import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import RecordNotes from '../components/RecordNotes'

const STATUSES = ['Pending — Not in Foundation', 'Submitted to Accounting', 'Posted in Foundation']

export default function InvoiceEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [jobs, setJobs] = useState([])
  const [jobPOs, setJobPOs] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)
  const [error, setError] = useState('')
  const [isCredit, setIsCredit] = useState(false)
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    po_id: '', vendor_invoice_number: '', vendor: '',
    amount: '', date_received: '',
    foundation_status: 'Pending — Not in Foundation',
    creditStatus: 'pending',
    notes: ''
  })

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  useEffect(() => {
    if (!editId) return
    supabase.from('invoices').select('*').eq('id', editId).single()
      .then(({ data }) => {
        if (data) {
          const credit = data.credit_type === 'supplier_credit'
          setIsCredit(credit)
          setForm({
            job_id: data.job_id || '',
            po_id: data.po_id || '',
            vendor_invoice_number: data.vendor_invoice_number || '',
            vendor: data.vendor || '',
            amount: credit ? String(Math.abs(data.amount ?? 0)) : (data.amount ?? ''),
            date_received: data.date_received || '',
            foundation_status: data.foundation_status || 'Pending — Not in Foundation',
            creditStatus: data.credit_status || 'pending',
            notes: data.notes || '',
          })
        }
        setLoading(false)
      })
  }, [editId])

  useEffect(() => {
    if (!form.job_id) { setJobPOs([]); return }
    supabase.from('purchase_orders').select('*').eq('job_id', form.job_id).order('created_at')
      .then(({ data }) => setJobPOs(data || []))
  }, [form.job_id])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  // Warn if entering a direct invoice for a job that already has POs
  const showDoubleCountWarning = !form.po_id && jobPOs.length > 0

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }

    const rawAmount = parseFloat(form.amount) || 0
    const payload = {
      po_id: isCredit ? null : (form.po_id || null),
      vendor_invoice_number: form.vendor_invoice_number,
      vendor: form.vendor,
      amount: isCredit ? -Math.abs(rawAmount) : rawAmount,
      date_received: form.date_received || null,
      foundation_status: form.foundation_status,
      credit_type: isCredit ? 'supplier_credit' : null,
      credit_status: isCredit ? form.creditStatus : null,
      notes: form.notes,
    }

    let err
    if (editId) {
      ;({ error: err } = await supabase.from('invoices').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('invoices').insert({ ...payload, job_id: form.job_id }))
    }
    if (err) { setError(err.message); setSaving(false); return }

    navigate(`/jobs/${form.job_id}`)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar"><span className="topbar-title">{editId ? 'Edit Invoice' : 'Enter Invoice'}</span></div>
      <div className="page" style={{ maxWidth: 680 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom:16 }}>{error}</div>}

          {/* Entry type — cannot change when editing */}
          {!editId && (
            <div className="form-section">
              <div className="form-section-title">Entry Type</div>
              <div style={{ display: 'flex', gap: 24 }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="entryType" checked={!isCredit} onChange={() => { setIsCredit(false); set('po_id', '') }} />
                  Vendor Invoice
                </label>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="entryType" checked={isCredit} onChange={() => { setIsCredit(true); set('po_id', '') }} />
                  Supplier Credit / Return
                </label>
              </div>
              {isCredit && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF3CD', border: '1px solid #FAC775', borderRadius: 6, fontSize: 12, color: '#854F0B' }}>
                  Supplier credits are standalone — they are not linked to a PO. The credit amount will be stored as negative and automatically reduces job tracked cost.
                </div>
              )}
            </div>
          )}

          <div className="form-section">
            <div className="form-section-title">Link to Job{isCredit ? '' : ' & PO'}</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Job *</label>
                <select value={form.job_id} onChange={e => { set('job_id', e.target.value); set('po_id', '') }} required disabled={!!editId}>
                  <option value="">— Select Job —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
                </select>
              </div>
              {!isCredit && (
                <div className="form-group">
                  <label>Against PO (optional)</label>
                  <select value={form.po_id} onChange={e => set('po_id', e.target.value)} disabled={!form.job_id}>
                    <option value="">— No PO / Direct Invoice —</option>
                    {jobPOs.map(p => <option key={p.id} value={p.id}>{p.po_number || 'No #'} · {p.vendor} · {fmt.currency(p.amount)}</option>)}
                  </select>
                  {showDoubleCountWarning && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#FAEEDA', border: '1px solid #FAC775', borderRadius: 4, fontSize: 12, color: '#854F0B' }}>
                      This job has {jobPOs.length} PO{jobPOs.length > 1 ? 's' : ''}. If this invoice is against one of them, select it above — otherwise both the PO and this invoice will be counted as separate costs.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">{isCredit ? 'Credit Details' : 'Invoice Details'}</div>
            <div className="form-grid">
              <div className="form-group">
                <label>{isCredit ? 'Supplier Credit Memo #' : 'Vendor Invoice #'}</label>
                <input type="text" placeholder={isCredit ? 'e.g. CM-1042' : 'e.g. INV-88421'} value={form.vendor_invoice_number} onChange={e => set('vendor_invoice_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Vendor / Supplier</label>
                <input type="text" placeholder={isCredit ? 'Who is issuing the credit?' : 'Who sent this invoice?'} value={form.vendor} onChange={e => set('vendor', e.target.value)} />
              </div>
              <div className="form-group">
                <label>{isCredit ? 'Credit Amount ($) * (enter as positive)' : 'Invoice Amount ($) *'}</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>{isCredit ? 'Date Credit Memo Received' : 'Date Received'}</label>
                <input type="date" value={form.date_received} onChange={e => set('date_received', e.target.value)} />
              </div>
              {isCredit ? (
                <div className="form-group">
                  <label>Credit Status</label>
                  <select value={form.creditStatus} onChange={e => set('creditStatus', e.target.value)}>
                    <option value="pending">Pending from Supplier</option>
                    <option value="received">Credit Received</option>
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label>Foundation Status</label>
                  <select value={form.foundation_status} onChange={e => set('foundation_status', e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group full">
                <label>Notes</label>
                <input type="text" placeholder={isCredit ? 'Reason for return, item description...' : 'Any notes about this invoice...'} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : editId ? 'Save Changes' : isCredit ? 'Save Credit' : 'Save Invoice'}
            </button>
            <button type="button" className="btn" onClick={() => form.job_id ? navigate(`/jobs/${form.job_id}`) : navigate('/jobs')}>
              Cancel
            </button>
          </div>
        </form>

        {editId && <RecordNotes entityType="invoice" entityId={editId} />}
      </div>
    </>
  )
}
