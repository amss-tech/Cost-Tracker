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
    // Parse bare date strings (YYYY-MM-DD) as local time to avoid UTC midnight rollback
    const s = String(v)
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? new Date(s + 'T00:00:00')
      : new Date(s)
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

export function gmPct(revenue, cost) {
  if (!revenue) return null
  return (revenue - cost) / revenue
}

export function gmCell(pct, target) {
  if (pct == null) return <span style={{ color:'var(--color-text-3)' }}>—</span>
  const display = (pct * 100).toFixed(1) + '%'
  if (target == null) return <span style={{ fontWeight:600 }}>{display}</span>
  const diff = (pct - target) * 100  // percentage points
  const color = diff <= -4 ? 'var(--color-danger)'
    : diff <= 3 ? 'var(--color-warning)'
    : 'var(--color-success)'
  return <span style={{ fontWeight:600, color }}>{display}</span>
}

export function trackingUrl(num) {
  if (!num?.trim()) return null
  const n = num.trim().replace(/\s+/g, '')
  if (/^1Z/i.test(n))
    return `https://www.ups.com/track?tracknum=${n}`
  if (/^(94|93|92|91|90)\d{18}$/.test(n))
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^96\d{20}$/.test(n))
    return `https://www.fedex.com/fedextrack/?trknbr=${n}`
  return `https://www.google.com/search?q=track+package+${encodeURIComponent(n)}`
}

export function calcTrackedCost(pos, invoices, uncommitted) {
  const poTotal = (pos || []).reduce((s, p) => s + (p.amount || 0), 0)
  const unTotal = (uncommitted || []).reduce((s, u) => s + (u.amount || 0), 0)
  return poTotal + unTotal
}
