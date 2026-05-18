import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, riskBadge } from '../lib/utils'
import { Download } from 'lucide-react'

export default function WIPCompare() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pos, setPOs] = useState([])
  const [uncommitted, setUncommitted] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterFlag, setFilterFlag] = useState('')

  useEffect(() => {
    async function load() {
      const [j, p, uc] = await Promise.all([
        supabase.from('jobs').select('*').order('job_number'),
        supabase.from('purchase_orders').select('job_id, amount'),
        supabase.from('uncommitted_costs').select('job_id, amount'),
      ])
      setJobs(j.data || [])
      setPOs(p.data || [])
      setUncommitted(uc.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const posByJob = {}, ucByJob = {}
  pos.forEach(p => { posByJob[p.job_id] = (posByJob[p.job_id] || 0) + (p.amount || 0) })
  uncommitted.forEach(u => { ucByJob[u.job_id] = (ucByJob[u.job_id] || 0) + (u.amount || 0) })

  const rows = jobs.map(j => {
    const tracked = (posByJob[j.id] || 0) + (ucByJob[j.id] || 0)
    const variance = (j.estimated_cost || 0) - tracked
    const variancePct = j.estimated_cost > 0 ? variance / j.estimated_cost : 0
    let flag = 'No data'
    if (tracked > 0) {
      if (variance <= -5000) flag = 'Over'
      else if (variance < 0) flag = 'Watch'
      else flag = 'On Track'
    }
    return { ...j, tracked, variance, variancePct, flag }
  })

  const filtered = filterFlag ? rows.filter(r => r.flag === filterFlag) : rows

  // Summary metrics
  const overJobs = rows.filter(r => r.flag === 'Over')
  const totalExposure = rows.filter(r => r.variance < 0).reduce((s, r) => s + Math.abs(r.variance), 0)
  const onTrackJobs = rows.filter(r => r.flag === 'On Track')
  const biggestGap = rows.reduce((m, r) => r.variance < m.variance ? r : m, { variance: 0, job_number: '—', job_description: '' })

  function exportCSV() {
    const headers = ['Job #','Description','PM','Type','Est Cost (WIP)','Tracked Cost','Variance $','Variance %','Flag']
    const csvRows = rows.map(r => [
      r.job_number, `"${r.job_description}"`, r.project_manager, r.job_type,
      r.estimated_cost, r.tracked.toFixed(2),
      r.variance.toFixed(2), (r.variancePct * 100).toFixed(1) + '%', r.flag
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'wip-compare.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">WIP Comparison</span>
        <div className="topbar-actions">
          <button className="btn" onClick={exportCSV}><Download size={14} /> Export CSV</button>
        </div>
      </div>
      <div className="page">
        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Jobs Over Tracked Cost</div>
            <div className="metric-value" style={{ color: overJobs.length > 0 ? 'var(--color-danger)' : 'inherit' }}>{overJobs.length}</div>
            <div className="metric-sub">POs exceed WIP estimate</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Cost Exposure</div>
            <div className="metric-value" style={{ color: totalExposure > 0 ? 'var(--color-warning)' : 'inherit' }}>{fmt.currency(totalExposure)}</div>
            <div className="metric-sub">Tracked over WIP estimates</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Jobs On Track</div>
            <div className="metric-value" style={{ color: 'var(--color-success)' }}>{onTrackJobs.length}</div>
            <div className="metric-sub">Within budget</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Largest Single Gap</div>
            <div className="metric-value" style={{ fontSize:18 }}>{biggestGap.variance < 0 ? fmt.currency(Math.abs(biggestGap.variance)) : '—'}</div>
            <div className="metric-sub">{biggestGap.variance < 0 ? `${biggestGap.job_number} — ${biggestGap.job_description?.slice(0,24)}` : 'No gaps'}</div>
          </div>
        </div>

        <div className="filter-row" style={{ marginBottom:14 }}>
          <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}>
            <option value="">All Jobs</option>
            <option>Over</option><option>Watch</option><option>On Track</option><option>No data</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Job #</th><th>Description</th><th>PM</th>
                <th className="text-right">WIP Est. Cost</th>
                <th className="text-right">Tracked Cost</th>
                <th className="text-right">Variance $</th>
                <th className="text-right">Variance %</th>
                <th>Flag</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--color-text-3)', padding:32 }}>No jobs match this filter.</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/jobs/${r.id}`)}>
                      <td className="fw-500">{r.job_number}</td>
                      <td>{r.job_description}</td>
                      <td>{r.project_manager}</td>
                      <td className="text-right">{fmt.currency(r.estimated_cost)}</td>
                      <td className="text-right">{r.tracked > 0 ? fmt.currency(r.tracked) : <span className="text-muted">—</span>}</td>
                      <td className={`text-right fw-500 ${r.tracked > 0 && r.variance < 0 ? 'text-danger' : r.tracked > 0 && r.variance > 0 ? 'text-success' : ''}`}>
                        {r.tracked > 0 ? (r.variance >= 0 ? '+' : '') + fmt.currency(r.variance) : '—'}
                      </td>
                      <td className={`text-right ${r.tracked > 0 && r.variancePct < 0 ? 'text-danger' : r.tracked > 0 ? 'text-success' : ''}`}>
                        {r.tracked > 0 ? (r.variancePct >= 0 ? '+' : '') + (r.variancePct * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td>{r.tracked > 0 ? riskBadge(r.variance) : <span className="badge badge-gray">No data</span>}</td>
                    </tr>
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
