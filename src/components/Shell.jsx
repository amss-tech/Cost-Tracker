import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Briefcase, FileText, Receipt,
  Wrench, Upload, GitCompareArrows, LogOut, Plus, Sun, Moon, BarChart2, CalendarDays, Clock, Users, ClipboardList, Table2
} from 'lucide-react'

const nav = [
  { label: 'Views', section: true },
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'Forecast', path: '/forecast', icon: CalendarDays },
  { label: 'Overhead Hours', path: '/overhead-hours', icon: Users },
  { label: 'Field Reports', path: '/field-report', icon: ClipboardList },
  { label: 'Reports', path: '/reports', icon: BarChart2 },
  { label: 'Enter PO', path: '/po-entry', icon: FileText },
  { label: 'Enter Invoice', path: '/invoice-entry', icon: Receipt },
  { label: 'Uncommitted Costs', path: '/uncommitted', icon: Wrench },
  { label: 'Data', section: true },
  { label: 'Import WIP', path: '/wip-import', icon: Upload },
  { label: 'Import Timecards', path: '/timecard-import', icon: Clock },
  { label: 'Import BOM', path: '/bom-import', icon: Table2 },
  { label: 'WIP Compare', path: '/wip-compare', icon: GitCompareArrows },
]

export default function Shell({ session, children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    const isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    return isDark
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

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
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button className="nav-item" style={{ padding: '6px 0', flex:1 }}
              onClick={() => supabase.auth.signOut()}>
              <LogOut size={14} /> Sign out
            </button>
            <button
              onClick={() => setDark(d => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ background:'none', border:'0.5px solid var(--color-border-strong)', borderRadius:6,
                padding:'5px 7px', color:'var(--color-text-2)', cursor:'pointer', flexShrink:0 }}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </nav>

      <div className="main">{children}</div>
    </div>
  )
}
