import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const preference = window.matchMedia('(prefers-color-scheme: dark)')
const key = 'digest:theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem(key)
      if (value === 'dark' || value === 'light') return value
    } catch {}
    return 'system'
  })
  const [systemDark, setSystemDark] = useState(preference.matches)
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    const change = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    preference.addEventListener('change', change)
    return () => preference.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try { localStorage.setItem(key, theme) } catch {}
  }, [dark, theme])
  return { theme, setTheme, dark }
}
