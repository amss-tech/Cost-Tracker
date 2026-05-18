import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Briefcase, FileText, Receipt,
  Wrench, Upload, GitCompareArrows, LogOut, Plus
} from 'lucide-react'

const nav = [
  { label: 'Views', section: true },
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'Enter PO', path: '/po-entry', icon: FileText },
  { label: 'Enter Invoice', path: '/invoice-entry', icon: Receipt },
  { label: 'Uncommitted Costs', path: '/uncommitted', icon: Wrench },
  { label: 'Data', section: true },
  { label: 'Import WIP', path: '/wip-import', icon: Upload },
  { label: 'WIP Compare', path: '/wip-compare', icon: GitCompareArrows },
]

export default function Shell({ session, children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function isActive(path) {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">Tusco ES</div>
          <div className="sidebar-brand-sub">Cost Tracker</div>
        </div>

        <div style={{ flex: 1 }}>
          {nav.map((item, i) => item.section
            ? <div key={i} className="nav-section-label">{item.label}</div>
            : (
              <button key={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}>
                <item.icon size={15} />
                {item.label}
              </button>
            )
          )}

          <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Add</div>
          <button className="nav-item" onClick={() => navigate('/jobs/new')}>
            <Plus size={15} /> New Job
          </button>
        </div>

        <div className="sidebar-footer">
          <div style={{ marginBottom: 6 }}>{session?.user?.email}</div>
          <button className="nav-item" style={{ padding: '6px 0' }}
            onClick={() => supabase.auth.signOut()}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </nav>

      <div className="main">{children}</div>
    </div>
  )
}
