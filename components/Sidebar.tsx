'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  CalendarClock,
  BarChart3,
  Upload,
  Settings,
  ChevronRight,
  SearchCode,
  Database,
  LogOut,
  Eye,
  Banknote,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'
import NotificationPanel from '@/components/NotificationPanel'

const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Dashboard',            icon: LayoutDashboard },
  { href: '/applications', label: 'Tracked Applications', icon: GitBranch },
  { href: '/patents',      label: 'Patents',              icon: FileText },
  { href: '/families',     label: 'Patent Families',      icon: GitBranch },
  { href: '/deadlines',    label: 'Deadlines & Fees',     icon: CalendarClock },
  { href: '/legal-fees',   label: 'Legal Fees',           icon: Banknote },
  { href: '/watchlists',   label: 'Watchlists',           icon: Eye },
  { href: '/reports',      label: 'Reports',              icon: BarChart3 },
  { href: '/lookup',       label: 'Add Patent',           icon: SearchCode },
  { href: '/import',       label: 'Import Data',          icon: Upload },
  { href: '/manage',       label: 'Manage Data',          icon: Database },
]

const BOTTOM_ITEMS = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const light = theme === 'light'

  const displayName  = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const displayEmail = user?.email || ''
  const initials     = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside
      className="w-64 h-screen flex flex-col sticky top-0 z-10"
      style={{
        backgroundColor: light ? '#FFFFFF' : 'rgba(0,0,0,0.2)',
        borderRight: `1px solid ${light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5"
        style={{ borderBottom: `1px solid ${light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}` }}
      >
        <div className="flex items-center gap-3">
          <Image
            src="/p4-icon.png"
            alt="Plaz4 IP"
            width={36}
            height={36}
            className="rounded-lg flex-shrink-0"
            style={{ background: 'white' }}
          />
          <div>
            <div className="leading-none" style={{
              fontFamily: 'var(--font-display), sans-serif',
              fontWeight: 400,
              fontSize: '1.05rem',
              letterSpacing: '-0.01em',
              color: light ? '#1A1A2E' : 'white',
            }}>
              Plaz4 <span style={{ color: 'var(--patent-sky)' }}>IP</span>
            </div>
            <div className="text-[10px] text-patent-muted mt-0.5 tracking-widest uppercase">Portfolio Manager</div>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="label px-3 mb-3">Navigation</div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom nav */}
      <div
        className="px-3 py-4 space-y-0.5"
        style={{ borderTop: `1px solid ${light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}` }}
      >
        {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${pathname === href ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </Link>
        ))}

        {/* User info + logout */}
        <div className="mt-3 px-3 py-2.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-patent-steel/50 border border-patent-sky/30 flex items-center justify-center text-xs font-bold text-patent-sky flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-medium truncate"
              style={{ color: light ? '#1A1A2E' : 'white' }}
            >
              {displayName}
            </div>
            <div className="text-[10px] text-patent-muted truncate">{displayEmail}</div>
          </div>
          <NotificationPanel />
          <button
            onClick={signOut}
            title="Sign out"
            className="transition-colors flex-shrink-0 text-patent-muted"
            style={{ '--hover-color': light ? '#1A1A2E' : 'white' } as React.CSSProperties}
            onMouseEnter={e => (e.currentTarget.style.color = light ? '#1A1A2E' : 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = '')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
