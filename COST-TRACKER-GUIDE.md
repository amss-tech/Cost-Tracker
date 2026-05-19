# Tusco Cost Tracker — User Guide

## What Is This?

Cost Tracker is a job cost management system that lets you track every dollar going in and out of each project — from the moment a PO is issued to the final billing. It replaces spreadsheet-based WIP tracking and gives you a live view of where each job stands financially.

---

## Core Concepts

Before using the system, it helps to understand how costs are categorized:

| Category | What It Is | Examples |
|---|---|---|
| **Tracked Cost** | Everything spent or committed on a job | POs + direct invoices + uncommitted costs |
| **Open Commitments** | PO line items ordered but not yet invoiced by vendor | Equipment on order, material in transit |
| **Billings** | What has been billed to the client | Progress draws, invoices to owner |
| **Est. Revenue** | The contracted value of the job | Contract amount |
| **Est. Cost (Budget)** | What we budgeted to spend | WIP estimate |

**The flag system** tells you at a glance how each job is performing:

- 🟢 **On Track** — Actual GM% ≥ Estimated GM%
- 🟡 **Watch** — Costs are accumulating but no billing yet
- 🔴 **Over** — Actual GM% has dropped below Estimated GM% (spending more than planned relative to revenue)
- 🟠 **No Est. Rev.** — Job is missing an Estimated Revenue value; can't compute GM%

---

## Getting Around

The left sidebar has everything. Here's how the sections break down:

**Views**
- **Dashboard** — High-level numbers across all active jobs
- **Jobs** — The master list; click any job to open its detail page
- **Forecast** — Monthly revenue and cost forecast (used in weekly meetings)
- **Overhead Hours** — Non-job labor (vacation, training, etc.)
- **Reports** — Summary reports for billing and cost

**Enter Data**
- **Enter PO** — Log a purchase order for a job
- **Enter Invoice** — Log a vendor invoice (with or without a PO)
- **Uncommitted Costs** — Log estimated or posted costs that aren't on a PO

**Data / Imports**
- **Import WIP** — Upload WIP data from accounting system
- **Import Timecards** — Upload timecard CSV from payroll system
- **WIP Compare** — Compare estimated vs. actual costs across all jobs

---

## Daily / Weekly Workflows

### Entering a Purchase Order

Go to **Enter PO** in the sidebar.

1. Select the job from the dropdown (or type the job number)
2. Fill in vendor, PO number, and issue date
3. Add line items — each line has a description, quantity, unit cost, and (optionally) an expected ship date
4. When a vendor ships and invoices for that line item, check **Invoiced by Vendor** and enter the invoice date on that line
5. Save

> **Why line items matter:** Un-invoiced line items show as **Open Commitments** on WIP Compare and the Forecast. This is how you track material that's been ordered but not yet received — the cost is real, even if the invoice hasn't arrived.

---

### Entering an Invoice

Go to **Enter Invoice**.

Use this for:
- **Vendor invoices tied to a PO** — select the PO and the invoice will link to it
- **Direct invoices with no PO** — subcontractors, one-off purchases

Key field: **Foundation Status**
- Leave as the default until the invoice is posted in your accounting system
- Once posted, change to **Posted in Foundation** — this is what triggers the cost to appear in MTD/YTD period reports and the Period Activity table on WIP Compare

---

### Logging Uncommitted Costs

Go to **Uncommitted Costs**, or add them directly from a job's detail page under the Costs tab.

Use uncommitted costs for:
- **Future material costs** not yet on a PO (set a future cost date — it will auto-populate the Cost Forecast)
- **Labor estimates** for upcoming work
- **Anything you need to forecast but haven't committed to a PO yet**

Check **Posted to Foundation** once the cost has been recorded in your accounting system. Posted costs count toward tracked totals and period reports.

---

### Reviewing a Job

Click any job from the **Jobs** list or the **WIP Compare** table.

The Job Detail page shows:
- **Summary metrics** at the top — Est. Revenue, Est. Cost, Tracked Cost, Variance, Billed to Date, Est. GM%, Actual GM%
- **POs tab** — all purchase orders, with line item detail and invoicing status
- **Invoices tab** — vendor invoices
- **Costs tab** — uncommitted costs (with Posted toggle)
- **Billings tab** — what has been billed to the client
- **Time tab** — labor hours logged to this job
- **Documents tab** — Egnyte/URL links for plans, specs, submittals

**When a job's costs are final** (nothing more will hit it), click **Lock Costs** in the topbar. This sets the Estimated Cost equal to the actual Tracked Cost, making the variance $0 and locking in the realized GM%. You can also do this automatically when you **Mark Complete**.

---

### Entering a Client Billing

Go to **Enter Billing** (or use the + Billing button from a job's detail page).

Log each draw or invoice sent to the owner. Include the billing number, amount, and date submitted. This is what populates the **Billed to Date** and **Left to Bill** columns on WIP Compare, and it feeds the Revenue Forecast actuals.

---

## WIP Compare

**WIP Compare** is your live job cost report. It shows every active job with:

| Column | What It Means |
|---|---|
| Est. Revenue | Contracted value of the job |
| WIP Est. Cost | Your budgeted cost from the WIP estimate |
| Tracked Cost | Actual costs entered (POs + invoices + uncommitted) |
| Open Commits | PO line items ordered but not invoiced yet |
| Variance $ | Budget minus tracked cost (positive = under budget) |
| Est GM% | Estimated gross margin percentage |
| Actual GM% | Realized GM% based on actual tracked costs vs. est. revenue |
| Billed to Date | Total billed to the client |
| Left to Bill | Remaining contract value to bill |
| Flag | On Track / Watch / Over / No Est. Rev. |

> **Important:** A job can show a *positive* cost variance (under budget on cost) and still be flagged **Over** — this happens when the Actual GM% has dropped below the Estimated GM%. This is the CFO method: if you're not achieving the margin you bid, it's over budget regardless of where the cost number sits.

### Period Activity (bottom of WIP Compare)

Use the **From / To** date pickers to see billing and posted cost activity for any date range. This answers "what actually moved through the system this month?" — only billings by date submitted and costs marked Posted in Foundation appear here.

---

## Forecast (Weekly Meeting)

**Forecast** is built for your weekly project review. Open it before the meeting.

### The 6-Month Summary Cards (top)

Shows Revenue / Cost / Net for the next 6 months at a glance. Net is color-coded:
- 🟢 Green = positive margin
- 🟡 Amber = slightly negative
- 🔴 Red = significantly negative

### Revenue Forecast Table

Click any cell to enter your planned billing for a job in a given month. When a billing is actually submitted, a green ✓ amount appears below the planned figure.

### Cost Forecast Table

Costs auto-populate from uncommitted costs that have a future **cost date** (*auto* appears in italic). You can click any cell to override the number manually. Clear a cell to revert back to auto.

> **How to prepare for the weekly meeting:**
> 1. Review your active jobs and add any expected future costs as uncommitted costs with appropriate cost dates
> 2. Enter planned billings for the next 2–3 months in the Revenue Forecast
> 3. The 6-month cards will update automatically

### Pipeline Jobs

When creating a new job that hasn't been formally awarded yet, set the **Status** to **Pipeline**. Pipeline jobs:
- Show in the Forecast with a blue Pipeline badge (use the "Active + Pipeline" filter)
- Do NOT show in WIP Compare (no real costs to track yet)
- Can have forecasted revenue and costs entered just like active jobs

Change the status to **Active** once the job is awarded.

---

## Adding a New Job

Go to **Jobs → New Job**.

Required:
- **Job Number** — must be unique (e.g., 263033)
- **Job Type** — ES, Gate, Cabling, AV, Other

Strongly recommended:
- **Estimated Revenue** — without this, the system cannot compute Est. GM% or flag the job correctly on WIP Compare
- **Estimated Cost** — the budget
- **Project Manager**
- **Status** — Active (job is awarded and underway) or Pipeline (not yet awarded)

---

## Importing Timecards

Go to **Import Timecards**.

1. Export the Submitted Time Report from your payroll/time tracking system as a CSV
2. Drop the file into the upload zone — the system auto-detects the week period from the filename
3. Click **Preview Import** — you'll see a breakdown of:
   - **Project Entries** — hours matched to a job (REG, WKEN2, REGPM earn codes)
   - **Overhead Entries** — non-job hours (VAC, TRAIN, etc.) logged separately
   - **Unmatched** — entries where the job number wasn't found in the system
4. Confirm to import

> Unmatched entries are skipped. If a job number appears in the timecard but not in Cost Tracker, create the job first, then re-import.

---

## Tips

- **Always enter Estimated Revenue when creating a job.** The flag system, GM% columns, and Left to Bill are all blind without it.
- **Use cost dates intentionally.** Future-dated uncommitted costs auto-populate the Cost Forecast — this is how the system knows what's coming.
- **PO line items are more powerful than PO totals.** Line items let you track partial deliveries, mark individual items as invoiced, and see exactly what's still open.
- **Posted in Foundation = costs that count.** MTD/YTD period reports and the Period Activity table only count costs that have been marked as posted. Get in the habit of updating this when items clear accounting.
- **Lock Costs when a job is done spending.** This makes the Variance $0 and permanently records the realized GM%. You can do it independently (Lock Costs button) or as part of marking the job Complete.

---

*For questions or issues, contact your system administrator.*
