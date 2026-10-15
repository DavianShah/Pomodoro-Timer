import { describe, expect, it, vi } from 'vitest'
import { initInstallPrompt, useInstall } from './install'

// Listeners are attached once, just like in main.tsx.
initInstallPrompt()

/** Dispatch a fake beforeinstallprompt; return its prompt spy. */
function dispatchPrompt(): ReturnType<typeof vi.fn<() => Promise<void>>> {
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
  }
  event.prompt = prompt
  window.dispatchEvent(event)
  return prompt
}

describe('the Install app button (F15)', () => {
  it('is available only after the browser offers installation', () => {
    useInstall.setState({ available: false })
    expect(useInstall.getState().available).toBe(false)

    dispatchPrompt()
    expect(useInstall.getState().available).toBe(true)
  })

  it('once used it disappears and the prompt is not called twice', () => {
    const prompt = dispatchPrompt()
    useInstall.getState().prompt()
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(useInstall.getState().available).toBe(false)

    useInstall.getState().prompt()
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('disappears after installation', () => {
    dispatchPrompt()
    expect(useInstall.getState().available).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))
    expect(useInstall.getState().available).toBe(false)
  })
})
