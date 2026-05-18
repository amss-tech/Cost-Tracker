import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, jobTypeBadge, riskBadge } from '../lib/utils'
import { ArrowLeft, Plus, Pencil } from 'lucide-react'

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [pos, setPOs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [activeTab, setActiveTab] = useState('pos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [j, p, inv, uc] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        supabase.from('purchase_orders').select('*').eq('job_id', id).order('created_at'),
        supabase.from('invoices').select('*').eq('job_id', id).order('date_received'),
        supabase.from('uncommitted_costs').select('*').eq('job_id', id).order('cost_date'),
      ])
      setJob(j.data)
      setPOs(p.data || [])
      setInvoices(inv.data || [])
      setUncommitted(uc.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!job) return <div className="page"><p>Job not found.</p></div>

  const trackedPOs = pos.reduce((s, p) => s + (p.amount || 0), 0)
  const trackedUC = uncommitted.reduce((s, u) => s + (u.amount || 0), 0)
  const trackedTotal = trackedPOs + trackedUC
  const variance = (job.estimated_cost || 0) - trackedTotal

  const invoicedByPO = {}
  invoices.forEach(inv => { if (inv.po_id) invoicedByPO[inv.po_id] = (invoicedByPO[inv.po_id] || 0) + (inv.amount || 0) })

  function invoiceStatusBadge(status) {
    if (status === 'Posted in Foundation') return <span className="badge badge-green">Posted</span>
    if (status === 'Submitted to Accounting') return <span className="badge badge-blue">Submitted</span>
    return <span className="badge badge-amber">Pending</span>
  }

  function deliveryBadge(status) {
    if (!status || status === 'Not Ordered') return <span className="badge badge-gray">Not Ordered</span>
    if (status === 'Ordered — In Transit') return <span className="badge badge-blue">In Transit</span>
    if (status === 'Delivered — Not Invoiced') return <span className="badge badge-amber">Delivered</span>
    if (status === 'Invoiced') return <span className="badge badge-green">Invoiced</span>
    return <span className="badge badge-gray">{status}</span>
  }

  return (
    <>
      <div className="topbar">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-sm" onClick={() => navigate('/jobs')}><ArrowLeft size={13} /> Jobs</button>
          <span className="topbar-title">{job.job_number} — {job.job_description}</span>
        </div>
        <div className="topbar-actions">
          {riskBadge(variance)}
          <button className="btn btn-sm" onClick={() => navigate(`/po-entry?job=${id}`)}><Plus size={13} /> PO</button>
          <button className="btn btn-sm" onClick={() => navigate(`/invoice-entry?job=${id}`)}><Plus size={13} /> Invoice</button>
        </div>
      </div>

      <div className="job-detail-header">
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          {jobTypeBadge(job.job_type)}
          <span className="badge badge-gray">{job.source === 'manual' ? 'Manual Entry' : 'WIP Import'}</span>
        </div>
        <div className="job-meta-row">
          <div className="job-meta-item">PM: <strong>{job.project_manager || '—'}</strong></div>
          <div className="job-meta-item">% Complete: <strong>{fmt.pct(job.pct_complete)}</strong></div>
          <div className="job-meta-item">Est. Completion: <strong>{fmt.date(job.estimated_completion_date)}</strong></div>
          <div className="job-meta-item">WIP Period: <strong>{job.wip_period || '—'}</strong></div>
          {job.notes && <div className="job-meta-item">Notes: <strong>{job.notes}</strong></div>}
        </div>
      </div>

      <div className="cost-breakdown-grid">
        <div className="cost-box">
          <div className="cost-box-label">Est. Revenue (WIP)</div>
          <div className="cost-box-value">{fmt.currency(job.estimated_revenue)}</div>
          <div className="cost-box-sub">JTD Billed: {fmt.currency(job.jtd_billing)}</div>
        </div>
        <div className="cost-box">
          <div className="cost-box-label">Est. Cost (WIP)</div>
          <div className="cost-box-value">{fmt.currency(job.estimated_cost)}</div>
          <div className="cost-box-sub">JTD Cost: {fmt.currency(job.jtd_cost)}</div>
        </div>
        <div className={`cost-box ${variance < -5000 ? 'alert' : ''}`}>
          <div className="cost-box-label">Tracked vs WIP Variance</div>
          <div className={`cost-box-value ${variance < 0 ? 'text-danger' : variance > 0 ? 'text-success' : ''}`}>
            {trackedTotal > 0 ? (variance >= 0 ? '+' : '') + fmt.currency(variance) : '—'}
          </div>
          <div className="cost-box-sub">
            Tracked: {fmt.currency(trackedTotal)} (POs: {fmt.currency(trackedPOs)} + UC: {fmt.currency(trackedUC)})
          </div>
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
              return (
                <div key={p.id} className="po-item">
                  <div>
                    <div className="po-item-num">{p.po_number || 'No PO #'} · {p.vendor}</div>
                    <div className="po-item-vendor">{p.description} {p.category ? `— ${p.category}` : ''}</div>
                    <div style={{ marginTop:4 }}>{deliveryBadge(p.delivery_status)}</div>
                  </div>
                  <div style={{ textAlign:'right', minWidth:140 }}>
                    <div className="po-item-amount">{fmt.currency(p.amount)}</div>
                    <div className="po-item-status">
                      {invoiced > 0
                        ? remaining === 0
                          ? <span className="badge badge-green">Fully Invoiced</span>
                          : <span className="badge badge-amber">Partial: {fmt.currency(invoiced)}</span>
                        : <span className="badge badge-red">Not Invoiced</span>
                      }
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:2 }}>
                      {p.expected_invoice_date ? `Exp: ${fmt.date(p.expected_invoice_date)}` : ''}
                    </div>
                  </div>
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
                    <th className="text-right">Amount</th><th>Against PO</th><th>Status</th>
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
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} style={{ textAlign:'right', fontWeight:500, fontSize:12, color:'var(--color-text-2)' }}>Total</td>
                      <td className="text-right fw-500">{fmt.currency(trackedUC)}</td>
                    </tr>
                  </tbody>
                </table>
              </div></div>
          }
        </div>
      )}
    </>
  )
}
