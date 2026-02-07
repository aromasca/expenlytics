'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tags, SlidersHorizontal, Trash2 } from 'lucide-react'

export default function SettingsPage() {
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
        <p className="text-sm text-gray-500">App configuration and preferences</p>
      </div>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <Tags className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Category Management</h3>
        </div>
        <p className="text-sm text-gray-400">Add, edit, and organize spending categories. Coming soon.</p>
      </Card>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <SlidersHorizontal className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Preferences</h3>
        </div>
        <p className="text-sm text-gray-400">Currency, date format, and display options. Coming soon.</p>
      </Card>

      <Card className="p-6 border-red-200">
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="h-5 w-5 text-red-500" />
          <h3 className="font-medium text-red-600">Danger Zone</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Delete all transactions and uploaded documents. This cannot be undone.</p>
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
