import type { BlockRow } from '@/db/db'
import { describe, expect, it } from 'vitest'
import { createTimer, setBoxingEnd, skip, start } from './engine'
import { MINUTE, methodById } from './methods'
import {
  APP_TITLE,
  boxingStatus,
  documentTitle,
  isBlockPrompt,
  phaseLabel,
  primaryLabel,
  sessionProgress,
  sessionStatus,
} from './labels'

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0)

describe('session labels', () => {
  it('Pomodoro shows the position in the cycle', () => {
    expect(sessionStatus(methodById('pomodoro'), 3, 'focus')).toBe('Focus · Session 3 of 4')
    expect(sessionStatus(methodById('pomodoro'), 4, 'longBreak')).toBe(
      'Long break · Session 4 of 4',
    )
  })

  it('methods without a fixed cycle never show session position', () => {
    expect(sessionStatus(methodById('flowtime'), 1, 'focus')).toBe('Focus')
    expect(sessionStatus(methodById('52-17'), 1, 'break')).toBe('Break')
    expect(sessionStatus(methodById('ultradian'), 1, 'focus')).toBe('Focus')
  })

  it('phase labels are in English', () => {
    expect(phaseLabel('focus')).toBe('Focus')
    expect(phaseLabel('break')).toBe('Break')
    expect(phaseLabel('longBreak')).toBe('Long break')
  })

  it('primary button label follows the phase and method mode', () => {
    expect(primaryLabel(createTimer('pomodoro'))).toBe('Start')
    expect(primaryLabel(start(createTimer('pomodoro'), T0))).toBe('Pause')
    const rest = skip(start(createTimer('pomodoro'), T0), T0)
    expect(primaryLabel(rest)).toBe('Start break')
    // A running count-up is offered as "Finish".
    expect(primaryLabel(start(createTimer('flowtime'), T0))).toBe('Finish')
  })

  it('session progress: countdown from the planned phase, count-up always 0', () => {
    expect(sessionProgress(createTimer('pomodoro'), 25 * MINUTE)).toBe(0)
    expect(sessionProgress(createTimer('pomodoro'), 10 * MINUTE)).toBe(60)
    expect(sessionProgress(start(createTimer('flowtime'), T0), 0)).toBe(0)
  })
})

describe('tab title', () => {
  it('while running: remaining time + phase', () => {
    const running = start(createTimer('pomodoro'), T0)
    expect(documentTitle(running, 25 * MINUTE, null, false)).toBe('25:00 · Focus')
  })

  it('while idle: the app name', () => {
    expect(documentTitle(createTimer('pomodoro'), 25 * MINUTE, null, false)).toBe(APP_TITLE)
    expect(APP_TITLE).toBe('Ritme')
  })

  it('session finished while tab hidden: marker until the user returns', () => {
    expect(documentTitle(createTimer('pomodoro'), 5 * MINUTE, 'Break ready', true)).toBe(
      '● Break ready',
    )
    // Back on the tab → the marker is no longer used.
    expect(documentTitle(createTimer('pomodoro'), 5 * MINUTE, 'Break ready', false)).toBe(
      APP_TITLE,
    )
  })
})

describe('Time Boxing labels', () => {
  const now = new Date(2026, 0, 5, 12, 30).getTime()
  const block: BlockRow = {
    id: 'b1',
    date: '2026-01-05',
    startMin: 11 * 60 + 45,
    endMin: 12 * 60 + 45,
    status: 'running',
  }
  const idle = createTimer('timeboxing')
  const running = start(setBoxingEnd(idle, now + 15 * MINUTE), now - 10 * MINUTE)

  it('status: finished-block marker, active block range, next block', () => {
    const ended = { ...running, running: false, endTime: now - 1_000 }
    expect(boxingStatus(ended, [block], now)).toBe('Block finished')
    expect(boxingStatus(running, [block], now)).toBe('Focus · 11:45–12:45')
    expect(boxingStatus(running, [], now)).toBe('No next block')
  })

  it('block prompt: only idle with an endTime already past', () => {
    const ended = { ...running, running: false, endTime: now - 1_000 }
    expect(isBlockPrompt(ended, now)).toBe(true)
    expect(isBlockPrompt(running, now)).toBe(false)
    expect(isBlockPrompt({ ...ended, endTime: now + 60_000 }, now)).toBe(false)
  })

  it('progress uses the block length, not the planned phase', () => {
    expect(sessionProgress(running, 10 * MINUTE, 30 * MINUTE)).toBe(67)
    expect(sessionProgress(running, 30 * MINUTE, 30 * MINUTE)).toBe(0)
    expect(sessionProgress(idle, 0)).toBe(0)
  })
})
