import { flushSync } from 'react-dom'

export type PendingViewTransition = {
  finished: Promise<void>
}

/**
 * Run a state change inside a View Transition (soft cross-fade) when the
 * browser supports it and the user hasn't asked for reduced motion. Returns
 * the transition's `finished` promise so callers can key transient
 * `view-transition-name` cleanup off it (see App.tsx's navigate) — a name
 * that lingers on a large/scrollable element would make every *later*,
 * unrelated transition (theme switch, going back) pay to re-snapshot it.
 */
export function withViewTransition(apply: () => void): PendingViewTransition | undefined {
  const reducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => PendingViewTransition
  }

  if (!reducedMotion && typeof doc.startViewTransition === 'function') {
    return doc.startViewTransition(() => {
      flushSync(apply)
    })
  }

  apply()
  return undefined
}
