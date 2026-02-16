'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/components/theme-provider'
import { Cpu, Trash2, Moon, Sun, RotateCcw } from 'lucide-react'
import { useWalkthrough } from '@/components/walkthrough-provider'

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
  const { startWalkthrough } = useWalkthrough()
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetSettings, setResetSettings] = useState(false)
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
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetSettings }),
      })
      if (res.ok) {
        window.location.href = '/transactions'
      }
    } finally {
      setResetting(false)
      setConfirmOpen(false)
      setConfirmText('')
      setResetSettings(false)
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="h-4 w-4" />
            <div>
              <h3 className="text-sm font-medium">Walkthrough</h3>
              <p className="text-xs text-muted-foreground">Replay the getting-started guide</p>
            </div>
          </div>
          <Button variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={startWalkthrough}>
            Restart
          </Button>
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
          <div className="space-y-3">
            <div className="text-xs space-y-1 p-2.5 rounded-md bg-destructive/5 border border-destructive/20">
              <p className="font-medium text-destructive">This will permanently delete:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>All transactions and documents</li>
                <li>Uploaded PDF files</li>
                <li>Insight cache and dismissed insights</li>
                <li>Merchant classification memory</li>
                <li>Dismissed subscriptions</li>
              </ul>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={resetSettings}
                onChange={(e) => setResetSettings(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              <span className="text-xs text-muted-foreground">Also reset AI model/provider settings to defaults</span>
            </label>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Type <span className="font-mono font-medium">RESET</span> to confirm:</p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                className="h-7 text-xs w-40 mb-2"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReset}
                disabled={resetting || confirmText !== 'RESET'}
              >
                {resetting ? 'Resetting...' : 'Confirm Delete'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setConfirmOpen(false); setConfirmText(''); setResetSettings(false) }} disabled={resetting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
