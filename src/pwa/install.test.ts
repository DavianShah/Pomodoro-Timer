import { describe, expect, it, vi } from 'vitest'
import { initInstallPrompt, useInstall } from './install'

// Listener dipasang sekali, sama seperti di main.tsx.
initInstallPrompt()

/** Kirim beforeinstallprompt buatan; kembalikan spy prompt-nya. */
function dispatchPrompt(): ReturnType<typeof vi.fn<() => Promise<void>>> {
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
  }
  event.prompt = prompt
  window.dispatchEvent(event)
  return prompt
}

describe('tombol Pasang aplikasi (F15)', () => {
  it('tersedia hanya setelah browser menawarkan pemasangan', () => {
    useInstall.setState({ available: false })
    expect(useInstall.getState().available).toBe(false)

    dispatchPrompt()
    expect(useInstall.getState().available).toBe(true)
  })

  it('sekali dipakai hilang dan prompt tidak dipanggil dua kali', () => {
    const prompt = dispatchPrompt()
    useInstall.getState().prompt()
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(useInstall.getState().available).toBe(false)

    useInstall.getState().prompt()
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('hilang setelah terpasang', () => {
    dispatchPrompt()
    expect(useInstall.getState().available).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))
    expect(useInstall.getState().available).toBe(false)
  })
})
