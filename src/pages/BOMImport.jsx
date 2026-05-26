import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { FileText, Download, ChevronDown, ChevronUp } from 'lucide-react'
import * as XLSX from 'xlsx'

function parseBOMFile(data) {
  const wb = XLSX.read(data, { type: 'binary', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const items = []
  // Rows 1-8 are BOM header / column-header rows — skip; data starts at row 9 (index 8)
  for (const row of rows.slice(8)) {
    const qty = parseFloat(row[0]) || 0
    const description = String(row[1] || '').trim()
    const manufacturer = String(row[2] || '').trim()
    const vendor = String(row[3] || '').trim()
    const partNumber = String(row[4] || '').trim()
    const uom = String(row[5] || '').trim()
    const priceEach = parseFloat(row[6]) || 0
    if (!vendor || !description || qty <= 0) continue
    items.push({ qty, description, manufacturer, vendor, partNumber, uom, priceEach })
  }
  return items
}

function vendorSlug(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'VENDOR'
}

function downloadTemplate() {
  const headerRows = [
    ['Bill of Materials'], [], [], [], [], [], [],
    ['QTY', 'Name', 'Manufacturer', 'Supplier', 'Part Number', 'UOM', 'Item Cost', 'Total Cost'],
  ]
  const sample = [
    [4,   'Cat6 Cable 1000ft Blue',    'Belden',   'Anixter',    'CAT6-1000BL',   'EA', 185.00, 740.00],
    [50,  'Cat6 Patch Cable 3ft Gray', 'Belden',   'Anixter',    'PATCH-CAT6-3',  'EA',   4.50, 225.00],
    [100, 'Cat6 Keystone Jack White',  'Leviton',  'Anixter',    'KEYSTONE-CAT6', 'EA',   2.10, 210.00],
    [20,  'EMT Conduit 1/2" 10ft',     '',         'Home Depot', 'EMT-050',       'EA',   4.25,  85.00],
    [2,   '24-Port Patch Panel Cat6',  'Panduit',  'Graybar',    'PANEL-24P',     'EA',  95.00, 190.00],
    [1,   '24-Port Gigabit Switch',    'Cisco',    'Graybar',    'SWITCH-24G',    'EA', 320.00, 320.00],
  ]
  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...sample])
  ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 10 }]
  const wbOut = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbOut, ws, 'BOM')
  XLSX.writeFile(wbOut, 'bom-template.xlsx')
}

export default function BOMImport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileRef = useRef()
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState(searchParams.get('job') || '')
  const [parsed, setParsed] = useState(null)
  const [groups, setGroups] = useState(null)
  const [result, setResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(new Set())
  const [poPrefix, setPoPrefix] = useState('')
  const [dateIssued, setDateIssued] = useState(new Date().toISOString().slice(0, 10))
  const [expectedInvoiceDate, setExpectedInvoiceDate] = useState('')

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  useEffect(() => {
    if (jobId) {
      const job = jobs.find(j => j.id === jobId)
      if (job && !poPrefix) setPoPrefix(job.job_number)
    }
  }, [jobId, jobs])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const items = parseBOMFile(ev.target.result)
      setParsed(items)
      setGroups(null)
      setResult(null)
      setError('')
    }
    reader.readAsBinaryString(file)
  }

  function buildGroups() {
    if (!parsed || !jobId) { setError('Please select a job before previewing.'); return }
    setError('')
    const map = {}
    for (const item of parsed) {
      if (!map[item.vendor]) map[item.vendor] = []
      map[item.vendor].push(item)
    }
    setGroups(map)
    setExpanded(new Set(Object.keys(map)))
  }

  async function handleImport() {
    if (!jobId) { setError('Please select a job.'); return }
    setImporting(true); setError('')

    const vendorList = Object.keys(groups)
    let posCreated = 0
    let linesCreated = 0
    let importError = null

    for (const vendor of vendorList) {
      const items = groups[vendor]
      const total = items.reduce((s, i) => s + i.qty * i.priceEach, 0)
      const slug = vendorSlug(vendor)
      const poNumber = poPrefix ? `${poPrefix}-${slug}` : slug

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        job_id: jobId,
        vendor,
        po_number: poNumber,
        amount: parseFloat(total.toFixed(2)),
        category: 'Material — Hardware',
        date_issued: dateIssued || null,
        expected_invoice_date: expectedInvoiceDate || null,
        description: 'BOM import',
        delivery_status: 'Not Ordered',
      }).select().single()

      if (poErr) { importError = poErr.message; break }

      const linesBatch = items.map(item => ({
        po_id: po.id,
        part_number: item.partNumber || null,
        description: item.description,
        manufacturer: item.manufacturer || null,
        uom: item.uom || null,
        qty: item.qty,
        price_each: item.priceEach,
        qty_ordered: 0,
        qty_in_transit: 0,
        qty_delivered: 0,
        tracking_number: null,
        invoiced: false,
        invoice_date: null,
      }))

      const { error: linesErr } = await supabase.from('po_line_items').insert(linesBatch)
      if (linesErr) { importError = linesErr.message; break }

      posCreated++
      linesCreated += linesBatch.length
    }

    if (importError) {
      setError(`Import failed: ${importError}`)
      setImporting(false)
      return
    }

    setResult({ posCreated, linesCreated, jobId })
    setGroups(null)
    setParsed(null)
    setImporting(false)
  }

  function toggleExpand(vendor) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(vendor) ? n.delete(vendor) : n.add(vendor)
      return n
    })
  }

  const grandTotal = groups
    ? Object.values(groups).flat().reduce((s, i) => s + i.qty * i.priceEach, 0)
    : 0

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Import BOM → Create POs</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={downloadTemplate}>
            <Download size={13} /> Download Template
          </button>
        </div>
      </div>
      <div className="page" style={{ maxWidth: 860 }}>

        {!groups && !result && (
          <>
            <div className="upload-zone" onClick={() => fileRef.current.click()}>
              <FileText size={36} />
              <p>Drop your Bill of Materials here, or click to browse</p>
              <small>XLSX or CSV — Row 8 = headers · <strong>A:</strong> QTY · <strong>B:</strong> Name · <strong>C:</strong> Manufacturer · <strong>D:</strong> Supplier · <strong>E:</strong> Part # · <strong>F:</strong> UOM · <strong>G:</strong> Item Cost</small>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {parsed && (
              <div style={{ background: 'var(--color-sidebar)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>File parsed — {parsed.length} line items found</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  {[...new Set(parsed.map(i => i.vendor))].join(' · ')}
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">Import Settings</div>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Job *</label>
                  <select value={jobId} onChange={e => setJobId(e.target.value)} required>
                    <option value="">— Select Job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_description}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>PO Number Prefix</label>
                  <input type="text" placeholder="e.g. 263024" value={poPrefix} onChange={e => setPoPrefix(e.target.value)} />
                  <small style={{ color: 'var(--color-text-3)' }}>Each PO will be: {poPrefix ? `${poPrefix}-VENDOR` : 'VENDOR (no prefix)'}</small>
                </div>
                <div className="form-group">
                  <label>Date Issued</label>
                  <input type="date" value={dateIssued} onChange={e => setDateIssued(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Expected Invoice Date</label>
                  <input type="date" value={expectedInvoiceDate} onChange={e => setExpectedInvoiceDate(e.target.value)} />
                  <small style={{ color: 'var(--color-text-3)' }}>Applied to all POs — edit individually after import if needed</small>
                </div>
              </div>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={buildGroups} disabled={!parsed}>
                <FileText size={14} /> Preview POs
              </button>
            </div>
          </>
        )}

        {/* PREVIEW */}
        {groups && !result && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                <div className="metric-label">POs to Create</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{Object.keys(groups).length}</div>
                <div className="metric-sub">One per supplier</div>
              </div>
              <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                <div className="metric-label">Total Line Items</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{Object.values(groups).flat().length}</div>
              </div>
              <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                <div className="metric-label">Total BOM Value</div>
                <div className="metric-value" style={{ fontSize: 22 }}>{fmt.currency(grandTotal)}</div>
              </div>
            </div>

            {Object.entries(groups).map(([vendor, items]) => {
              const total = items.reduce((s, i) => s + i.qty * i.priceEach, 0)
              const isOpen = expanded.has(vendor)
              const slug = vendorSlug(vendor)
              const poNum = poPrefix ? `${poPrefix}-${slug}` : slug
              return (
                <div key={vendor} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(vendor)}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{vendor}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
                        PO # {poNum} · {items.length} item{items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{fmt.currency(total)}</div>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: '0.5px solid var(--color-border)' }}>
                      <div className="table-wrap">
                        <table>
                          <thead><tr>
                            <th>Part #</th><th>Description</th><th>Manufacturer</th>
                            <th className="text-right">Qty</th><th>UOM</th>
                            <th className="text-right">$ Each</th><th className="text-right">Total</th>
                          </tr></thead>
                          <tbody>
                            {items.map((item, idx) => (
                              <tr key={idx}>
                                <td style={{ fontSize: 12 }}>{item.partNumber || '—'}</td>
                                <td style={{ fontSize: 12 }}>{item.description}</td>
                                <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.manufacturer || '—'}</td>
                                <td className="text-right" style={{ fontSize: 12 }}>{item.qty}</td>
                                <td style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.uom || '—'}</td>
                                <td className="text-right" style={{ fontSize: 12 }}>{fmt.currency(item.priceEach)}</td>
                                <td className="text-right fw-500">{fmt.currency(item.qty * item.priceEach)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Create ${Object.keys(groups).length} Purchase Orders`}
              </button>
              <button className="btn" onClick={() => setGroups(null)}>Back</button>
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div style={{ background: '#EAF3DE', border: '0.5px solid #C0DD97', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontWeight: 500, color: '#3B6D11', marginBottom: 8, fontSize: 15 }}>POs created successfully</div>
            <div style={{ fontSize: 13, color: '#3B6D11' }}>
              {result.posCreated} purchase order{result.posCreated !== 1 ? 's' : ''} created with {result.linesCreated} total line items
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate(`/jobs/${result.jobId}`)}>
                View Job
              </button>
              <button className="btn btn-sm" onClick={() => { setParsed(null); setResult(null); setPoPrefix(''); setExpanded(new Set()) }}>
                Import Another
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
