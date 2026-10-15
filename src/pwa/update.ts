/**
 * Service worker updates (PRD F15): a new version installs in the background
 * but does NOT reload on its own — one "A new version is available" row that
 * the user decides on. Kept separate from `register.ts` so it can be tested
 * without the `virtual:pwa-register` module.
 */
import { create } from 'zustand'

let applyUpdate: (() => Promise<void>) | null = null

export interface SwUpdateState {
  /** A new version is waiting; the row shows while the timer is not running. */
  ready: boolean
  /** Reload into the new version. */
  reload: () => void
}

export const useSwUpdate = create<SwUpdateState>(() => ({
  ready: false,
  reload: () => {
    void applyUpdate?.()
  },
}))

/** Called by registerSW: wires up the actual reload. */
export function bindUpdateApply(apply: () => Promise<void>): void {
  applyUpdate = apply
}
