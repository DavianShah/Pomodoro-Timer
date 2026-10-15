/**
 * Theme preview before the first render (F12). Reads the theme choice from
 * localStorage and sets data-theme on <html> before the first styles are
 * used, so the page does not flash light then dark. Classic script,
 * synchronous, no inline — passes CSP script-src 'self'.
 *
 * A failed read is left alone: ThemeProvider fixes it after hydration.
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
    // localStorage/JSON can fail (private mode); let the app fix it.
  }
})()
