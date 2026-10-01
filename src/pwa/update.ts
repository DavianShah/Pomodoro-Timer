/**
 * Pembaruan service worker (PRD F15): versi baru dipasang di latar belakang
 * tapi TIDAK memuat ulang sendiri — satu baris "Versi baru tersedia" yang
 * diputuskan user. Terpisah dari `register.ts` supaya bisa diuji tanpa modul
 * virtual `virtual:pwa-register`.
 */
import { create } from 'zustand'

let applyUpdate: (() => Promise<void>) | null = null

export interface SwUpdateState {
  /** Versi baru sudah menunggu; baris tampil saat timer tidak berjalan. */
  ready: boolean
  /** Muat ulang ke versi baru. */
  reload: () => void
}

export const useSwUpdate = create<SwUpdateState>(() => ({
  ready: false,
  reload: () => {
    void applyUpdate?.()
  },
}))

/** Dipanggil registerSW: pasang tombol muat ulang yang sebenarnya. */
export function bindUpdateApply(apply: () => Promise<void>): void {
  applyUpdate = apply
}
