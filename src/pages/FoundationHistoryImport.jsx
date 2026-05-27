import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils.jsx'
import { FileSearch, Upload, CheckCircle, AlertCircle } from 'lucide-react'

function xlCell(v) {
  const s = String(v || '').trim()
  if (s.startsWith('="') && s.endsWith('"')) return s.slice(2, -1).trim()
  return s
}

function rowHash(r) {
  const s = [
    r.cost_date, r.source, r.class, r.cost_code,
    String(Math.round((r.dollars || 0) * 100)),
    String(Math.round((r.hours || 0) * 100)),
  ].join('|')
  return btoa(unescape(encodeURIComponent(s)))
}

function parseDate(s) {
  // MM/DD/YYYY → YYYY-MM-DD
  const parts = s.trim().split('/')
  if (parts.length !== 3) return null
  return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
}

// Simple CSV parser that handles quoted fields (including ="..." Excel formula cells)
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const rows = []
  for (const line of lines) {
    const fields = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        let j = i + 1
        while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) j++
        fields.push(line.slice(i + 1, j))
        i = j + 1
        if (line[i] === ',') i++
      } else if (line[i] === '=') {
        // ="..." formula cell
        let j = i
        if (line[j + 1] === '"') {
          j += 2
          while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) j++
          fields.push(line.slice(i, j + 1)) // keep =" prefix for xlCell
          i = j + 1
          if (line[i] === ',') i++
        }
      } else {
        let j = i
        while (j < line.length && line[j] !== ',') j++
        fields.push(line.slice(i, j))
        i = j + 1
      }
    }
    rows.push(fields)
  }
  return rows
}

function parseHistoryCSV(text) {
  const rows = parseCSV(text)
  // Skip header row
  const byJob = {}
  for (let idx = 1; idx < rows.length; idx++) {
    const row = rows[idx]
    if (row.length < 11) continue
    const jobNo = xlCell(row[0])
    if (!jobNo || !/^\d/.test(jobNo)) continue

    const source = String(row[6] || '').trim()
    const cls = String(row[8] || '').trim()
    const rawCategory = String(row[9] || '').trim() || null
    const dollars = parseFloat(row[10]) || 0
    const hoursRaw = parseFloat(xlCell(row[11])) || 0
    const comment = String(row[12] || '').replace(/^"\s*|\s*"$/g, '').trim()
    const costCode = xlCell(row[4])
    const costCodeDesc = String(row[5] || '').trim()
    const dateStr = String(row[7] || '').trim()
    const cost_date = parseDate(dateStr)
    if (!cost_date) continue

    const descParts = [`[${costCode}] ${costCodeDesc}`]
    if (comment) descParts.push(comment)
    const description = descParts.join(' — ')

    const hours = hoursRaw > 0 ? hoursRaw : null
    const rate = hours && dollars > 0 ? Math.round((dollars / hours) * 100) / 100 : null

    const entry = {
      cost_date,
      source,
      class: cls,
      cost_code: costCode,
      cost_code_desc: costCodeDesc,
      category: rawCategory,
      description,
      dollars,
      hours,
      rate,
      comment: comment || null,
    }

    if (!byJob[jobNo]) byJob[jobNo] = { jobNo, jobDesc: String(row[1] || '').trim(), rows: [] }
    byJob[jobNo].rows.push(entry)
  }
  return Object.values(byJob)
}

export default function FoundationHistoryImport() {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [step, setStep] = useState('upload') // upload | preview | result
  const [parsed, setParsed] = useState([]) // [{jobNo, jobDesc, rows, matched, job_id, include}]
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    const text = await file.text()
    const jobGroups = parseHistoryCSV(text)

    // Match job numbers against DB
    const jobNos = jobGroups.map(g => g.jobNo)
    const { data: dbJobs } = await supabase
      .from('jobs')
      .select('id, job_number, job_description, status')
      .in('job_number', jobNos)

    const dbByNum = {}
    ;(dbJobs || []).forEach(j => { dbByNum[j.job_number] = j })

    const enriched = jobGroups.map(g => {
      const match = dbByNum[g.jobNo]
      return {
        ...g,
        matched: !!match,
        job_id: match?.id || null,
        job_description: match?.job_description || g.jobDesc,
        include: !!match,
      }
    })

    enriched.sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      return a.jobNo.localeCompare(b.jobNo)
    })

    setParsed(enriched)
    setStep('preview')
  }

  function toggleInclude(jobNo) {
    setParsed(prev => prev.map(g => g.jobNo === jobNo ? { ...g, include: !g.include } : g))
  }

  function toggleAll(val) {
    setParsed(prev => prev.map(g => g.matched ? { ...g, include: val } : g))
  }

  async function handleImport() {
    const selected = parsed.filter(g => g.include && g.matched)
    if (!selected.length) { setError('No matched jobs selected.'); return }
    setImporting(true); setError('')

    let totalAdded = 0
    let totalRemoved = 0
    const errors = []

    for (const group of selected) {
      const incomingRows = group.rows.map(r => ({
        ...r,
        job_id: group.job_id,
        row_hash: rowHash(r),
      }))
      const incomingHashSet = new Set(incomingRows.map(r => r.row_hash))

      const { data: existing, error: fetchErr } = await supabase
        .from('foundation_costs')
        .select('id, row_hash')
        .eq('job_id', group.job_id)

      if (fetchErr) { errors.push(`${group.jobNo}: fetch failed`); continue }

      const existingHashSet = new Set((existing || []).filter(r => r.row_hash).map(r => r.row_hash))

      // Delete rows no longer in Foundation + legacy NULL-hash rows
      const toDeleteIds = (existing || [])
        .filter(r => !r.row_hash || !incomingHashSet.has(r.row_hash))
        .map(r => r.id)

      if (toDeleteIds.length) {
        for (let i = 0; i < toDeleteIds.length; i += 200) {
          const { error: delErr } = await supabase.from('foundation_costs').delete().in('id', toDeleteIds.slice(i, i + 200))
          if (delErr) { errors.push(`${group.jobNo}: delete failed`); break }
        }
        totalRemoved += toDeleteIds.length
      }

      // Insert only genuinely new rows
      const toInsert = incomingRows.filter(r => !existingHashSet.has(r.row_hash))
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500)
        const { error: insErr } = await supabase.from('foundation_costs').insert(batch)
        if (insErr) { errors.push(`${group.jobNo}: insert failed — ${insErr.message}`); break }
        totalAdded += batch.length
      }
    }

    setResult({ jobs: selected.length, added: totalAdded, removed: totalRemoved, errors })
    setStep('result')
    setImporting(false)
  }

  const selectedCount = parsed.filter(g => g.include && g.matched).length
  const totalSelectedRows = parsed.filter(g => g.include && g.matched).reduce((s, g) => s + g.rows.length, 0)
  const totalSelectedDollars = parsed.filter(g => g.include && g.matched).reduce((s, g) => s + g.rows.reduce((rs, r) => rs + r.dollars, 0), 0)

  return (
    <>
      <div className="topbar no-print">
        <span className="topbar-title">Import Job History</span>
      </div>
      <div className="page" style={{ maxWidth: 860 }}>

        {step === 'upload' && (
          <>
            <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Foundation Job Detail History Report</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 16 }}>
                Import posted GL transactions (payroll, A/P, G/J) from the Foundation "Job Detail History Report" CSV.
                Rows will appear in each job's GL History tab and are kept separate from uncommitted costs.
              </div>
              <div
                className="upload-zone"
                onClick={() => fileRef.current.click()}
                style={{ cursor: 'pointer' }}
              >
                <FileSearch size={36} />
                <p>Drop your Job History CSV here, or click to browse</p>
                <small>Foundation "Job Detail History Report" .csv format</small>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleFile}
                />
              </div>
            </div>
            {error && <div className="auth-error">{error}</div>}
          </>
        )}

        {step === 'preview' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{parsed.length} jobs found in file</span>
                <span style={{ color: 'var(--color-text-3)', fontSize: 13, marginLeft: 12 }}>
                  {parsed.filter(g => g.matched).length} matched · {parsed.filter(g => !g.matched).length} unmatched
                </span>
              </div>
              <button className="btn btn-sm" onClick={() => toggleAll(true)}>Select all matched</button>
              <button className="btn btn-sm" onClick={() => toggleAll(false)}>Deselect all</button>
            </div>

            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Job #</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Rows</th>
                    <th style={{ textAlign: 'right' }}>Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map(g => {
                    const totalDollars = g.rows.reduce((s, r) => s + r.dollars, 0)
                    return (
                      <tr key={g.jobNo} style={{ opacity: g.matched ? 1 : 0.55 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={g.include}
                            disabled={!g.matched}
                            onChange={() => toggleInclude(g.jobNo)}
                          />
                        </td>
                        <td style={{ fontWeight: 500 }}>{g.jobNo}</td>
                        <td style={{ color: 'var(--color-text-2)' }}>{g.job_description}</td>
                        <td>
                          {g.matched
                            ? <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle size={11} /> Matched
                              </span>
                            : <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <AlertCircle size={11} /> Not in DB
                              </span>
                          }
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-3)', fontSize: 13 }}>{g.rows.length.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt.currency(totalDollars)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{
              background: 'var(--color-sidebar)',
              border: '0.5px solid var(--color-border)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              gap: 24,
              fontSize: 13,
            }}>
              <div><span style={{ color: 'var(--color-text-3)' }}>Selected jobs:</span> <strong>{selectedCount}</strong></div>
              <div><span style={{ color: 'var(--color-text-3)' }}>Total rows:</span> <strong>{totalSelectedRows.toLocaleString()}</strong></div>
              <div><span style={{ color: 'var(--color-text-3)' }}>Total $:</span> <strong>{fmt.currency(totalSelectedDollars)}</strong></div>
              <div style={{ color: 'var(--color-text-3)', fontSize: 12, marginLeft: 'auto' }}>
                Re-importing a job replaces all existing GL history for that job.
              </div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
              >
                {importing
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : <><Upload size={14} /> Import {selectedCount} Job{selectedCount !== 1 ? 's' : ''}</>
                }
              </button>
              <button className="btn" onClick={() => { setStep('upload'); setParsed([]); }}>Back</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <div style={{ background: '#EAF3DE', border: '0.5px solid #C0DD97', borderRadius: 8, padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, color: '#3B6D11', marginBottom: 8, fontSize: 15 }}>Import complete</div>
            <div style={{ fontSize: 13, color: '#3B6D11', marginBottom: 12 }}>
              {result.jobs} job{result.jobs !== 1 ? 's' : ''} synced · {result.added.toLocaleString()} added · {result.removed.toLocaleString()} removed
            </div>
            {result.errors.length > 0 && (
              <div style={{ background: '#FEF2F2', border: '0.5px solid #FCA5A5', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
                {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#991B1B' }}>{e}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => navigate('/jobs')}>Go to Jobs</button>
              <button className="btn" onClick={() => { setStep('upload'); setParsed([]); setResult(null); }}>
                Import another file
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
