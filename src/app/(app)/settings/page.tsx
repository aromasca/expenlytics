'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/components/theme-provider'
import { Tags, Cpu, Trash2, Moon, Sun, RefreshCw } from 'lucide-react'

interface ProviderConfig {
  name: string
  envKey: string
  models: { id: string; name: string }[]
  defaults: Record<string, string>
}

const TASK_NAMES = ['extraction', 'classification', 'normalization', 'insights'] as const

const TASK_LABELS: Record<string, { label: string; description: string }> = {
  extraction: { label: 'PDF Extraction', description: 'Extracts raw transactions from PDF documents' },
  classification: { label: 'Transaction Classification', description: 'Assigns categories to transactions' },
  normalization: { label: 'Merchant Normalization', description: 'Normalizes merchant names for recurring detection' },
  insights: { label: 'Financial Insights', description: 'Generates health scores and spending insights' },
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({})
  const [availableProviders, setAvailableProviders] = useState<string[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const { providers: p, availableProviders: ap, ...rest } = data
        setProviders(p || {})
        setAvailableProviders(ap || [])
        setSettings(rest)
      })
      .catch(() => {})
  }, [])

  async function handleProviderChange(task: string, providerName: string) {
    const providerConfig = providers[providerName]
    if (!providerConfig) return

    const defaultModel = providerConfig.defaults[task] || providerConfig.models[0]?.id || ''
    const providerKey = `provider_${task}`
    const modelKey = `model_${task}`

    setSavingKey(providerKey)
    setSettings(prev => ({ ...prev, [providerKey]: providerName, [modelKey]: defaultModel }))

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [providerKey]: providerName, [modelKey]: defaultModel }),
      })
    } catch {
      // Revert on failure
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          const { providers: p, availableProviders: ap, ...rest } = data
          setProviders(p || {})
          setAvailableProviders(ap || [])
          setSettings(rest)
        })
        .catch(() => {})
    } finally {
      setSavingKey(null)
    }
  }

  async function handleModelChange(task: string, modelId: string) {
    const modelKey = `model_${task}`
    setSavingKey(modelKey)
    setSettings(prev => ({ ...prev, [modelKey]: modelId }))

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [modelKey]: modelId }),
      })
    } catch {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          const { providers: p, availableProviders: ap, ...rest } = data
          setProviders(p || {})
          setAvailableProviders(ap || [])
          setSettings(rest)
        })
        .catch(() => {})
    } finally {
      setSavingKey(null)
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
            <p className="text-xs text-muted-foreground">Choose which provider and model to use for each task</p>
          </div>
        </div>
        <div className="space-y-3">
          {TASK_NAMES.map(task => {
            const currentProvider = settings[`provider_${task}`] || 'anthropic'
            const currentModel = settings[`model_${task}`] || ''
            const providerConfig = providers[currentProvider]
            const models = providerConfig?.models || []

            return (
              <div key={task} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{TASK_LABELS[task].label}</p>
                  <p className="text-[11px] text-muted-foreground">{TASK_LABELS[task].description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={currentProvider}
                    onValueChange={(value) => handleProviderChange(task, value)}
                    disabled={savingKey === `provider_${task}`}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map(p => (
                        <SelectItem key={p} value={p} className="text-xs">
                          {providers[p]?.name || p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={currentModel}
                    onValueChange={(value) => handleModelChange(task, value)}
                    disabled={savingKey === `model_${task}`}
                  >
                    <SelectTrigger className="w-48 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })}
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
