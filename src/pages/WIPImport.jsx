import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

// Excel serial date to ISO string
function excelDate(serial) {
  if (!serial) return null
  const d = new Date((serial - 25569) * 86400 * 1000)
  if (isNaN(d)) return null
  return d.toISOString().split('T')[0]
}

// Parse Foundation WIP xlsx rows into job objects
function parseWIPRows(rows) {
  // Header row is index 1 (row 0 is the merged group labels)
  // Columns: 0=Job Number, 1=Job Type, 2=PM, 3=Description,
  //          4=JTD Billing, 5=JTD Cost,
  //          6=Est Revenue, 7=Est Cost, 8=Est Margin, 9=Est Margin%,
  //          10=Est Completion Date, 11=% Complete, 12=Notes,
  //          13=Prev Est Revenue, 14=Prev Est Cost, 15=Prev Est Margin, 16=Prev Est Margin%,
  //          17=Revenue Change, 18=Cost Change
  const jobs = []
  for (const row of rows) {
    const jobNum = String(row[0] || '').trim()
    if (!jobNum || jobNum === 'Job  Number' || jobNum === 'Actual') continue
    jobs.push({
      job_number: jobNum,
      job_type: String(row[1] || '').trim(),
      project_manager: String(row[2] || '').trim(),
      job_description: String(row[3] || '').trim(),
      jtd_billing: parseFloat(row[4]) || 0,
      jtd_cost: parseFloat(row[5]) || 0,
      estimated_revenue: parseFloat(row[6]) || 0,
      estimated_cost: parseFloat(row[7]) || 0,
      estimated_margin: parseFloat(row[8]) || 0,
      estimated_margin_pct: parseFloat(row[9]) || 0,
      estimated_completion_date: excelDate(row[10]),
      pct_complete: parseFloat(row[11]) || 0,
      notes: String(row[12] || '').trim(),
      prev_estimated_revenue: parseFloat(row[13]) || 0,
      prev_estimated_cost: parseFloat(row[14]) || 0,
      prev_estimated_margin: parseFloat(row[15]) || 0,
      prev_estimated_margin_pct: parseFloat(row[16]) || 0,
      revenue_change: parseFloat(row[17]) || 0,
      cost_change: parseFloat(row[18]) || 0,
      source: 'wip',
    })
  }
  return jobs
}

export default function WIPImport() {
  const fileRef = useRef()
  const [period, setPeriod] = useState('')
  const [onDuplicate, setOnDuplicate] = useState('update')
  const [parsed, setParsed] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [conflictResolutions, setConflictResolutions] = useState({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      const jobs = parseWIPRows(rows)
      setParsed(jobs)
      setConflicts([])
      setConflictResolutions({})
      setResult(null)
    }
    reader.readAsBinaryString(file)
  }

  async function checkConflicts() {
    if (!parsed) return
    const nums = parsed.map(j => j.job_number)
    const { data: existing } = await supabase.from('jobs')
      .select('*').in('job_number', nums).eq('source', 'manual')
    if (!existing || existing.length === 0) return []
    return existing
  }

  async function handleImport() {
    if (!parsed || !period) { setError('Please select a WIP period.'); return }
    setImporting(true); setError(''); setResult(null)

    // Check for manual job conflicts
    const existingManual = await checkConflicts()
    const conflictNums = new Set(existingManual.map(j => j.job_number))
    const newConflicts = parsed.filter(j => conflictNums.has(j.job_number)).map(wipJob => ({
      wip: wipJob,
      existing: existingManual.find(e => e.job_number === wipJob.job_number)
    }))

    if (newConflicts.length > 0 && Object.keys(conflictResolutions).length < newConflicts.length) {
      setConflicts(newConflicts)
      // Initialize all to 'wip' default
      const res = {}
      newConflicts.forEach(c => { res[c.wip.job_number] = res[c.wip.job_number] || 'wip' })
      setConflictResolutions(res)
      setImporting(false)
      return
    }

    // Perform import
    let updated = 0, inserted = 0

    for (const job of parsed) {
      const payload = { ...job, wip_period: period }

      const { data: existing } = await supabase.from('jobs')
        .select('id, source').eq('job_number', job.job_number).single()

      if (existing) {
        // If manual and user chose to keep manual, skip WIP fields
        if (existing.source === 'manual' && conflictResolutions[job.job_number] === 'keep') {
          // Update only wip_period
          await supabase.from('jobs').update({ wip_period: period }).eq('id', existing.id)
        } else {
          await supabase.from('jobs').update({ ...payload, source: 'wip' }).eq('id', existing.id)
          updated++
        }
      } else {
        await supabase.from('jobs').insert(payload)
        inserted++
      }
    }

    // Log the import
    await supabase.from('wip_imports').insert({
      period,
      job_count: parsed.length,
      updated_count: updated,
      conflict_count: conflicts.length,
    })

    setResult({ total: parsed.length, inserted, updated })
    setConflicts([])
    setImporting(false)
  }

  function resolveAll(choice) {
    const res = {}
    conflicts.forEach(c => { res[c.wip.job_number] = choice })
    setConflictResolutions(res)
  }

  function changedFields(wip, existing) {
    const fields = ['job_description','project_manager','estimated_revenue','estimated_cost','pct_complete','notes']
    return fields.filter(f => {
      const a = wip[f]; const b = existing[f]
      if (typeof a === 'number') return Math.abs(a - (b || 0)) > 0.01
      return String(a||'').trim() !== String(b||'').trim()
    })
  }

  return (
    <>
      <div className="topbar"><span className="topbar-title">Import WIP</span></div>
      <div className="page" style={{ maxWidth: 720 }}>

        {!conflicts.length && !result && (
          <>
            <div className="upload-zone" onClick={() => fileRef.current.click()}>
              <Upload size={36} />
              <p>Drop your WIP Excel file here, or click to browse</p>
              <small>Accepts the Foundation WIP .xlsx format</small>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={handleFile} />
            </div>

            {parsed && (
              <div style={{ background:'var(--color-sidebar)', border:'0.5px solid var(--color-border)', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
                <div style={{ fontWeight:500, marginBottom:4 }}>File parsed — {parsed.length} jobs found</div>
                <div style={{ fontSize:12, color:'var(--color-text-3)' }}>
                  Sample: {parsed.slice(0,3).map(j => j.job_number).join(', ')}...
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">Import Settings</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>WIP Period *</label>
                  <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>On Duplicate (WIP import job)</label>
                  <select value={onDuplicate} onChange={e => setOnDuplicate(e.target.value)}>
                    <option value="update">Update estimates, keep my cost data</option>
                    <option value="skip">Skip — keep existing record</option>
                  </select>
                </div>
              </div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom:12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || !parsed}>
                {importing ? <span className="spinner" style={{ width:14,height:14 }} /> : <><Upload size={14} /> Import {parsed ? `(${parsed.length} jobs)` : ''}</>}
              </button>
            </div>
          </>
        )}

        {/* CONFLICT RESOLUTION */}
        {conflicts.length > 0 && (
          <div>
            <div style={{ background:'#FAEEDA', border:'0.5px solid #FAC775', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
              <div style={{ fontWeight:500, color:'#854F0B', marginBottom:4 }}>
                {conflicts.length} manual job{conflicts.length>1?'s':''} will be overwritten by this WIP import
              </div>
              <div style={{ fontSize:12, color:'#854F0B' }}>
                Review each conflict below and choose which version to keep.
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button className="btn btn-sm" onClick={() => resolveAll('wip')}>Use WIP for all</button>
              <button className="btn btn-sm" onClick={() => resolveAll('keep')}>Keep manual for all</button>
            </div>

            {conflicts.map(c => {
              const changed = changedFields(c.wip, c.existing)
              const choice = conflictResolutions[c.wip.job_number] || 'wip'
              return (
                <div key={c.wip.job_number} className="card" style={{ marginBottom:12 }}>
                  <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--color-border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <span style={{ fontWeight:500 }}>{c.wip.job_number}</span>
                      <span style={{ color:'var(--color-text-3)', marginLeft:8, fontSize:13 }}>{c.wip.job_description}</span>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className={`btn btn-sm ${choice==='wip'?'btn-primary':''}`} onClick={() => setConflictResolutions(r => ({...r,[c.wip.job_number]:'wip'}))}>
                        Use WIP
                      </button>
                      <button className={`btn btn-sm ${choice==='keep'?'btn-primary':''}`} onClick={() => setConflictResolutions(r => ({...r,[c.wip.job_number]:'keep'}))}>
                        Keep Manual
                      </button>
                    </div>
                  </div>
                  <div style={{ padding:'10px 16px' }}>
                    {changed.length === 0
                      ? <div style={{ fontSize:13, color:'var(--color-text-3)' }}>No field differences detected.</div>
                      : changed.map(field => (
                        <div key={field} className="diff-row">
                          <div className="diff-field">{field.replace(/_/g,' ')}</div>
                          <div className={`diff-val ${c.existing[field] != c.wip[field] ? 'changed' : 'same'}`}>
                            Manual: {typeof c.existing[field]==='number' ? fmt.currency(c.existing[field]) : c.existing[field] || '—'}
                          </div>
                          <div className="diff-val changed">
                            WIP: {typeof c.wip[field]==='number' ? fmt.currency(c.wip[field]) : c.wip[field] || '—'}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )
            })}

            <div className="form-actions" style={{ marginTop:16 }}>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? <span className="spinner" style={{ width:14,height:14 }} /> : `Confirm Import (${parsed?.length} jobs)`}
              </button>
              <button className="btn" onClick={() => setConflicts([])}>Cancel</button>
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div style={{ background:'#EAF3DE', border:'0.5px solid #C0DD97', borderRadius:8, padding:'16px 20px' }}>
            <div style={{ fontWeight:500, color:'#3B6D11', marginBottom:8, fontSize:15 }}>Import complete</div>
            <div style={{ fontSize:13, color:'#3B6D11' }}>
              {result.total} jobs processed · {result.inserted} new · {result.updated} updated
            </div>
            <button className="btn btn-sm" style={{ marginTop:12 }} onClick={() => { setParsed(null); setResult(null); setPeriod('') }}>
              Import another
            </button>
          </div>
        )}
      </div>
    </>
  )
}
