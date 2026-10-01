/**
 * Jendela mini (PRD bagian 6 / F4). Satu sumber kebenaran tetap di halaman
 * utama: window mini hanya menampilkan state dan mengirim aksi. Buka/tutup
 * hanya lewat aksi user (klik/keydown), tidak pernah otomatis.
 *
 * Dokumen window mini disiapkan dengan mengklon elemen <link
 * rel="stylesheet"> — proyek punya CSP dan menyalin cssRules ke <style>
 * inline bisa terblokir; @font-face ikut termuat dari stylesheet yang sama.
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
 * Buka window mini. Cara utama: Document PiP (deteksi via `'documentPictureInPicture'
 * in window`, bukan user agent). PiP tidak ada/ditolak → fallback `window.open`;
 * popup diblokir → `ok: false` supaya layar menampilkan pesan, bukan gagal diam-diam.
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
      // Ditolak/gagal → jatuh ke popup.
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
    // Sudah tertutup — bukan kesalahan.
  }
}

/** Salin data-theme dan data-phase ke window mini (aksen per fase + mode terang/gelap). */
export function syncThemeAndPhase(source: HTMLElement, target: HTMLElement): void {
  for (const name of ['data-theme', 'data-phase'] as const) {
    const value = source.getAttribute(name)
    if (value !== null) target.setAttribute(name, value)
    else target.removeAttribute(name)
  }
}

/** Siapkan dokumen window mini: stylesheet klon, atribut tema/fase, akar render. */
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
