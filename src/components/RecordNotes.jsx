import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function RecordNotes({ entityType, entityId }) {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || 'Unknown'))
    supabase
      .from('record_notes')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setNotes(data || []))
  }, [entityType, entityId])

  async function saveNote() {
    if (!body.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('record_notes').insert({
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
      created_by: userEmail,
    }).select().single()
    if (!error && data) {
      setNotes(n => [...n, data])
      setBody('')
    }
    setSaving(false)
  }

  function fmtDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="form-section">
      <div className="form-section-title">Notes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.length === 0
          ? <p style={{ color: 'var(--color-text-3)', fontSize: 13, margin: 0 }}>No notes yet.</p>
          : notes.map(n => (
            <div key={n.id} style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 3 }}>
                {n.created_by} &middot; {fmtDate(n.created_at)}
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.body}</div>
            </div>
          ))
        }
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          placeholder="Add a note..."
          value={body}
          onChange={e => setBody(e.target.value)}
          style={{ flex: 1, minHeight: 64, resize: 'vertical' }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote() }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={saveNote}
          disabled={saving || !body.trim()}
          style={{ alignSelf: 'flex-end' }}
        >
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Note'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>Ctrl+Enter to save</div>
    </div>
  )
}
