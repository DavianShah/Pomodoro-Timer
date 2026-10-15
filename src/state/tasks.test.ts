import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dataTasks from '@/data/tasks'
import { useSettings } from './settings'
import { useTasks } from './tasks'

beforeEach(() => {
  useSettings.setState({ databaseAvailable: true })
  useTasks.setState({ tasks: [], open: false })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useTasks when IndexedDB fails', () => {
  it('load fails: does not throw, list stays empty, databaseAvailable false', async () => {
    vi.spyOn(dataTasks, 'listTasks').mockRejectedValue(new Error('IDB down'))

    await expect(useTasks.getState().load()).resolves.toBeUndefined()
    expect(useTasks.getState().tasks).toEqual([])
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })

  it('add fails: does not throw, flagged as unavailable', async () => {
    vi.spyOn(dataTasks, 'addTask').mockRejectedValue(new Error('IDB down'))

    await expect(useTasks.getState().add('Task')).resolves.toBeUndefined()
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })

  it('remove fails: does not throw', async () => {
    vi.spyOn(dataTasks, 'removeTask').mockRejectedValue(new Error('IDB down'))

    await expect(useTasks.getState().remove('x')).resolves.toBeUndefined()
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })
})
