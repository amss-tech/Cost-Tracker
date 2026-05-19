import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RecordNotes from '../components/RecordNotes'

const STATUSES = ['Submitted', 'Approved', 'Paid', 'Pending', 'Disputed']

export default function BillingEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const [jobs, setJobs] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    billing_number: '',
    description: '',
    amount: '',
    date_submitted: new Date().toISOString().split('T')[0],
    date_approved: '',
    status: 'Submitted',
    notes: '',
  })

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  useEffect(() => {
    if (!editId) return
    supabase.from('billings').select('*').eq('id', editId).single()
      .then(({ data }) => {
        if (data) setForm({
          job_id: data.job_id || '',
          billing_number: data.billing_number || '',
          description: data.description || '',
          amount: data.amount ?? '',
          date_submitted: data.date_submitted || '',
          date_approved: data.date_approved || '',
          status: data.status || 'Submitted',
          notes: data.notes || '',
        })
        setLoading(false)
      })
  }, [editId])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }
    if (!form.amount) { setError('Amount is required.'); setSaving(false); return }

    const payload = {
      billing_number: form.billing_number,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      date_submitted: form.date_submitted || null,
      date_approved: form.date_approved || null,
      status: form.status,
      notes: form.notes,
    }

    let err
    if (editId) {
      ;({ error: err } = await supabase.from('billings').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('billings').insert({ ...payload, job_id: form.job_id }))
    }
    if (err) { setError(err.message); setSaving(false); return }
    navigate(`/jobs/${form.job_id}`)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">{editId ? 'Edit Billing' : 'Enter Billing'}</span>
      </div>
      <div className="page" style={{ maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom:16 }}>{error}</div>}

          <div className="form-section">
            <div className="form-section-title">Job Assignment</div>
            <div className="form-group">
              <label>Job *</label>
              <select value={form.job_id} onChange={e => set('job_id', e.target.value)} required disabled={!!editId}>
                <option value="">— Select Job —</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
              </select>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Billing Details</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Billing / Pay App #</label>
                <input type="text" placeholder="e.g. Pay App #3" value={form.billing_number} onChange={e => set('billing_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Amount ($) *</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Date Submitted</label>
                <input type="date" value={form.date_submitted} onChange={e => set('date_submitted', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Date Approved / Paid</label>
                <input type="date" value={form.date_approved} onChange={e => set('date_approved', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>Description</label>
                <input type="text" placeholder="What does this billing cover?" value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <textarea placeholder="Any notes..." value={form.notes} onChange={e => set('notes', e.target.value)} style={{ minHeight:60 }} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : editId ? 'Save Changes' : 'Save Billing'}
            </button>
            <button type="button" className="btn" onClick={() => form.job_id ? navigate(`/jobs/${form.job_id}`) : navigate('/jobs')}>
              Cancel
            </button>
          </div>
        </form>

        {editId && <RecordNotes entityType="billing" entityId={editId} />}
      </div>
    </>
  )
}
