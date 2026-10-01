import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useSettings } from '@/state/settings'

/** Token tema dipasang di <html>, jadi satu set variabel CSS melayani seluruh halaman. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettings((state) => state.settings.theme)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (query.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (theme !== 'system') return
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [theme])

  return children
}
