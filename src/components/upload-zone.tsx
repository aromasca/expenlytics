'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

interface UploadZoneProps {
  onUploadComplete: () => void
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Upload failed')
    }
  }, [])

  const handleUploadFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf')
    if (pdfFiles.length === 0) {
      setError('Please upload PDF files')
      return
    }

    setUploading(pdfFiles.length)
    setError(null)

    const errors: string[] = []
    await Promise.all(
      pdfFiles.map(file =>
        uploadFile(file).catch((err: Error) => { errors.push(`${file.name}: ${err.message}`) })
      )
    )

    if (errors.length > 0) {
      setError(errors.join('; '))
    }
    onUploadComplete()
    setUploading(0)
  }, [uploadFile, onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleUploadFiles(files)
  }, [handleUploadFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) handleUploadFiles(files)
    e.target.value = ''
  }, [handleUploadFiles])

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
        {uploading > 0 ? `Uploading ${uploading} file${uploading > 1 ? 's' : ''}...` : 'Drop PDFs here'}
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={uploading > 0} asChild>
          <label className="cursor-pointer">
            Browse
            <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileInput} />
          </label>
        </Button>
      </div>
    </div>
  )
}
