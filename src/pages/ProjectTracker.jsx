import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

const STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Waiting on Customer', 'Done', 'Passed']
const PRIORITIES = ['High', 'Medium', 'Low']
const PHASES = ['Precon', 'Engineering', 'Procurement', 'Field', 'Closeout', 'Warranty']
const BUCKET_ORDER = ['Overdue', 'Due This Week', 'Due Next 2 Weeks', 'Future', 'Complete']

function agingBucket(task) {
  if (['Done', 'Passed'].includes(task.status)) return 'Complete'
  if (!task.completion_date) return 'Future'
  const daysUntil = Math.ceil((new Date(task.completion_date) - new Date()) / 86400000)
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil <= 7) return 'Due This Week'
  if (daysUntil <= 14) return 'Due Next 2 Weeks'
  return 'Future'
}

function daysRemaining(completionDate, status) {
  if (['Done', 'Passed'].includes(status) || !completionDate) return null
  return Math.ceil((new Date(completionDate) - new Date()) / 86400000)
}

function bucketBadge(bucket) {
  const map = {
    'Overdue':          { bg: 'var(--color-danger)',  color: '#fff' },
    'Due This Week':    { bg: 'var(--color-warning)', color: '#fff' },
    'Due Next 2 Weeks': { bg: '#3b82f6',              color: '#fff' },
    'Future':           { bg: 'var(--color-sidebar)', color: 'var(--color-text-2)' },
    'Complete':         { bg: 'var(--color-success)', color: '#fff' },
  }
  const style = map[bucket] || map['Future']
  return <span className="badge" style={{ ...style, fontSize: 10 }}>{bucket}</span>
}

function priorityBadge(p) {
  if (p === 'High')   return <span className="badge badge-red"    style={{ fontSize: 10 }}>High</span>
  if (p === 'Medium') return <span className="badge badge-amber"  style={{ fontSize: 10 }}>Med</span>
  return                     <span className="badge badge-gray"   style={{ fontSize: 10 }}>Low</span>
}

function statusColor(status) {
  if (status === 'Blocked') return 'var(--color-danger)'
  if (status === 'Waiting on Customer') return 'var(--color-warning)'
  if (status === 'In Progress') return 'var(--color-primary)'
  if (['Done', 'Passed'].includes(status)) return 'var(--color-success)'
  return 'var(--color-text-2)'
}

const emptyForm = {
  job_id: '', phase: '', sub_job: '', scope_system: '', lead: '', contractor: '',
  status: 'Not Started', priority: 'Medium', pct_complete: '',
  start_date: '', completion_date: '', next_action: '', blocker_notes: ''
}

export default function ProjectTracker() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [filterLead, setFilterLead] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPhase, setFilterPhase] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterBucket, setFilterBucket] = useState('')
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: t }, { data: j }] = await Promise.all([
        supabase.from('job_tasks').select('*').order('created_at'),
        supabase.from('jobs').select('id, job_number, job_description, status').order('job_number'),
      ])
      setTasks(t || [])
      setJobs(j || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const jobMap = {}
  jobs.forEach(j => { jobMap[j.id] = j })

  const enriched = tasks.map(t => ({
    ...t,
    job: jobMap[t.job_id],
    bucket: agingBucket(t),
    days: daysRemaining(t.completion_date, t.status),
  }))

  const isOpen = t => !['Done', 'Passed'].includes(t.status)
  const openTasks = enriched.filter(isOpen)
  const totalOpen = openTasks.length
  const overdue = openTasks.filter(t => t.bucket === 'Overdue').length
  const dueThisWeek = openTasks.filter(t => t.bucket === 'Due This Week').length
  const blocked = openTasks.filter(t => t.status === 'Blocked').length
  const waitingOnCustomer = openTasks.filter(t => t.status === 'Waiting on Customer').length
  const highPriorityOpen = openTasks.filter(t => t.priority === 'High').length

  const leads = [...new Set(tasks.map(t => t.lead).filter(Boolean))].sort()

  const filtered = enriched.filter(t => {
    if (!showCompleted && ['Done', 'Passed'].includes(t.status)) return false
    if (filterLead && t.lead !== filterLead) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPhase && t.phase !== filterPhase) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterBucket && t.bucket !== filterBucket) return false
    if (search) {
      const q = search.toLowerCase()
      if (!t.job?.job_number?.toLowerCase().includes(q) &&
          !t.job?.job_description?.toLowerCase().includes(q) &&
          !t.sub_job?.toLowerCase().includes(q) &&
          !t.lead?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const bi = BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
    if (bi !== 0) return bi
    return (a.job?.job_number || '').localeCompare(b.job?.job_number || '')
  })

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function startEdit(task) {
    setEditId(task.id)
    setShowAdd(false)
    setForm({
      job_id: task.job_id || '',
      phase: task.phase || '',
      sub_job: task.sub_job || '',
      scope_system: task.scope_system || '',
      lead: task.lead || '',
      contractor: task.contractor || '',
      status: task.status || 'Not Started',
      priority: task.priority || 'Medium',
      pct_complete: task.pct_complete != null ? (task.pct_complete * 100).toFixed(0) : '',
      start_date: task.start_date || '',
      completion_date: task.completion_date || '',
      next_action: task.next_action || '',
      blocker_notes: task.blocker_notes || '',
    })
  }

  function startAdd() {
    setShowAdd(true)
    setEditId(null)
    setForm(emptyForm)
  }

  function cancelForm() {
    setEditId(null)
    setShowAdd(false)
    setForm(emptyForm)
  }

  async function saveForm(e) {
    e.preventDefault()
    if (!form.job_id) return
    setSaving(true)
    const payload = {
      job_id: form.job_id,
      phase: form.phase || null,
      sub_job: form.sub_job || null,
      scope_system: form.scope_system || null,
      lead: form.lead || null,
      contractor: form.contractor || null,
      status: form.status,
      priority: form.priority,
      pct_complete: form.pct_complete ? parseFloat(form.pct_complete) / 100 : 0,
      start_date: form.start_date || null,
      completion_date: form.completion_date || null,
      next_action: form.next_action || null,
      blocker_notes: form.blocker_notes || null,
    }
    if (editId) {
      const { data } = await supabase.from('job_tasks').update(payload).eq('id', editId).select().single()
      if (data) setTasks(prev => prev.map(t => t.id === editId ? data : t))
    } else {
      const { data } = await supabase.from('job_tasks').insert(payload).select().single()
      if (data) setTasks(prev => [...prev, data])
    }
    setSaving(false)
    cancelForm()
  }

  async function updateStatus(taskId, status) {
    await supabase.from('job_tasks').update({ status }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Delete this task?')) return
    await supabase.from('job_tasks').delete().eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const activeJobs = jobs.filter(j => j.status !== 'Complete')

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Project Tracker</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => setShowCompleted(v => !v)}>
            {showCompleted ? 'Hide Completed' : 'Show Completed'}
          </button>
          <button className="btn btn-primary" onClick={startAdd}>
            <Plus size={14} /> Add Task
          </button>
        </div>
      </div>

      <div className="page">
        {/* Summary cards */}
        <div className="cards-row" style={{ marginBottom: 20 }}>
          <div className="metric-card">
            <div className="metric-value">{totalOpen}</div>
            <div className="metric-label">Open Tasks</div>
          </div>
          <div className="metric-card" style={{ borderTop: overdue > 0 ? '3px solid var(--color-danger)' : undefined }}>
            <div className="metric-value" style={{ color: overdue > 0 ? 'var(--color-danger)' : undefined }}>{overdue}</div>
            <div className="metric-label">Overdue</div>
          </div>
          <div className="metric-card" style={{ borderTop: dueThisWeek > 0 ? '3px solid var(--color-warning)' : undefined }}>
            <div className="metric-value" style={{ color: dueThisWeek > 0 ? 'var(--color-warning)' : undefined }}>{dueThisWeek}</div>
            <div className="metric-label">Due This Week</div>
          </div>
          <div className="metric-card" style={{ borderTop: blocked > 0 ? '3px solid var(--color-danger)' : undefined }}>
            <div className="metric-value" style={{ color: blocked > 0 ? 'var(--color-danger)' : undefined }}>{blocked}</div>
            <div className="metric-label">Blocked</div>
          </div>
          <div className="metric-card" style={{ borderTop: waitingOnCustomer > 0 ? '3px solid var(--color-warning)' : undefined }}>
            <div className="metric-value" style={{ color: waitingOnCustomer > 0 ? 'var(--color-warning)' : undefined }}>{waitingOnCustomer}</div>
            <div className="metric-label">Waiting on Customer</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: highPriorityOpen > 0 ? 'var(--color-danger)' : undefined }}>{highPriorityOpen}</div>
            <div className="metric-label">High Priority Open</div>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Add Task</div>
            <TaskForm
              form={form} set={set} jobs={activeJobs}
              onSave={saveForm} onCancel={cancelForm} saving={saving}
            />
          </div>
        )}

        {/* Filters */}
        <div className="filter-row">
          <input type="text" placeholder="Search job # / description / sub-job / lead…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 260 }} />
          <select value={filterLead} onChange={e => setFilterLead(e.target.value)}>
            <option value="">All Leads</option>
            {leads.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)}>
            <option value="">All Phases</option>
            {PHASES.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filterBucket} onChange={e => setFilterBucket(e.target.value)}>
            <option value="">All Buckets</option>
            {BUCKET_ORDER.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th>
                <th>Description</th>
                <th>Phase</th>
                <th>Sub-Job</th>
                <th>Scope / System</th>
                <th>Lead</th>
                <th>Contractor</th>
                <th>Status</th>
                <th>Pri</th>
                <th>% Done</th>
                <th>Due Date</th>
                <th>Days</th>
                <th>Bucket</th>
                <th>Next Action</th>
                <th>Blocker / Notes</th>
                <th></th>
              </tr></thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={16} style={{ textAlign:'center', color:'var(--color-text-3)', padding:32 }}>No tasks found.</td></tr>
                  : filtered.map(t => (
                    <>
                      <tr key={t.id} className={editId === t.id ? '' : 'clickable'}
                        onClick={editId === t.id ? undefined : () => startEdit(t)}>
                        <td className="fw-500" style={{ whiteSpace:'nowrap' }}>
                          <span style={{ cursor:'pointer', color:'var(--color-primary)' }}
                            onClick={e => { e.stopPropagation(); navigate(`/jobs/${t.job_id}`) }}>
                            {t.job?.job_number || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={t.job?.job_description}>
                          {t.job?.job_description || '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>{t.phase || '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace:'nowrap' }}>{t.sub_job || '—'}</td>
                        <td style={{ fontSize: 12 }}>{t.scope_system || '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace:'nowrap' }}>{t.lead || '—'}</td>
                        <td style={{ fontSize: 12 }}>{t.contractor || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <select value={t.status}
                            onChange={e => updateStatus(t.id, e.target.value)}
                            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4,
                              border: '1px solid var(--color-border)',
                              color: statusColor(t.status),
                              background: 'var(--color-card)',
                              minWidth: 120 }}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>{priorityBadge(t.priority)}</td>
                        <td>
                          <div className="progress-wrap" style={{ minWidth: 70 }}>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${Math.min(100, (t.pct_complete || 0) * 100)}%` }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{fmt.pct(t.pct_complete)}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, whiteSpace:'nowrap' }}>{t.completion_date ? fmt.date(t.completion_date) : '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace:'nowrap', color: t.days < 0 ? 'var(--color-danger)' : t.days <= 7 ? 'var(--color-warning)' : 'var(--color-text-2)' }}>
                          {t.days != null ? (t.days < 0 ? `${Math.abs(t.days)}d over` : `${t.days}d`) : '—'}
                        </td>
                        <td>{bucketBadge(t.bucket)}</td>
                        <td style={{ fontSize: 12, maxWidth: 200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={t.next_action}>
                          {t.next_action || <span style={{ color:'var(--color-text-3)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          background: t.blocker_notes ? 'rgba(245,158,11,0.08)' : undefined }}
                          title={t.blocker_notes}>
                          {t.blocker_notes || <span style={{ color:'var(--color-text-3)' }}>—</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:'flex', gap: 4 }}>
                            <button className="btn btn-sm" title="Edit"
                              onClick={() => startEdit(t)}><Pencil size={11} /></button>
                            <button className="btn btn-sm" style={{ color:'var(--color-danger)' }} title="Delete"
                              onClick={() => deleteTask(t.id)}><Trash2 size={11} /></button>
                          </div>
                        </td>
                      </tr>
                      {editId === t.id && (
                        <tr key={`edit-${t.id}`}>
                          <td colSpan={16} style={{ padding: '12px 16px', background:'var(--color-sidebar)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Edit Task</div>
                            <TaskForm
                              form={form} set={set} jobs={jobs}
                              onSave={saveForm} onCancel={cancelForm} saving={saving}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function TaskForm({ form, set, jobs, onSave, onCancel, saving }) {
  return (
    <form onSubmit={onSave}>
      <div className="form-grid">
        <div className="form-group">
          <label>Job *</label>
          <select value={form.job_id} onChange={e => set('job_id', e.target.value)} required>
            <option value="">— Select Job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Phase</label>
          <select value={form.phase} onChange={e => set('phase', e.target.value)}>
            <option value="">— None —</option>
            {PHASES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Sub-Job</label>
          <input type="text" placeholder="e.g. Fire Alarm, Low Voltage" value={form.sub_job} onChange={e => set('sub_job', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Scope / System</label>
          <input type="text" placeholder="e.g. Gamewell E3, Avigilon" value={form.scope_system} onChange={e => set('scope_system', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Lead</label>
          <input type="text" placeholder="Field tech name" value={form.lead} onChange={e => set('lead', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Contractor</label>
          <input type="text" placeholder="Electrical contractor" value={form.contractor} onChange={e => set('contractor', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>% Complete (0–100)</label>
          <input type="number" min="0" max="100" step="1" value={form.pct_complete} onChange={e => set('pct_complete', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Start Date</label>
          <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Due Date</label>
          <input type="date" value={form.completion_date} onChange={e => set('completion_date', e.target.value)} />
        </div>
        <div className="form-group full">
          <label>Next Action</label>
          <input type="text" placeholder="What's the next step?" value={form.next_action} onChange={e => set('next_action', e.target.value)} />
        </div>
        <div className="form-group full">
          <label>Blocker / Notes</label>
          <input type="text" placeholder="What's blocking progress?" value={form.blocker_notes} onChange={e => set('blocker_notes', e.target.value)} />
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : <><Check size={13} /> Save</>}
        </button>
        <button type="button" className="btn" onClick={onCancel}><X size={13} /> Cancel</button>
      </div>
    </form>
  )
}
