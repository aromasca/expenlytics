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
    // Cap height so large elements (tables, charts) don't overflow the viewport
    const maxHeight = Math.min(r.height, window.innerHeight * 0.6)
    setTargetRect({ top: Math.max(r.top, 8), left: r.left, width: r.width, height: maxHeight })
  }, [step.target])

  // Find target element — scroll top into view, then measure with retries
  useEffect(() => {
    const el = document.querySelector(`[data-walkthrough="${step.target}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const timers = [
      setTimeout(() => { setTargetRect(null); findAndMeasure() }, 0),
      setTimeout(findAndMeasure, 200),
      setTimeout(findAndMeasure, 500),
      setTimeout(findAndMeasure, 800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [step.target, findAndMeasure])

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
    const roomAbove = targetRect.top - 8
    if (roomAbove >= 110) {
      // Enough room above — place tooltip above element
      tooltipStyle.bottom = window.innerHeight - targetRect.top + TOOLTIP_GAP
    } else {
      // Not enough room above — float tooltip inside the highlight, near the top
      tooltipStyle.top = targetRect.top + PADDING + TOOLTIP_GAP
    }
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
