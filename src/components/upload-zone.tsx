'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

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
    <div
      className={`border border-dashed rounded-lg px-4 py-3 flex items-center justify-between transition-colors ${
        isDragging ? 'border-foreground bg-muted' : 'border-border'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Upload className="h-4 w-4" />
        {isUploading ? 'Processing...' : 'Drop PDF here'}
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={isUploading} asChild>
          <label className="cursor-pointer">
            Browse
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </label>
        </Button>
      </div>
    </div>
  )
}
