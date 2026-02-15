'use client'

const PHASES = ['upload', 'extraction', 'classification', 'normalization', 'complete'] as const
const PHASE_LABELS: Record<string, string> = {
  upload: 'Uploaded',
  extraction: 'Extracting',
  classification: 'Classifying',
  normalization: 'Normalizing',
  complete: 'Complete',
}

interface ProcessingStatusProps {
  status: string
  phase: string | null
  errorMessage: string | null
}

export function ProcessingStatus({ status, phase, errorMessage }: ProcessingStatusProps) {
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        <span className="text-xs text-destructive">
          Failed{phase ? ` at ${PHASE_LABELS[phase] ?? phase}` : ''}
        </span>
        {errorMessage && (
          <span className="text-[11px] text-muted-foreground truncate max-w-48" title={errorMessage}>
            — {errorMessage}
          </span>
        )}
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-muted-foreground">Completed</span>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        <span className="text-xs text-muted-foreground">Pending</span>
      </div>
    )
  }

  // Processing — show phase progress bars
  const currentIdx = phase ? PHASES.indexOf(phase as typeof PHASES[number]) : 0
  return (
    <div className="flex items-center gap-1">
      {PHASES.slice(1, -1).map((p, i) => {
        const phaseIdx = i + 1
        const isComplete = currentIdx > phaseIdx
        const isCurrent = currentIdx === phaseIdx
        return (
          <div
            key={p}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              isComplete ? 'bg-emerald-500' : isCurrent ? 'bg-foreground animate-pulse' : 'bg-muted'
            }`}
            title={PHASE_LABELS[p]}
          />
        )
      })}
      <span className="text-[11px] text-muted-foreground ml-1">
        {PHASE_LABELS[phase ?? 'extraction'] ?? 'Processing'}...
      </span>
    </div>
  )
}
