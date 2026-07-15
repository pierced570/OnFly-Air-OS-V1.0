# CHUNK 5 — Client Portal, Request Form, QuickBooks, Manifests

**Objective:** clients self-serve — request trips through the portal, watch them live, and receive invoices generated from QuickBooks automatically. The manifest generator closes the document set.

## 1. Client portal (M9)

- **Auth: Supabase magic links** (email OTP), scoped to `client_contacts.email`. RLS policies: portal users read only their client's trips/documents (`client_id` match via a `portal_users` mapping view); no operator cost, margin, or operator identity columns exposed — create **safe views** (`portal_trips`, `portal_legs`, `portal_documents`) and grant portal role only those. Never ship raw tables to the portal.
- **Light premium theme** (cream/white, black headers, gold accents — the client-doc family, `data-theme="client"`).
- Pages: **Active trips** (cards: state chip, next milestone, live ETA) · **Trip detail** = the tracker: ETA chain rendered stop-by-stop in stop-local time, est vs actual, status pushes timeline, documents (quote, ETA sheet, invoice, POD when delivered) · **History** with search · **Request a trip**.
- Distribution list behavior: `supply_chain` contacts get tracker links + status pushes; `ap` contacts get invoices only; `requester` sees request form + their trips.

## 2. Request form (feeds M2)

One page, sections: (1) What — cargo/pax toggle; pieces editor (same dims parser component as dispatch, plus per-piece rows: count, L×W×H in, weight ea, stackable toggle); pax count/names optional; (2) Where — pickup: address OR airport (autodetect, multiple pickups allowed → additional stops); destination same; A2A/D2D badge auto-shows; (3) When — ready time (their local, auto-zone from address), hard deadline toggle + time; (4) Details — hazmat (triggers DG note), declared value, forklift needed, temp control, PO/reference, notes. Submit → draft trip with `client_rules` pre-attached + requester identity → **instant-quote path runs automatically** → on-shift dispatcher notified with review link; if the estimate needs no touch-ups (all confidence high), dispatcher one-tap approves and the client sees "estimate arriving now" — target under 5 minutes from portal submit to estimate email even with the human gate.

## 3. QuickBooks (`src/adapters/accounting/`)

```ts
interface AccountingAdapter { ensureCustomer(client): qbId; createInvoice(trip, quote): {qbInvoiceId, url};
  invoiceStatus(qbInvoiceId): 'sent'|'viewed'|'paid'; }
```
- Mock first (fake IDs, simulator panel). Real: QuickBooks Online API — OAuth2 (Intuit developer app; store refresh token as Supabase secret; token refresh in the edge function `qb-sync`), `Invoice` create with line items: air transportation (+ FET tax lines exactly as quoted — map `tax_breakdown`), ground handling separate line, terms NET30 default from `clients.billing_terms`.
- Trigger: `transition(delivered)` → generate invoice from the locked hard quote + any dispatcher-approved adjustments (wait time actually used at the quoted wait rate — adjustment UI with reason required) → send to `ap` contacts → `transition(invoiced)`. `paid` webhook/poll → `closed`.
- **This is the fiddliest integration — timebox the OAuth plumbing, keep the mock as fallback, never block delivery flow on QB availability (queue + retry).**

## 4. Load manifest generator (M10)

Render from trip state at booking (regenerate on payload edits): OnFly header (black/gold), trip ref, aircraft type + tail, operator (this doc is internal/crew-facing — carrier appears here), pieces table (dims, weight ea, total, stackable, hazmat UN class if flagged), total payload vs available payload check line, origin/dest FBO blocks (name, phone, after-hours), ETA chain summary, emergency contacts (24/7 dispatch). Distribute to crew + handlers via thread as PDF link at booking.

## 5. Document polish

Move quote/ETA-sheet/manifest rendering to a single `render-doc` edge function (HTML→PDF via headless engine — evaluate `@sparticuz/chromium` + puppeteer on Vercel function instead if cold starts hurt; keep interface stable). All docs stored in Supabase storage under `trips/<id>/`, rows in `documents`.

## Acceptance checklist

- [ ] Magic-link login as a seeded client contact → sees only their trips; SQL probe confirms RLS blocks cross-client reads and never exposes cost/margin/operator columns
- [ ] Portal request (D2D, 2 pickups, hazmat) → draft trip with rules attached → estimate emailed after dispatcher one-tap, wall time < 5 min in rehearsal
- [ ] Delivered trip → QB mock invoice with FET lines matching the stored tax_breakdown → AP contact receives it; supply_chain contact got tracker, never the invoice
- [ ] Wait-time adjustment flows into the invoice with reason logged in trip_events
- [ ] Manifest PDF renders with real piece data + payload check; posted to the thread at booking
- [ ] Real QBO sandbox invoice created behind `ACCOUNTING_PROVIDER=quickbooks` flag
