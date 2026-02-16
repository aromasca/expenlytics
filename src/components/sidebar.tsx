'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Receipt, BarChart3, RefreshCw, Settings, Lightbulb, FileText } from 'lucide-react'

const navItems = [
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/subscriptions', label: 'Recurring', icon: RefreshCw },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-48 flex-col border-r border-sidebar-border bg-sidebar max-md:w-12">
      <div className="px-4 py-3 max-md:px-2">
        <Link href="/insights" className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="Expenlytics" width={24} height={24} className="rounded shrink-0" />
          <span className="text-sm font-semibold tracking-tight text-foreground max-md:hidden">Expenlytics</span>
        </Link>
      </div>
      <nav className="flex-1 px-2 space-y-0.5 max-md:px-1" data-walkthrough="sidebar">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors max-md:justify-center max-md:px-2',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <span className="max-md:hidden">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
