import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { resolveTheme, useSettings } from '@/state/settings'

/** Token tema dipasang di <html>, jadi satu set variabel CSS melayani seluruh halaman. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettings((state) => state.settings.theme)
  const settingsLoaded = useSettings((state) => state.settingsLoaded)

  useEffect(() => {
    // Nilai awal sudah dipasang theme-boot.js sebelum render pertama. Tunggu
    // pengaturan tersimpan supaya default 'system' tidak menimpanya (kilatan).
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
