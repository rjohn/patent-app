'use client'

import { useState, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import {
  BookOpen, LayoutDashboard, FileText, GitBranch, CalendarClock,
  Banknote, Eye, BarChart3, SearchCode, Upload, Database,
  Settings, ChevronDown, ChevronRight, Search, ExternalLink,
  Info, AlertTriangle, CheckCircle2, Lightbulb,
} from 'lucide-react'
import { useTheme } from '@/context/theme-context'

const SECTIONS = [
  { id: 'overview',      label: 'Overview',              icon: BookOpen },
  { id: 'dashboard',     label: 'Dashboard',             icon: LayoutDashboard },
  { id: 'patents',       label: 'Patents',               icon: FileText },
  { id: 'patent-detail', label: 'Patent Detail Tabs',    icon: FileText },
  { id: 'families',      label: 'Patent Families',       icon: GitBranch },
  { id: 'deadlines',     label: 'Deadlines & Fees',      icon: CalendarClock },
  { id: 'legal-fees',   label: 'Legal Fees',            icon: Banknote },
  { id: 'watchlists',   label: 'Watchlists',            icon: Eye },
  { id: 'reports',      label: 'Reports',               icon: BarChart3 },
  { id: 'add-patent',   label: 'Adding Patents',        icon: SearchCode },
  { id: 'manage',       label: 'Manage Data',           icon: Database },
  { id: 'settings',     label: 'Settings & Team',       icon: Settings },
]

function Note({ type = 'info', children }: { type?: 'info' | 'tip' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info:    { border: 'rgba(74,144,217,0.4)',  bg: 'rgba(74,144,217,0.08)',  icon: Info,          color: 'var(--patent-sky)' },
    tip:     { border: 'rgba(74,222,128,0.4)',  bg: 'rgba(74,222,128,0.08)',  icon: Lightbulb,     color: '#4ade80' },
    warning: { border: 'rgba(251,191,36,0.4)',  bg: 'rgba(251,191,36,0.08)', icon: AlertTriangle, color: '#fbbf24' },
  }
  const s = styles[type]
  const Icon = s.icon
  return (
    <div className="flex gap-3 rounded-lg p-3 my-3 text-sm" style={{ border: `1px solid ${s.border}`, background: s.bg }}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: s.color }} />
      <div className="text-patent-muted leading-relaxed">{children}</div>
    </div>
  )
}

function Section({ id, title, icon: Icon, children }: {
  id: string; title: string; icon: React.ElementType; children: React.ReactNode
}) {
  const { theme } = useTheme()
  const light = theme === 'light'
  return (
    <section id={id} className="scroll-mt-8 mb-12">
      <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: `1px solid ${light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}` }}>
        <div className="p-2 rounded-lg" style={{ background: 'rgba(74,144,217,0.15)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: light ? '#1A1A2E' : 'white' }}>{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-patent-muted">
        {children}
      </div>
    </section>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  return <h3 className="font-semibold text-sm mt-5 mb-1.5" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>{children}</h3>
}

function KBD({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded text-xs font-mono"
      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
      {children}
    </kbd>
  )
}

function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: 'blue' | 'green' | 'purple' | 'yellow' }) {
  const colors = {
    blue:   { bg: 'rgba(74,144,217,0.15)',  text: 'var(--patent-sky)' },
    green:  { bg: 'rgba(74,222,128,0.15)',  text: '#4ade80' },
    purple: { bg: 'rgba(99,51,174,0.25)',   text: '#c084fc' },
    yellow: { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24' },
  }
  const c = colors[color]
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  )
}

export default function HelpPage() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [activeSection, setActiveSection] = useState('overview')
  const [search, setSearch] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const filteredSections = SECTIONS.filter(s =>
    !search || s.label.toLowerCase().includes(search.toLowerCase())
  )

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex overflow-hidden">

        {/* Left TOC */}
        <aside className="w-52 flex-shrink-0 flex flex-col overflow-y-auto py-6 px-3"
          style={{
            borderRight: `1px solid ${light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
            background: light ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.15)',
          }}>
          <div className="label px-2 mb-3">Contents</div>
          <div className="relative mb-3">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-patent-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter…"
              className="input text-xs py-1.5 pl-7 w-full"
            />
          </div>
          <nav className="space-y-0.5">
            {filteredSections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${
                  activeSection === id ? 'font-medium' : ''
                }`}
                style={{
                  color: activeSection === id ? 'var(--patent-sky)' : 'var(--patent-muted)',
                  background: activeSection === id ? 'rgba(74,144,217,0.1)' : 'transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">

            {/* Page header */}
            <div className="mb-10">
              <h1 className="text-2xl font-semibold mb-1" style={{
                fontFamily: 'var(--font-display), sans-serif',
                color: light ? '#1A1A2E' : 'white',
              }}>
                Help & Documentation
              </h1>
              <p className="text-patent-muted text-sm">
                A guide to using Plaz4 IP — your patent portfolio manager.
              </p>
            </div>

            {/* OVERVIEW */}
            <Section id="overview" title="Overview" icon={BookOpen}>
              <p>
                Plaz4 IP is a patent portfolio management tool for tracking US and European patents,
                patent families, maintenance fee deadlines, prosecution history, and continuation
                relationships. It syncs data from the USPTO Open Data Portal (ODP) and the EPO
                Open Patent Services (OPS) APIs.
              </p>
              <H3>Key concepts</H3>
              <ul className="space-y-1.5 list-none">
                <li><span className="font-medium" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>Patent</span> — a US or EP patent or application record in your portfolio.</li>
                <li><span className="font-medium" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>Family</span> — a group of related patents (e.g. US + EP counterparts for the same invention).</li>
                <li><span className="font-medium" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>Continuity</span> — the parent/child continuation chain (CON, CIP, DIV, etc.).</li>
                <li><span className="font-medium" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>Maintenance Fee</span> — periodic USPTO fees required to keep a granted patent in force.</li>
                <li><span className="font-medium" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>Watchlist</span> — a saved search that monitors competitor or technology patents.</li>
              </ul>
              <Note type="info">
                Data is pulled live from USPTO and EPO on demand. Use the <strong>Refresh</strong> button on a patent to fetch the latest prosecution events and documents.
              </Note>
            </Section>

            {/* DASHBOARD */}
            <Section id="dashboard" title="Dashboard" icon={LayoutDashboard}>
              <p>
                The Dashboard gives a real-time snapshot of your portfolio health. It loads automatically on sign-in.
              </p>
              <H3>Stats cards</H3>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Total Patents</strong> — all records regardless of status.</li>
                <li><strong>Granted / Pending / Abandoned</strong> — counts by status.</li>
                <li><strong>Families</strong> — number of patent families.</li>
                <li><strong>Upcoming Deadlines</strong> — maintenance fees due within 90 days.</li>
                <li><strong>Overdue</strong> — fees past their due date.</li>
                <li><strong>Expiring this year</strong> — patents whose 20-year term ends in the current calendar year.</li>
              </ul>
              <H3>Recent Deadlines</H3>
              <p>
                The deadline list uses color-coded urgency:
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge color="yellow">Overdue</Badge>
                <span className="text-xs self-center">past due date</span>
                <Badge color="yellow">≤ 14 days</Badge>
                <span className="text-xs self-center">critical</span>
                <Badge color="blue">≤ 30 days</Badge>
                <span className="text-xs self-center">urgent</span>
                <Badge color="green">≤ 60 days</Badge>
                <span className="text-xs self-center">upcoming</span>
              </div>
              <H3>Recent Patents</H3>
              <p>Lists the most recently added patents. Click any row to open the patent detail page.</p>
              <Note type="tip">
                Click the <strong>Refresh</strong> icon on the dashboard to re-fetch all stats without a full page reload.
              </Note>
            </Section>

            {/* PATENTS */}
            <Section id="patents" title="Patents" icon={FileText}>
              <p>
                The Patents list (<strong>/patents</strong>) shows all patents and applications in your portfolio with filtering and sorting.
              </p>
              <H3>Filtering</H3>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  Search matches any part of the text in these fields (not case-sensitive):
                  title, abstract, <strong>claims</strong>, patent / application / publication / EP number,
                  docket number, assignee, <strong>inventor</strong> names, and <strong>CPC codes</strong>.
                </li>
                <li>Filter by <Badge color="blue">Status</Badge> (Granted, Pending, Abandoned, Expired, Published).</li>
                <li>Filter by <Badge color="purple">Type</Badge> (Utility, Design, Plant, PCT, …).</li>
                <li>Filter by <Badge color="green">Jurisdiction</Badge> (US / EP).</li>
                <li>Filter by <Badge color="blue">Family</Badge>.</li>
              </ul>
              <Note type="tip">
                Partial matches work — <code className="mono">smith</code> finds inventor “Smith, John”, and{' '}
                <code className="mono">A61B</code> finds every patent with a CPC code in that class.
                Claim text is searchable once a patent&apos;s claims have been loaded — by a refresh or by
                opening its Claims tab.
              </Note>
              <H3>Status badges</H3>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge color="green">GRANTED</Badge>
                <Badge color="blue">PENDING</Badge>
                <Badge color="yellow">PUBLISHED</Badge>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>ABANDONED</span>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>EXPIRED</span>
              </div>
              <H3>Adding a patent</H3>
              <p>
                Use <strong>Add Patent</strong> in the sidebar (USPTO lookup) or <strong>Import Data</strong> for bulk imports.
                See the <button className="underline text-patent-sky cursor-pointer bg-transparent border-none p-0" onClick={() => scrollTo('add-patent')}>Adding Patents</button> section for details.
              </p>
              <Note type="info">
                Application numbers are stored digits-only (e.g. <code className="mono">18336362</code>, not <code className="mono">18/336,362</code>).
              </Note>
            </Section>

            {/* PATENT DETAIL TABS */}
            <Section id="patent-detail" title="Patent Detail Tabs" icon={FileText}>
              <p>
                Click any patent to open its detail page. There are five tabs across the top.
              </p>

              <H3>Overview tab</H3>
              <p>
                Displays core bibliographic data: title, inventors, assignee, filing/grant dates,
                application number, patent number, status, jurisdiction, family, continuation type,
                and expiry date. You can edit fields inline — changes are saved immediately.
              </p>

              <H3>Claims tab</H3>
              <p>
                Shows the parsed independent and dependent claims fetched from the USPTO CLM XML
                document. Claims are numbered and indented to reflect dependency. Independent claims
                are highlighted.
              </p>
              <Note type="info">
                Claims are fetched from USPTO the first time and saved, which also makes them searchable from the
                Patents list. If the patent has not yet been granted, no claims document may be available.
              </Note>

              <H3>History tab</H3>
              <p>The History tab has two views, toggled by a switcher:</p>
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>Events</strong> — USPTO prosecution history events from the file wrapper,
                  grouped by year. Filter by category (Actions, Responses, Notices, Interviews…)
                  or by year. Each event shows its code, description, and date.
                </li>
                <li>
                  <strong>Documents</strong> — file wrapper documents in reverse chronological
                  order. Each document shows its code, description, direction
                  (<Badge color="blue">OUTGOING</Badge> from USPTO, <Badge color="purple">INCOMING</Badge> from applicant),
                  page count, and a <strong>Download PDF</strong> button.
                </li>
              </ul>
              <Note type="tip">
                Documents require a USPTO refresh. If the Documents panel is empty, click <strong>Refresh</strong> on the Overview tab to pull the latest file wrapper.
              </Note>

              <H3>Family tab</H3>
              <p>
                An interactive D3 tree showing the patent's continuation family — parents, siblings,
                and children. Nodes are color-coded by status. Click a node to navigate to that patent.
              </p>

              <H3>Fees tab</H3>
              <p>
                Lists the maintenance fee schedule for granted US patents: 3.5-year, 7.5-year, and
                11.5-year fees with due dates and amounts. Each fee has a status:
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge color="yellow">UPCOMING</Badge>
                <Badge color="blue">PAID</Badge>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(251,113,133,0.15)', color: '#f87171' }}>OVERDUE</span>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>WAIVED</span>
              </div>
              <p className="mt-2">
                Click a fee row to mark it as PAID (enter the payment date) or WAIVED.
                Use <strong>Generate Fee Schedule</strong> to regenerate fees from the grant date.
              </p>
            </Section>

            {/* FAMILIES */}
            <Section id="families" title="Patent Families" icon={GitBranch}>
              <p>
                A <strong>Patent Family</strong> groups related patents — typically US and EP
                counterparts for the same invention. Families appear in the sidebar under
                <strong> Patent Families</strong>.
              </p>
              <H3>Creating a family</H3>
              <p>
                Click <strong>New Family</strong> on the Families list page. Give it a name and
                optional description. You can then assign patents to a family from their individual
                Overview tabs.
              </p>
              <H3>Family detail</H3>
              <p>
                The family detail page shows all member patents in a table, plus a D3 continuation
                tree visualizing the parent–child relationships across the entire family.
              </p>
              <Note type="tip">
                Assigning a patent to a family does not change its continuation relationships —
                continuity is tracked separately via the <strong>Manage Data → Continuity Tree</strong> tab.
              </Note>
            </Section>

            {/* DEADLINES */}
            <Section id="deadlines" title="Deadlines & Fees" icon={CalendarClock}>
              <p>
                The <strong>Deadlines & Fees</strong> page lists all maintenance fees across your
                portfolio, sortable and filterable by status and urgency.
              </p>
              <H3>Columns</H3>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Patent</strong> — patent number and title.</li>
                <li><strong>Fee Type</strong> — 3.5yr / 7.5yr / 11.5yr maintenance fee stage.</li>
                <li><strong>Due Date</strong> — the statutory deadline.</li>
                <li><strong>Status</strong> — UPCOMING, PAID, OVERDUE, WAIVED.</li>
                <li><strong>Amount</strong> — estimated USPTO fee (large entity rates).</li>
              </ul>
              <H3>Updating fee status</H3>
              <p>
                Click any row to update its status. Mark fees PAID by entering the payment date,
                or WAIVED if the patent was abandoned before that fee stage.
              </p>
              <Note type="warning">
                Fee amounts shown are estimates. Always verify current USPTO fee schedules at
                <strong> fees.uspto.gov</strong> before making payments.
              </Note>
            </Section>

            {/* LEGAL FEES */}
            <Section id="legal-fees" title="Legal Fees" icon={Banknote}>
              <p>
                The <strong>Legal Fees</strong> page tracks outside counsel and agent invoices
                associated with your patents. It is separate from USPTO maintenance fees.
              </p>
              <H3>Adding an invoice</H3>
              <p>
                Click <strong>New Invoice</strong> and fill in: vendor/firm, patent, invoice date,
                amount, and optional description. Invoices can be marked as PAID or PENDING.
              </p>
              <H3>Filtering</H3>
              <p>Filter by patent, vendor, date range, or payment status. The summary cards at the
              top show total billed, total paid, and outstanding balance.</p>
              <Note type="tip">
                Link invoices to a specific patent so you can see all legal spend per patent on the
                patent's Overview tab.
              </Note>
            </Section>

            {/* WATCHLISTS */}
            <Section id="watchlists" title="Watchlists" icon={Eye}>
              <p>
                <strong>Watchlists</strong> let you monitor sets of patents that are not in your
                portfolio — competitor patents, prior art, or technology areas of interest.
              </p>
              <H3>Creating a watchlist</H3>
              <p>
                Click <strong>New Watchlist</strong>, give it a name, and add patent numbers
                manually or by USPTO search. Patents in a watchlist are fetched from USPTO on demand.
              </p>
              <H3>AI analysis</H3>
              <p>
                Each watchlist supports an AI-powered analysis that summarizes the claims and
                identifies key themes across the watched patents. Click <strong>Analyze</strong>
                to run it.
              </p>
              <H3>Updating watched patents</H3>
              <p>
                Use <strong>Refresh</strong> on a watchlist to pull the latest status and abstract
                for all patents in that list. Changes in status (e.g. Pending → Granted) are
                highlighted.
              </p>
              <Note type="info">
                Watchlist patents are read-only — they do not appear in your Deadlines or Fees
                pages. To bring one into full portfolio tracking, use <strong>Import</strong> from
                the watchlist.
              </Note>
            </Section>

            {/* REPORTS */}
            <Section id="reports" title="Reports" icon={BarChart3}>
              <p>
                The <strong>Reports</strong> page generates PDF reports of your patent portfolio.
              </p>
              <H3>Report types</H3>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Portfolio Summary</strong> — all patents with status, dates, and family groupings.</li>
                <li><strong>Deadline Report</strong> — upcoming maintenance fees for a chosen date range.</li>
                <li><strong>Family Report</strong> — full breakdown of a single patent family.</li>
              </ul>
              <H3>Generating a report</H3>
              <p>
                Select the report type, configure any filters (family, date range, status), then
                click <strong>Generate PDF</strong>. The PDF downloads automatically.
              </p>
              <Note type="info">
                PDF generation uses a built-in renderer — no external service is required. Reports
                include the Plaz4 IP logo and are formatted for letter-size paper.
              </Note>
            </Section>

            {/* ADD PATENT */}
            <Section id="add-patent" title="Adding Patents" icon={SearchCode}>
              <p>There are three ways to add patents to your portfolio:</p>

              <H3>1. USPTO Lookup (Add Patent)</H3>
              <p>
                Use <strong>Add Patent</strong> in the sidebar. Enter a US patent number
                (e.g. <code className="mono">US12345678</code>) or application number. Plaz4 IP
                fetches the full record from the USPTO ODP API and imports it into your portfolio.
              </p>

              <H3>2. EPO Lookup</H3>
              <p>
                Use <strong>EP Lookup</strong> to search European patents by EP number
                (e.g. <code className="mono">EP3456789</code>). Strip the leading zeros and <code className="mono">EP</code> prefix
                — enter just the digits (e.g. <code className="mono">3456789</code>).
              </p>

              <H3>3. Bulk Import</H3>
              <p>
                Use <strong>Import Data</strong> in the sidebar to upload a CSV or paste a list
                of application numbers for batch import. The importer queues each patent for
                USPTO lookup and shows a progress bar.
              </p>

              <H3>Importing continuations</H3>
              <p>
                On any patent's <strong>Continuity</strong> tab in Manage Data, you can import
                child continuations (divisionals, continuations) with one click. Imported
                continuations are marked with source <Badge color="purple">CONTINUATION</Badge> and
                are automatically linked to their parent.
              </p>

              <Note type="tip">
                Application numbers must be digits-only with no slashes or commas. The app
                normalizes them automatically during import.
              </Note>
            </Section>

            {/* MANAGE */}
            <Section id="manage" title="Manage Data" icon={Database}>
              <p>
                <strong>Manage Data</strong> (<strong>/manage</strong>) provides advanced data
                management tools in two tabs.
              </p>

              <H3>Patents tab</H3>
              <p>
                A full table of all patents with inline editing for status, type, assignee, family,
                and expiry date. Changes are saved immediately.
              </p>
              <p className="mt-2">
                The <strong>Bulk Refresh</strong> button re-fetches all patents from USPTO
                sequentially, showing a progress bar. Use this after a period of inactivity to
                bring all records up to date.
              </p>

              <H3>Continuity Tree tab</H3>
              <p>
                Builds a visual tree of parent → child continuation relationships across your
                entire portfolio. Root patents (no tracked parent) appear at the top with a
                <Badge color="blue"> ROOT </Badge> badge. Child nodes show their continuation type:
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge color="blue">CON</Badge><span className="text-xs self-center">Continuation</span>
                <Badge color="purple">CIP</Badge><span className="text-xs self-center">Continuation-in-Part</span>
                <Badge color="green">DIV</Badge><span className="text-xs self-center">Divisional</span>
                <Badge color="yellow">REI</Badge><span className="text-xs self-center">Reissue</span>
              </div>
              <p className="mt-2">
                Click a node to navigate to that patent. Use the search box to filter the tree
                by patent number or title.
              </p>
              <Note type="tip">
                Collapse branches you don&apos;t need by clicking the toggle arrow on any node with children.
              </Note>
            </Section>

            {/* SETTINGS */}
            <Section id="settings" title="Settings & Team" icon={Settings}>
              <p>
                The <strong>Settings</strong> page manages your team members, invite links,
                API keys, and appearance preferences.
              </p>

              <H3>Team Members</H3>
              <p>
                View all current team members and their roles. Each member has one of three roles:
              </p>
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                <Badge color="purple">ADMIN</Badge><span className="text-xs self-center">Full access, can manage team</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge color="blue">EDITOR</Badge><span className="text-xs self-center">Can add, edit, and refresh patents</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>VIEWER</span>
                <span className="text-xs self-center">Read-only access</span>
              </div>

              <H3>Inviting team members</H3>
              <p>
                Click <strong>Invite Member</strong>, enter the email and desired role, then
                click <strong>Send Invite</strong>. An invite link is generated — copy it and
                share it with your colleague. Invite links expire after 7 days.
              </p>
              <p className="mt-2">
                The invitee opens the link, enters their name and password, and their account
                is created automatically.
              </p>

              <H3>Revoking invites</H3>
              <p>
                Pending invites appear in the <strong>Pending Invites</strong> list. Click the
                trash icon to revoke an invite before it is accepted.
              </p>

              <H3>Appearance</H3>
              <p>
                Toggle between <strong>Dark</strong> and <strong>Light</strong> mode using the
                sun/moon button in the Settings page. Your preference is saved in your browser.
              </p>

              <H3>API Keys</H3>
              <p>
                Configure USPTO and EPO API keys in the environment variables (<code className="mono">.env.local</code>).
                These are server-side only and are never exposed to the browser.
              </p>
              <Note type="warning">
                Without a USPTO API key, requests are rate-limited to a few calls per minute.
                The app will still work but large bulk refreshes may be throttled.
              </Note>
            </Section>

          </div>
        </main>
      </div>
    </div>
  )
}
