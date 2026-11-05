# Plaz4 IP — Patent Portfolio Manager

## Project Overview

Full-stack patent portfolio management application. Tracks US and EP patents, applications, patent families, maintenance fees/deadlines, continuation relationships, and USPTO file wrapper documents.

**Local path:** `/Users/rjohn/dev/patent-app`  
**Deploy:** Vercel  
**Stack:** Next.js 14 · PostgreSQL (Supabase) · Prisma ORM · Tailwind CSS · D3.js  

---

## Architecture

### Infrastructure

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js | 14.1.0 |
| Language | TypeScript | ^5 |
| Database | PostgreSQL via Supabase | — |
| ORM | Prisma | ^5.10 |
| Hosting | Vercel | — |
| Styling | Tailwind CSS | ^3.3 |

**Supabase** provides managed PostgreSQL + Auth + Storage. Prisma requires two connection strings:
- `DATABASE_URL` — pooled (PgBouncer) for runtime queries
- `DIRECT_URL` — direct connection for `prisma db push` / migrations

Auth: `middleware.ts` enforces a Supabase session on every page and API route except the `PUBLIC_PATHS` / `PUBLIC_API` lists. Routes in `PUBLIC_API` that aren't meant to be public (`/api/cron/*`, `/api/mcp`) check their own bearer token. `User.supabaseId` bridges to Supabase Auth.

**Prisma** uses `db push` (no migration history). Schema-first, no migration files checked in. `prisma generate` runs at build time via `"build": "prisma generate && next build"`.

### UI Components

**Radix UI primitives** (headless, unstyled) — no shadcn/ui, components are hand-rolled with Tailwind:

| Package | Version | Used for |
|---|---|---|
| `@radix-ui/react-alert-dialog` | ^1.0.5 | Destructive confirmation dialogs |
| `@radix-ui/react-dialog` | ^1.0.5 | Modals / drawers |
| `@radix-ui/react-dropdown-menu` | ^2.0.6 | Context menus, action menus |
| `@radix-ui/react-select` | ^2.0.0 | Styled select dropdowns |
| `@radix-ui/react-tabs` | ^1.0.4 | Tab panels |
| `@radix-ui/react-tooltip` | ^1.0.7 | Hover tooltips |

Utility packages: `clsx ^2.1.0` + `tailwind-merge ^2.2.1` (combined as `cn()`), `lucide-react ^0.323.0` (icons), `react-hot-toast ^2.4.1` (toasts).

### Data & Visualization

| Package | Version | Purpose |
|---|---|---|
| `d3` | ^7.9.0 | Patent family / continuity tree (`FamilyTree.tsx`) |
| `date-fns` | ^3.3.1 | Date arithmetic for maintenance fee calculations |
| `xlsx` | ^0.18.5 | Excel export |
| `xml2js` | ^0.6.2 | USPTO XML parsing (claims documents) |
| `zod` | ^3.22.4 | Runtime validation on API inputs |

### AI Integration

`@anthropic-ai/sdk ^0.78.0` — Claude API for watchlist portfolio analysis. Called server-side from API routes only.

### Key Architectural Decisions

1. **Radix + hand-rolled components** — no shadcn. More control over dark theme; more boilerplate.
2. **Prisma `db push` not migrations** — faster iteration, no migration history. Schema rollbacks require manual SQL.
3. **External API proxy pattern** — USPTO PDF downloads require an API key that can't be set from browser `<a>` tags. Server-side proxy route adds the header and streams the PDF back.
4. **`rawJsonData` caching** — slimmed USPTO response stored as `Json?` on Patent model to avoid re-fetching. Live fetch is the fallback when empty.
5. **Self-relation for continuations** — `Patent.parentPatentId` → self-relation `"PatentContinuations"` enables recursive tree queries.
6. **Session middleware + per-route bearer tokens** — `middleware.ts` gates pages/APIs on a Supabase session; machine callers (Vercel Cron, MCP clients) are exempted there and authenticate with their own secret.

---

## Environment Variables

```
DATABASE_URL=               # Supabase pooled connection (Prisma runtime)
DIRECT_URL=                 # Supabase direct connection (Prisma migrations/db push)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
USPTO_API_KEY=              # USPTO Open Data Portal API key (optional but recommended)
EPO_OPS_KEY=                # EPO Open Patent Services consumer key
EPO_OPS_SECRET=             # EPO OPS consumer secret
NEXT_PUBLIC_APP_URL=        # e.g. https://your-app.vercel.app (for invite links)
CRON_SECRET=                # Shared secret for /api/cron/* routes; Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`
RESEND_API_KEY=             # Resend API key, used by lib/email.ts for activity digest emails
EMAIL_FROM=                 # Verified sender, e.g. "Plaz4 IP <digest@mail.yourdomain.com>"
MCP_API_KEY=                # Bearer token for /api/mcp (Claude MCP connector). Endpoint returns 401 for everyone if unset
```

---

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:push      # Push schema changes to DB (no migration history)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:studio    # Open Prisma Studio
```

---

## Directory Structure

```
app/
  dashboard/          # Main dashboard with portfolio stats
  patents/            # Patent list + [id] detail page (tabbed)
  patents/[id]/       # Detail: Overview, Claims, History (Events+Docs), Family Tree, Fees
  families/           # Patent family list + [id] detail
  families/[id]/      # Family detail with D3 tree
  manage/             # Data management: Patents table + Continuity Tree tab
  import/             # Import US patent by application number
  lookup/             # USPTO patent lookup
  ep-lookup/          # EPO patent lookup
  applications/       # Tracked applications (continuations being monitored)
  deadlines/          # Upcoming maintenance fee deadlines
  reports/            # PDF report generation
  settings/           # Team management (members, roles, invites)
  invite/[token]/     # Standalone invite acceptance page (no sidebar)

  api/
    dashboard/        # GET: portfolio stats (counts, upcoming deadlines)
    patents/          # GET (list+filter), POST (create)
    patents/[id]/     # GET, PATCH, DELETE
    patents/[id]/events/      # GET: USPTO prosecution history events
    patents/[id]/documents/   # GET: USPTO file wrapper documents (stored or live)
    patents/[id]/documents/[docId]/download/  # GET: proxy download with X-Api-Key
    patents/[id]/claims/      # GET: parsed claims
    patents/[id]/continuity/  # GET: parent/child continuation data
    patents/[id]/tree/        # GET: D3 tree data for family visualization
    patents/[id]/generate-fees/  # POST: generate maintenance fee schedule
    patents/refresh/          # GET: refresh single patent from USPTO ODP
    patents/lookup/           # GET: USPTO patent lookup by number
    patents/ep-lookup/        # GET: EPO OPS lookup
    patents/import-application/  # POST: import continuation/divisional application
    patents/import/           # POST: bulk import
    families/                 # GET, POST
    families/[id]/            # GET, PATCH, DELETE
    fees/                     # GET all fees
    fees/[id]/                # PATCH (update status/paidDate)
    deadlines/                # GET upcoming deadlines
    reports/generate/         # POST: generate PDF report
    team/                     # GET: members + pending invites
    team/invite/              # POST: create invite (7-day expiry)
    team/invite/[id]/         # DELETE: revoke invite
    team/invite/accept/       # GET: validate token; POST: accept + create user
    team/members/[id]/        # PATCH: update role; DELETE: remove member
    activity/                 # GET: portfolio activity summary (?period=, ?format=html for digest)
    settings/activity-subscription/  # GET, PATCH: current user's digest subscription
    cron/refresh-patents/     # GET (CRON_SECRET-guarded): daily bulk USPTO/EPO refresh
    cron/activity-digest/     # GET (CRON_SECRET-guarded): sends due weekly/monthly digest emails
    mcp/                      # GET/POST/DELETE (MCP_API_KEY-guarded): read-only MCP server for Claude

components/
  Sidebar.tsx         # Navigation sidebar with "Plaz4 IP" branding, p4-icon.png
  FamilyTree.tsx      # D3 tree visualization for patent family/continuity

lib/
  prisma.ts           # Prisma client singleton
  uspto-api.ts        # calculateMaintenanceFees() and USPTO helpers
  pdf-builder.ts      # Pure-TypeScript PDF generation (no npm packages)
  patent-refresh.ts   # USPTO/EPO refresh logic; refreshAllPatents() used by /manage and the daily cron
  activity.ts         # buildActivitySummary()/buildEmailHtml() — shared by /api/activity and the digest cron
  email.ts            # sendEmail() — thin Resend wrapper
  mcp-server.ts       # createMcpServer() — MCP tool definitions served by /api/mcp
  patent-search.ts    # patentSearchConditions() — free-text patent search, shared by /api/patents and MCP
  claims-text.ts      # claimsToText() — flattens claimsJson into Patent.claimsText (synced in lib/prisma.ts)

public/
  p4-icon.png         # App icon (white background)
  fonts/Sansation-Regular.ttf  # Brand font for page titles
```

---

## Branding & Design

- **App name:** Plaz4 IP
- **Brand colors:** `--p4-blue: #1A5BC5`, `--p4-purple: #5B2D9E`
- **Button gradient:** `#1E64D4` → `#6333AE` (blue to purple)
- **Title font:** Sansation (local TTF, weight 400, letter-spacing -0.02em) via `next/font/local`
- **Body font:** DM Sans; **Mono font:** DM Mono
- **Theme:** Dark UI. Key CSS vars: `--patent-sky`, `--patent-text`, `--patent-muted`
- **Card class:** `.card` · **Button classes:** `.btn-primary`, `.btn-secondary`, `.btn-ghost`

---

## Critical Next.js 15 Patterns

**API routes — `params` is a Promise:**
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

**Client pages — use plain destructure (NOT `use()`):**
```typescript
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params
  // ...
}
```

---

## USPTO ODP API

**Base URL:** `https://api.uspto.gov/api/v1/patent/applications`  
**Auth header:** `X-Api-Key: ${USPTO_API_KEY}` (add via `odpHeaders()` helper in refresh route)

### Key endpoints

```
GET /search?q=applicationMetaData.patentNumber:12345678&limit=1
GET /search?q=applicationNumberText:18336362&limit=1
GET /{appNum}/continuity        → { patentFileWrapperDataBag: [{ parentContinuityBag, childContinuityBag }] }
GET /{appNum}/documents         → { count, documentBag: [...] }   ← TOP LEVEL, not nested
```

### Search response shape
```json
{
  "patentFileWrapperDataBag": [{
    "applicationNumberText": "18336362",
    "applicationMetaData": {
      "applicationStatusDescriptionText": "Patented Case",
      "patentNumber": "12345678",
      "inventionTitle": "...",
      "filingDate": "2023-06-16",
      "grantDate": "2025-03-04",
      "inventorBag": [{ "inventorNameText": "Smith, John" }],
      "applicantBag": [{ "applicantNameText": "Acme Corp" }]
    },
    "eventDataBag": [{ "eventCode": "CTNF", "eventDate": "2024-01-03", "eventDescriptionText": "..." }],
    "parentContinuityBag": [{ "applicationNumberText": "17000000", "continuityTypeCategory": "CONTINUATION" }],
    "childContinuityBag": []
  }]
}
```

### Documents response shape
```json
{
  "count": 49,
  "documentBag": [{
    "documentIdentifier": "da9f19df-...",
    "documentCode": "CTNF",
    "documentCodeDescriptionText": "Non-Final Rejection",
    "officialDate": "2024-01-03T00:00:00.000-0500",
    "directionCategory": "OUTGOING",
    "downloadOptionBag": [{
      "mimeTypeIdentifier": "PDF",
      "downloadUrl": "https://api.uspto.gov/api/v1/download/applications/18336362/...",
      "pageTotalQuantity": 7
    }]
  }]
}
```
- `directionCategory`: `OUTGOING` (USPTO→applicant), `INCOMING` (applicant→USPTO), `INTERNAL` (examiner notes)
- PDF download URL requires `X-Api-Key` header — use the proxy route `/api/patents/[id]/documents/[docId]/download?url=...`

---

## rawJsonData Storage Pattern

Refresh stores a **slimmed** version of the USPTO search response plus documents in `rawJsonData` (Json field):

```typescript
// Written by /api/patents/refresh on every USPTO refresh:
rawJsonData = {
  count: 1,
  patentFileWrapperDataBag: [{
    applicationNumberText,
    applicationMetaData: { /* key fields only, no bulky attorney/correspondence bags */ },
    eventDataBag: [...],          // prosecution history events
    parentContinuityBag: [...],
    childContinuityBag: [...],
  }],
  documentBag: [                  // normalized — NO downloadOptionBag here
    {
      documentIdentifier,
      documentCode,
      documentCodeDescriptionText,
      officialDate,
      directionCategory,
      pageCount,          // already extracted from downloadOptionBag.pageTotalQuantity
      downloadUrl,        // already extracted from downloadOptionBag.downloadUrl
      mimeType,
    }
  ]
}
```

**Key rule:** `documentBag` in `rawJsonData` is **already normalized** (no `downloadOptionBag`). When serving documents, pass stored docs through as-is. Only documents from a **live** USPTO fetch need `normalizeRaw()` to extract from `downloadOptionBag`.

---

## Document Download Proxy

Direct USPTO download URLs return 403 without an API key. Browser fetch can't set custom headers on `<a href>` clicks.

**Solution:** Server-side proxy at `/api/patents/[id]/documents/[docId]/download`
- Accepts `?url=<encodedUsptoPdfUrl>`
- Validates URL starts with `https://api.uspto.gov/`
- Adds `X-Api-Key` header server-side
- Streams PDF back to browser

**Usage in UI:**
```typescript
const proxyUrl = `/api/patents/${patentId}/documents/${doc.documentIdentifier}/download?url=${encodeURIComponent(doc.downloadUrl)}`
```

---

## EPO OPS API

**Auth:** OAuth2 client credentials → `https://ops.epo.org/3.2/auth/accesstoken`  
**Base URL:** `https://ops.epo.org/3.2/rest-services`  
**EP number format:** Strip leading zeros, no `EP` prefix (e.g. `3456789` not `EP03456789`)

---

## Prisma Schema Key Points

- `Patent.applicationNumber` — stored digits-only, no slashes/commas (e.g. `18336362` not `18/336,362`)
- `Patent.jurisdiction` — `String?` defaulting to `"US"`, not an enum. Values: `"US"`, `"EP"`
- `Patent.parentPatentId` → self-relation `"PatentContinuations"` for continuation trees
- `Patent.continuationType` — `ContinuationType?` enum: `CONTINUATION`, `CONTINUATION_IN_PART`, `DIVISIONAL`, `REISSUE`, `REEXAMINATION`
- `Patent.source` — `PatentSource` enum: `PORTFOLIO` (manually added), `CONTINUATION` (tracked from continuity tab)
- `Patent.rawJsonData` — `Json?` field storing slimmed USPTO response + documentBag (see above)
- `Invite` model requires `npm run db:push` if not yet applied — has `token`, `status (InviteStatus)`, `expiresAt`
- `ActivitySubscription` — one per `User` (`@@unique userId`), drives the portfolio activity digest email. `frequency (DigestFrequency: WEEKLY|MONTHLY)`, `onlyIfActivity` (skip sending if nothing happened that period), `lastSentAt` (advances every due period regardless of whether an email was actually sent)

---

## Team / Invite Flow

1. Settings page → Invite Member → creates `Invite` record via `POST /api/team/invite` → returns `inviteUrl`
2. Invite link: `${NEXT_PUBLIC_APP_URL}/invite/{token}`
3. `/invite/[token]` page — standalone (no sidebar), validates token via `GET /api/team/invite/accept?token=...`
4. On submit → `POST /api/team/invite/accept` creates `User` record + marks invite `ACCEPTED`
5. **Pending:** Supabase Auth credential creation not yet wired — currently creates DB user only

---

## Patent Detail Page Tabs

`/patents/[id]` has these tabs: **Overview** · **Claims** · **History** · **Family** · **Fees**

**History tab** has two panels toggled by a switcher:
- **Events** — prosecution history from `eventDataBag`, grouped by year, filterable by category and year
- **Documents** — file wrapper documents from `documentBag`, reverse chronological, with proxy download links

**Family tab** uses `FamilyTree.tsx` (D3) — known fix: declare `nodeCount` before using it in `innerH` calculation.

---

## Manage Data Page Tabs

`/manage` has two tabs:

**Patents** — table with inline editing (status, type, assignee, family, expiry) + bulk USPTO refresh with progress bar

**Continuity Tree** — builds parent→child tree from `parentPatentId` across all patents. Shows ROOT badges at top level, continuation type badges (CON/CIP/DIV/REI/REX) for children, collapsible branches, search filter.

---

## PDF Generation

Uses a custom pure-TypeScript `PDFBuilder` class in `lib/pdf-builder.ts`. No npm PDF packages, no subprocesses. Raw PDF 1.4 syntax.  
The `@react-pdf/renderer` package is also installed but PDFBuilder is the primary approach.

---

## Scheduled Jobs (Vercel Cron)

`vercel.json` defines two daily cron jobs, both guarded by `CRON_SECRET` (checked against the `Authorization: Bearer` header Vercel sends automatically for its own cron invocations when that env var is set):

- **`GET /api/cron/refresh-patents`** — `10:00 UTC` (~6am Eastern, drifts ±1hr with DST since Vercel Cron schedules are fixed-UTC). Calls `refreshAllPatents()` from `lib/patent-refresh.ts` — the same bulk-refresh logic the `/manage` page's button triggers via `POST /api/patents/refresh`.
- **`GET /api/cron/activity-digest`** — `10:30 UTC`, 30 min after the refresh so digests reflect same-morning data. Walks every enabled `ActivitySubscription`, and for each one whose weekly/monthly window has elapsed, builds a summary via `buildActivitySummary()` (`lib/activity.ts` — shared with `/api/activity` and the in-app Activity page) and emails it through `lib/email.ts` (Resend) if there was activity or `onlyIfActivity` is off. `lastSentAt` always advances on a due check, whether or not an email was actually sent, so cadence stays fixed to the chosen frequency.

Users manage their own subscription from **Settings → Portfolio Activity Digest** (`GET`/`PATCH /api/settings/activity-subscription`).

---

## MCP Server (Claude connector)

`/api/mcp` is a stateless Streamable-HTTP MCP endpoint (`@modelcontextprotocol/sdk`, `WebStandardStreamableHTTPServerTransport`) that lets Claude query the portfolio. Read-only tools, defined in `lib/mcp-server.ts`: `portfolio_overview`, `search_patents`, `get_patent`, `get_claims`, `get_prosecution_history`, `list_families`, `get_family`, `upcoming_fees`, `recent_activity`, `list_watchlists`, `get_watchlist`. Patent tools accept an internal id or any patent / application / EP / publication number format.

Auth is a single shared `MCP_API_KEY` bearer token (no per-user OAuth yet, so it can't be added as a claude.ai custom connector). Connect from Claude Code:

```bash
claude mcp add --transport http plaz4-ip https://<app-url>/api/mcp --header "Authorization: Bearer $MCP_API_KEY"
```

---

## Known Issues / TODOs

- Supabase Auth not wired to invite flow (user record created but no auth credential)
- MCP endpoint uses one shared key — add OAuth (Supabase) for per-user access and claude.ai connector support
- Documents tab populated on first load only if patent has been refreshed after document fetching was added; otherwise falls back to live USPTO fetch
- `FamilyTree.tsx` — `nodeCount` must be declared before `innerH` (already fixed)
