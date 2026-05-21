import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, jobTypeBadge, riskBadge, trackingUrl, gmPct, gmCell } from '../lib/utils'
import { ArrowLeft, Plus, Pencil, CheckCircle, RotateCcw, Trash2, Clock, Link, ExternalLink, Lock } from 'lucide-react'

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [cos, setCOs] = useState([])
  const [billings, setBillings] = useState([])
  const [activeTab, setActiveTab] = useState('pos')
  const [expandedPOs, setExpandedPOs] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [timeEntries, setTimeEntries] = useState([])
  const [timeForm, setTimeForm] = useState(null)
  const [documents, setDocuments] = useState([])
  const [docForm, setDocForm] = useState({ label: '', url: '' })
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [lockCostsOnComplete, setLockCostsOnComplete] = useState(false)
  const [confirmLockCosts, setConfirmLockCosts] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const [j, p, inv, uc, co, bil, te, docs] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('purchase_orders').select('*, po_line_items(*)').eq('job_id', id).order('created_at'),
        supabase.from('invoices').select('*').eq('job_id', id).order('date_received'),
        supabase.from('uncommitted_costs').select('*').eq('job_id', id).order('cost_date'),
        supabase.from('change_orders').select('*').eq('job_id', id).order('created_at'),
        supabase.from('billings').select('*').eq('job_id', id).order('date_submitted'),
        supabase.from('time_entries').select('*').eq('job_id', id).order('work_date'),
        supabase.from('job_documents').select('*').eq('job_id', id).order('created_at'),
      ])
      setJob(j.data)
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setCOs(co.data || [])
      setBillings(bil.data || [])
      setTimeEntries(te.data || [])
      setDocuments(docs.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!job) return <div className="page"><p>Job not found.</p></div>

  // Build invoicedByPO first — used for both the tracked cost formula and PO badge display
  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })

  // Tracked cost formula: uninvoiced PO balance + all invoices + uncommitted
  // Using uninvoiced balance prevents double-counting when invoice > PO amount and correctly
  // captures overages when an invoice exceeds its PO.
  const trackedPOs = pos.reduce((s, p) => s + (p.amount || 0), 0)  // total PO commitment (for display)
  const uninvoicedPOBalance = pos.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (invoicedByPO[p.id] || 0)), 0)
  const trackedUC = uncommitted.reduce((s, u) => s + (u.amount || 0), 0)
  const trackedAllInv = invoices.reduce((s, inv) => s + (inv.amount || 0), 0)
  const trackedDirectInv = invoices.filter(inv => !inv.po_id).reduce((s, inv) => s + (inv.amount || 0), 0)
  const trackedTotal = uninvoicedPOBalance + trackedAllInv + trackedUC

  // Approved change orders
  const approvedCOs = cos.filter(c => c.status === 'Approved')
  const approvedCORevenue = approvedCOs.reduce((s, c) => s + (c.revenue_amount || 0), 0)
  const approvedCOCost = approvedCOs.reduce((s, c) => s + (c.cost_amount || 0), 0)
  const revisedRevenue = (job.estimated_revenue || 0) + approvedCORevenue
  const revisedCost = (job.estimated_cost || 0) + approvedCOCost
  const variance = revisedCost - trackedTotal

  const postedInvoicesTotal = invoices.filter(inv => inv.foundation_status === 'Posted in Foundation').reduce((s, inv) => s + (inv.amount || 0), 0)
  const postedLaborTotal = uncommitted.filter(u => u.category === 'Labor — Hours × Rate' && u.posted).reduce((s, u) => s + (u.amount || 0), 0)
  const estGM = gmPct(revisedRevenue, revisedCost)
  const actualGM = trackedTotal > 0 ? gmPct(revisedRevenue, trackedTotal) : null

  const totalBilled = billings.reduce((s, b) => s + (b.amount || 0), 0)
  const leftToBill = revisedRevenue - totalBilled

  async function togglePosted(ucId, current) {
    setUncommitted(prev => prev.map(u => u.id === ucId ? { ...u, posted: !current } : u))
    await supabase.from('uncommitted_costs').update({ posted: !current }).eq('id', ucId)
  }

  async function setJobStatus(status) {
    const updates = { status }
    if (status === 'Complete' && lockCostsOnComplete && trackedTotal > 0)
      updates.estimated_cost = trackedTotal
    await supabase.from('jobs').update(updates).eq('id', id)
    setJob(j => ({ ...j, ...updates }))
    setConfirmComplete(false)
    setLockCostsOnComplete(false)
  }

  async function lockCostToActual() {
    await supabase.from('jobs').update({ estimated_cost: trackedTotal }).eq('id', id)
    setJob(j => ({ ...j, estimated_cost: trackedTotal }))
    setConfirmLockCosts(false)
  }

  async function deleteJob() {
    setDeleting(true)
    const poIds = pos.map(p => p.id)
    if (poIds.length > 0) {
      await supabase.from('po_line_items').delete().in('po_id', poIds)
    }
    await Promise.all([
      supabase.from('purchase_orders').delete().eq('job_id', id),
      supabase.from('invoices').delete().eq('job_id', id),
      supabase.from('uncommitted_costs').delete().eq('job_id', id),
      supabase.from('billings').delete().eq('job_id', id),
      supabase.from('change_orders').delete().eq('job_id', id),
      supabase.from('billing_forecast').delete().eq('job_id', id),
    ])
    await supabase.from('jobs').delete().eq('id', id)
    navigate('/jobs')
  }

  const DEFAULT_TIME_FORM = { id: null, work_date: '', employee: '', hours: '', earn_code: 'REG', cost_code: '', time_in: '', time_out: '', notes: '', rate: '50' }

  async function saveTimeEntry() {
    const rate = parseFloat(timeForm.rate) || null
    const payload = {
      job_id: id,
      work_date: timeForm.work_date,
      employee: timeForm.employee.trim(),
      hours: parseFloat(timeForm.hours),
      earn_code: timeForm.earn_code,
      cost_code: timeForm.cost_code.trim() || null,
      time_in: timeForm.earn_code === 'WKEN2' ? (timeForm.time_in.trim() || null) : null,
      time_out: timeForm.earn_code === 'WKEN2' ? (timeForm.time_out.trim() || null) : null,
      notes: timeForm.notes.trim() || null,
      rate,
    }
    if (timeForm.id) {
      const { data } = await supabase.from('time_entries').update(payload).eq('id', timeForm.id).select().single()
      if (data) setTimeEntries(prev => prev.map(e => e.id === timeForm.id ? data : e))
    } else {
      const { data } = await supabase.from('time_entries').insert(payload).select().single()
      if (data) {
        setTimeEntries(prev => [...prev, data].sort((a, b) => a.work_date.localeCompare(b.work_date)))
        if (rate > 0) {
          const hrs = parseFloat(timeForm.hours)
          await supabase.from('uncommitted_costs').insert({
            job_id: id,
            cost_date: timeForm.work_date,
            category: 'Labor — Hours × Rate',
            description: `${timeForm.earn_code} labor — ${timeForm.work_date} (${timeForm.employee.trim()})`,
            hours: hrs,
            rate,
            amount: parseFloat((hrs * rate).toFixed(2)),
            posted: true,
          })
        }
      }
    }
    setTimeForm(null)
  }

  async function deleteTimeEntry(entryId) {
    await supabase.from('time_entries').delete().eq('id', entryId)
    setTimeEntries(prev => prev.filter(e => e.id !== entryId))
    setTimeForm(null)
  }

  async function addDocument() {
    if (!docForm.label.trim() || !docForm.url.trim()) return
    const { data } = await supabase.from('job_documents').insert({
      job_id: id,
      label: docForm.label.trim(),
      url: docForm.url.trim(),
    }).select().single()
    if (data) {
      setDocuments(prev => [...prev, data])
      setDocForm({ label: '', url: '' })
    }
  }

  async function deleteDocument(docId) {
    await supabase.from('job_documents').delete().eq('id', docId)
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  function invoiceStatusBadge(status) {
    if (status === 'Posted in Foundation') return <span className="badge badge-green">Posted</span>
    if (status === 'Submitted to Accounting') return <span className="badge badge-blue">Submitted</span>
    return <span className="badge badge-amber">Pending</span>
  }

  function poBadge(lines, invoicedByPOAmt, poAmt) {
    if (lines.length > 0) {
      const invoicedCount = lines.filter(l => l.invoiced).length
      const openAmt = lines.filter(l => !l.invoiced).reduce((s, l) => s + (l.qty || 0) * (l.price_each || 0), 0)
      if (invoicedCount === 0) return <span className="badge badge-gray">Open</span>
      if (invoicedCount === lines.length) return <span className="badge badge-green">Fully Invoiced</span>
      return <span className="badge badge-amber">Partial — {fmt.currency(openAmt)} open</span>
    }
    const remaining = Math.max(0, (poAmt || 0) - invoicedByPOAmt)
    if (invoicedByPOAmt > 0) {
      if (remaining === 0) return <span className="badge badge-green">Fully Invoiced</span>
      return <span className="badge badge-amber">Partial: {fmt.currency(invoicedByPOAmt)}</span>
    }
    return <span className="badge badge-gray">Open</span>
  }

  function deliveryBadge(status) {
    if (!status || status === 'Not Ordered') return <span className="badge badge-gray">Not Ordered</span>
    if (status === 'Ordered — In Transit') return <span className="badge badge-blue">In Transit</span>
    if (status === 'Partially Delivered') return <span className="badge badge-blue">Partial Delivery</span>
    if (status === 'Delivered — Not Invoiced') return <span className="badge badge-amber">Delivered</span>
    if (status === 'Invoiced') return <span className="badge badge-green">Invoiced</span>
    return <span className="badge badge-gray">{status}</span>
  }

  function coBadge(status) {
    if (status === 'Approved') return <span className="badge badge-green">Approved</span>
    if (status === 'Rejected') return <span className="badge badge-gray">Rejected</span>
    return <span className="badge badge-amber">Pending</span>
  }

  function billingBadge(status) {
    if (status === 'Paid') return <span className="badge badge-green">Paid</span>
    if (status === 'Approved') return <span className="badge badge-amber">Approved</span>
    if (status === 'Submitted') return <span className="badge badge-blue">Submitted</span>
    if (status === 'Disputed') return <span className="badge badge-red">Disputed</span>
    return <span className="badge badge-gray">Pending</span>
  }

  return (
    <>
      <div className="topbar">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-sm" onClick={() => navigate('/jobs')}><ArrowLeft size={13} /> Jobs</button>
          <span className="topbar-title">{job.job_number} — {job.job_description}</span>
          {job.status === 'Complete' && <span className="badge badge-green" style={{ fontSize: 11 }}>Complete</span>}
        </div>
        <div className="topbar-actions">
          {riskBadge(variance)}
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Permanently delete this job and all data?</span>
              <button className="btn btn-sm" style={{ background:'var(--color-danger)', color:'#fff', border:'none' }} onClick={deleteJob} disabled={deleting}>
                {deleting ? <span className="spinner" style={{ width:12, height:12 }} /> : 'Yes, Delete'}
              </button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => navigate(`/jobs/${id}/edit`)}><Pencil size={13} /> Edit Job</button>
              {job.status === 'Complete' ? (
                <button className="btn btn-sm" onClick={() => setJobStatus('Active')} title="Reopen this job">
                  <RotateCcw size={13} /> Reopen
                </button>
              ) : confirmComplete ? (
                <button className="btn btn-sm" onClick={() => { setConfirmComplete(false); setLockCostsOnComplete(false) }}>Cancel</button>
              ) : (
                <>
                  <button className="btn btn-sm" onClick={() => navigate(`/po-entry?job=${id}`)}><Plus size={13} /> PO</button>
                  <button className="btn btn-sm" onClick={() => navigate(`/invoice-entry?job=${id}`)}><Plus size={13} /> Invoice</button>
                  <button className="btn btn-sm" onClick={() => navigate(`/billing-entry?job=${id}`)}><Plus size={13} /> Billing</button>
                  {trackedTotal > 0 && Math.abs(trackedTotal - (job.estimated_cost || 0)) > 1 && (
                    <button className="btn btn-sm" onClick={() => setConfirmLockCosts(true)} title="Set estimated cost to match actual tracked costs">
                      <Lock size={13} /> Lock Costs
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => setConfirmComplete(true)} title="Mark job as complete">
                    <CheckCircle size={13} /> Complete Job
                  </button>
                </>
              )}
              <button className="btn btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

      {confirmComplete && (
        <div style={{ background: 'var(--color-sidebar)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 20px', margin: '0 20px 0' }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Mark this job as complete?</div>
          {trackedTotal > 0 && Math.abs(trackedTotal - (job.estimated_cost || 0)) > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={lockCostsOnComplete} onChange={e => setLockCostsOnComplete(e.target.checked)} />
              Also update Estimated Cost from {fmt.currency(job.estimated_cost)} → {fmt.currency(trackedTotal)} to match actual tracked costs
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => setJobStatus('Complete')}>
              <CheckCircle size={13} /> Yes, Mark Complete
            </button>
            <button className="btn btn-sm" onClick={() => { setConfirmComplete(false); setLockCostsOnComplete(false) }}>Cancel</button>
          </div>
        </div>
      )}

      {confirmLockCosts && (
        <div style={{ background: 'var(--color-sidebar)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 20px', margin: '0 20px 0' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Lock Estimated Cost to Actual?</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 12 }}>
            Estimated Cost will change from {fmt.currency(job.estimated_cost)} → {fmt.currency(trackedTotal)}.
            Variance becomes $0 and the GM% reflects actual performance.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={lockCostToActual}>
              <Lock size={13} /> Yes, Lock Costs
            </button>
            <button className="btn btn-sm" onClick={() => setConfirmLockCosts(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="job-detail-header">
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          {jobTypeBadge(job.job_type)}
          <span className="badge badge-gray">{job.source === 'manual' ? 'Manual Entry' : 'WIP Import'}</span>
          {cos.length > 0 && <span className="badge badge-blue">{cos.length} CO{cos.length > 1 ? 's' : ''}</span>}
        </div>
        <div className="job-meta-row">
          <div className="job-meta-item">PM: <strong>{job.project_manager || '—'}</strong></div>
          <div className="job-meta-item">% Complete: <strong>{fmt.pct(job.pct_complete)}</strong></div>
          <div className="job-meta-item">Est. Completion: <strong>{fmt.date(job.estimated_completion_date)}</strong></div>
          <div className="job-meta-item">WIP Period: <strong>{job.wip_period || '—'}</strong></div>
          {job.notes && <div className="job-meta-item">Notes: <strong>{job.notes}</strong></div>}
        </div>
      </div>

      <div className="cost-breakdown-grid" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        {/* Row 1: Budget */}
        <div className="cost-box">
          <div className="cost-box-label">Est. Revenue</div>
          <div className="cost-box-value">{fmt.currency(revisedRevenue)}</div>
          <div className="cost-box-sub">
            {approvedCORevenue > 0
              ? `Base ${fmt.currency(job.estimated_revenue)} + CO ${fmt.currency(approvedCORevenue)}`
              : `JTD Billed: ${fmt.currency(job.jtd_billing)}`}
          </div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Est. Cost (Budget)</div>
          <div className="cost-box-value">{fmt.currency(revisedCost)}</div>
          <div className="cost-box-sub">
            {approvedCOCost > 0
              ? `Base ${fmt.currency(job.estimated_cost)} + CO ${fmt.currency(approvedCOCost)}`
              : `JTD Cost: ${fmt.currency(job.jtd_cost)}`}
          </div>
        </div>
        <div className={`cost-box ${variance < -5000 ? 'alert' : ''}`}>
          <div className="cost-box-label">Tracked vs Budget Variance</div>
          <div className={`cost-box-value ${variance < 0 ? 'text-danger' : variance > 0 ? 'text-success' : ''}`}>
            {trackedTotal > 0 ? (variance >= 0 ? '+' : '') + fmt.currency(variance) : '—'}
          </div>
          <div className="cost-box-sub">
            Tracked: {fmt.currency(trackedTotal)}
            {trackedDirectInv > 0 ? ` · Direct Inv: ${fmt.currency(trackedDirectInv)}` : ''}
          </div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Est GM%</div>
          <div className="cost-box-value">{gmCell(estGM)}</div>
          <div className="cost-box-sub">
            {actualGM != null ? <>Actual: {gmCell(actualGM, estGM)}</> : 'No tracked cost yet'}
          </div>
        </div>
        {/* Row 2: Billing & Foundation */}
        <div className="cost-box">
          <div className="cost-box-label">Total Billed to Date</div>
          <div className="cost-box-value" style={{ color: totalBilled > 0 ? 'var(--color-primary)' : 'inherit' }}>
            {fmt.currency(totalBilled)}
          </div>
          <div className="cost-box-sub">{billings.length} billing{billings.length !== 1 ? 's' : ''} submitted</div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Left to Bill</div>
          <div className="cost-box-value" style={{ color: leftToBill < 0 ? 'var(--color-danger)' : leftToBill === 0 ? 'var(--color-success)' : 'inherit' }}>
            {fmt.currency(leftToBill)}
          </div>
          <div className="cost-box-sub">of {fmt.currency(revisedRevenue)} est. revenue</div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Posted Invoices</div>
          <div className="cost-box-value" style={{ color: postedInvoicesTotal > 0 ? 'var(--color-success)' : 'inherit' }}>
            {fmt.currency(postedInvoicesTotal)}
          </div>
          <div className="cost-box-sub">Confirmed in Foundation</div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Posted Labor</div>
          <div className="cost-box-value" style={{ color: postedLaborTotal > 0 ? 'var(--color-success)' : 'inherit' }}>
            {fmt.currency(postedLaborTotal)}
          </div>
          <div className="cost-box-sub">Labor confirmed in Foundation</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab==='pos'?'active':''}`} onClick={() => setActiveTab('pos')}>
          Purchase Orders ({pos.length})
        </button>
        <button className={`tab ${activeTab==='invoices'?'active':''}`} onClick={() => setActiveTab('invoices')}>
          Invoices ({invoices.length})
        </button>
        <button className={`tab ${activeTab==='labor'?'active':''}`} onClick={() => setActiveTab('labor')}>
          Uncommitted ({uncommitted.length})
        </button>
        <button className={`tab ${activeTab==='cos'?'active':''}`} onClick={() => setActiveTab('cos')}>
          Change Orders ({cos.length})
        </button>
        <button className={`tab ${activeTab==='billings'?'active':''}`} onClick={() => setActiveTab('billings')}>
          Billings ({billings.length})
        </button>
        <button className={`tab ${activeTab==='time'?'active':''}`} onClick={() => setActiveTab('time')}>
          <Clock size={12} style={{ marginRight: 4 }} />Time Entries ({timeEntries.length})
        </button>
        <button className={`tab ${activeTab==='docs'?'active':''}`} onClick={() => setActiveTab('docs')}>
          <Link size={12} style={{ marginRight: 4 }} />Documents {documents.length > 0 ? `(${documents.length})` : ''}
        </button>
      </div>

      {/* POs */}
      {activeTab === 'pos' && (
        <div className="tab-content">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/po-entry?job=${id}`)}>
              <Plus size={14} /> Add PO
            </button>
          </div>
          {pos.length === 0
            ? <div className="empty-state"><p>No POs yet for this job.</p></div>
            : pos.map(p => {
              const invoiced = invoicedByPO[p.id] || 0
              const remaining = Math.max(0, (p.amount || 0) - invoiced)
              const lines = p.po_line_items || []
              const isExpanded = expandedPOs.has(p.id)
              return (
                <div key={p.id} className="po-item" style={{ flexDirection:'column', alignItems:'stretch', gap:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div className="po-item-num">{p.po_number || 'No PO #'} · {p.vendor}</div>
                      <div className="po-item-vendor">{p.description} {p.category ? `— ${p.category}` : ''}</div>
                      <div style={{ marginTop:4, display:'flex', gap:6, alignItems:'center' }}>
                        {deliveryBadge(p.delivery_status)}
                        {lines.length > 0 && (
                          <button type="button"
                            style={{ fontSize:11, color:'var(--color-primary)', background:'none', border:'none', cursor:'pointer', padding:'0 4px' }}
                            onClick={() => setExpandedPOs(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}>
                            {isExpanded ? '▲ Hide lines' : `▼ ${lines.length} line${lines.length !== 1 ? 's' : ''}`}
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', minWidth:140 }}>
                      <div className="po-item-amount">{fmt.currency(p.amount)}</div>
                      <div className="po-item-status">
                        {poBadge(lines, invoiced, p.amount)}
                      </div>
                      <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:2 }}>
                        {p.expected_invoice_date ? `Exp: ${fmt.date(p.expected_invoice_date)}` : ''}
                      </div>
                      <button className="btn btn-sm" style={{ marginTop:6 }}
                        onClick={e => { e.stopPropagation(); navigate(`/po-entry?edit=${p.id}&job=${id}`) }}>
                        <Pencil size={11} /> Edit
                      </button>
                    </div>
                  </div>
                  {isExpanded && lines.length > 0 && (
                    <div style={{ overflowX:'auto', marginTop:12, borderTop:'1px solid var(--color-border)', paddingTop:10 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
                            <th style={liTh}>Part #</th>
                            <th style={{ ...liTh, minWidth:160 }}>Description</th>
                            <th style={{ ...liTh, textAlign:'right' }}>Qty</th>
                            <th style={{ ...liTh, textAlign:'right' }}>$ Each</th>
                            <th style={{ ...liTh, textAlign:'right' }}>Total</th>
                            <th style={liTh}>Invoiced</th>
                            <th style={liTh}>Invoice Date</th>
                            <th style={{ ...liTh, textAlign:'right' }}>Ord</th>
                            <th style={{ ...liTh, textAlign:'right' }}>Transit</th>
                            <th style={{ ...liTh, textAlign:'right' }}>Rcvd</th>
                            <th style={liTh}>Est. Ship</th>
                            <th style={{ ...liTh, minWidth:120 }}>Tracking #</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(l => {
                            const lt = (l.qty || 0) * (l.price_each || 0)
                            return (
                              <tr key={l.id} style={{ borderBottom:'1px solid var(--color-border)' }}>
                                <td style={liTd}>{l.part_number || '—'}</td>
                                <td style={liTd}>{l.description || '—'}</td>
                                <td style={{ ...liTd, textAlign:'right' }}>{l.qty}</td>
                                <td style={{ ...liTd, textAlign:'right' }}>{l.price_each > 0 ? fmt.currency(l.price_each) : '—'}</td>
                                <td style={{ ...liTd, textAlign:'right', fontWeight:500 }}>{lt > 0 ? fmt.currency(lt) : '—'}</td>
                                <td style={liTd}>
                                  {l.invoiced
                                    ? <span className="badge badge-green">Invoiced</span>
                                    : <span className="badge badge-gray">Open</span>}
                                </td>
                                <td style={{ ...liTd, color: 'var(--color-text-3)' }}>{l.invoice_date ? fmt.date(l.invoice_date) : '—'}</td>
                                <td style={{ ...liTd, textAlign:'right' }}>{l.qty_ordered || '—'}</td>
                                <td style={{ ...liTd, textAlign:'right' }}>{l.qty_in_transit || '—'}</td>
                                <td style={{ ...liTd, textAlign:'right' }}>{l.qty_delivered || '—'}</td>
                                <td style={liTd}>{l.estimated_ship_date ? fmt.date(l.estimated_ship_date) : '—'}</td>
                                <td style={liTd}>
                                  {l.tracking_number
                                    ? <a href={trackingUrl(l.tracking_number)} target="_blank" rel="noopener noreferrer"
                                        style={{ color:'var(--color-primary)', textDecoration:'none' }}>
                                        {l.tracking_number}
                                      </a>
                                    : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          }
          {pos.length > 0 && (
            <div style={{ textAlign:'right', marginTop:12, fontSize:13, fontWeight:500 }}>
              Total POs: {fmt.currency(trackedPOs)}
            </div>
          )}
        </div>
      )}

      {/* Invoices */}
      {activeTab === 'invoices' && (
        <div className="tab-content">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/invoice-entry?job=${id}`)}>
              <Plus size={14} /> Add Invoice
            </button>
          </div>
          {invoices.length === 0
            ? <div className="empty-state"><p>No invoices recorded yet.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Invoice #</th><th>Vendor</th><th>Date Received</th>
                    <th className="text-right">Amount</th><th>Against PO</th><th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {invoices.map(inv => {
                      const linkedPO = pos.find(p => p.id === inv.po_id)
                      return (
                        <tr key={inv.id}>
                          <td className="fw-500">{inv.vendor_invoice_number || '—'}</td>
                          <td>{inv.vendor || '—'}</td>
                          <td>{fmt.date(inv.date_received)}</td>
                          <td className="text-right">{fmt.currency(inv.amount)}</td>
                          <td>{linkedPO ? `${linkedPO.po_number || 'PO'} · ${linkedPO.vendor}` : '—'}</td>
                          <td>{invoiceStatusBadge(inv.foundation_status)}</td>
                          <td><button className="btn btn-sm" onClick={() => navigate(`/invoice-entry?edit=${inv.id}&job=${id}`)}><Pencil size={11} /></button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}

      {/* Uncommitted */}
      {activeTab === 'labor' && (
        <div className="tab-content">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/uncommitted?job=${id}`)}>
              <Plus size={14} /> Add Cost
            </button>
          </div>
          {uncommitted.length === 0
            ? <div className="empty-state"><p>No uncommitted costs yet.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Category</th><th>Description</th>
                    <th>Hrs</th><th>Rate</th><th className="text-right">Amount</th>
                    <th>Foundation Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {uncommitted.map(u => (
                      <tr key={u.id}>
                        <td>{fmt.date(u.cost_date)}</td>
                        <td><span className="badge badge-blue">{u.category?.split(' ')[0]}</span></td>
                        <td>{u.description}</td>
                        <td>{u.hours ? u.hours : '—'}</td>
                        <td>{u.rate ? fmt.currency(u.rate) : '—'}</td>
                        <td className="text-right fw-500">{fmt.currency(u.amount)}</td>
                        <td>
                          <button type="button" onClick={() => togglePosted(u.id, u.posted)}
                            style={{ background:'none', border:'none', padding:0, cursor:'pointer' }}
                            title="Click to toggle Foundation status">
                            {u.posted
                              ? <span className="badge badge-green">Posted</span>
                              : <span className="badge badge-amber">Not Posted</span>}
                          </button>
                        </td>
                        <td><button className="btn btn-sm" onClick={() => navigate(`/uncommitted?edit=${u.id}&job=${id}`)}><Pencil size={11} /></button></td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={7} style={{ textAlign:'right', fontWeight:500, fontSize:12, color:'var(--color-text-2)' }}>Total</td>
                      <td className="text-right fw-500">{fmt.currency(trackedUC)}</td>
                    </tr>
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}

      {/* Change Orders */}
      {activeTab === 'cos' && (
        <div className="tab-content">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/jobs/${id}/edit`)}>
              <Plus size={14} /> Add Change Order
            </button>
          </div>
          {cos.length === 0
            ? <div className="empty-state"><p>No change orders yet. Click "Add Change Order" to add one.</p></div>
            : <>
                <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>CO #</th><th>Description</th>
                      <th className="text-right">Revenue +</th>
                      <th className="text-right">Cost +</th>
                      <th>Status</th><th>Submitted</th><th>Approved</th>
                    </tr></thead>
                    <tbody>
                      {cos.map(c => (
                        <tr key={c.id}>
                          <td className="fw-500">{c.co_number || '—'}</td>
                          <td>{c.description}</td>
                          <td className="text-right text-success">{c.revenue_amount > 0 ? fmt.currency(c.revenue_amount) : '—'}</td>
                          <td className="text-right">{c.cost_amount > 0 ? fmt.currency(c.cost_amount) : '—'}</td>
                          <td>{coBadge(c.status)}</td>
                          <td style={{ fontSize:12, color:'var(--color-text-3)' }}>{fmt.date(c.date_submitted)}</td>
                          <td style={{ fontSize:12, color:'var(--color-text-3)' }}>{fmt.date(c.date_approved)}</td>
                        </tr>
                      ))}
                      {approvedCOs.length > 0 && (
                        <tr style={{ background:'var(--color-sidebar)', fontWeight:500 }}>
                          <td colSpan={2} style={{ textAlign:'right', fontSize:12, color:'var(--color-text-2)' }}>Approved CO Totals</td>
                          <td className="text-right text-success">{fmt.currency(approvedCORevenue)}</td>
                          <td className="text-right">{fmt.currency(approvedCOCost)}</td>
                          <td colSpan={3} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div></div>
                <div style={{ marginTop:16, padding:'12px 16px', background:'var(--color-sidebar)', borderRadius:8, fontSize:13 }}>
                  <div style={{ display:'flex', gap:32 }}>
                    <div>Revised Revenue: <strong>{fmt.currency(revisedRevenue)}</strong></div>
                    <div>Revised Budget: <strong>{fmt.currency(revisedCost)}</strong></div>
                    <div>Approved COs: <strong>{approvedCOs.length} of {cos.length}</strong></div>
                  </div>
                </div>
              </>
          }
        </div>
      )}
      {/* Time Entries */}
      {activeTab === 'time' && (() => {
        const totalTimeHours = timeEntries.reduce((s, e) => s + (e.hours || 0), 0)
        const regHours = timeEntries.filter(e => e.earn_code === 'REG').reduce((s, e) => s + (e.hours || 0), 0)
        const wken2Hours = timeEntries.filter(e => e.earn_code === 'WKEN2').reduce((s, e) => s + (e.hours || 0), 0)
        const regpmHours = timeEntries.filter(e => e.earn_code === 'REGPM').reduce((s, e) => s + (e.hours || 0), 0)
        const byEmp = {}
        timeEntries.forEach(e => { byEmp[e.employee] = (byEmp[e.employee] || 0) + (e.hours || 0) })
        return (
          <div className="tab-content">
            {timeEntries.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
                  <div className="metric-label">Total Hours</div>
                  <div className="metric-value" style={{ fontSize: 20 }}>{totalTimeHours.toFixed(1)}</div>
                </div>
                {regHours > 0 && <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
                  <div className="metric-label">REG</div>
                  <div className="metric-value" style={{ fontSize: 20 }}>{regHours.toFixed(1)}</div>
                </div>}
                {wken2Hours > 0 && <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
                  <div className="metric-label">WKEN2</div>
                  <div className="metric-value" style={{ fontSize: 20 }}>{wken2Hours.toFixed(1)}</div>
                </div>}
                {regpmHours > 0 && <div className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
                  <div className="metric-label">REGPM</div>
                  <div className="metric-value" style={{ fontSize: 20 }}>{regpmHours.toFixed(1)}</div>
                </div>}
                {Object.entries(byEmp).map(([emp, hrs]) => (
                  <div key={emp} className="metric-card" style={{ flex: '0 0 auto', padding: '10px 14px' }}>
                    <div className="metric-label">{emp}</div>
                    <div className="metric-value" style={{ fontSize: 20 }}>{hrs.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400 }}>h</span></div>
                  </div>
                ))}
              </div>
            )}

            {/* Add / Edit form */}
            {timeForm && (
              <div className="card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 12 }}>{timeForm.id ? 'Edit Time Entry' : 'Add Time Entry'}</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Date *</label>
                    <input type="date" value={timeForm.work_date} onChange={e => setTimeForm(f => ({ ...f, work_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Employee *</label>
                    <input type="text" value={timeForm.employee} onChange={e => setTimeForm(f => ({ ...f, employee: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div className="form-group">
                    <label>Hours *</label>
                    <input type="number" step="0.25" min="0" value={timeForm.hours} onChange={e => setTimeForm(f => ({ ...f, hours: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Earn Code *</label>
                    <select value={timeForm.earn_code} onChange={e => setTimeForm(f => ({ ...f, earn_code: e.target.value }))}>
                      <option value="REG">REG — Regular</option>
                      <option value="WKEN2">WKEN2 — Wage Determination</option>
                      <option value="REGPM">REGPM — PM Time</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cost Code</label>
                    <input type="text" value={timeForm.cost_code} onChange={e => setTimeForm(f => ({ ...f, cost_code: e.target.value }))} placeholder="e.g. 3100SI - Card Access" />
                  </div>
                  <div className="form-group">
                    <label>Rate ($/hr)</label>
                    <input type="number" step="0.01" min="0" placeholder="e.g. 50.00" value={timeForm.rate} onChange={e => setTimeForm(f => ({ ...f, rate: e.target.value }))} />
                    {parseFloat(timeForm.hours) > 0 && parseFloat(timeForm.rate) > 0 && (
                      <small style={{ color: 'var(--color-text-3)' }}>= {fmt.currency(parseFloat(timeForm.hours) * parseFloat(timeForm.rate))}</small>
                    )}
                  </div>
                  {timeForm.earn_code === 'WKEN2' && (
                    <>
                      <div className="form-group">
                        <label>Time In</label>
                        <input type="text" value={timeForm.time_in} onChange={e => setTimeForm(f => ({ ...f, time_in: e.target.value }))} placeholder="e.g. 7:00 am" />
                      </div>
                      <div className="form-group">
                        <label>Time Out</label>
                        <input type="text" value={timeForm.time_out} onChange={e => setTimeForm(f => ({ ...f, time_out: e.target.value }))} placeholder="e.g. 3:30 pm" />
                      </div>
                    </>
                  )}
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Notes</label>
                    <input type="text" value={timeForm.notes} onChange={e => setTimeForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="form-actions" style={{ margin: 0, marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={saveTimeEntry} disabled={!timeForm.work_date || !timeForm.employee || !timeForm.hours}>Save</button>
                  <button className="btn" onClick={() => setTimeForm(null)}>Cancel</button>
                  {timeForm.id && (
                    <button className="btn" style={{ color: 'var(--color-danger)', marginLeft: 'auto' }} onClick={() => deleteTimeEntry(timeForm.id)}>Delete</button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {!timeForm && (
                <button className="btn btn-primary" onClick={() => setTimeForm({ ...DEFAULT_TIME_FORM })}>
                  <Plus size={14} /> Add Entry
                </button>
              )}
            </div>

            {timeEntries.length === 0 && !timeForm
              ? <div className="empty-state"><p>No time entries yet. Add manually or use Import Timecards.</p></div>
              : timeEntries.length > 0 && (
                <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Date</th><th>Employee</th><th className="text-right">Hours</th>
                      <th>Earn Code</th><th>Cost Code</th><th className="text-right">Rate</th><th className="text-right">Cost</th><th>Time In</th><th>Time Out</th><th>Status</th><th></th>
                    </tr></thead>
                    <tbody>
                      {timeEntries.map(e => (
                        <tr key={e.id} className="clickable" onClick={() => setTimeForm({ ...e, hours: String(e.hours), rate: e.rate != null ? String(e.rate) : '' })}>
                          <td style={{ fontSize: 12 }}>{fmt.date(e.work_date)}</td>
                          <td>{e.employee}</td>
                          <td className="text-right fw-500">{e.hours}</td>
                          <td>
                            <span className={`badge ${e.earn_code === 'REG' ? 'badge-green' : e.earn_code === 'WKEN2' ? 'badge-blue' : 'badge-amber'}`}>
                              {e.earn_code}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{e.cost_code || '—'}</td>
                          <td className="text-right" style={{ fontSize: 12 }}>{e.rate > 0 ? fmt.currency(e.rate) : '—'}</td>
                          <td className="text-right fw-500">{e.rate > 0 ? fmt.currency(e.hours * e.rate) : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{e.time_in || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{e.time_out || '—'}</td>
                          <td><span className={`badge ${e.status === 'Approved' ? 'badge-green' : 'badge-amber'}`}>{e.status}</span></td>
                          <td>
                            <button className="btn btn-sm" onClick={() => setTimeForm({ ...e, hours: String(e.hours), rate: e.rate != null ? String(e.rate) : '' })}>
                              <Pencil size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--color-sidebar)', fontWeight: 500 }}>
                        <td colSpan={2} style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-text-2)' }}>Total</td>
                        <td className="text-right fw-500">{totalTimeHours.toFixed(1)}</td>
                        <td colSpan={8} />
                      </tr>
                    </tbody>
                  </table>
                </div></div>
              )
            }
          </div>
        )
      })()}

      {/* Documents */}
      {activeTab === 'docs' && (
        <div className="tab-content">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Label</label>
              <input
                type="text"
                placeholder="e.g. BOM, Submittal Package, Contract"
                value={docForm.label}
                onChange={e => setDocForm(f => ({ ...f, label: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addDocument()}
              />
            </div>
            <div className="form-group" style={{ flex: 3, margin: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Egnyte / URL</label>
              <input
                type="url"
                placeholder="Paste link from Egnyte or any source"
                value={docForm.url}
                onChange={e => setDocForm(f => ({ ...f, url: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addDocument()}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={addDocument}
              disabled={!docForm.label.trim() || !docForm.url.trim()}
              style={{ flexShrink: 0 }}>
              <Plus size={14} /> Add
            </button>
          </div>

          {documents.length === 0
            ? <div className="empty-state"><p>No documents linked yet. Paste an Egnyte link above to add one.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Label</th>
                    <th>Link</th>
                    <th style={{ width: 40 }}></th>
                  </tr></thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id}>
                        <td className="fw-500">{doc.label}</td>
                        <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={doc.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink size={12} />
                            {doc.url.length > 60 ? doc.url.slice(0, 60) + '…' : doc.url}
                          </a>
                        </td>
                        <td>
                          <button className="btn btn-sm" style={{ color: 'var(--color-danger)' }}
                            onClick={() => deleteDocument(doc.id)}>
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}

      {/* Billings */}
      {activeTab === 'billings' && (
        <div className="tab-content">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--color-text-2)' }}>
              Billed: <strong style={{ color:'var(--color-text)' }}>{fmt.currency(totalBilled)}</strong>
              <span style={{ margin:'0 8px', color:'var(--color-border-strong)' }}>·</span>
              Left to bill: <strong style={{ color: leftToBill < 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>{fmt.currency(leftToBill)}</strong>
            </div>
            <button className="btn btn-primary" onClick={() => navigate(`/billing-entry?job=${id}`)}>
              <Plus size={14} /> Add Billing
            </button>
          </div>
          {billings.length === 0
            ? <div className="empty-state"><p>No billings yet. Click "Add Billing" to record a pay application or billing request.</p></div>
            : <div className="card"><div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Billing #</th><th>Description</th>
                    <th>Date Submitted</th><th>Date Approved</th>
                    <th className="text-right">Amount</th><th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {billings.map(b => (
                      <tr key={b.id}>
                        <td className="fw-500">{b.billing_number || '—'}</td>
                        <td>{b.description || '—'}</td>
                        <td style={{ fontSize:12, color:'var(--color-text-3)' }}>{fmt.date(b.date_submitted)}</td>
                        <td style={{ fontSize:12, color:'var(--color-text-3)' }}>{fmt.date(b.date_approved)}</td>
                        <td className="text-right fw-500">{fmt.currency(b.amount)}</td>
                        <td>{billingBadge(b.status)}</td>
                        <td><button className="btn btn-sm" onClick={() => navigate(`/billing-entry?edit=${b.id}&job=${id}`)}><Pencil size={11} /></button></td>
                      </tr>
                    ))}
                    <tr style={{ background:'var(--color-sidebar)', fontWeight:500 }}>
                      <td colSpan={4} style={{ textAlign:'right', fontSize:12, color:'var(--color-text-2)' }}>Total Billed</td>
                      <td className="text-right fw-500">{fmt.currency(totalBilled)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}

      </div>
    </>
  )
}

const liTh = { textAlign:'left', padding:'5px 8px', fontWeight:600, fontSize:11, color:'var(--color-text-2)', whiteSpace:'nowrap' }
const liTd = { padding:'4px 8px', fontSize:12, color:'var(--color-text-1)', whiteSpace:'nowrap' }
