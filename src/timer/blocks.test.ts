import { describe, expect, it } from 'vitest'
import type { BlockRow } from '@/db/db'
import {
  blockEndingAt,
  blockEndMs,
  blockStartMs,
  createBlock,
  DAY_MIN,
  deleteBlock,
  extendBlock,
  formatBlockRange,
  formatMin,
  currentBlock,
  nextBlock,
  shiftFollowing,
  snapMin,
  updateBlock,
  type BlockListResult,
  type BlockResult,
} from './blocks'
function must(result: BlockResult): Extract<BlockResult, { ok: true }>
function must(result: BlockListResult): Extract<BlockListResult, { ok: true }>
function must(result: BlockResult | BlockListResult): {
  ok: true
  block?: BlockRow
  blocks?: BlockRow[]
} {
  if (!result.ok) throw new Error(`ekspektasi sukses: ${result.error}`)
  return result
}

function errorOf(result: BlockResult | BlockListResult): string {
  if (result.ok) throw new Error('ekspektasi operasi gagal')
  return result.error
}

const DATE = '2026-10-01'

let seq = 0
const fixedId = (): string => `blk-${seq++}`

function block(startMin: number, endMin: number, extra: Partial<BlockRow> = {}): BlockRow {
  return { id: fixedId(), date: DATE, startMin, endMin, status: 'planned', ...extra }
}

describe('snapMin', () => {
  it('membulatkan ke kelipatan 15 terdekat', () => {
    expect(snapMin(67)).toBe(60)
    expect(snapMin(68)).toBe(75)
    expect(snapMin(66)).toBe(60)
    expect(snapMin(0)).toBe(0)
  })

  it('dijepit ke rentang hari', () => {
    expect(snapMin(-10)).toBe(0)
    expect(snapMin(1435)).toBe(DAY_MIN)
    expect(snapMin(2000)).toBe(DAY_MIN)
  })
})

describe('createBlock', () => {
  it('menyelaraskan input ke 15 menit dan menandai planned', () => {
    const result = must(createBlock(DATE, { startMin: 67, endMin: 137 }, [], fixedId))
    expect(result.block).toEqual({
      id: 'blk-0',
      date: DATE,
      startMin: 60,
      endMin: 135,
      status: 'planned',
    })
  })

  it('membawa taskId bila diberikan', () => {
    const result = must(createBlock(DATE, { startMin: 0, endMin: 60, taskId: 't1' }, [], fixedId))
    expect(result.block.taskId).toBe('t1')
  })

  it('menolak durasi di bawah 15 menit', () => {
    const error = errorOf(createBlock(DATE, { startMin: 60, endMin: 70 }, [], fixedId))
    expect(error).toBe('Durasi minimal 15 menit')
  })

  it('menolak rentang terbalik', () => {
    const error = errorOf(createBlock(DATE, { startMin: 120, endMin: 60 }, [], fixedId))
    expect(error).toBe('Selesai harus setelah mulai')
  })

  it('menolak tumpang tindih dengan blok lain', () => {
    const blocks = [block(60, 120)]
    const error = errorOf(createBlock(DATE, { startMin: 105, endMin: 165 }, blocks, fixedId))
    expect(error).toBe('Blok tumpang tindih')
  })

  it('mengizinkan blok berdempetan', () => {
    const blocks = [block(60, 120)]
    const result = must(createBlock(DATE, { startMin: 120, endMin: 180 }, blocks, fixedId))
    expect(result.block.startMin).toBe(120)
  })
})

describe('updateBlock', () => {
  it('mengubah isi blok tanpa menolak dirinya sendiri', () => {
    const blocks = [block(60, 120)]
    const result = must(updateBlock(blocks[0]!.id, { startMin: 60, endMin: 150 }, blocks))
    expect(result.block.endMin).toBe(150)
    expect(result.block.date).toBe(DATE)
  })

  it('mengembalikan status ke planned kecuali sedang running', () => {
    const running = [block(60, 120, { status: 'running' })]
    const overrun = [block(180, 240, { status: 'overrun' })]
    const a = must(updateBlock(running[0]!.id, { startMin: 60, endMin: 120 }, running))
    const b = must(updateBlock(overrun[0]!.id, { startMin: 180, endMin: 240 }, overrun))
    expect(a.block.status).toBe('running')
    expect(b.block.status).toBe('planned')
  })

  it('taskId hilang di fields = blok tanpa task', () => {
    const blocks = [block(60, 120, { taskId: 't1' })]
    const result = must(updateBlock(blocks[0]!.id, { startMin: 60, endMin: 120 }, blocks))
    expect('taskId' in result.block).toBe(false)
  })

  it('menolak tumpang tindih dengan blok lain', () => {
    const blocks = [block(60, 120), block(180, 240)]
    const error = errorOf(updateBlock(blocks[0]!.id, { startMin: 60, endMin: 200 }, blocks))
    expect(error).toBe('Blok tumpang tindih')
  })

  it('blok tidak ditemukan', () => {
    const error = errorOf(updateBlock('hilang', { startMin: 0, endMin: 60 }, []))
    expect(error).toBe('Blok tidak ditemukan')
  })
})

describe('deleteBlock', () => {
  it('menghapus satu blok, sisanya utuh', () => {
    const blocks = [block(60, 120), block(180, 240)]
    const result = must(deleteBlock(blocks[0]!.id, blocks))
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]?.startMin).toBe(180)
  })

  it('blok tidak ditemukan', () => {
    expect(errorOf(deleteBlock('hilang', []))).toBe('Blok tidak ditemukan')
  })
})

describe('extendBlock', () => {
  it('memperpanjang 15 menit dan menandai overrun', () => {
    const blocks = [block(60, 120)]
    const result = must(extendBlock(blocks[0]!.id, 15, blocks))
    expect(result.blocks[0]?.endMin).toBe(135)
    expect(result.blocks[0]?.status).toBe('overrun')
  })

  it('blok berikutnya menempel ikut digeser sejauh perpanjangan', () => {
    const blocks = [block(60, 120), block(120, 180)]
    const result = must(extendBlock(blocks[0]!.id, 15, blocks))
    const [cur, next] = result.blocks
    expect(cur?.endMin).toBe(135)
    expect(next?.startMin).toBe(135)
    expect(next?.endMin).toBe(195)
  })

  it('blok dengan jarak jauh tidak ikut digeser', () => {
    const blocks = [block(60, 120), block(600, 660)]
    const result = must(extendBlock(blocks[0]!.id, 15, blocks))
    expect(result.blocks[1]?.startMin).toBe(600)
  })

  it('perpanjangan dijepit sisa hari — ekor ikut dan berhenti di 24:00', () => {
    const blocks = [block(60, 120), block(120, 1435)]
    const result = must(extendBlock(blocks[0]!.id, 30, blocks))
    expect(result.blocks[0]?.endMin).toBe(125)
    expect(result.blocks[1]).toEqual({ ...blocks[1], startMin: 125, endMin: DAY_MIN })
  })

  it('blok sudah berakhir 24:00 tidak bisa diperpanjang', () => {
    const blocks = [block(60, DAY_MIN)]
    expect(errorOf(extendBlock(blocks[0]!.id, 15, blocks))).toBe('Sudah 24.00')
  })

  it('hari penuh sampai 24:00 menolak perpanjangan', () => {
    const blocks = [block(60, 120), block(120, DAY_MIN)]
    expect(errorOf(extendBlock(blocks[0]!.id, 15, blocks))).toBe('Hari sudah penuh')
  })

  it('blok tidak ditemukan', () => {
    expect(errorOf(extendBlock('hilang', 15, []))).toBe('Blok tidak ditemukan')
  })
})

describe('shiftFollowing', () => {
  it('menggeser semua blok setelahnya sebesar delta', () => {
    const blocks = [block(60, 120), block(120, 180), block(240, 300)]
    const result = must(shiftFollowing(blocks[0]!.id, 20, blocks))
    const [cur, a, b] = result.blocks
    expect(cur?.startMin).toBe(60)
    expect(a?.startMin).toBe(140)
    expect(a?.endMin).toBe(200)
    expect(b?.startMin).toBe(260)
    expect(b?.endMin).toBe(320)
  })

  it('delta dijepit supaya tidak melewati 24:00', () => {
    const blocks = [block(60, 120), block(720, 1435)]
    const result = must(shiftFollowing(blocks[0]!.id, 30, blocks))
    expect(result.blocks[1]?.endMin).toBe(DAY_MIN)
  })

  it('delta nol = tanpa perubahan', () => {
    const blocks = [block(60, 120), block(120, 180)]
    const result = must(shiftFollowing(blocks[0]!.id, 0, blocks))
    expect(result.blocks).toBe(blocks)
  })

  it('tanpa blok berikutnya = tanpa perubahan', () => {
    const blocks = [block(60, 120)]
    const result = must(shiftFollowing(blocks[0]!.id, 30, blocks))
    expect(result.blocks).toBe(blocks)
  })

  it('blok tidak ditemukan', () => {
    expect(errorOf(shiftFollowing('hilang', 15, []))).toBe('Blok tidak ditemukan')
  })
})

describe('lookup waktu', () => {
  it('epoch mulai dan akhir (1440 jatuh ke tengah malam)', () => {
    const b = block(540, 600)
    expect(blockStartMs(b)).toBe(new Date(2026, 9, 1, 9, 0).getTime())
    expect(blockEndMs(b)).toBe(new Date(2026, 9, 1, 10, 0).getTime())
    expect(blockEndMs(block(1380, DAY_MIN))).toBe(new Date(2026, 9, 2, 0, 0).getTime())
  })

  it('formatMin menulis 24 jam', () => {
    expect(formatMin(0)).toBe('00:00')
    expect(formatMin(615)).toBe('10:15')
    expect(formatMin(DAY_MIN)).toBe('24:00')
    expect(formatBlockRange(block(540, 630))).toBe('09:00–10:30')
  })

  it('currentBlock mencakup awal dan tidak mencakup akhir', () => {
    const blocks = [block(540, 600)]
    expect(currentBlock(blocks, new Date(2026, 9, 1, 9, 0).getTime())?.startMin).toBe(540)
    expect(currentBlock(blocks, new Date(2026, 9, 1, 9, 59).getTime())?.startMin).toBe(540)
    expect(currentBlock(blocks, new Date(2026, 9, 1, 10, 0).getTime())).toBeNull()
    expect(currentBlock(blocks, new Date(2026, 9, 1, 8, 59).getTime())).toBeNull()
  })

  it('nextBlock mengabaikan blok yang sudah lewat', () => {
    const blocks = [block(540, 600), block(660, 720)]
    const now = new Date(2026, 9, 1, 9, 30).getTime()
    expect(nextBlock(blocks, now)?.startMin).toBe(660)
    expect(nextBlock(blocks, new Date(2026, 9, 1, 12, 0).getTime())).toBeNull()
  })

  it('blockEndingAt menemukan blok dari epoch akhir', () => {
    const blocks = [block(540, 600), block(1380, DAY_MIN)]
    expect(blockEndingAt(blocks, blockEndMs(blocks[0]!))?.startMin).toBe(540)
    expect(blockEndingAt(blocks, new Date(2026, 9, 2, 0, 0).getTime())?.startMin).toBe(1380)
    expect(blockEndingAt(blocks, new Date(2026, 9, 1, 10, 30).getTime())).toBeNull()
  })
})
