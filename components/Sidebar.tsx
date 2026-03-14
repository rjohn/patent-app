'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  GitBranch,
  CalendarClock,
  BarChart3,
  Upload,
  Settings,
  Shield,
  ChevronRight,
  SearchCode,
  Globe,
  Database,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/patents',    label: 'Patents',          icon: FileText },
  { href: '/families',   label: 'Patent Families',  icon: GitBranch },
  { href: '/deadlines',  label: 'Deadlines & Fees', icon: CalendarClock },
  { href: '/reports',    label: 'Reports',          icon: BarChart3 },
  { href: '/lookup',     label: 'Add US Patent',    icon: SearchCode },
  { href: '/ep-lookup',  label: 'Add EP Patent',    icon: Globe },
  { href: '/import',     label: 'Import Data',      icon: Upload },
  { href: '/manage',     label: 'Manage Data',      icon: Database },
]

const BOTTOM_ITEMS = [
  { href: '/settings',   label: 'Settings',        icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-black/20 border-r border-white/10 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-patent-gold rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-patent-navy" />
          </div>
          <div>
            <div className="font-display font-bold text-white text-sm leading-none">PatentOS</div>
            <div className="text-[10px] text-patent-muted mt-0.5 tracking-wider uppercase">Portfolio Manager</div>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
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
      <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
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

        {/* User info placeholder */}
        <div className="mt-3 px-3 py-2.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-patent-steel/50 border border-patent-sky/30 flex items-center justify-center text-xs font-bold text-patent-sky">
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">User</div>
            <div className="text-[10px] text-patent-muted truncate">user@company.com</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
