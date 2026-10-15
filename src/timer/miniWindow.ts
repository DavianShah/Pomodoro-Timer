/**
 * Mini window (PRD section 6 / F4). The single source of truth stays on the
 * main page: the mini window only displays state and sends actions. It opens
 * and closes only through user actions (click/keydown), never automatically.
 *
 * The mini window document is prepared by cloning <link rel="stylesheet">
 * elements — the project has a CSP, and copying cssRules into an inline
 * <style> could be blocked; @font-face loads from the same stylesheet too.
 */

import { APP_TITLE } from './labels'

export const MINI_ROOT_ID = 'mini-root'

const PIP_SIZE = { width: 300, height: 180 }
const POPUP_FEATURES = 'width=300,height=180,menubar=no,toolbar=no,location=no,status=no'

export type MiniOpenResult =
  { ok: true; kind: 'pip' | 'popup'; win: Window } | { ok: false; reason: 'blocked' }

interface PipLike {
  requestWindow(options: { width: number; height: number }): Promise<Window>
}

type MiniHost = Window & { documentPictureInPicture?: PipLike }

/**
 * Open the mini window. Primary path: Document PiP (detected via
 * `'documentPictureInPicture' in window`, not the user agent). PiP missing
 * or denied → `window.open` fallback; popup blocked → `ok: false` so the
 * screen shows a message instead of failing silently.
 */
export async function openMiniWindow(host: Window): Promise<MiniOpenResult> {
  if ('documentPictureInPicture' in host) {
    try {
      const pip = (host as MiniHost).documentPictureInPicture
      if (pip) {
        const win = await pip.requestWindow({ width: PIP_SIZE.width, height: PIP_SIZE.height })
        return { ok: true, kind: 'pip', win }
      }
    } catch {
      // Denied/failed → fall back to a popup.
    }
  }
  const popup = host.open('', 'ritme-mini', POPUP_FEATURES)
  if (popup === null) return { ok: false, reason: 'blocked' }
  return { ok: true, kind: 'popup', win: popup }
}

export function closeMiniWindow(win: Window): void {
  try {
    win.close()
  } catch {
    // Already closed — not an error.
  }
}

/** Copy data-theme and data-phase to the mini window (per-phase accent + light/dark mode). */
export function syncThemeAndPhase(source: HTMLElement, target: HTMLElement): void {
  for (const name of ['data-theme', 'data-phase'] as const) {
    const value = source.getAttribute(name)
    if (value !== null) target.setAttribute(name, value)
    else target.removeAttribute(name)
  }
}

/** Prepare the mini window document: cloned stylesheets, theme/phase attributes, render root. */
export function prepareMiniDocument(source: Document, target: Window): void {
  const doc = target.document
  doc.title = APP_TITLE

  const lang = source.documentElement.getAttribute('lang')
  if (lang !== null) doc.documentElement.setAttribute('lang', lang)
  syncThemeAndPhase(source.documentElement, doc.documentElement)

  for (const link of source.querySelectorAll('link[rel="stylesheet"]')) {
    doc.head.appendChild(link.cloneNode(true))
  }

  if (doc.getElementById(MINI_ROOT_ID) === null) {
    const root = doc.createElement('div')
    root.id = MINI_ROOT_ID
    doc.body.appendChild(root)
  }
}
