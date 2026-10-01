import { useId } from 'react'
import { useSettings, type ThemeChoice } from '@/state/settings'

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Terang' },
  { value: 'dark', label: 'Gelap' },
]

export default function ThemeToggle() {
  const theme = useSettings((state) => state.settings.theme)
  const setTheme = useSettings((state) => state.setTheme)
  const name = useId()

  return (
    <fieldset className="flex items-center gap-3 border-0 p-0">
      <legend className="label float-left mr-3">Tema</legend>
      <div className="flex gap-1">
        {OPTIONS.map((option) => {
          const active = option.value === theme
          return (
            <label
              key={option.value}
              className={
                'cursor-pointer rounded-sm border px-2 py-1 text-xs transition-colors ' +
                (active
                  ? 'border-ink text-ink'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')
              }
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => setTheme(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
