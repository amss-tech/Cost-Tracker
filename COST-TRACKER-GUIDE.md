# Tusco Cost Tracker — User Guide

## What Is This?

Cost Tracker is a job cost management system that lets you track every dollar going in and out of each project — from the moment a PO is issued to the final billing. It replaces spreadsheet-based WIP tracking and gives you a live view of where each job stands financially.

---

## Core Concepts

Before using the system, it helps to understand how costs are categorized:

| Category | What It Is | Examples |
|---|---|---|
| **Forecast Cost** | Everything spent or committed on a job (POs + invoices + uncommitted) | Used for Forecast GM% |
| **GL Cost (Actual)** | Posted costs imported directly from Foundation accounting | Source of truth for Actual GM% |
| **Open Commitments** | PO line items ordered but not yet invoiced by vendor | Equipment on order, material in transit |
| **Billings** | What has been billed to the client | Progress draws, invoices to owner |
| **Est. Revenue** | The contracted value of the job | Contract amount |
| **Est. Cost (Budget)** | What we budgeted to spend | WIP estimate |

**Two GM% metrics:**

| Metric | Based On | Where You See It |
|---|---|---|
| **Forecast GM%** | POs + invoices + uncommitted costs | Jobs list, Job Detail card 4 |
| **Actual GM% (GL)** | Foundation GL history (posted costs only) | Jobs list, Job Detail card 4 |

When GL history has been imported, both appear. Use Actual GL GM% to measure true realized margin; use Forecast GM% to see where you're trending including uncommitted costs.

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
- **Reports** — Summary reports for billing, cost, and inventory

**Enter Data**
- **Enter PO** — Log a purchase order for a job
- **Enter Invoice** — Log a vendor invoice (with or without a PO)
- **Uncommitted Costs** — Log estimated or posted costs that aren't on a PO
- **Field Report** — Submit a daily field report (technicians)

**Data / Imports**
- **Import WIP** — Upload WIP data from accounting system
- **Import Timecards** — Upload timecard CSV from payroll system
- **Import BOM** — Import a Bill of Materials from the sales team to auto-create a PO
- **Import GL History** — Import Foundation Job Detail History Report (payroll, A/P, G/J)
- **WIP Compare** — Compare estimated vs. actual costs across all jobs
- **Inventory** — Stock management: receive, issue, adjust, and track serialized items

---

## Daily / Weekly Workflows

### Entering a Purchase Order

Go to **Enter PO** in the sidebar.

1. Select the job from the dropdown (or type the job number)
2. Fill in vendor, PO number, and issue date
3. Add line items — each line has a description, quantity, unit cost, manufacturer, UOM, and (optionally) an expected ship date
4. When a vendor ships and invoices for that line item, check **Invoiced by Vendor** and enter the invoice date on that line
5. Save

> **Why line items matter:** Un-invoiced line items show as **Open Commitments** on WIP Compare and the Forecast. This is how you track material that's been ordered but not yet received — the cost is real, even if the invoice hasn't arrived.

---

### Importing a BOM

Go to **Import BOM**.

Use this when the sales team provides a Bill of Materials for a job. The system reads the standard sales BOM format (first 7 rows are project info, row 8 is the column header, data starts row 9) and auto-creates a draft PO with all line items pre-filled.

Column mapping: **A** = QTY · **B** = Name · **C** = Manufacturer · **D** = Supplier · **E** = Part # · **F** = UOM · **G** = Item Cost

1. Select the job
2. Enter a PO number and issue date
3. Drop the BOM file (XLSX or CSV) into the upload zone
4. Review the preview — confirm quantities, descriptions, manufacturers, and unit costs
5. Click **Import** — the PO and all line items are created immediately

> If you don't have the actual sales BOM format, click **Download Template** to get a correctly formatted starter file.

> **Forecast note:** BOM-imported POs (which have no ship dates on line items) will appear in the Billing Forecast using the PO's **Expected Invoice Date**. Set that date on the PO to control when the cost shows up in the monthly forecast.

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

> **Workflow tip for labor:** Use uncommitted costs to forecast labor; delete individual rows as the corresponding charges appear in the GL History import. This keeps the forecast lean and accurate over time.

---

### Reviewing a Job

Click any job from the **Jobs** list or the **WIP Compare** table.

The Job Detail page shows:

**Top cards:**
- **Est. Revenue / Revised Revenue** — contracted value including approved change orders
- **Est. Cost / Revised Budget** — budget including approved change orders
- **Forecast vs Budget** — tracked forecast cost vs. budget; sub-line shows "Forecast: $X"
- **Est. GM%** — sub-line shows both "Actual (GL): X%" and "Forecast: Y%" when GL history is present

**GL Cost Cards** (appears when GL history has been imported):
- GL Labor, GL Subcontractor, GL Travel, GL Fuel, GL Rented Equipment, GL Total
- All pulled directly from Foundation posted transactions

**Tabs:**
- **POs** — all purchase orders, with line item detail and invoicing status
- **Invoices** — vendor invoices
- **Costs** — uncommitted costs (with Posted toggle and delete button)
- **Billings** — what has been billed to the client (with correction flag button)
- **GL History** — Foundation posted transactions (payroll, A/P, G/J) with correction flag button
- **Materials** — inventory items issued to this job, including serial numbers
- **Time** — labor hours logged to this job
- **Field Reports** — daily field reports submitted by technicians
- **Documents** — Egnyte/URL links for plans, specs, submittals
- **Activity** — full audit trail of correction requests and billing requests filed on this job

**When a job's costs are final** (nothing more will hit it), click **Lock Costs** in the topbar. This sets the Estimated Cost equal to the actual Forecast Tracked Cost, making the variance $0 and locking in the realized GM%. You can also do this automatically when you **Mark Complete**.

> **Lock Costs** only appears when there are tracked costs (POs/invoices/uncommitted) AND the current tracked total differs from the estimated cost by more than $1. If the button isn't showing, either costs are $0 or they already match.

---

### Flagging a GL or Billing Row for Correction

Both the **GL History** tab and the **Billings** tab have a flag button (⚑) on each row.

Clicking it opens the **Correction Request** modal:

1. Choose the correction type:
   - **Cost move to another job** — specify destination job and amount
   - **Wrong department / cost code**
   - **Other**
2. Add a note (optional)
3. Click **Submit & Open Email** — the system logs the request to the Activity tab and opens your email client with a pre-filled message

GL corrections email → `corrections@tuscoinc.com`
Billing corrections email → `ar@tuscoinc.com`

After submitting, the row shows an amber **Correction filed** badge. The **Activity** tab on that job shows the full history of all requests.

---

### Importing GL History from Foundation

Go to **Import GL History**.

Use this to import the **Job Detail History Report** from Foundation (export as CSV). The system reads payroll (P/R), accounts payable (A/P), and general journal (G/J) rows and stores them in the GL History tab for each job.

**Re-import strategy:** Each import deletes all existing GL rows for the selected jobs and replaces them with the new data. This means each import is a clean snapshot — run it regularly (weekly or after each Foundation posting period) to keep GL data current.

After importing:
- GL cost cards appear on the Job Detail header
- The **Actual GM% (GL)** column populates in the Jobs list
- The **Est. Cost** sub-line on Card 3 shows GL total when GL history is present

---

### Entering a Client Billing

Go to **Enter Billing** (or use the + Billing button from a job's detail page).

Log each draw or invoice sent to the owner. Include the billing number, amount, and date submitted. This is what populates the **Billed to Date** and **Left to Bill** columns on WIP Compare, and it feeds the Revenue Forecast actuals.

---

### Submitting a Field Report (Technicians)

Go to **Field Report** in the sidebar.

1. Select the job
2. Enter the report date, your name, start/end times, and crew size
3. Write a summary of work completed
4. Click **Submit**

Field reports appear in the **Field Reports** tab on the job's detail page. Foremen and PMs can review them without leaving the app.

---

## Inventory

Go to **Inventory** in the sidebar.

Inventory tracks physical stock in your warehouse — quantities on hand, where items went, and the lifecycle of serialized equipment.

### Transactions

- **Receive** — stock arrives from a supplier; increases quantity on hand
- **Issue** — stock goes out to a job; decreases quantity on hand and records the job assignment
- **Adjust** — manual correction (cycle count, damage, etc.)

### Serialized Items

For high-value equipment with individual serial numbers (panels, cameras, etc.), enable **Serialized** on the item. Each serial number has a lifecycle:
- **In Stock** — in the warehouse
- **Installed** — issued to a job

Use the **Installed Serials** tab to look up any serial number and see which job it's on.

### Importing Inventory

Use the **XLSX Import** button to bulk-load stock items. Download the template for the correct column format.

### Field Report Integration

When a technician submits a field report, they can log materials used. This automatically issues those items from inventory and records any serial numbers. The **Materials** tab on the job's detail page shows all issued items.

### Inventory Reports

Under **Reports → Inventory**:
- **Stock Valuation** — current on-hand value by item
- **Usage by Job** — how much inventory each job consumed (with drill-down)
- **Installed Serials** — where every serialized item ended up

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

Costs auto-populate from three sources (*auto* appears in italic):
- **Pass A** — PO line items with an `estimated_ship_date` → placed in that month
- **Pass B** — POs with no line items and an `expected_invoice_date` → placed in that month
- **Pass C** — BOM-imported line items (no ship date) → fall back to the parent PO's `expected_invoice_date`

You can click any cell to override the number manually. Clear a cell to revert back to auto.

> **How to prepare for the weekly meeting:**
> 1. Review your active jobs and add any expected future costs as uncommitted costs with appropriate cost dates
> 2. Set `Expected Invoice Date` on BOM-imported POs to control when those costs appear in the forecast
> 3. Enter planned billings for the next 2–3 months in the Revenue Forecast
> 4. The 6-month cards will update automatically

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
- **Set Expected Invoice Date on BOM-imported POs.** Without it, BOM line items won't appear in the monthly cost forecast.
- **PO line items are more powerful than PO totals.** Line items let you track partial deliveries, mark individual items as invoiced, and see exactly what's still open.
- **Posted in Foundation = costs that count.** MTD/YTD period reports and the Period Activity table only count costs that have been marked as posted. Get in the habit of updating this when items clear accounting.
- **Import GL History regularly.** The Actual GM% column and GL cost cards only reflect what's been imported. Run a fresh import after each Foundation posting period.
- **Use correction flags immediately.** If you spot a mis-coded GL entry or a billing dispute, flag it right away. The Activity tab gives you a permanent record of what was filed and when.
- **Lock Costs when a job is done spending.** This makes the Variance $0 and permanently records the realized GM%. You can do it independently (Lock Costs button) or as part of marking the job Complete.

---

*For questions or issues, contact your system administrator.*
