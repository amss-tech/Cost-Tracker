import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'

const CATEGORIES = ['Labor — Hours × Rate', 'Material Received (Not Invoiced)', 'Subcontractor Draw']

export default function UncommittedCosts() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [recent, setRecent] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    job_id: params.get('job') || '',
    category: 'Labor — Hours × Rate',
    description: '', cost_date: new Date().toISOString().split('T')[0],
    hours: '', rate: '', amount: ''
  })

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
    loadRecent()
  }, [])

  async function loadRecent() {
    const { data } = await supabase.from('uncommitted_costs')
      .select('*, jobs(job_number, job_description)')
      .order('created_at', { ascending: false }).limit(15)
    setRecent(data || [])
  }

  function set(field, val) {
    setForm(f => {
      const next = { ...f, [field]: val }
      // Auto-calc amount from hours × rate
      if (field === 'hours' || field === 'rate') {
        const h = parseFloat(field === 'hours' ? val : next.hours) || 0
        const r = parseFloat(field === 'rate' ? val : next.rate) || 0
        if (h > 0 && r > 0) next.amount = (h * r).toFixed(2)
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    if (!form.job_id) { setError('Please select a job.'); setSaving(false); return }
    if (!form.amount) { setError('Amount is required.'); setSaving(false); return }

    const { error: err } = await supabase.from('uncommitted_costs').insert({
      job_id: form.job_id,
      category: form.category,
      description: form.description,
      cost_date: form.cost_date || null,
      hours: parseFloat(form.hours) || null,
      rate: parseFloat(form.rate) || null,
      amount: parseFloat(form.amount) || 0,
    })
    if (err) { setError(err.message); setSaving(false); return }

    setSuccess('Cost entry saved!')
    setForm(f => ({ ...f, description:'', hours:'', rate:'', amount:'' }))
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
    loadRecent()
  }

  const isLabor = form.category === 'Labor — Hours × Rate'

  return (
    <>
      <div className="topbar"><span className="topbar-title">Uncommitted Costs</span></div>
      <div className="page">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
          <div>
            <form onSubmit={handleSubmit}>
              {error && <div className="auth-error" style={{ marginBottom:12 }}>{error}</div>}
              {success && <div style={{ background:'#EAF3DE', color:'#3B6D11', padding:'10px 14px', borderRadius:8, marginBottom:12, fontSize:13 }}>{success}</div>}

              <div className="form-section">
                <div className="form-section-title">Cost Entry</div>
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Job *</label>
                  <select value={form.job_id} onChange={e => set('job_id', e.target.value)} required>
                    <option value="">— Select Job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Category</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Date</label>
                  <input type="date" value={form.cost_date} onChange={e => set('cost_date', e.target.value)} />
                </div>

                {isLabor && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                    <div className="form-group">
                      <label>Hours</label>
                      <input type="number" step="0.25" placeholder="0" value={form.hours} onChange={e => set('hours', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Rate ($/hr)</label>
                      <input type="number" step="0.01" placeholder="0.00" value={form.rate} onChange={e => set('rate', e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Amount ($) {isLabor && '— auto-calculated from hrs × rate'}</label>
                  <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom:16 }}>
                  <label>Description</label>
                  <textarea placeholder="What is this cost for?" value={form.description} onChange={e => set('description', e.target.value)} style={{ minHeight:60 }} />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Add Cost'}
                </button>
                <button type="button" className="btn" onClick={() => setForm(f => ({ ...f, description:'', hours:'', rate:'', amount:'' }))}>
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div>
            <div className="section-header"><span className="section-title">Recent entries</span></div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Job</th><th>Category</th><th>Description</th><th>Date</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {recent.length === 0
                      ? <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--color-text-3)', padding:24 }}>No entries yet.</td></tr>
                      : recent.map(r => (
                        <tr key={r.id} className="clickable" onClick={() => navigate(`/jobs/${r.job_id}`)}>
                          <td className="fw-500">{r.jobs?.job_number}</td>
                          <td><span className="badge badge-blue" style={{ fontSize:10 }}>{r.category?.split(' ')[0]}</span></td>
                          <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description}</td>
                          <td>{fmt.date(r.cost_date)}</td>
                          <td className="text-right fw-500">{fmt.currency(r.amount)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
