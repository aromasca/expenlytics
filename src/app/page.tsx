'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { TransactionTable } from '@/components/transaction-table'

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-2xl font-bold">Expenlytics</h1>
        <p className="text-sm text-gray-500">Local-first spending analytics from your bank statements</p>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <UploadZone onUploadComplete={() => setRefreshKey(k => k + 1)} />
        <TransactionTable refreshKey={refreshKey} />
      </main>
    </div>
  )
}
