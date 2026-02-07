# Warm UI Redesign & Dark Mode - Design Document

**Date:** 2026-02-07
**Status:** Approved

## Overview

Redesign Expenlytics UI with warm peach/coral tones and soft rounded corners to create a more inviting, less intimidating financial app experience. Add dark mode toggle in Settings page.

## Design Decisions

### Color Palette: Peach/Coral

**Light Mode:**
- Background: Warm off-white (#FEF7F4)
- Primary accent: Coral (#F97066)
- Secondary: Soft peach (#FFDDD2)
- Sidebar: Warm tone (#FDF0EC)
- Borders: Peachy-gray (#F4E5E0)
- Charts: Warm palette - coral, amber, peach, terracotta, rose

**Dark Mode:**
- Background: Deep warm charcoal (#1A1614)
- Primary accent: Bright coral (#FF8A80)
- Secondary: Muted peach (#3A2A26) for elevated surfaces
- Text: Warm off-white (#FAF5F2)
- Charts: High saturation warm palette

### Border Radius

Increase from 10px to 12px base (`--radius: 0.75rem`), maintaining proportional scaling for larger elements.

### Dark Mode Implementation

**Approach:** localStorage-based toggle with React context
- `ThemeProvider` context wraps app
- `.dark` class applied to `<html>` element
- Settings page toggle switch (no system auto-detect)
- Blocking script prevents flash on load
- Default: light mode

## Component Changes

### Sidebar
- Warm backgrounds in both modes
- Coral active states
- Soft peach hover highlights

### Cards & Buttons
- Increased border-radius (12px base)
- Warm shadows (peachy tint)
- Coral primary buttons
- Warm hover states

### Tables & Charts
- Warm striped rows
- Peachy hover highlights
- Updated chart color palette
- Warm borders throughout

## Implementation Files

1. `src/app/globals.css` - Color variables, radius
2. `src/app/layout.tsx` - Theme provider, blocking script
3. `src/components/theme-provider.tsx` - New context
4. `src/app/(app)/settings/page.tsx` - Toggle UI

## Migration Strategy

CSS variable updates cascade automatically to all components. No structural changes needed.

## Testing Checklist

- [ ] All pages render in both themes
- [ ] Chart readability in dark mode
- [ ] WCAG AA contrast ratios
- [ ] Toggle persistence across reloads
- [ ] Mobile responsive unchanged
