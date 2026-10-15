/**
 * Keyboard shortcuts (PRD F7): Space start/pause, R reset, S skip,
 * M mini window, 1-5 switch methods while idle. Disabled while focus is in
 * an input/textarea/select, with modifiers held, and on key auto-repeat.
 * Space does not scroll.
 *
 * Space performs the global shortcut semantics wherever focus is, except
 * in inputs. Native activation is prevented only on the primary action
 * button ([data-primary-action]): its label changes underneath focus
 * (Start → Pause → Start, or Start → Finish in Time Boxing), so Space
 * could trigger the wrong new label. Enter and click still activate the
 * primary button; other buttons/links keep native Space activation
 * (standard accessibility behavior).
 *
 * Time Boxing differs: Space only starts (needs an active block) and does
 * nothing while running — the block is closed via the Finish button or the
 * S shortcut, not via Space.
 *
 * Listeners attach to the given window — the main page uses its own window,
 * the mini window attaches listeners inside the mini window so Space/R work
 * when focus is there.
 */

import { useCallback, useEffect, useRef } from 'react'
import { METHOD_CONFIGS, methodById } from './methods'
import { useSettings } from '@/state/settings'
import type { TimerApi } from './useTimer'

export interface ShortcutOptions {
  running: boolean
  methodEditable: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
  /** Toggle the mini window (F4). */
  onMini: (() => void) | null
  /** Toggle the task panel (F9). */
  onTasks: (() => void) | null
  selectMethod: (index: number) => void
}

/**
 * Selector lookup near the target. `instanceof Element` is not used:
 * elements in the mini window come from a different document realm and
 * fail the instanceof check.
 */
function near(node: EventTarget | null, selector: string): Element | null {
  const el = node as Element | null
  return typeof el?.closest === 'function' ? el.closest(selector) : null
}

export function useShortcuts(options: ShortcutOptions, host: Window = window): void {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return
      if (near(event.target, 'input, textarea, select, [contenteditable="true"]')) return

      const opts = optionsRef.current

      if (event.key === ' ') {
        // Primary action button: its label changes underneath focus, so native
        // Space activation is suppressed (keydown + keyup) so only the shortcut
        // semantics run. Other buttons/links stay native.
        const primary = near(event.target, '[data-primary-action]') !== null
        const control = near(event.target, 'button, a') !== null
        if (primary || !control) event.preventDefault()
        if (opts.running) opts.pause()
        else opts.start()
        return
      }

      if (event.key >= '1' && event.key <= '5') {
        if (!opts.methodEditable) return
        opts.selectMethod(Number(event.key) - 1)
        return
      }

      const letter = event.key.toLowerCase()
      if (letter === 'r') opts.reset()
      else if (letter === 's') opts.skip()
      if (letter === 'm') opts.onMini?.()
      else if (letter === 't') opts.onTasks?.()
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      // Some engines activate buttons on Space keyup; suppressed only for the
      // primary action button (see the note in onKeyDown).
      if (event.key === ' ' && near(event.target, '[data-primary-action]') !== null) {
        event.preventDefault()
      }
    }

    host.addEventListener('keydown', onKeyDown)
    host.addEventListener('keyup', onKeyUp)
    return () => {
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('keyup', onKeyUp)
    }
  }, [host])
}

export interface TimerShortcutHooks {
  /** Toggle the mini window; null = inactive. */
  onMini?: (() => void) | null
  /** Toggle the task panel; null = inactive. */
  onTasks?: (() => void) | null
  /** Window receiving the listeners; defaults to the main page. */
  host?: Window
}

/** Deliberately empty action (e.g. Space while Time Boxing is running). */
const noop = (): void => {}

/** Timer-flow shortcuts — used by the main screen and the mini window (F4). */
export function useTimerShortcuts(timer: TimerApi, hooks: TimerShortcutHooks = {}): void {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const { onMini = null, onTasks = null, host } = hooks
  // Time Boxing: Space while running does not end the block (PRD F7).
  const boxing = methodById(timer.state.method).mode === 'boxing'

  const selectMethod = useCallback(
    (index: number) => {
      const config = METHOD_CONFIGS[index]
      if (!config) return
      if (!timer.methodEditable) return
      setLastMethod(config.id)
    },
    [setLastMethod, timer.methodEditable],
  )

  useShortcuts(
    {
      running: timer.state.running,
      methodEditable: timer.methodEditable,
      start: timer.start,
      pause: boxing ? noop : timer.pause,
      skip: timer.skip,
      reset: timer.reset,
      onMini,
      onTasks,
      selectMethod,
    },
    host,
  )
}
