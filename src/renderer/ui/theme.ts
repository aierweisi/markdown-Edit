import type { AppContext } from '../context'
import type { Theme } from '@shared/types'

/** Resolve 'auto' to the OS-preferred theme; pass explicit light/dark through. */
export function effectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyThemeSideEffects(_ctx: AppContext, theme: Theme): void {
  const eff = effectiveTheme(theme)
  document.body.classList.toggle('theme-dark', eff === 'dark')
  document.body.classList.toggle('theme-light', eff !== 'dark')
}
