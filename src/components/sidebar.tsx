'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Receipt, BarChart3, RefreshCw, Settings } from 'lucide-react'

const navItems = [
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white max-md:w-16">
      <div className="border-b px-6 py-4 max-md:px-2 max-md:py-3">
        <Link href="/transactions">
          <h1 className="text-xl font-bold max-md:hidden">Expenlytics</h1>
          <span className="hidden text-xl font-bold max-md:block">E</span>
        </Link>
        <p className="text-xs text-gray-500 max-md:hidden">Local-first spending analytics</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 max-md:p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors max-md:justify-center max-md:px-2',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-md:hidden">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
