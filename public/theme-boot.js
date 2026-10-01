/**
 * Pratinjau tema sebelum render pertama (F12). Baca pilihan tema dari
 * localStorage lalu pasang data-theme di <html> sebelum gaya pertama dipakai,
 * supaya halaman tidak berkedip terang lalu gelap. Classic script, sinkron,
 * tanpa inline — lolos CSP script-src 'self'.
 *
 * Keggagalan baca dibiarkan: ThemeProvider memperbaiki setelah hydrate.
 */
;(function bootTheme() {
  var KEY = 'ritme.v1.ritme.settings'
  try {
    var choice = 'system'
    var raw = window.localStorage.getItem(KEY)
    if (raw !== null) {
      var envelope = JSON.parse(raw)
      var stored = envelope && envelope.value ? envelope.value.theme : undefined
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        choice = stored
      }
    }
    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset.theme =
      choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
  } catch (error) {
    // localStorage/JSON bisa gagal (mode privasi); biarkan aplikasi memperbaiki.
  }
})()
