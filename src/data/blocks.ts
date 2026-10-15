/**
 * Time Boxing block repository (PRD section 9). The only place stores/UI
 * touch the `blocks` table. Every function throws when IndexedDB fails;
 * failure handling lives in the caller (the store).
 */
import { db, type BlockRow } from '@/db/db'

/** Blocks for one date, ordered by start (index `[date+startMin]`). */
export async function listBlocks(date: string): Promise<BlockRow[]> {
  return db.blocks.where('date').equals(date).sortBy('startMin')
}

/** Write/overwrite one or many blocks — a shift operation writes the whole tail. */
export async function putBlocks(blocks: BlockRow[]): Promise<void> {
  await db.blocks.bulkPut(blocks)
}

export async function removeBlockRow(id: string): Promise<void> {
  await db.blocks.delete(id)
}
