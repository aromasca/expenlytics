'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/components/theme-provider'
import { Cpu, Trash2, Moon, Sun, RotateCcw, Database } from 'lucide-react'
import { useWalkthrough } from '@/components/walkthrough-provider'
import { useSettings, useDemoMode, useToggleDemo } from '@/hooks/use-settings'
import { useQueryClient } from '@tanstack/react-query'

const TASK_NAMES = ['extraction', 'classification', 'normalization', 'insights', 'merge_suggestions'] as const

const TASK_LABELS: Record<string, { label: string; description: string }> = {
  extraction: { label: 'PDF Extraction', description: 'Extracts raw transactions from PDF documents' },
  classification: { label: 'Transaction Classification', description: 'Assigns categories to transactions' },
  normalization: { label: 'Merchant Normalization', description: 'Normalizes merchant names for commitment detection' },
  insights: { label: 'Financial Insights', description: 'Generates health scores and spending insights' },
  merge_suggestions: { label: 'Merge Suggestions', description: 'Detects duplicate merchant names for merging' },
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const { startWalkthrough } = useWalkthrough()
  const queryClient = useQueryClient()

  const { data: settingsData } = useSettings()
  const { data: demoData } = useDemoMode()
  const toggleDemo = useToggleDemo()

  const providers = settingsData?.providers ?? {}
  const availableProviders = settingsData?.availableProviders ?? Object.keys(providers)
  // The API returns a flat object with provider_* and model_* keys alongside providers
  const settings: Record<string, string> = {}
  if (settingsData) {
    for (const key of Object.keys(settingsData)) {
      if (key !== 'providers' && key !== 'availableProviders' && typeof settingsData[key] === 'string') {
        settings[key] = settingsData[key] as string
      }
    }
  }

  const demoMode = demoData?.demo ?? false
  const hasData = demoData?.hasData === true

  const [demoLoading, setDemoLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetSettings, setResetSettings] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // Local optimistic state for provider/model selects
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({})

  // Merge server settings with local optimistic overrides
  const effectiveSettings = { ...settings, ...localSettings }

  async function handleProviderChange(task: string, providerName: string) {
    const providerConfig = providers[providerName]
    if (!providerConfig) return

    const defaultModel = providerConfig.defaults[task] || providerConfig.models[0]?.id || ''
    const providerKey = `provider_${task}`
    const modelKey = `model_${task}`

    setSavingKey(providerKey)
    setLocalSettings(prev => ({ ...prev, [providerKey]: providerName, [modelKey]: defaultModel }))

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [providerKey]: providerName, [modelKey]: defaultModel }),
      })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch {
      // Revert local optimistic state on failure
      setLocalSettings(prev => {
        const next = { ...prev }
        delete next[providerKey]
        delete next[modelKey]
        return next
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function handleModelChange(task: string, modelId: string) {
    const modelKey = `model_${task}`
    setSavingKey(modelKey)
    setLocalSettings(prev => ({ ...prev, [modelKey]: modelId }))

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [modelKey]: modelId }),
      })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch {
      setLocalSettings(prev => {
        const next = { ...prev }
        delete next[modelKey]
        return next
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function handleDemoToggle() {
    setDemoLoading(true)
    try {
      await toggleDemo.mutateAsync(demoMode ? 'clear' : 'load')
    } finally {
      setDemoLoading(false)
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4" />
            <div>
              <h3 className="text-sm font-medium">Demo Data</h3>
              <p className="text-xs text-muted-foreground">
                {demoMode ? 'Sample data is loaded' : hasData ? 'Reset database first to load demo data' : 'Load sample transactions to explore features'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleDemoToggle}
            disabled={demoLoading || (!demoMode && hasData)}
          >
            {demoLoading ? (demoMode ? 'Removing...' : 'Loading...') : (demoMode ? 'Remove' : 'Load')}
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
            const currentProvider = effectiveSettings[`provider_${task}`] || 'anthropic'
            const currentModel = effectiveSettings[`model_${task}`] || ''
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
                <li>Dismissed commitments</li>
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
