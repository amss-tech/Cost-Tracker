import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { supabaseEsticomms } from '../lib/supabaseEsticomms'
import { fmt } from '../lib/utils'
import { Plus, X } from 'lucide-react'

const TYPES = ['ES', 'Gate', 'Cabling', 'AV', 'Other']
const CO_STATUSES = ['Pending', 'Approved', 'Rejected']

const emptyCOForm = {
  co_number: '', description: '', status: 'Pending',
  revenue_amount: '', cost_amount: '',
  date_submitted: '', date_approved: '', notes: ''
}

export default function EditJob() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    job_number: '', job_type: 'ES', project_manager: '',
    job_description: '', estimated_revenue: '', estimated_cost: '',
    pct_complete: '', estimated_completion_date: '', notes: '',
    jtd_billing: '', jtd_cost: '',
    customer_id: '', site_id: '', contact_id: ''
  })
  const [customers, setCustomers] = useState([])
  const [sites, setSites] = useState([])
  const [contacts, setContacts] = useState([])

  // Change orders
  const [cos, setCOs] = useState([])
  const [showCOForm, setShowCOForm] = useState(false)
  const [coForm, setCoForm] = useState(emptyCOForm)
  const [savingCO, setSavingCO] = useState(false)
  const [coError, setCOError] = useState('')

  useEffect(() => {
    supabaseEsticomms.from('customers').select('id, name').order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  useEffect(() => {
    async function load() {
      const [{ data: job }, { data: coData }] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('change_orders').select('*').eq('job_id', id).order('created_at'),
      ])
      if (job) {
        setForm({
          job_number: job.job_number || '',
          job_type: job.job_type || 'ES',
          project_manager: job.project_manager || '',
          job_description: job.job_description || '',
          estimated_revenue: job.estimated_revenue ?? '',
          estimated_cost: job.estimated_cost ?? '',
          pct_complete: job.pct_complete != null ? (job.pct_complete * 100).toFixed(1) : '',
          estimated_completion_date: job.estimated_completion_date || '',
          notes: job.notes || '',
          jtd_billing: job.jtd_billing ?? '',
          jtd_cost: job.jtd_cost ?? '',
          customer_id: job.customer_id || '',
          site_id: job.site_id || '',
          contact_id: job.contact_id || '',
        })
        if (job.customer_id) {
          const [{ data: siteData }, { data: contactData }] = await Promise.all([
            supabaseEsticomms.from('customer_locations').select('id, label, address, city').eq('customer_id', job.customer_id).order('sort_order'),
            supabaseEsticomms.from('contacts').select('id, name, title').eq('customer_id', job.customer_id).order('name'),
          ])
          setSites(siteData || [])
          setContacts(contactData || [])
        }
      }
      setCOs(coData || [])
      setLoading(false)
    }
    load()
  }, [id])

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }
  function setCO(field, val) { setCoForm(f => ({ ...f, [field]: val })) }

  async function handleCustomerChange(customerId) {
    set('customer_id', customerId)
    set('site_id', '')
    set('contact_id', '')
    setSites([])
    setContacts([])
    if (!customerId) return
    const { data } = await supabaseEsticomms.from('customer_locations')
      .select('id, label, address, city').eq('customer_id', customerId).order('sort_order')
    setSites(data || [])
  }

  async function handleSiteChange(siteId) {
    set('site_id', siteId)
    set('contact_id', '')
    setContacts([])
    if (!siteId) return
    const { data } = await supabaseEsticomms.from('contacts')
      .select('id, name, title').eq('customer_id', form.customer_id).order('name')
    setContacts(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const pct = form.pct_complete ? parseFloat(form.pct_complete) / 100 : 0
    const estRev = parseFloat(form.estimated_revenue) || 0
    const estCost = parseFloat(form.estimated_cost) || 0

    const { error: err } = await supabase.from('jobs').update({
      job_type: form.job_type,
      project_manager: form.project_manager,
      job_description: form.job_description,
      estimated_revenue: estRev,
      estimated_cost: estCost,
      estimated_margin: estRev - estCost,
      estimated_margin_pct: estRev > 0 ? (estRev - estCost) / estRev : 0,
      pct_complete: pct,
      jtd_billing: parseFloat(form.jtd_billing) || 0,
      jtd_cost: parseFloat(form.jtd_cost) || 0,
      estimated_completion_date: form.estimated_completion_date || null,
      notes: form.notes,
      customer_id: form.customer_id || null,
      site_id: form.site_id || null,
      contact_id: form.contact_id || null,
    }).eq('id', id)

    if (err) { setError(err.message); setSaving(false); return }
    navigate(`/jobs/${id}`)
  }

  async function handleAddCO(e) {
    e.preventDefault()
    if (!coForm.description.trim()) { setCOError('Description is required.'); return }
    setSavingCO(true); setCOError('')

    const { data, error: err } = await supabase.from('change_orders').insert({
      job_id: id,
      co_number: coForm.co_number || null,
      description: coForm.description,
      status: coForm.status,
      revenue_amount: parseFloat(coForm.revenue_amount) || 0,
      cost_amount: parseFloat(coForm.cost_amount) || 0,
      date_submitted: coForm.date_submitted || null,
      date_approved: coForm.date_approved || null,
      notes: coForm.notes || null,
    }).select().single()

    if (err) { setCOError(err.message); setSavingCO(false); return }
    setCOs(prev => [...prev, data])
    setCoForm(emptyCOForm)
    setShowCOForm(false)
    setSavingCO(false)
  }

  async function updateCOStatus(coId, status) {
    const patch = { status }
    if (status === 'Approved') patch.date_approved = new Date().toISOString().split('T')[0]
    await supabase.from('change_orders').update(patch).eq('id', coId)
    setCOs(prev => prev.map(c => c.id === coId ? { ...c, ...patch } : c))
  }

  async function deleteCO(coId) {
    await supabase.from('change_orders').delete().eq('id', coId)
    setCOs(prev => prev.filter(c => c.id !== coId))
  }

  const approvedCOs = cos.filter(c => c.status === 'Approved')
  const approvedRevenue = approvedCOs.reduce((s, c) => s + (c.revenue_amount || 0), 0)
  const approvedCost = approvedCOs.reduce((s, c) => s + (c.cost_amount || 0), 0)
  const baseRevenue = parseFloat(form.estimated_revenue) || 0
  const baseCost = parseFloat(form.estimated_cost) || 0

  function statusBadge(s) {
    if (s === 'Approved') return <span className="badge badge-green">Approved</span>
    if (s === 'Rejected') return <span className="badge badge-gray">Rejected</span>
    return <span className="badge badge-amber">Pending</span>
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Edit Job — {form.job_number}</span>
      </div>
      <div className="page" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="form-section">
            <div className="form-section-title">Job Identity</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Job Number</label>
                <input type="text" value={form.job_number} disabled style={{ opacity: 0.6 }} />
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
                <label>Job Description</label>
                <input type="text" value={form.job_description} onChange={e => set('job_description', e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Customer</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Customer</label>
                <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)}>
                  <option value="">— None —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {sites.length > 0 && (
                <div className="form-group">
                  <label>Site</label>
                  <select value={form.site_id} onChange={e => handleSiteChange(e.target.value)}>
                    <option value="">— None —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.label}{s.city ? ` — ${s.city}` : ''}</option>)}
                  </select>
                </div>
              )}
              {contacts.length > 0 && (
                <div className="form-group">
                  <label>Contact</label>
                  <select value={form.contact_id} onChange={e => set('contact_id', e.target.value)}>
                    <option value="">— None —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.title ? ` (${c.title})` : ''}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Base Financial Estimates</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Estimated Revenue ($)</label>
                <input type="number" step="0.01" value={form.estimated_revenue} onChange={e => set('estimated_revenue', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Estimated Cost ($)</label>
                <input type="number" step="0.01" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} />
              </div>
              <div className="form-group">
                <label>JTD Billing ($)</label>
                <input type="number" step="0.01" value={form.jtd_billing} onChange={e => set('jtd_billing', e.target.value)} />
              </div>
              <div className="form-group">
                <label>JTD Cost ($)</label>
                <input type="number" step="0.01" value={form.jtd_cost} onChange={e => set('jtd_cost', e.target.value)} />
              </div>
            </div>
            {cos.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-sidebar)', borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span>Base Revenue: <strong>{fmt.currency(baseRevenue)}</strong></span>
                  <span style={{ color: 'var(--color-text-3)' }}>+</span>
                  <span>Approved CO Revenue: <strong>{fmt.currency(approvedRevenue)}</strong></span>
                  <span style={{ color: 'var(--color-text-3)' }}>=</span>
                  <span>Revised: <strong>{fmt.currency(baseRevenue + approvedRevenue)}</strong></span>
                </div>
                <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
                  <span>Base Cost: <strong>{fmt.currency(baseCost)}</strong></span>
                  <span style={{ color: 'var(--color-text-3)' }}>+</span>
                  <span>Approved CO Cost: <strong>{fmt.currency(approvedCost)}</strong></span>
                  <span style={{ color: 'var(--color-text-3)' }}>=</span>
                  <span>Revised: <strong>{fmt.currency(baseCost + approvedCost)}</strong></span>
                </div>
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">Progress & Timeline</div>
            <div className="form-grid">
              <div className="form-group">
                <label>% Complete (0–100)</label>
                <input type="number" min="0" max="100" step="0.1" value={form.pct_complete} onChange={e => set('pct_complete', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Estimated Completion Date</label>
                <input type="date" value={form.estimated_completion_date} onChange={e => set('estimated_completion_date', e.target.value)} />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Save Changes'}
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/jobs/${id}`)}>Cancel</button>
          </div>
        </form>

        {/* ── Change Orders ─────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 32, paddingTop: 24 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <span className="section-title">Change Orders ({cos.length})</span>
            {!showCOForm && (
              <button className="btn btn-primary" onClick={() => setShowCOForm(true)}>
                <Plus size={14} /> Add Change Order
              </button>
            )}
          </div>

          {/* Existing COs */}
          {cos.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>CO #</th>
                    <th>Description</th>
                    <th className="text-right">Revenue +</th>
                    <th className="text-right">Cost +</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {cos.map(c => (
                      <tr key={c.id}>
                        <td className="fw-500">{c.co_number || '—'}</td>
                        <td>{c.description}</td>
                        <td className="text-right">{fmt.currency(c.revenue_amount)}</td>
                        <td className="text-right">{fmt.currency(c.cost_amount)}</td>
                        <td>
                          <select
                            value={c.status}
                            onChange={e => updateCOStatus(c.id, e.target.value)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)' }}
                          >
                            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{fmt.date(c.date_submitted)}</td>
                        <td>
                          <button className="btn btn-sm" style={{ color: 'var(--color-danger)' }}
                            onClick={() => deleteCO(c.id)} title="Remove">
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {approvedCOs.length > 0 && (
                      <tr style={{ background: 'var(--color-sidebar)', fontWeight: 500 }}>
                        <td colSpan={2} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)' }}>Approved CO Totals</td>
                        <td className="text-right text-success">{fmt.currency(approvedRevenue)}</td>
                        <td className="text-right text-success">{fmt.currency(approvedCost)}</td>
                        <td colSpan={3} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {cos.length === 0 && !showCOForm && (
            <div className="empty-state" style={{ marginBottom: 20 }}>
              <p>No change orders yet.</p>
            </div>
          )}

          {/* Add CO form */}
          {showCOForm && (
            <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 14, fontSize: 14 }}>New Change Order</div>
              {coError && <div className="auth-error" style={{ marginBottom: 12 }}>{coError}</div>}
              <form onSubmit={handleAddCO}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>CO Number</label>
                    <input type="text" placeholder="CO-001" value={coForm.co_number} onChange={e => setCO('co_number', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={coForm.status} onChange={e => setCO('status', e.target.value)}>
                      {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group full">
                    <label>Description *</label>
                    <input type="text" placeholder="What does this change order cover?" value={coForm.description} onChange={e => setCO('description', e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Additional Revenue ($)</label>
                    <input type="number" step="0.01" placeholder="0.00" value={coForm.revenue_amount} onChange={e => setCO('revenue_amount', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Additional Cost ($)</label>
                    <input type="number" step="0.01" placeholder="0.00" value={coForm.cost_amount} onChange={e => setCO('cost_amount', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Date Submitted</label>
                    <input type="date" value={coForm.date_submitted} onChange={e => setCO('date_submitted', e.target.value)} />
                  </div>
                  {coForm.status === 'Approved' && (
                    <div className="form-group">
                      <label>Date Approved</label>
                      <input type="date" value={coForm.date_approved} onChange={e => setCO('date_approved', e.target.value)} />
                    </div>
                  )}
                  <div className="form-group full">
                    <label>Notes</label>
                    <input type="text" placeholder="Optional notes..." value={coForm.notes} onChange={e => setCO('notes', e.target.value)} />
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary" disabled={savingCO}>
                    {savingCO ? <span className="spinner" style={{ width:14,height:14 }} /> : 'Add Change Order'}
                  </button>
                  <button type="button" className="btn" onClick={() => { setShowCOForm(false); setCoForm(emptyCOForm); setCOError('') }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
