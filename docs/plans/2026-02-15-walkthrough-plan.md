# First-Time User Walkthrough — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 5-step tooltip walkthrough that guides first-time users through the app, auto-navigating between pages and highlighting key UI elements.

**Architecture:** A React context provider (`WalkthroughProvider`) manages step state and localStorage persistence. A separate overlay component renders the backdrop, highlight cutout, and tooltip. Target elements are identified via `data-walkthrough` attributes added to existing components.

**Tech Stack:** React context, `useRouter` (Next.js), `getBoundingClientRect()`, `ResizeObserver`, localStorage, Tailwind CSS, existing shadcn Button component.

**Design doc:** `docs/plans/2026-02-15-walkthrough-design.md`

---

### Task 1: Create walkthrough step configuration

**Files:**
- Create: `src/components/walkthrough-steps.ts`

**Step 1: Create the steps config file**

This is a pure data file — no tests needed.

```ts
export interface WalkthroughStep {
  page: string
  target: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'right'
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    page: '/insights',
    target: 'sidebar',
    title: 'Welcome to Expenlytics!',
    description: 'This is your dashboard. Let\u2019s walk through how to get started.',
    position: 'right',
  },
  {
    page: '/documents',
    target: 'upload',
    title: 'Upload a Statement',
    description: 'Drop a bank or credit card PDF here. We\u2019ll extract and categorize every transaction automatically.',
    position: 'bottom',
  },
  {
    page: '/transactions',
    target: 'transactions',
    title: 'Review Transactions',
    description: 'All extracted transactions appear here. You can edit categories, types, and merchant names.',
    position: 'top',
  },
  {
    page: '/reports',
    target: 'reports',
    title: 'Explore Reports',
    description: 'See spending breakdowns, savings rate, month-over-month comparisons, and a Sankey flow diagram.',
    position: 'top',
  },
  {
    page: '/insights',
    target: 'health-score',
    title: 'Get Insights',
    description: 'Your financial health score, spending patterns, and personalized recommendations live here.',
    position: 'bottom',
  },
]
```

**Step 2: Commit**

```bash
git add src/components/walkthrough-steps.ts
git commit -m "feat(walkthrough): add step configuration"
```

---

### Task 2: Create WalkthroughProvider context

**Files:**
- Create: `src/components/walkthrough-provider.tsx`

**Step 1: Create the provider component**

```tsx
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
      setCurrentStep(0)
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
```

**Step 2: Commit**

Note: This won't compile yet — `WalkthroughOverlay` doesn't exist. That's fine, commit the provider alone; we build the overlay in Task 3. If you prefer, you can hold off committing until after Task 3.

---

### Task 3: Create WalkthroughOverlay component

**Files:**
- Create: `src/components/walkthrough-overlay.tsx`

**Step 1: Create the overlay component**

```tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { WalkthroughStep } from './walkthrough-steps'

interface OverlayProps {
  step: WalkthroughStep
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8
const TOOLTIP_GAP = 12

export function WalkthroughOverlay({ step, stepIndex, totalSteps, onNext, onPrev, onSkip }: OverlayProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const findAndMeasure = useCallback(() => {
    const el = document.querySelector(`[data-walkthrough="${step.target}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step.target])

  // Find target element — retry briefly after page navigation
  useEffect(() => {
    setTargetRect(null)
    findAndMeasure()
    // Retry a few times in case the page is still rendering after navigation
    const timers = [
      setTimeout(findAndMeasure, 100),
      setTimeout(findAndMeasure, 300),
      setTimeout(findAndMeasure, 600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [findAndMeasure])

  // Reposition on resize/scroll
  useEffect(() => {
    if (!targetRect) return
    const el = document.querySelector(`[data-walkthrough="${step.target}"]`)
    if (!el) return

    const observer = new ResizeObserver(findAndMeasure)
    observer.observe(el)
    window.addEventListener('scroll', findAndMeasure, true)
    window.addEventListener('resize', findAndMeasure)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', findAndMeasure, true)
      window.removeEventListener('resize', findAndMeasure)
    }
  }, [targetRect, step.target, findAndMeasure])

  if (!targetRect) return null

  // Compute tooltip position
  const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 60, maxWidth: 320 }

  if (step.position === 'bottom') {
    tooltipStyle.top = targetRect.top + targetRect.height + PADDING + TOOLTIP_GAP
    tooltipStyle.left = targetRect.left + targetRect.width / 2
    tooltipStyle.transform = 'translateX(-50%)'
  } else if (step.position === 'top') {
    tooltipStyle.bottom = window.innerHeight - targetRect.top + TOOLTIP_GAP
    tooltipStyle.left = targetRect.left + targetRect.width / 2
    tooltipStyle.transform = 'translateX(-50%)'
  } else {
    // right
    tooltipStyle.top = targetRect.top + targetRect.height / 2
    tooltipStyle.left = targetRect.left + targetRect.width + PADDING + TOOLTIP_GAP
    tooltipStyle.transform = 'translateY(-50%)'
  }

  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1

  // Clip path to cut out the target element area
  const cutout = {
    top: targetRect.top - PADDING,
    left: targetRect.left - PADDING,
    width: targetRect.width + PADDING * 2,
    height: targetRect.height + PADDING * 2,
  }

  return (
    <>
      {/* Backdrop with cutout */}
      <div
        className="fixed inset-0 z-50"
        style={{
          clipPath: `polygon(
            0% 0%, 0% 100%, ${cutout.left}px 100%, ${cutout.left}px ${cutout.top}px,
            ${cutout.left + cutout.width}px ${cutout.top}px, ${cutout.left + cutout.width}px ${cutout.top + cutout.height}px,
            ${cutout.left}px ${cutout.top + cutout.height}px, ${cutout.left}px 100%, 100% 100%, 100% 0%
          )`,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}
        onClick={onSkip}
      />

      {/* Highlight ring around target */}
      <div
        className="fixed z-50 rounded-md ring-2 ring-primary pointer-events-none"
        style={{
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-60 bg-card border rounded-lg p-4 shadow-lg"
        style={tooltipStyle}
      >
        <p className="text-sm font-medium mb-1">{step.title}</p>
        <p className="text-xs text-muted-foreground mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{stepIndex + 1} of {totalSteps}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
            {!isFirst && (
              <Button variant="ghost" className="h-7 text-xs" onClick={onPrev}>
                Back
              </Button>
            )}
            <Button className="h-7 text-xs" onClick={onNext}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
```

**Step 2: Run dev server and verify it compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/walkthrough-provider.tsx src/components/walkthrough-overlay.tsx
git commit -m "feat(walkthrough): add provider context and overlay component"
```

---

### Task 4: Wire provider into app layout

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Step 1: Add the provider**

Current content of `layout.tsx`:

```tsx
import { Sidebar } from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  )
}
```

Change to:

```tsx
import { Sidebar } from '@/components/sidebar'
import { WalkthroughProvider } from '@/components/walkthrough-provider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalkthroughProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </WalkthroughProvider>
  )
}
```

Note: `WalkthroughProvider` is a client component but the layout is a server component. Next.js handles this fine — a `'use client'` component imported into a server component creates a client boundary. The `children` remain server-rendered and streamed into the client boundary.

**Step 2: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(walkthrough): wire provider into app layout"
```

---

### Task 5: Add `data-walkthrough` attributes to target elements

**Files:**
- Modify: `src/components/sidebar.tsx:29` — add `data-walkthrough="sidebar"` to `<nav>`
- Modify: `src/app/(app)/documents/page.tsx:52` — wrap `<UploadZone>` in a div with `data-walkthrough="upload"`
- Modify: `src/app/(app)/transactions/page.tsx:56` — wrap `<TransactionTable>` in a div with `data-walkthrough="transactions"`
- Modify: `src/app/(app)/reports/page.tsx:137` — change `<>` to `<div data-walkthrough="reports">` (and closing `</>` to `</div>`)
- Modify: `src/components/insights/health-score.tsx:21` — add `data-walkthrough="health-score"` to root div

**Step 1: sidebar.tsx**

Change line 29:
```tsx
      <nav className="flex-1 px-2 space-y-0.5 max-md:px-1">
```
To:
```tsx
      <nav className="flex-1 px-2 space-y-0.5 max-md:px-1" data-walkthrough="sidebar">
```

**Step 2: documents/page.tsx**

Change line 52:
```tsx
      <UploadZone onUploadComplete={fetchDocuments} />
```
To:
```tsx
      <div data-walkthrough="upload">
        <UploadZone onUploadComplete={fetchDocuments} />
      </div>
```

**Step 3: transactions/page.tsx**

Change line 56:
```tsx
      <TransactionTable filters={filters} />
```
To:
```tsx
      <div data-walkthrough="transactions">
        <TransactionTable filters={filters} />
      </div>
```

**Step 4: reports/page.tsx**

Change line 137:
```tsx
        <>
```
To:
```tsx
        <div data-walkthrough="reports" className="space-y-4">
```

And line 159:
```tsx
        </>
```
To:
```tsx
        </div>
```

Note: The parent div has `space-y-4` but fragments don't receive it. Adding `space-y-4` to the new wrapper div preserves the spacing.

**Step 5: health-score.tsx**

Change line 21:
```tsx
    <div className="space-y-2">
```
To:
```tsx
    <div className="space-y-2" data-walkthrough="health-score">
```

**Step 6: Verify build**

```bash
npm run build 2>&1 | head -20
```

**Step 7: Commit**

```bash
git add src/components/sidebar.tsx "src/app/(app)/documents/page.tsx" "src/app/(app)/transactions/page.tsx" "src/app/(app)/reports/page.tsx" src/components/insights/health-score.tsx
git commit -m "feat(walkthrough): add data-walkthrough attributes to target elements"
```

---

### Task 6: Add "Restart walkthrough" to settings page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

**Step 1: Add the restart button**

Add import at the top (after existing imports):
```tsx
import { useWalkthrough } from '@/components/walkthrough-provider'
import { RotateCcw } from 'lucide-react'
```

Inside the component, after `const { theme, toggleTheme } = useTheme()`:
```tsx
  const { startWalkthrough } = useWalkthrough()
```

Add a new Card block after the Appearance card (after line 144's closing `</Card>`):

```tsx
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
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "feat(walkthrough): add restart button to settings page"
```

---

### Task 7: Manual QA and polish

**Files:** Potentially any of the above

**Step 1: Start dev server and test the full flow**

```bash
npm run dev
```

Open `http://localhost:3000` in the browser. The walkthrough should auto-start.

**Verify:**
- [ ] Step 1: Sidebar highlighted, tooltip appears to the right
- [ ] Step 2: Navigates to `/documents`, upload zone highlighted, tooltip below
- [ ] Step 3: Navigates to `/transactions`, table highlighted, tooltip above
- [ ] Step 4: Navigates to `/reports`, charts area highlighted, tooltip above
- [ ] Step 5: Navigates to `/insights`, health score highlighted, tooltip below. "Done" button
- [ ] Clicking "Done" dismisses overlay, `localStorage` has `walkthrough_completed = 'true'`
- [ ] Refreshing the page does NOT re-show the walkthrough
- [ ] Settings > "Restart" clears localStorage and re-starts walkthrough
- [ ] "Skip" on any step dismisses the walkthrough
- [ ] "Back" works correctly on steps 2-5
- [ ] Overlay clips correctly (cutout around target, darkened everywhere else)
- [ ] Tooltip doesn't overflow viewport on mobile-ish widths
- [ ] Dark mode: overlay, tooltip, and highlight all look correct

**Step 2: Fix any visual/positioning issues found during QA**

Common fixes:
- Tooltip overflowing viewport → add clamping logic in positioning
- z-index conflicts → ensure overlay is z-50, tooltip is z-60
- Target not found on page load → increase retry delays

**Step 3: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix(walkthrough): polish positioning and visual issues"
```
