import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dataTasks from '@/data/tasks'
import { useSettings } from './settings'
import { useTasks } from './tasks'

beforeEach(() => {
  useSettings.setState({ databaseAvailable: true })
  useTasks.setState({ tasks: [], open: false })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useTasks saat IndexedDB gagal', () => {
  it('load gagal: tidak melempar, daftar kosong, databaseAvailable false', async () => {
    vi.spyOn(dataTasks, 'listTasks').mockRejectedValue(new Error('IDB mati'))

    await expect(useTasks.getState().load()).resolves.toBeUndefined()
    expect(useTasks.getState().tasks).toEqual([])
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })

  it('add gagal: tidak melempar, ditandai tidak tersedia', async () => {
    vi.spyOn(dataTasks, 'addTask').mockRejectedValue(new Error('IDB mati'))

    await expect(useTasks.getState().add('Tugas')).resolves.toBeUndefined()
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })

  it('remove gagal: tidak melempar', async () => {
    vi.spyOn(dataTasks, 'removeTask').mockRejectedValue(new Error('IDB mati'))

    await expect(useTasks.getState().remove('x')).resolves.toBeUndefined()
    expect(useSettings.getState().databaseAvailable).toBe(false)
  })
})
