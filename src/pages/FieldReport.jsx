import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function newMatLine() {
  return { _key: Math.random(), item_id: '', qty: '1', serialIds: [] }
}

export default function FieldReport() {
  const [jobs, setJobs] = useState([])
  const [invItems, setInvItems] = useState([])
  const [serialsByItem, setSerialsByItem] = useState({})
  const [form, setForm] = useState({
    job_id: '',
    report_date: new Date().toISOString().slice(0, 10),
    employee: '',
    start_time: '',
    end_time: '',
    crew_size: '',
    work_summary: '',
  })
  const [materials, setMaterials] = useState([])
  const [submitted, setSubmitted] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('jobs').select('id, job_number, job_description')
      .in('status', ['Active', 'Pipeline'])
      .order('job_number')
      .then(({ data }) => setJobs(data || []))
    supabase.from('inventory_items').select('id, description, part_number, unit, qty_on_hand, is_serialized')
      .gt('qty_on_hand', 0)
      .order('description')
      .then(({ data }) => setInvItems(data || []))
  }, [])

  async function loadSerials(item_id) {
    if (serialsByItem[item_id]) return
    const { data } = await supabase.from('inventory_serials')
      .select('id, serial_number').eq('item_id', item_id).eq('status', 'in_stock').order('serial_number')
    setSerialsByItem(prev => ({ ...prev, [item_id]: data || [] }))
  }

  function addMaterial() { setMaterials(m => [...m, newMatLine()]) }

  function removeMaterial(key) { setMaterials(m => m.filter(l => l._key !== key)) }

  function updateMat(key, field, val) {
    setMaterials(prev => prev.map(l => {
      if (l._key !== key) return l
      const updated = { ...l, [field]: val }
      if (field === 'item_id') {
        updated.qty = '1'
        updated.serialIds = []
        const item = invItems.find(i => i.id === val)
        if (item?.is_serialized) loadSerials(val)
      }
      if (field === 'qty') {
        const n = parseInt(val) || 0
        updated.serialIds = updated.serialIds.slice(0, n)
      }
      return updated
    }))
  }

  function setSerial(matKey, idx, serialId) {
    setMaterials(prev => prev.map(l => {
      if (l._key !== matKey) return l
      const ids = [...l.serialIds]
      ids[idx] = serialId
      return { ...l, serialIds: ids }
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.job_id || !form.report_date || !form.employee.trim() || !form.work_summary.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    // Validate material lines
    const matLines = materials.filter(l => l.item_id && parseInt(l.qty) > 0)
    for (const line of matLines) {
      const item = invItems.find(i => i.id === line.item_id)
      const qty = parseInt(line.qty)
      if (qty > item.qty_on_hand) {
        setError(`Not enough stock for "${item.description}" — only ${item.qty_on_hand} ${item.unit} on hand.`)
        return
      }
      if (item.is_serialized) {
        const chosen = line.serialIds.filter(Boolean)
        if (chosen.length !== qty) {
          setError(`Select all ${qty} serial number(s) for "${item.description}".`)
          return
        }
      }
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

    if (err) {
      setSubmitting(false)
      setError('Failed to submit: ' + err.message)
      return
    }

    // Save inventory issue transactions
    for (const line of matLines) {
      const item = invItems.find(i => i.id === line.item_id)
      const qty = parseInt(line.qty)

      const { data: txn, error: te } = await supabase.from('inventory_transactions').insert({
        item_id: line.item_id,
        txn_type: 'issue',
        qty: -qty,
        job_id: form.job_id,
        txn_date: form.report_date,
        notes: `Field report — ${form.employee.trim()}`,
      }).select().single()
      if (te) { setSubmitting(false); setError('Inventory save failed: ' + te.message); return }

      if (item.is_serialized) {
        for (const serialId of line.serialIds.filter(Boolean)) {
          await supabase.from('inventory_serials').update({
            status: 'installed',
            issue_txn_id: txn.id,
            job_id: form.job_id,
            installed_date: form.report_date,
          }).eq('id', serialId)
        }
      }

      await supabase.from('inventory_items')
        .update({ qty_on_hand: item.qty_on_hand - qty })
        .eq('id', item.id)

      // Keep local state in sync so duplicate submits don't over-decrement
      setInvItems(prev => prev.map(i => i.id === item.id ? { ...i, qty_on_hand: i.qty_on_hand - qty } : i))
    }

    setSubmitting(false)
    const job = jobs.find(j => j.id === form.job_id)
    setSubmitted({ ...data, job_name: job ? `${job.job_number} — ${job.job_description}` : '', matLines })
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
    setMaterials([])
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
              {submitted.matLines?.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #C0DD97' }}>
                  <strong>Materials Used:</strong>
                  {submitted.matLines.map((l, i) => {
                    const item = invItems.find(it => it.id === l.item_id)
                    const serials = l.serialIds.filter(Boolean).map(id => (serialsByItem[l.item_id] || []).find(s => s.id === id)?.serial_number).filter(Boolean)
                    return (
                      <div key={i} style={{ marginTop: 4 }}>
                        {l.qty}× {item?.description}{item?.part_number ? ` (${item.part_number})` : ''}
                        {serials.length > 0 && <span style={{ fontSize: 12 }}> — S/N: {serials.join(', ')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
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

          {/* Materials Used */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Materials Used</label>
              <button type="button" onClick={addMaterial}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                + Add Item
              </button>
            </div>
            {materials.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '10px 0' }}>
                Tap "Add Item" to log materials pulled from inventory.
              </div>
            )}
            {materials.map(line => {
              const item = invItems.find(i => i.id === line.item_id)
              const qty = parseInt(line.qty) || 0
              const inStock = serialsByItem[line.item_id] || []
              return (
                <div key={line._key} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <select style={{ ...inp, marginBottom: 8 }} value={line.item_id}
                        onChange={e => updateMat(line._key, 'item_id', e.target.value)}>
                        <option value="">— Select item —</option>
                        {invItems.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.description}{i.part_number ? ` (${i.part_number})` : ''} — {i.qty_on_hand} {i.unit} avail
                          </option>
                        ))}
                      </select>
                      {line.item_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Qty</label>
                          <input type="number" min="1" max={item?.qty_on_hand ?? 999} style={{ ...inp, width: 90 }}
                            value={line.qty} onChange={e => updateMat(line._key, 'qty', e.target.value)} />
                          <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item?.unit}</span>
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeMaterial(line._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 20, lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>
                      ×
                    </button>
                  </div>
                  {/* Serial number selects for serialized items */}
                  {item?.is_serialized && qty > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                        Serial Numbers
                      </div>
                      {Array.from({ length: qty }).map((_, i) => {
                        const usedInOther = line.serialIds.filter((s, j) => j !== i && s)
                        return (
                          <div key={i} style={{ marginBottom: 8 }}>
                            <select style={inp} value={line.serialIds[i] ?? ''}
                              onChange={e => setSerial(line._key, i, e.target.value)}>
                              <option value="">— Select serial #{i + 1} —</option>
                              {inStock.filter(s => !usedInOther.includes(s.id)).map(s => (
                                <option key={s.id} value={s.id}>{s.serial_number}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
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
