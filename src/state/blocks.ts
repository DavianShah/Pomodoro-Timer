/**
 * Store blok Time Boxing hari ini (F16). Komponen memanggil store; store
 * memanggil operasi murni `src/timer/blocks` lalu repository
 * `src/data/blocks` — Dexie tidak pernah tersentuh UI. Kegagalan validasi
 * dikembalikan sebagai pesan untuk ditampilkan di panel; kegagalan
 * IndexedDB ditandai ke `databaseAvailable` (satu banner untuk aplikasi).
 */
import { create } from 'zustand'
import type { BlockRow } from '@/db/db'
import { listBlocks, putBlocks, removeBlockRow } from '@/data/blocks'
import { localDateKey } from '@/timer/sessionRecord'
import {
  createBlock,
  currentBlock,
  deleteBlock,
  extendBlock,
  shiftFollowing,
  sortBlocks,
  updateBlock,
  type BlockFields,
} from '@/timer/blocks'
import { useSettings } from './settings'

interface BlocksState {
  blocks: BlockRow[]
  /** Tanggal yang dimuat (`YYYY-MM-DD`, zona perangkat). */
  date: string
  /** Panel Jadwal terbuka. */
  open: boolean
  load: () => Promise<void>
  refresh: () => Promise<void>
  toggleOpen: () => void
  /** Buat blok baru; null = sukses, string = pesan validasi. */
  create: (fields: BlockFields) => Promise<string | null>
  /** Ubah blok; null = sukses, string = pesan validasi. */
  edit: (id: string, fields: BlockFields) => Promise<string | null>
  remove: (id: string) => Promise<void>
  /** Perpanjang (Lanjut 15) — kembalikan blok barunya, atau null. */
  extend: (id: string, extraMin: number) => Promise<BlockRow | null>
  /** Geser semua blok setelahnya. */
  shift: (id: string, deltaMin: number) => Promise<void>
  /** Tandai blok yang sedang dicover timer sebagai `running`. */
  markRunning: (now: number) => Promise<void>
}

function markUnavailable(error: unknown): void {
  console.warn('Ritme: blok tidak bisa diakses', error)
  useSettings.setState({ databaseAvailable: false })
}

export const useBlocks = create<BlocksState>()((set, get) => {
  const reload = async (): Promise<void> => {
    const date = localDateKey(Date.now())
    try {
      set({ blocks: await listBlocks(date), date })
    } catch (error) {
      markUnavailable(error)
    }
  }

  return {
    blocks: [],
    date: localDateKey(Date.now()),
    open: false,
    load: reload,
    refresh: reload,
    toggleOpen: () => set({ open: !get().open }),

    create: async (fields) => {
      const { blocks, date } = get()
      const result = createBlock(date, fields, blocks)
      if (!result.ok) return result.error
      try {
        await putBlocks([result.block])
      } catch (error) {
        markUnavailable(error)
        return null
      }
      set({ blocks: sortBlocks([...blocks, result.block]) })
      return null
    },

    edit: async (id, fields) => {
      const { blocks } = get()
      const result = updateBlock(id, fields, blocks)
      if (!result.ok) return result.error
      try {
        await putBlocks([result.block])
      } catch (error) {
        markUnavailable(error)
        return null
      }
      set({ blocks: sortBlocks(blocks.map((block) => (block.id === id ? result.block : block))) })
      return null
    },

    remove: async (id) => {
      const { blocks } = get()
      const result = deleteBlock(id, blocks)
      if (!result.ok) return
      try {
        await removeBlockRow(id)
      } catch (error) {
        markUnavailable(error)
        return
      }
      set({ blocks: result.blocks })
    },

    extend: async (id, extraMin) => {
      const { blocks } = get()
      const result = extendBlock(id, extraMin, blocks)
      if (!result.ok) return null
      try {
        await putBlocks(result.blocks)
      } catch (error) {
        markUnavailable(error)
        return null
      }
      set({ blocks: sortBlocks(result.blocks) })
      return result.blocks.find((block) => block.id === id) ?? null
    },

    shift: async (id, deltaMin) => {
      const { blocks } = get()
      const result = shiftFollowing(id, deltaMin, blocks)
      if (!result.ok || result.blocks === blocks) return
      try {
        await putBlocks(result.blocks)
      } catch (error) {
        markUnavailable(error)
        return
      }
      set({ blocks: result.blocks })
    },

    markRunning: async (now) => {
      const { blocks, date } = get()
      if (localDateKey(now) !== date) return
      const current = currentBlock(blocks, now)
      if (current === null || current.status !== 'planned') return
      const next: BlockRow[] = blocks.map((block) =>
        block.id === current.id ? { ...block, status: 'running' } : block,
      )
      try {
        await putBlocks(next)
      } catch (error) {
        markUnavailable(error)
        return
      }
      set({ blocks: next })
    },
  }
})
