import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { resolveTheme, useSettings } from '@/state/settings'

/** Theme tokens are applied on <html>, so one set of CSS variables serves the whole page. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettings((state) => state.settings.theme)
  const settingsLoaded = useSettings((state) => state.settingsLoaded)

  useEffect(() => {
    // The initial value is already applied by theme-boot.js before the first
    // render. Wait for stored settings so the 'system' default does not
    // override it (flash).
    if (!settingsLoaded) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme, query.matches)
    }
    apply()
    if (theme !== 'system') return
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [theme, settingsLoaded])

  return children
}
