'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/components/theme-provider'
import { Tags, Cpu, Trash2, Moon, Sun, RefreshCw } from 'lucide-react'

const MODEL_TASKS = [
  { key: 'model_extraction', label: 'PDF Extraction', description: 'Extracts raw transactions from PDF documents' },
  { key: 'model_classification', label: 'Transaction Classification', description: 'Assigns categories to transactions' },
  { key: 'model_normalization', label: 'Merchant Normalization', description: 'Normalizes merchant names for recurring detection' },
  { key: 'model_insights', label: 'Financial Insights', description: 'Generates health scores and spending insights' },
]

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [modelSettings, setModelSettings] = useState<Record<string, string>>({})
  const [savingModel, setSavingModel] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setModelSettings(data))
      .catch(() => {})
  }, [])

  async function handleModelChange(key: string, value: string) {
    setSavingModel(key)
    setModelSettings(prev => ({ ...prev, [key]: value }))
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
    } catch {
      // Revert on failure
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => setModelSettings(data))
        .catch(() => {})
    } finally {
      setSavingModel(null)
    }
  }

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
        <div className="flex items-center gap-2.5 mb-3">
          <Cpu className="h-4 w-4" />
          <div>
            <h3 className="text-sm font-medium">AI Models</h3>
            <p className="text-xs text-muted-foreground">Choose which model to use for each task</p>
          </div>
        </div>
        <div className="space-y-3">
          {MODEL_TASKS.map(task => (
            <div key={task.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium">{task.label}</p>
                <p className="text-[11px] text-muted-foreground">{task.description}</p>
              </div>
              <Select
                value={modelSettings[task.key] || ''}
                onValueChange={(value) => handleModelChange(task.key, value)}
                disabled={savingModel === task.key}
              >
                <SelectTrigger className="w-48 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id} className="text-xs">
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
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

      <Card className="p-4">
        <div className="flex items-center gap-2.5 mb-2">
          <RefreshCw className="h-4 w-4" />
          <h3 className="text-sm font-medium">Backfill Transaction Classes</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Infer transaction class (purchase, payment, refund, fee, interest, transfer) from existing categories.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            setBackfilling(true)
            setBackfillResult(null)
            try {
              const res = await fetch('/api/transactions/backfill-class', { method: 'POST' })
              const data = await res.json()
              if (res.ok) {
                setBackfillResult(`${data.updated}/${data.total} classified`)
              } else {
                setBackfillResult(`Error: ${data.error}`)
              }
            } catch {
              setBackfillResult('Failed to connect')
            } finally {
              setBackfilling(false)
            }
          }} disabled={backfilling}>
            {backfilling ? 'Running...' : 'Backfill All'}
          </Button>
          {backfillResult && (
            <span className="text-xs text-muted-foreground">{backfillResult}</span>
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
