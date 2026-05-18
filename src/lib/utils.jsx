export const fmt = {
  currency: (v) => {
    if (v == null || isNaN(v)) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
  },
  pct: (v) => {
    if (v == null || isNaN(v)) return '—'
    return (v * 100).toFixed(1) + '%'
  },
  date: (v) => {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d)) return v
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  },
  excelDate: (serial) => {
    if (!serial) return null
    const d = new Date((serial - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
}

export function riskBadge(variance) {
  if (variance <= -5000) return <span className="badge badge-red">Over</span>
  if (variance < 0) return <span className="badge badge-amber">Watch</span>
  return <span className="badge badge-green">On Track</span>
}

export function jobTypeBadge(type) {
  const map = { ES: 'badge-blue', Gate: 'badge-gray', Cabling: 'badge-green', AV: 'badge-amber' }
  return <span className={`badge ${map[type] || 'badge-gray'}`}>{type || '—'}</span>
}

export function calcTrackedCost(pos, invoices, uncommitted) {
  const poTotal = (pos || []).reduce((s, p) => s + (p.amount || 0), 0)
  const unTotal = (uncommitted || []).reduce((s, u) => s + (u.amount || 0), 0)
  return poTotal + unTotal
}
