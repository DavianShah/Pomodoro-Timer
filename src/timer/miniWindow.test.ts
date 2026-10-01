import { describe, expect, it, vi } from 'vitest'
import {
  closeMiniWindow,
  openMiniWindow,
  prepareMiniDocument,
  syncThemeAndPhase,
} from './miniWindow'

function fakeWindow(): Window {
  return { close: vi.fn() } as unknown as Window
}

describe('jendela mini: buka/tutup', () => {
  it('memakai Document PiP kalau tersedia, dengan ukuran 300×180', async () => {
    const pipWin = fakeWindow()
    const requestWindow = vi.fn().mockResolvedValue(pipWin)
    const open = vi.fn()
    const host = { documentPictureInPicture: { requestWindow }, open } as unknown as Window

    const result = await openMiniWindow(host)

    expect(result).toEqual({ ok: true, kind: 'pip', win: pipWin })
    expect(requestWindow).toHaveBeenCalledWith({ width: 300, height: 180 })
    expect(open).not.toHaveBeenCalled()
  })

  it('tanpa PiP: jatuh ke window.open dengan fitur popup kecil', async () => {
    const popup = fakeWindow()
    const open = vi.fn().mockReturnValue(popup)
    const host = { open } as unknown as Window

    const result = await openMiniWindow(host)

    expect(result).toEqual({ ok: true, kind: 'popup', win: popup })
    expect(open).toHaveBeenCalledWith('', 'ritme-mini', expect.stringContaining('width=300'))
  })

  it('PiP ditolak (requestWindow reject): jatuh ke window.open', async () => {
    const popup = fakeWindow()
    const requestWindow = vi.fn().mockRejectedValue(new Error('ditolak'))
    const open = vi.fn().mockReturnValue(popup)
    const host = { documentPictureInPicture: { requestWindow }, open } as unknown as Window

    const result = await openMiniWindow(host)

    expect(result).toEqual({ ok: true, kind: 'popup', win: popup })
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('properti ada tapi tidak bisa dipakai: tetap jatuh ke popup', async () => {
    const popup = fakeWindow()
    const open = vi.fn().mockReturnValue(popup)
    const host = { documentPictureInPicture: undefined, open } as unknown as Window

    const result = await openMiniWindow(host)

    expect(result).toEqual({ ok: true, kind: 'popup', win: popup })
  })

  it('popup diblokir browser: hasil blocked (layar menampilkan pesan)', async () => {
    const open = vi.fn().mockReturnValue(null)
    const host = { open } as unknown as Window

    const result = await openMiniWindow(host)

    expect(result).toEqual({ ok: false, reason: 'blocked' })
  })

  it('tutup memanggil close pada window-nya', () => {
    const close = vi.fn()
    const win = { close } as unknown as Window
    closeMiniWindow(win)
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('jendela mini: dokumen', () => {
  it('mengklon stylesheet halaman utama, menyalin tema/fase, membuat akar render', () => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/assets/index.css'
    document.head.appendChild(link)
    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.setAttribute('data-phase', 'break')

    const targetDoc = document.implementation.createHTMLDocument('mini')
    const target = { document: targetDoc } as unknown as Window

    prepareMiniDocument(document, target)

    const cloned = targetDoc.querySelectorAll('link[rel="stylesheet"]')
    expect(cloned).toHaveLength(1)
    expect(cloned[0]?.getAttribute('href')).toBe('/assets/index.css')
    expect(targetDoc.documentElement.dataset.theme).toBe('dark')
    expect(targetDoc.documentElement.dataset.phase).toBe('break')
    expect(targetDoc.title).toBe('Ritme')
    expect(targetDoc.getElementById('mini-root')).not.toBeNull()

    link.remove()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-phase')
  })

  it('menghapus atribut di target saat sumber tidak punya nilainya', () => {
    const source = document.createElement('div')
    const target = document.createElement('div')
    target.setAttribute('data-theme', 'light')
    target.setAttribute('data-phase', 'focus')

    syncThemeAndPhase(source, target)

    expect(target.hasAttribute('data-theme')).toBe(false)
    expect(target.hasAttribute('data-phase')).toBe(false)
  })
})
