import { useState } from 'react'
import { ArrowUpRight, Bookmark, Check, MapPin } from 'lucide-react'
import { displayDate, shiftDay, validUrl, type Article, type Event, type Listing, type Savable } from './model'

export function SaveButton({ record, saved, ready, save, iconOnly = false }: {
  record: Savable; saved: boolean; ready: boolean; save: (record: Savable) => void; iconOnly?: boolean
}) {
  const label = saved ? 'Saved' : 'Save'
  return <button className={iconOnly ? 'button icon-button' : 'button'} aria-pressed={saved} disabled={!ready}
    aria-label={iconOnly ? label + ' · ' + record.title : undefined} title={iconOnly ? label : undefined} onClick={() => save(record)}>
    <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /> {!iconOnly && label}
  </button>
}

export function Outlet({ article, dark }: { article: Article; dark: boolean }) {
  const light = validUrl(article.logoLight)
  const night = validUrl(article.logoDark)
  const [failed, setFailed] = useState<string[]>([])
  const url = (dark ? [night, light] : [light, night]).find(candidate => candidate && !failed.includes(candidate))
  return <span className="outlet">
    {url && <span className={'outlet-logo' + (dark && url === light && url !== night ? ' light-logo' : '')}>
      <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, url])} />
    </span>}
    {article.outlet || 'Article'}
  </span>
}

export function ArticleCard({ article, dark, read, open, children }: {
  article: Article; dark: boolean; read: boolean; open: () => void; children: React.ReactNode
}) {
  const title = <>{article.emoji && <span>{article.emoji} </span>}{article.title}</>
  return <article className={'card digest-article' + (article.feature ? ' clickable-card' : '')}>
    <div className="article-byline"><Outlet article={article} dark={dark} /><span>{displayDate(article.date)}</span>
      {read && <span className="badge"><Check size={12} /> Read</span>}
    </div>
    <h3>{article.feature ? <button className="record-title card-target" onClick={open}>{title}</button> : title}</h3>
    {article.description && <p className="description article-summary">{article.description}</p>}
    {children && <div className="card-actions">{children}</div>}
  </article>
}

export function TransitLink({ event, origin }: { event: Event; origin: string }) {
  if (!event.address || /not (?:stated|listed|published)|\b(?:TBA|TBD|online)\b/i.test(event.address)) return null
  const route = new URL('https://www.google.com/maps/dir/')
  route.search = new URLSearchParams({ api: '1', destination: event.address, travelmode: 'transit' }).toString()
  if (origin) route.searchParams.set('origin', origin)
  return <a className="transit-link" href={route.href} target="_blank" rel="noreferrer">
    <MapPin size={14} /> Transit directions
  </a>
}

function scheduledMeta(item: Event | Listing) {
  return item.kind === 'event' ? [item.time, item.location, item.price] : [item.organizer, item.category, item.price]
}

export function ScheduleCard({ item, compact, tracked, open, origin, children }: {
  item: Event | Listing; compact?: boolean; tracked?: boolean; open: () => void; origin: string; children: React.ReactNode
}) {
  const website = item.kind === 'event' ? validUrl(item.url) : ''
  return <article className={'card schedule-card clickable-card' + (compact ? ' compact-row' : '') + (tracked ? ' tracked-row' : '')}>
    <div className="card-main">
      <span className="card-icon mint" aria-hidden="true">{item.emoji || (item.kind === 'event' ? '📅' : '✉️')}</span>
      <div className="card-content">
        <div className="card-title"><h3>{website ? <a className="record-title card-target" href={website} target="_blank" rel="noreferrer">{item.title}</a>
            : <button className="record-title card-target" onClick={open}>{item.title}</button>}</h3>
          {!compact && (item.kind === 'event' ? item.top : item.top || item.deadlineSoon) && <span className="badge top">{item.kind === 'opportunity' && !item.top ? 'Deadline soon' : 'Top pick'}</span>}
        </div>
        <p className="meta">{scheduledMeta(item).filter(Boolean).join(' · ')}</p>
        {item.kind === 'event' && <div className="transit-meta">
          <TransitLink event={item} origin={origin} />
          {item.travel && <span>{item.travel} estimated transit</span>}
        </div>}
        {!compact && item.description && <p className="description article-summary">{item.description}</p>}
      </div>
    </div>
    <div className="schedule-actions">{children}</div>
  </article>
}

export function SourceLink({ url, label }: { url: string; label: string }) {
  const href = validUrl(url)
  return href ? <a className="primary" href={href} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={15} /></a> : null
}

export function Schedule({ items, today, isOpportunity, render }: {
  items: (Event | Listing)[]; today: string; isOpportunity: boolean; render: (item: Event | Listing, compact: boolean) => React.ReactNode
}) {
  const weekEnd = shiftDay(today, 7 - (new Date(today + 'T12:00:00Z').getUTCDay() || 7))
  const days = new Map<string, (Event | Listing)[]>()
  for (const item of items) {
    const records = days.get(item.date) ?? []
    records.push(item)
    days.set(item.date, records)
  }
  const dates = [...days.keys()].filter(Boolean).sort()
  const sections = [
    { label: 'Rest of this week', dates: dates.filter(date => date > today && date <= weekEnd) },
    { label: 'Later', dates: dates.filter(date => date > weekEnd) },
    { label: 'Open deadlines', dates: days.has('') ? [''] : [] }
  ]
  return <>
    <section className="group schedule-today">
      <h3>Today <span>{displayDate(today)}</span></h3>
      {days.has(today) ? <div className="cards">{days.get(today)!.map(item => render(item, false))}</div>
        : <p className="quiet">{isOpportunity ? 'No deadlines today.' : 'No listings for today.'}</p>}
    </section>
    {sections.map(section => section.dates.length > 0 && <section className="group" key={section.label}>
      <h3>{section.label}</h3>
      {section.dates.map(date => <div className="day-group" key={date}>
        {date && <h4>{displayDate(date)}</h4>}
        <div className="cards compact-cards">{days.get(date)!.map(item => render(item, true))}</div>
      </div>)}
    </section>)}
  </>
}

export function ArticleImage({ article }: { article: Article }) {
  const [failed, setFailed] = useState(false)
  const src = validUrl(article.image)
  return src && !failed ? <img className="reader-image" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : null
}
