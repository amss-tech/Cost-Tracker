import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Clock } from 'lucide-react'
import * as XLSX from 'xlsx'

const PROJECT_CODES = new Set(['REG', 'WKEN2', 'REGPM'])
// Internal overhead jobs — routed to overhead_time_entries even when earn code is a project code
const OVERHEAD_JOB_NUMBERS = new Set(['8'])

function parseWeekPeriod(filename) {
  const match = filename.match(/(\d{8})/)
  if (!match) return ''
  const s = match[1]
  return `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`
}

// XLSX auto-converts MM/DD/YYYY strings to Date objects — handle both cases
function cellToWorkDate(val) {
  if (!val) return null
  if (val instanceof Date) {
    if (isNaN(val)) return null
    const mm = String(val.getMonth() + 1).padStart(2, '0')
    const dd = String(val.getDate()).padStart(2, '0')
    return `${val.getFullYear()}-${mm}-${dd}`
  }
  const s = String(val).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [mm, dd, yyyy] = s.split('/')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

function parseTimecardCSV(data) {
  const wb = XLSX.read(data, { type: 'binary', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const entries = []
  for (const row of rows) {
    const workDate = cellToWorkDate(row[0])
    if (!workDate) continue  // skips header row, employee name rows, subtotal rows
    const jobField = String(row[1] || '').trim()
    const employee = String(row[2] || '').trim()
    const timeIn = String(row[3] || '').trim()
    const timeOut = String(row[4] || '').trim()
    const costCode = String(row[5] || '').trim().replace(/\s+/g, ' ')
    const hours = parseFloat(row[7]) || 0
    const earnCode = String(row[8] || '').trim()
    const status = String(row[17] || '').trim() || 'Approved'
    if (!hours || !employee) continue
    entries.push({
      work_date: workDate,
      employee,
      hours,
      earn_code: earnCode,
      cost_code: costCode && costCode !== '-' ? costCode : null,
      time_in: timeIn && timeIn !== '-' ? timeIn : null,
      time_out: timeOut && timeOut !== '-' ? timeOut : null,
      status,
      job_number: jobField.split(' - ')[0].trim(),
      job_name: jobField,
    })
  }
  return entries
}

export default function TimecardImport() {
  const fileRef = useRef()
  const [weekPeriod, setWeekPeriod] = useState('')
  const [laborRate, setLaborRate] = useState('')
  const [parsed, setParsed] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const auto = parseWeekPeriod(file.name)
    if (auto) setWeekPeriod(auto)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const entries = parseTimecardCSV(ev.target.result)
      setParsed(entries)
      setPreview(null)
      setResult(null)
      setError('')
    }
    reader.readAsBinaryString(file)
  }

  async function buildPreview() {
    if (!parsed) return
    const { data: jobs } = await supabase.from('jobs').select('id, job_number, job_description')
    const jobMap = {}
    for (const j of jobs || []) jobMap[j.job_number] = j

    const projectEntries = [], overheadEntries = [], unmatchedEntries = []
    for (const e of parsed) {
      if (PROJECT_CODES.has(e.earn_code) && !OVERHEAD_JOB_NUMBERS.has(e.job_number)) {
        const job = jobMap[e.job_number]
        if (job) projectEntries.push({ ...e, job_id: job.id, job_description: job.job_description })
        else unmatchedEntries.push(e)
      } else {
        overheadEntries.push(e)
      }
    }
    setPreview({ projectEntries, overheadEntries, unmatchedEntries })
  }

  async function handleImport() {
    if (!weekPeriod) { setError('Please set a week period before importing.'); return }
    setImporting(true); setError('')

    const projectBatch = preview.projectEntries.map(e => ({
      job_id: e.job_id,
      work_date: e.work_date,
      employee: e.employee,
      hours: e.hours,
      earn_code: e.earn_code,
      cost_code: e.cost_code,
      time_in: e.time_in,
      time_out: e.time_out,
      week_period: weekPeriod,
      status: e.status,
    }))

    const overheadBatch = preview.overheadEntries.map(e => ({
      work_date: e.work_date,
      employee: e.employee,
      hours: e.hours,
      earn_code: e.earn_code,
      cost_code: e.cost_code,
      job_name: e.job_name,
      week_period: weekPeriod,
      status: e.status,
    }))

    // Build posted labor cost records (one per job) if a rate is provided
    const rate = parseFloat(laborRate) || 0
    let laborBatch = []
    if (rate > 0) {
      const jobHours = {}
      preview.projectEntries.forEach(e => { jobHours[e.job_id] = (jobHours[e.job_id] || 0) + (e.hours || 0) })
      laborBatch = Object.entries(jobHours).map(([jobId, hrs]) => ({
        job_id: jobId,
        cost_date: weekPeriod,
        category: 'Labor — Hours × Rate',
        description: `Timecard import — week of ${weekPeriod}`,
        hours: parseFloat(hrs.toFixed(2)),
        rate,
        amount: parseFloat((hrs * rate).toFixed(2)),
        posted: true,
      }))
    }

    const [pRes, oRes, lRes] = await Promise.all([
      projectBatch.length ? supabase.from('time_entries').insert(projectBatch) : { error: null },
      overheadBatch.length ? supabase.from('overhead_time_entries').insert(overheadBatch) : { error: null },
      laborBatch.length ? supabase.from('uncommitted_costs').insert(laborBatch) : { error: null },
    ])

    if (pRes.error || oRes.error || lRes.error) {
      const msg = pRes.error?.message || oRes.error?.message || lRes.error?.message || 'Unknown error'
      const detail = pRes.error?.details || oRes.error?.details || lRes.error?.details || ''
      setError(`Import failed: ${msg}${detail ? ` — ${detail}` : ''}`)
      setImporting(false)
      return
    }

    setResult({
      projectCount: projectBatch.length,
      overheadCount: overheadBatch.length,
      unmatched: preview.unmatchedEntries.length,
      laborJobCount: laborBatch.length,
      laborRate: rate,
    })
    setPreview(null)
    setParsed(null)
    setImporting(false)
  }

  // Group project preview by job
  const projectByJob = {}
  if (preview) {
    for (const e of preview.projectEntries) {
      if (!projectByJob[e.job_number]) projectByJob[e.job_number] = { ...e, entries: [] }
      projectByJob[e.job_number].entries.push(e)
    }
  }

  return (
    <>
      <div className="topbar"><span className="topbar-title">Import Timecards</span></div>
      <div className="page" style={{ maxWidth: 760 }}>

        {!preview && !result && (
          <>
            <div className="upload-zone" onClick={() => fileRef.current.click()}>
              <Clock size={36} />
              <p>Drop your Submitted Time Report CSV here, or click to browse</p>
              <small>Export from your time tracking system as CSV</small>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {parsed && (
              <div style={{ background: 'var(--color-sidebar)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>File parsed — {parsed.length} time entries found</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  {[...new Set(parsed.map(e => e.employee))].join(', ')}
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">Import Settings</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Week Start Date *</label>
                  <input type="date" value={weekPeriod} onChange={e => setWeekPeriod(e.target.value)} />
                  {weekPeriod && <small style={{ color: 'var(--color-text-3)' }}>Auto-detected from filename</small>}
                </div>
                <div className="form-group">
                  <label>Loaded Labor Rate ($/hr)</label>
                  <input type="number" step="0.01" min="0" placeholder="e.g. 85.00" value={laborRate} onChange={e => setLaborRate(e.target.value)} />
                  <small style={{ color: 'var(--color-text-3)' }}>If set, posts labor costs to each job as confirmed Foundation cost</small>
                </div>
              </div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={buildPreview} disabled={!parsed}>
                <Clock size={14} /> Preview Import
              </button>
            </div>
          </>
        )}

        {/* PREVIEW */}
        {preview && !result && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                <div className="metric-label">Project Entries</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{preview.projectEntries.length}</div>
                <div className="metric-sub">Matched to jobs</div>
              </div>
              <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                <div className="metric-label">Overhead Entries</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{preview.overheadEntries.length}</div>
                <div className="metric-sub">TRAIN / VAC / Bldg Renov</div>
              </div>
              {preview.unmatchedEntries.length > 0 && (
                <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                  <div className="metric-label">Unmatched</div>
                  <div className="metric-value" style={{ fontSize: 22, color: 'var(--color-warning)' }}>{preview.unmatchedEntries.length}</div>
                  <div className="metric-sub">No matching job</div>
                </div>
              )}
            </div>

            {Object.keys(projectByJob).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-header"><span className="section-title">Project Entries — by Job</span></div>
                <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Job #</th><th>Description</th>
                      <th className="text-right">Entries</th>
                      <th className="text-right">Total Hours</th>
                    </tr></thead>
                    <tbody>
                      {Object.values(projectByJob).map(g => (
                        <tr key={g.job_number}>
                          <td className="fw-500">{g.job_number}</td>
                          <td>{g.job_description}</td>
                          <td className="text-right">{g.entries.length}</td>
                          <td className="text-right fw-500">{g.entries.reduce((s, e) => s + e.hours, 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              </div>
            )}

            {preview.overheadEntries.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-header"><span className="section-title">Overhead Entries (logged separately)</span></div>
                <div className="card"><div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Date</th><th>Employee</th><th>Job / Activity</th>
                      <th>Earn Code</th><th className="text-right">Hours</th>
                    </tr></thead>
                    <tbody>
                      {preview.overheadEntries.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{e.work_date}</td>
                          <td>{e.employee}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{e.job_name}</td>
                          <td><span className="badge badge-gray">{e.earn_code}</span></td>
                          <td className="text-right">{e.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              </div>
            )}

            {preview.unmatchedEntries.length > 0 && (
              <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ fontWeight: 500, color: '#854F0B', marginBottom: 8 }}>
                  {preview.unmatchedEntries.length} entries skipped — no matching job found in the system
                </div>
                {preview.unmatchedEntries.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#854F0B' }}>
                    {e.work_date} · {e.employee} · {e.job_name} · {e.hours}h
                  </div>
                ))}
              </div>
            )}

            {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Confirm Import`}
              </button>
              <button className="btn" onClick={() => setPreview(null)}>Back</button>
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div style={{ background: '#EAF3DE', border: '0.5px solid #C0DD97', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontWeight: 500, color: '#3B6D11', marginBottom: 8, fontSize: 15 }}>Import complete</div>
            <div style={{ fontSize: 13, color: '#3B6D11' }}>
              {result.projectCount} project entries imported · {result.overheadCount} overhead entries logged
              {result.unmatched > 0 ? ` · ${result.unmatched} unmatched entries skipped` : ''}
              {result.laborJobCount > 0 ? ` · Labor costs posted to ${result.laborJobCount} job${result.laborJobCount !== 1 ? 's' : ''} @ $${result.laborRate}/hr` : ''}
            </div>
            <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => { setParsed(null); setResult(null); setWeekPeriod(''); setLaborRate('') }}>
              Import another
            </button>
          </div>
        )}
      </div>
    </>
  )
}
