import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function FieldReport() {
  const [jobs, setJobs] = useState([])
  const [form, setForm] = useState({
    job_id: '',
    report_date: new Date().toISOString().slice(0, 10),
    employee: '',
    start_time: '',
    end_time: '',
    crew_size: '',
    work_summary: '',
  })
  const [submitted, setSubmitted] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description')
      .in('status', ['Active', 'Pipeline'])
      .order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.job_id || !form.report_date || !form.employee.trim() || !form.work_summary.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    setError('')

    const { data, error: err } = await supabase.from('daily_reports').insert({
      job_id: form.job_id,
      report_date: form.report_date,
      employee: form.employee.trim(),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      crew_size: form.crew_size ? parseInt(form.crew_size) : null,
      work_summary: form.work_summary.trim(),
    }).select().single()

    setSubmitting(false)

    if (err) {
      setError('Failed to submit: ' + err.message)
      return
    }

    const job = jobs.find(j => j.id === form.job_id)
    setSubmitted({ ...data, job_name: job ? `${job.job_number} — ${job.job_description}` : '' })
  }

  function submitAnother() {
    const emp = form.employee
    setForm({
      job_id: '',
      report_date: new Date().toISOString().slice(0, 10),
      employee: emp,
      start_time: '',
      end_time: '',
      crew_size: '',
      work_summary: '',
    })
    setSubmitted(null)
  }

  const inp = {
    width: '100%', minHeight: 44, fontSize: 16, padding: '10px 12px',
    borderRadius: 6, border: '1px solid var(--color-border-strong)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const topbar = (
    <div style={{
      background: 'var(--color-sidebar)', borderBottom: '0.5px solid var(--color-border)',
      padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Tusco ES</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Daily Field Report</div>
      </div>
      <button className="btn btn-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )

  if (submitted) {
    return (
      <div>
        {topbar}
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>
          <div style={{ background: '#EAF3DE', border: '0.5px solid #C0DD97', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, color: '#3B6D11', fontSize: 16, marginBottom: 10 }}>Report Submitted!</div>
            <div style={{ fontSize: 14, color: '#3B6D11', lineHeight: 1.6 }}>
              <div><strong>Job:</strong> {submitted.job_name}</div>
              <div><strong>Date:</strong> {submitted.report_date}</div>
              <div><strong>Employee:</strong> {submitted.employee}</div>
              {submitted.start_time && <div><strong>Start:</strong> {submitted.start_time}</div>}
              {submitted.end_time && <div><strong>End:</strong> {submitted.end_time}</div>}
              {submitted.crew_size && <div><strong>Crew:</strong> {submitted.crew_size}</div>}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #C0DD97' }}>{submitted.work_summary}</div>
            </div>
          </div>
          <button
            onClick={submitAnother}
            style={{ display: 'block', width: '100%', minHeight: 48, fontSize: 16, fontWeight: 600, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Submit Another Report
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {topbar}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 40px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Daily Field Report</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Job *</label>
            <select style={inp} value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} required>
              <option value="">— Select Job —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Date *</label>
            <input type="date" style={inp} value={form.report_date}
              onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))} required />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Your Name *</label>
            <input type="text" style={inp} placeholder="First and last name"
              value={form.employee} onChange={e => setForm(f => ({ ...f, employee: e.target.value }))} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Start Time</label>
              <input type="time" style={inp} value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>End Time</label>
              <input type="time" style={inp} value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Crew Size</label>
            <input type="number" style={inp} min="1" placeholder="e.g. 3"
              value={form.crew_size} onChange={e => setForm(f => ({ ...f, crew_size: e.target.value }))} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Work Summary *</label>
            <textarea
              style={{ ...inp, minHeight: 110, resize: 'vertical' }}
              placeholder="Describe the work performed today..."
              value={form.work_summary}
              onChange={e => setForm(f => ({ ...f, work_summary: e.target.value }))}
              required
              rows={4}
            />
          </div>

          {error && <div style={{ color: 'var(--color-danger)', marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{ display: 'block', width: '100%', minHeight: 48, fontSize: 16, fontWeight: 600, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  )
}
