'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface UploadZoneProps {
  onUploadComplete: () => void
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Upload failed')
        return
      }

      onUploadComplete()
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }, [onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') {
      handleUpload(file)
    } else {
      setError('Please upload a PDF file')
    }
  }, [handleUpload])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  return (
    <Card
      className={`border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="space-y-4">
        <p className="text-lg font-medium">
          {isUploading ? 'Processing...' : 'Drop your bank statement PDF here'}
        </p>
        <p className="text-sm text-gray-500">or</p>
        <Button variant="outline" disabled={isUploading} asChild>
          <label className="cursor-pointer">
            Browse files
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </label>
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Card>
  )
}
