'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/components/theme-provider'
import { Tags, SlidersHorizontal, Trash2, Moon, Sun } from 'lucide-react'

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleReset() {
    setResetting(true)
    try {
      const res = await fetch('/api/reset', { method: 'POST' })
      if (res.ok) {
        window.location.href = '/transactions'
      }
    } finally {
      setResetting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">App configuration and preferences</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-primary" />
            ) : (
              <Sun className="h-5 w-5 text-primary" />
            )}
            <div>
              <h3 className="font-medium">Appearance</h3>
              <p className="text-sm text-muted-foreground">
                {theme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Dark Mode</span>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <Tags className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium text-muted-foreground">Category Management</h3>
        </div>
        <p className="text-sm text-muted-foreground">Add, edit, and organize spending categories. Coming soon.</p>
      </Card>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium text-muted-foreground">Preferences</h3>
        </div>
        <p className="text-sm text-muted-foreground">Currency, date format, and display options. Coming soon.</p>
      </Card>

      <Card className="p-6 border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h3 className="font-medium text-destructive">Danger Zone</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Delete all transactions and uploaded documents. This cannot be undone.</p>
        {!confirmOpen ? (
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Reset Database
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Yes, delete everything'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={resetting}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
