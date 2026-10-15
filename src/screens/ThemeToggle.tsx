import { useId } from 'react'
import { useSettings, type ThemeChoice } from '@/state/settings'

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function ThemeToggle() {
  const theme = useSettings((state) => state.settings.theme)
  const setTheme = useSettings((state) => state.setTheme)
  const name = useId()

  return (
    <fieldset className="flex items-center gap-3 border-0 p-0">
      <legend className="label float-left mr-3">Theme</legend>
      <div className="flex gap-1">
        {OPTIONS.map((option) => {
          const active = option.value === theme
          return (
            <label
              key={option.value}
              className={
                'cursor-pointer border-b-2 px-2 pb-1 text-xs transition-colors ' +
                // Radio input is sr-only: the focus ring is drawn on its label.
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ' +
                (active
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink')
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
