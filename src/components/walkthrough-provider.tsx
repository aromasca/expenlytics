'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { WALKTHROUGH_STEPS } from './walkthrough-steps'
import { WalkthroughOverlay } from './walkthrough-overlay'

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
  const router = useRouter()
  const pathname = usePathname()

  // Auto-start on first visit
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(STORAGE_KEY)) {
      Promise.resolve().then(() => setCurrentStep(0))
    }
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
    </WalkthroughContext.Provider>
  )
}
