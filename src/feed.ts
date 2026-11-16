import { useEffect, useRef, useState } from 'react'
import { isArticle, isListing, isObject, isOpportunity, type Snapshot } from './model'
import { readSnapshot, storeSnapshot } from './storage'

const BASE = import.meta.env.BASE_URL
type Manifest = { file: string; updatedAt: string | null; preview?: boolean }
export function useFeed(editing: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [pending, setPending] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const current = useRef<Snapshot | null>(null)
  useEffect(() => {
    if (!editing && pending) { setSnapshot(pending); setPending(null) }
  }, [editing, pending])
  useEffect(() => {
    let active = true
    let checking = false
    let lastChecked = 0
    const check = async () => {
      if (checking) return
      checking = true
      lastChecked = Date.now()
      try {
        const folder = BASE + 'data/'
        const response = await fetch(folder + 'latest.json', { cache: 'no-store' })
        if (!response.ok) throw Error('Feed unavailable')
        const manifest: Manifest = await response.json()
        if (!/^snapshot(?:-[\w-]+)?\.json$/.test(manifest.file)) throw Error('Invalid version')
        if (!manifest.preview && current.current && manifest.updatedAt === current.current.updatedAt && !!manifest.preview === !!current.current.preview) {
          if (active) setUnavailable(false)
          return
        }
        const file = await fetch(folder + manifest.file, manifest.preview ? { cache: 'no-store' } : undefined)
        if (!file.ok) throw Error('Snapshot unavailable')
        const data: unknown = await file.json()
        if (!isObject(data) || data.updatedAt !== manifest.updatedAt || !Array.isArray(data.jobs) || !Array.isArray(data.events) ||
          !data.jobs.every(item => isOpportunity(item) && item.kind === 'job') ||
          !data.events.every(item => isOpportunity(item) && item.kind === 'event') ||
          (data.articles !== undefined && (!Array.isArray(data.articles) || !data.articles.every(isArticle))) ||
          (data.opportunities !== undefined && (!Array.isArray(data.opportunities) || !data.opportunities.every(isListing)))) throw Error('Invalid snapshot')
        if (!active) return
        current.current = data as Snapshot
        setPending(current.current)
        void storeSnapshot(current.current).catch(() => {})
      } catch {
        if (active) setUnavailable(true)
        return
      } finally {
        checking = false
        if (active) setLoading(false)
      }
      if (active) setUnavailable(false)
    }
    void readSnapshot().then(cached => {
      if (active && cached?.articles) { current.current = cached; setSnapshot(cached); setLoading(false) }
    }).catch(() => {}).finally(() => { if (active) void check() })
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastChecked >= 5 * 60_000) void check()
    }
    const timer = window.setInterval(onVisible, 5 * 60_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
  return { snapshot, loading, unavailable }
}
