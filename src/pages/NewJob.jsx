import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TYPES = ['ES', 'Gate', 'Cabling', 'AV', 'Other']

export default function NewJob() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    job_number: '', job_type: 'ES', project_manager: '',
    job_description: '', estimated_revenue: '', estimated_cost: '',
    pct_complete: '', estimated_completion_date: '', notes: '',
    jtd_billing: '', jtd_cost: '', source: 'manual'
  })

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    if (!form.job_number.trim()) { setError('Job number is required.'); setSaving(false); return }

    // Check for duplicate
    const { data: existing } = await supabase.from('jobs').select('id').eq('job_number', form.job_number.trim()).single()
    if (existing) { setError(`Job number ${form.job_number} already exists.`); setSaving(false); return }

    const pct = form.pct_complete ? parseFloat(form.pct_complete) / 100 : 0
    const estRev = parseFloat(form.estimated_revenue) || 0
    const estCost = parseFloat(form.estimated_cost) || 0

    const payload = {
      ...form,
      job_number: form.job_number.trim(),
      estimated_revenue: estRev,
      estimated_cost: estCost,
      estimated_margin: estRev - estCost,
      estimated_margin_pct: estRev > 0 ? (estRev - estCost) / estRev : 0,
      pct_complete: pct,
      jtd_billing: parseFloat(form.jtd_billing) || 0,
      jtd_cost: parseFloat(form.jtd_cost) || 0,
      estimated_completion_date: form.estimated_completion_date || null,
    }

    const { data, error: err } = await supabase.from('jobs').insert(payload).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    navigate(`/jobs/${data.id}`)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">New Job</span>
      </div>
      <div className="page" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="form-section">
            <div className="form-section-title">Job Identity</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Job Number *</label>
                <input type="text" placeholder="e.g. 263033" value={form.job_number} onChange={e => set('job_number', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Job Type</label>
                <select value={form.job_type} onChange={e => set('job_type', e.target.value)}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Project Manager</label>
                <input type="text" placeholder="e.g. JR, MW, RB" value={form.project_manager} onChange={e => set('project_manager', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>Job Description *</label>
                <input type="text" placeholder="Brief description of the job" value={form.job_description} onChange={e => set('job_description', e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Financial Estimates</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Estimated Revenue ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.estimated_revenue} onChange={e => set('estimated_revenue', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Estimated Cost ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} />
              </div>
              <div className="form-group">
                <label>JTD Billing ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.jtd_billing} onChange={e => set('jtd_billing', e.target.value)} />
              </div>
              <div className="form-group">
                <label>JTD Cost ($)</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.jtd_cost} onChange={e => set('jtd_cost', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Progress & Timeline</div>
            <div className="form-grid">
              <div className="form-group">
                <label>% Complete (0–100)</label>
                <input type="number" min="0" max="100" step="0.1" placeholder="0" value={form.pct_complete} onChange={e => set('pct_complete', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Estimated Completion Date</label>
                <input type="date" value={form.estimated_completion_date} onChange={e => set('estimated_completion_date', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <textarea placeholder="Any notes about this job..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Save Job'}
            </button>
            <button type="button" className="btn" onClick={() => navigate('/jobs')}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}
