import { useState } from 'react'
import JobCostReport from './reports/JobCostReport'
import WIPReport from './reports/WIPReport'
import BillingReport from './reports/BillingReport'
import CostForecastReport from './reports/CostForecastReport'
import LaborReport from './reports/LaborReport'
import InventoryReport from './reports/InventoryReport'

const REPORTS = [
  { key: 'job-cost', label: 'Job Cost Summary', Component: JobCostReport },
  { key: 'wip', label: 'WIP Report', Component: WIPReport },
  { key: 'billing', label: 'Billing Status', Component: BillingReport },
  { key: 'forecast', label: 'Cost Forecast', Component: CostForecastReport },
  { key: 'labor', label: 'Labor Hours', Component: LaborReport },
  { key: 'inventory', label: 'Inventory', Component: InventoryReport },
]

export default function Reports() {
  const [active, setActive] = useState('job-cost')
  const { Component } = REPORTS.find(r => r.key === active)

  return (
    <>
      <div className="topbar no-print">
        <span className="topbar-title">Reports</span>
      </div>
      <div className="page">
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
          {REPORTS.map(r => (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className="btn"
              style={{
                borderRadius: 6,
                fontWeight: active === r.key ? 600 : 400,
                background: active === r.key ? 'var(--color-primary)' : 'transparent',
                color: active === r.key ? '#fff' : 'var(--color-text-2)',
                border: active === r.key ? 'none' : '1px solid var(--color-border)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Component key={active} />
      </div>
    </>
  )
}
