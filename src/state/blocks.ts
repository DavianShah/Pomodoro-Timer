/**
 * Today's Time Boxing block store (F16). Components call the store; the
 * store calls the pure operations in `src/timer/blocks` and then the
 * `src/data/blocks` repository — Dexie never touches the UI. Validation
 * failures come back as a message to show in the panel; IndexedDB failures
 * are flagged via `databaseAvailable` (one banner for the app).
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
  /** The loaded date (`YYYY-MM-DD`, device timezone). */
  date: string
  /** Schedule panel open. */
  open: boolean
  load: () => Promise<void>
  refresh: () => Promise<void>
  toggleOpen: () => void
  /** Create a block; null = success, string = validation message. */
  create: (fields: BlockFields) => Promise<string | null>
  /** Edit a block; null = success, string = validation message. */
  edit: (id: string, fields: BlockFields) => Promise<string | null>
  remove: (id: string) => Promise<void>
  /** Extend (Resume 15) — returns the new block, or null. */
  extend: (id: string, extraMin: number) => Promise<BlockRow | null>
  /** Shift every following block. */
  shift: (id: string, deltaMin: number) => Promise<void>
  /** Mark the block the timer currently covers as `running`. */
  markRunning: (now: number) => Promise<void>
}

function markUnavailable(error: unknown): void {
  console.warn('Ritme: blocks unavailable', error)
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
