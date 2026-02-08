'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/components/theme-provider'
import { Tags, SlidersHorizontal, Trash2, Moon, Sun, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)

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
    <div className="p-4 space-y-3 max-w-2xl">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            <div>
              <h3 className="text-sm font-medium">Appearance</h3>
              <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Dark' : 'Light'} mode</p>
            </div>
          </div>
          <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2">
          <RefreshCw className="h-4 w-4" />
          <h3 className="text-sm font-medium">Reclassify Transactions</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Re-run AI classification using the latest taxonomy. Manual overrides preserved.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            setReclassifying(true)
            setReclassifyResult(null)
            try {
              const res = await fetch('/api/reclassify/backfill', { method: 'POST' })
              const data = await res.json()
              if (res.ok) {
                setReclassifyResult(`${data.updated}/${data.total} reclassified`)
              } else {
                setReclassifyResult(`Error: ${data.error}`)
              }
            } catch {
              setReclassifyResult('Failed to connect')
            } finally {
              setReclassifying(false)
            }
          }} disabled={reclassifying}>
            {reclassifying ? 'Running...' : 'Reclassify All'}
          </Button>
          {reclassifyResult && (
            <span className="text-xs text-muted-foreground">{reclassifyResult}</span>
          )}
        </div>
      </Card>

      <Card className="p-4 opacity-50">
        <div className="flex items-center gap-2.5 mb-1">
          <Tags className="h-4 w-4" />
          <h3 className="text-sm font-medium">Category Management</h3>
        </div>
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </Card>

      <Card className="p-4 opacity-50">
        <div className="flex items-center gap-2.5 mb-1">
          <SlidersHorizontal className="h-4 w-4" />
          <h3 className="text-sm font-medium">Preferences</h3>
        </div>
        <p className="text-xs text-muted-foreground">Coming soon</p>
      </Card>

      <Card className="p-4 border-destructive/20">
        <div className="flex items-center gap-2.5 mb-1">
          <Trash2 className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Delete all data. This cannot be undone.</p>
        {!confirmOpen ? (
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            Reset Database
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Confirm Delete'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={resetting}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
