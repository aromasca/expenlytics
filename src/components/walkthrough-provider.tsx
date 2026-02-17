'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { WALKTHROUGH_STEPS } from './walkthrough-steps'
import { WalkthroughOverlay } from './walkthrough-overlay'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'walkthrough_completed'

interface WalkthroughContextValue {
  currentStep: number | null
  startWalkthrough: () => void
}

const WalkthroughContext = createContext<WalkthroughContextValue>({
  currentStep: null,
  startWalkthrough: () => {},
})

export function useWalkthrough() {
  return useContext(WalkthroughContext)
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [showDemoPrompt, setShowDemoPrompt] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Auto-start on first visit — check if DB is empty first
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(STORAGE_KEY)) return

    fetch('/api/transactions?limit=1')
      .then(res => res.json())
      .then(data => {
        const hasData = Array.isArray(data.transactions) ? data.transactions.length > 0 : false
        if (hasData) {
          Promise.resolve().then(() => setCurrentStep(0))
        } else {
          setShowDemoPrompt(true)
        }
      })
      .catch(() => {
        Promise.resolve().then(() => setCurrentStep(0))
      })
  }, [])

  const complete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setCurrentStep(null)
  }, [])

  const navigateToStep = useCallback((stepIndex: number) => {
    const step = WALKTHROUGH_STEPS[stepIndex]
    if (!step) return
    if (pathname !== step.page) {
      router.push(step.page)
    }
    setCurrentStep(stepIndex)
  }, [pathname, router])

  const next = useCallback(() => {
    if (currentStep === null) return
    if (currentStep >= WALKTHROUGH_STEPS.length - 1) {
      complete()
    } else {
      navigateToStep(currentStep + 1)
    }
  }, [currentStep, complete, navigateToStep])

  const prev = useCallback(() => {
    if (currentStep === null || currentStep <= 0) return
    navigateToStep(currentStep - 1)
  }, [currentStep, navigateToStep])

  const startWalkthrough = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    navigateToStep(0)
  }, [navigateToStep])

  const handleLoadDemo = useCallback(async () => {
    setDemoLoading(true)
    try {
      await fetch('/api/demo', { method: 'POST' })
    } catch {
      // Continue with walkthrough regardless
    } finally {
      setDemoLoading(false)
      setShowDemoPrompt(false)
      Promise.resolve().then(() => setCurrentStep(0))
    }
  }, [])

  const handleSkipDemo = useCallback(() => {
    setShowDemoPrompt(false)
    Promise.resolve().then(() => setCurrentStep(0))
  }, [])

  return (
    <WalkthroughContext.Provider value={{ currentStep, startWalkthrough }}>
      {children}
      {currentStep !== null && (
        <WalkthroughOverlay
          step={WALKTHROUGH_STEPS[currentStep]}
          stepIndex={currentStep}
          totalSteps={WALKTHROUGH_STEPS.length}
          onNext={next}
          onPrev={prev}
          onSkip={complete}
        />
      )}
      <Dialog open={showDemoPrompt} onOpenChange={(open) => { if (!open) handleSkipDemo() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Welcome to Expenlytics</DialogTitle>
            <DialogDescription>
              Would you like to load sample data? This will add realistic transactions so you can explore all features right away.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleSkipDemo} disabled={demoLoading}>
              Skip
            </Button>
            <Button onClick={handleLoadDemo} disabled={demoLoading}>
              {demoLoading ? 'Loading...' : 'Load Demo Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WalkthroughContext.Provider>
  )
}
