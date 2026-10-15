/**
 * Shortcut decision table (PRD F7): all methods × {idle, running,
 * paused/ended} × {Space, R, S}. The critical row is Time Boxing — Space
 * while running calls no action at all (the block is only closed via the
 * Finish button or S); Space while idle calls start, and the engine rejects
 * it when there is no active block (`engine.start`).
 *
 * The hook is mounted via a small probe; this file also proves that one
 * keypress produces exactly one action (double listeners would show up here).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTimer, pause as pausePhase, setBoxingEnd, start as startPhase } from './engine'
import type { TimerState } from './engine'
import { METHOD_CONFIGS, MINUTE, methodById, type RunnableMethod } from './methods'
import type { MethodConfig } from './methods'
import { useTimerShortcuts } from './useShortcuts'
import type { TimerApi } from './useTimer'

const NOW = 1_700_000_000_000
const KINDS = ['idle', 'running', 'paused/ended'] as const
const KEYS = [' ', 'R', 'S'] as const

type Kind = (typeof KINDS)[number]
type Action = 'start' | 'pause' | 'skip' | 'reset'
const ACTIONS: readonly Action[] = ['start', 'pause', 'skip', 'reset']

afterEach(cleanup)

/** State per method per kind; the clock stays at NOW so it is deterministic. */
function stateFor(config: MethodConfig, kind: Kind): TimerState {
  const idle = createTimer(config.id)
  if (config.mode === 'boxing') {
    if (kind === 'idle') return setBoxingEnd(idle, NOW + 30 * MINUTE)
    if (kind === 'running') return startPhase(setBoxingEnd(idle, NOW + 30 * MINUTE), NOW)
    // Block already past: the "ended" row of the picker.
    return setBoxingEnd(idle, NOW - MINUTE)
  }
  if (kind === 'idle') return idle
  const running = startPhase(idle, NOW)
  return kind === 'running' ? running : pausePhase(running, NOW + MINUTE)
}

/** Actions the hook should call for one row of the table. */
function expected(config: MethodConfig, kind: Kind, key: string): Action[] {
  if (key === 'R') return ['reset']
  if (key === 'S') return ['skip']
  if (config.mode === 'boxing') return kind === 'running' ? [] : ['start']
  return kind === 'running' ? ['pause'] : ['start']
}

function Probe({ timer }: { timer: TimerApi }): null {
  useTimerShortcuts(timer)
  return null
}

interface Spies {
  start: ReturnType<typeof vi.fn<() => void>>
  pause: ReturnType<typeof vi.fn<() => void>>
  skip: ReturnType<typeof vi.fn<() => void>>
  reset: ReturnType<typeof vi.fn<() => void>>
}

function makeSpies(): Spies {
  return {
    start: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    skip: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }
}

function makeTimer(config: MethodConfig, kind: Kind, spies: Spies): TimerApi {
  const state = stateFor(config, kind)
  return {
    state,
    now: NOW,
    display: 0,
    methodEditable: !state.running,
    soundBlocked: false,
    setBoxingEnd: vi.fn<(endMs: number | null) => void>(),
    resumeAt: vi.fn<(endMs: number) => void>(),
    ...spies,
  }
}

/** Fold of called actions — detects double listeners. */
function collect(spies: Spies): Action[] {
  const fired: Action[] = []
  for (const action of ACTIONS) {
    for (let i = 0; i < spies[action].mock.calls.length; i += 1) fired.push(action)
  }
  return fired
}

function press(config: MethodConfig, kind: Kind, key: string): Action[] {
  const spies = makeSpies()
  render(<Probe timer={makeTimer(config, kind, spies)} />)
  fireEvent.keyDown(window, { key })
  return collect(spies)
}

const ROWS = METHOD_CONFIGS.flatMap((config) =>
  KINDS.flatMap((kind) =>
    KEYS.map((key) => ({
      name: `${config.name} · ${kind} · "${key}"`,
      config,
      kind,
      key,
    })),
  ),
)

describe('shortcut decision table (F7)', () => {
  it.each(ROWS)('$name', ({ config, kind, key }) => {
    expect(press(config, kind, key)).toEqual(expected(config, kind, key))
  })

  it('Space in running Time Boxing does not touch the Finish (skip) action', () => {
    const boxing = METHOD_CONFIGS.find((config) => config.mode === 'boxing')
    if (boxing === undefined) throw new Error('Time Boxing method missing')
    expect(press(boxing, 'running', ' ')).toEqual([])
  })
})

describe('Space and button focus', () => {
  interface Outcome {
    fired: Action[]
    keydownPrevented: boolean
    keyupPrevented: boolean
  }

  /**
   * Space: the global shortcut semantics run wherever focus is (except
   * inputs); native activation is prevented only on the primary action
   * button because its label changes underneath focus (Start→Pause,
   * Start→Finish).
   */
  function pressAt(config: RunnableMethod, kind: Kind, selector: string): Outcome {
    const spies = makeSpies()
    const view = render(
      <>
        <Probe timer={makeTimer(config, kind, spies)} />
        <button type="button" data-primary-action="">
          Primary action
        </button>
        <button type="button">Other button</button>
        <input aria-label="notes" />
      </>,
    )
    const target = selector === 'window' ? window : view.container.querySelector(selector)
    if (target === null) throw new Error(`target ${selector} not found`)

    let keydownPrevented = false
    let keyupPrevented = false
    // Spies attach after the shortcut effect: listener order makes them read
    // defaultPrevented AFTER the shortcut handler runs.
    window.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        keydownPrevented = event.defaultPrevented
      },
      { once: true },
    )
    window.addEventListener(
      'keyup',
      (event: KeyboardEvent) => {
        keyupPrevented = event.defaultPrevented
      },
      { once: true },
    )

    fireEvent.keyDown(target, { key: ' ' })
    fireEvent.keyUp(target, { key: ' ' })
    return { fired: collect(spies), keydownPrevented, keyupPrevented }
  }

  it('primary action button, running Pomodoro: shortcut pauses once, native activation cancelled', () => {
    const outcome = pressAt(methodById('pomodoro'), 'running', '[data-primary-action]')
    expect(outcome.fired).toEqual(['pause'])
    expect(outcome.keydownPrevented).toBe(true)
    expect(outcome.keyupPrevented).toBe(true)
  })

  it('primary action button, running Time Boxing: no action and native cancelled', () => {
    const outcome = pressAt(methodById('timeboxing'), 'running', '[data-primary-action]')
    expect(outcome.fired).toEqual([])
    expect(outcome.keydownPrevented).toBe(true)
    expect(outcome.keyupPrevented).toBe(true)
  })

  it('other button: native activation stays, shortcut still runs', () => {
    const outcome = pressAt(methodById('pomodoro'), 'running', 'button:not([data-primary-action])')
    expect(outcome.fired).toEqual(['pause'])
    expect(outcome.keydownPrevented).toBe(false)
    expect(outcome.keyupPrevented).toBe(false)
  })

  it('in an input: Space types, the shortcut does not run', () => {
    const outcome = pressAt(methodById('pomodoro'), 'idle', 'input')
    expect(outcome.fired).toEqual([])
    expect(outcome.keydownPrevented).toBe(false)
  })

  it('outside controls: Space is prevented (anti-scroll) then the shortcut runs', () => {
    const outcome = pressAt(methodById('pomodoro'), 'idle', 'window')
    expect(outcome.fired).toEqual(['start'])
    expect(outcome.keydownPrevented).toBe(true)
  })
})
