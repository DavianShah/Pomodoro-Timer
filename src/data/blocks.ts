/**
 * Repository blok Time Boxing (PRD bagian 9). Satu-satunya tempat store/UI
 * berurutan dengan tabel `blocks`. Semua fungsi melempar error saat
 * IndexedDB gagal; penanganan gagal ada di pemanggil (store).
 */
import { db, type BlockRow } from '@/db/db'

/** Blok satu tanggal, urut awal (index `[date+startMin]`). */
export async function listBlocks(date: string): Promise<BlockRow[]> {
  return db.blocks.where('date').equals(date).sortBy('startMin')
}

/** Tulis/timpa satu atau banyak blok — operasi geser menulis seluruh ekor. */
export async function putBlocks(blocks: BlockRow[]): Promise<void> {
  await db.blocks.bulkPut(blocks)
}

export async function removeBlockRow(id: string): Promise<void> {
  await db.blocks.delete(id)
}
