import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays,
  Bookmark, Check, ChevronDown, Ellipsis, EyeOff, FileText, House, MapPin, Moon, Newspaper, Search, Settings2, Sparkles, Sun, Users, X
} from 'lucide-react'
import { useFeed } from './feed'
import { readPersonal, subscribe, updatePersonal } from './storage'
import {
  displayDate, emptyPersonal, isProfile, localDate, readBackup, shiftDay, statuses, textKey, validUrl,
  type Application, type Article, type Event, type Job, type Listing, type Personal, type Profile, type Savable, type Status
} from './model'
import { ArticleCard, ArticleCarousel, ArticleImage, Outlet, SaveButton, Schedule, ScheduleCard, SourceLink, TransitLink } from './digest'
import { useDesign, useTheme } from './theme'
import './style.css'

type View = 'News' | 'Events' | 'Networking' | 'Opportunities' | 'Saved' | 'Jobs'
const navigation = [
  { name: 'News', Icon: Newspaper }, { name: 'Networking', Icon: Users },
  { name: 'Events', Icon: CalendarDays }, { name: 'Opportunities', Icon: BriefcaseBusiness }, { name: 'Saved', Icon: Bookmark }
] as const
const jobFilters = ['All Jobs', 'New Today', 'Top Picks', 'Saved', 'Applied'] as const
const lastUpdated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })
const headings = {
  News: 'News', Events: 'NYC events', Networking: 'Networking', Opportunities: 'Opportunities', Saved: 'Saved', Jobs: 'Jobs'
}
const savedTabs = [
  ['all', 'All saved'], ['article', 'Articles'], ['event', 'Events & networking'], ['opportunity', 'Opportunities'], ['activity', 'Activity']
] as const
const LIST_SIZE = 100
function eventTime(time: string) {
  const match = /\b(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(time)
  if (!match) return 24 * 60
  const [, hours, minutes, meridiem] = match
  const hour = meridiem ? Number(hours) % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0) : Number(hours)
  return hour * 60 + Number(minutes)
}
const comingFirst = (a: Event, b: Event) => a.date.localeCompare(b.date) ||
  Number(b.top) - Number(a.top) || eventTime(a.time) - eventTime(b.time) || a.title.localeCompare(b.title)
const isApplied = (application?: Application) => !!application?.appliedAt || ['Applied', 'Interview', 'Rejected', 'Offer'].includes(application?.status ?? '')
const known = (value: string) => value && !/^(?:не вказано|невідомо|n\/a|—|-)(?:$|\s*\()/i.test(value) ? value : ''

function App() {
  const [view, setView] = useState<View>('News')
  const [personal, setPersonal] = useState<Personal>(emptyPersonal)
  const [storageReady, setStorageReady] = useState(false)
  const [jobFilter, setJobFilter] = useState<typeof jobFilters[number]>('All Jobs')
  const [savedTab, setSavedTab] = useState<typeof savedTabs[number][0] | 'job' | 'hidden'>('all')
  const [reader, setReader] = useState<Article>()
  const [detail, setDetail] = useState<Event | Listing>()
  const { theme, setTheme, dark } = useTheme()
  const { design, setDesign } = useDesign()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [page, setPage] = useState(1)
  const [origin, setOrigin] = useState(() => {
    try { return localStorage.getItem('digest:transit-origin') ?? '' } catch { return '' }
  })
  const [housingOnly, setHousingOnly] = useState(false)
  const [settings, setSettings] = useState(false)
  const [note, setNote] = useState<Job>()
  const [cv, setCV] = useState<Job>()
  const [feedback, setFeedback] = useState('')
  const [today, setToday] = useState(localDate)
  const [includeProfile, setIncludeProfile] = useState(false)
  const { snapshot, loading, unavailable } = useFeed(!!note || !!cv || !!reader || !!detail)
  useEffect(() => {
    const refresh = () => {
      void readPersonal().then(value => { setPersonal(value); setStorageReady(true) }).catch(() => setFeedback('Browser storage is unavailable.'))
    }
    refresh()
    return subscribe(refresh)
  }, [])
  useEffect(() => {
    const refresh = () => setToday(localDate())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(''), 4200)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const commit = async (update: (current: Personal) => Personal) => {
    try { setPersonal(await updatePersonal(update)); return true }
    catch { setFeedback('Couldn’t save to this browser.'); return false }
  }
  const save = (record: Savable) => void commit(current => {
    const saved = { ...current.saved }
    if (saved[record.id]) delete saved[record.id]
    else saved[record.id] = record
    return { ...current, saved }
  })
  const openArticle = (article: Article) => {
    setReader(article)
    if (storageReady) void commit(current => ({
      ...current,
      reading: {
        ...current.reading,
        [article.id]: { article, openedAt: new Date().toISOString(), read: current.reading?.[article.id]?.read ?? false }
      }
    }))
  }
  const toggleRead = (article: Article) => void commit(current => ({
    ...current,
    reading: {
      ...current.reading,
      [article.id]: { article, openedAt: new Date().toISOString(), read: !current.reading?.[article.id]?.read }
    }
  }))
  const toggleActivity = (item: Event | Listing) => void commit(current => {
    const activity = { ...current.activity }
    if (activity[item.id]) delete activity[item.id]
    else activity[item.id] = { item, completedAt: new Date().toISOString() }
    return { ...current, activity }
  })
  const updateJob = (job: Job, change: Partial<Application>) => commit(current => {
    const previous = current.applications[job.id] as Application | undefined
    const application: Application = { ...(previous ?? { status: 'Not Applied', note: '' }), ...change, job }
    if (change.status === 'Applied' && !application.appliedAt) application.appliedAt = new Date().toISOString()
    if (change.status === 'Not Applied' || change.status === 'Interested') delete application.appliedAt
    return { ...current, applications: { ...current.applications, [job.id]: application } }
  })
  const switchTo = (next: View) => { setView(next); setPage(1); window.scrollTo(0, 0) }
  const importFile = async (event: ChangeEvent<HTMLInputElement>, profile: boolean) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const value: unknown = JSON.parse(await file.text())
      if (profile) {
        if (!isProfile(value)) throw Error('Choose a valid CV profile JSON file.')
        if (await commit(current => ({ ...current, profile: value }))) setFeedback('CV profile imported.')
      } else {
        const restored = readBackup(value)
        if (await commit(current => ({
          saved: { ...current.saved, ...restored.saved },
          reading: { ...current.reading, ...restored.reading },
          activity: { ...current.activity, ...restored.activity },
          applications: { ...current.applications, ...restored.applications },
          profile: restored.profile ?? current.profile
        }))) setFeedback('Backup restored.')
      }
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Couldn’t read this file.') }
  }
  const saved = Object.values(personal.saved)
  const savedJobs = saved.filter(item => item.kind === 'job')
  const savedEvents = saved.filter(item => item.kind === 'event').sort(comingFirst)
  const allJobs = [...new Map([...(snapshot?.jobs ?? []), ...savedJobs, ...Object.values(personal.applications).map(entry => entry.job)].map(job => [job.id, job])).values()]
  const jobs = allJobs.filter(job => !personal.applications[job.id]?.hidden)
  const events = (snapshot?.events ?? []).filter(event => event.date >= today).sort(comingFirst)
  const applied = Object.values(personal.applications).filter(isApplied)
  const jobPool = jobFilter === 'Saved' ? savedJobs : jobFilter === 'Applied' ?
    Array.from(new Map([...applied.map(item => item.job), ...jobs.filter(job => isApplied(personal.applications[job.id]))].map(job => [job.id, job])).values()) : jobs
  const searchTerms = textKey(search).trim().split(/\s+/).filter(Boolean)
  const filteredJobs = jobPool.filter(job => {
    if (personal.applications[job.id]?.hidden) return false
    if (jobFilter === 'New Today' && job.firstSeen !== today) return false
    if (jobFilter === 'Top Picks' && !job.top) return false
    const text = textKey([job.title, job.company, job.description, job.location, job.category, job.employment].join(' '))
    return searchTerms.every(term => text.includes(term))
  }).sort((a, b) => {
    if ((a.firstSeen === today) !== (b.firstSeen === today)) return a.firstSeen === today ? -1 : 1
    const order = sort === 'new' ? -1 : 1
    const recent = (job: Job) => /^\d{4}-\d{2}-\d{2}$/.test(job.published) ? job.published : job.firstSeen
    return order * (a.firstSeen.localeCompare(b.firstSeen) || recent(a).localeCompare(recent(b)))
  })
  const pages = Math.max(1, Math.ceil(filteredJobs.length / LIST_SIZE))
  const currentPage = Math.min(page, pages)
  const visibleJobs = filteredJobs.slice((currentPage - 1) * LIST_SIZE, currentPage * LIST_SIZE)
  const allArticles = snapshot?.articles ?? []
  const featuredArticles = [...new Map([
    ...allArticles.filter(article => article.feature && article.date >= shiftDay(today, -3) && article.date <= today),
    ...saved.filter((item): item is Article => item.kind === 'article' && item.feature)
  ].map(article => [article.id, article])).values()]
  const latestStories = allArticles.filter(article => !article.feature &&
    article.date >= shiftDay(today, -1) && article.date <= today)
  const reading = Object.values(personal.reading ?? {})
    .filter(entry => !entry.read)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  const activity = Object.values(personal.activity ?? {}).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  const attended = new Set(activity.map(entry => entry.item.id))
  const yesterday = shiftDay(today, -1)
  const checkIn = savedEvents.filter(event => event.date === yesterday && !attended.has(event.id))
  const checkInIds = new Set(checkIn.map(event => event.id))
  const listedOpportunities = (snapshot?.opportunities ?? []).filter(item =>
    (!housingOnly || /\bhousing\b/i.test(item.category)) && (item.date >= today || !item.date) && !/^(closed|expired|cancelled|canceled)$/i.test(item.sourceStatus)
  )
  const soon = listedOpportunities.filter(item => item.date && (item.top || item.deadlineSoon || item.date <= shiftDay(today, 6)))
    .sort((a, b) => Number(!!b.top) - Number(!!a.top) || Number(!!b.deadlineSoon) - Number(!!a.deadlineSoon) || a.date.localeCompare(b.date))
    .slice(0, 3)
  const soonIds = new Set(soon.map(item => item.id))
  const moreOpportunities = listedOpportunities.filter(item => !soonIds.has(item.id))
  const savedItems = savedTab === 'activity' ? activity.map(entry => entry.item) :
    savedTab === 'hidden' ? Object.values(personal.applications).filter(item => item.hidden).map(item => item.job) :
    saved.filter(item => (savedTab === 'all' || item.kind === savedTab) && !checkInIds.has(item.id))
  const tabs = allJobs.length ? [...savedTabs, ['job', 'Jobs'], ['hidden', 'Hidden jobs']] as const : savedTabs

  const saveButton = (record: Savable, iconOnly = false) => <SaveButton record={record}
    saved={!!personal.saved[record.id]} ready={storageReady} save={save} iconOnly={iconOnly} />
  const activityButton = (item: Event | Listing) => {
    const complete = attended.has(item.id)
    return <button className="button" aria-pressed={complete} disabled={!storageReady} onClick={() => toggleActivity(item)}>
      <Check size={15} /> {item.kind === 'event' ? (complete ? 'Attended' : 'Mark attended') : (complete ? 'Sent' : 'Mark sent')}
    </button>
  }
  const card = (record: Savable, compact = false, tracked = false, preview = false) => {
    if (record.kind === 'article') return <ArticleCard key={record.id} article={record} dark={dark} preview={preview}
      read={!!personal.reading?.[record.id]?.read} open={() => openArticle(record)}>
      {record.feature && saveButton(record)}
    </ArticleCard>
    if (record.kind !== 'job') return <ScheduleCard key={record.id} item={record} compact={compact} tracked={tracked} origin={origin.trim()} open={() => setDetail(record)}>
      {tracked && <span className="schedule-date">{record.date ? displayDate(record.date) : record.kind === 'opportunity' ? record.deadline : ''}</span>}
      {saveButton(record, compact && !tracked)}
      {tracked && activityButton(record)}
      {tracked && record.kind === 'event' && <button className="button" onClick={() => setDetail(record)}>Details</button>}
    </ScheduleCard>
    return <OpportunityCard key={record.id} record={record} today={today}
      saved={!!personal.saved[record.id]} application={personal.applications[record.id]} storageReady={storageReady}
      onSave={() => save(record)} onCV={setCV} onNote={setNote} onUpdate={updateJob} />
  }

  return <>
    <header className="topbar">
      <div className="top-inner">
        <button className="brand" onClick={() => switchTo('News')} aria-label="Digest home">
          <span className="brand-mark"><Sparkles size={19} strokeWidth={2.3} /></span>
          <span>Andrew’s Digest 🚀</span>
        </button>
        <nav className="navigation" aria-label="Main navigation">
          {navigation.map(({ name, Icon }) => <button key={name} onClick={() => switchTo(name)} aria-current={view === name ? 'page' : undefined}>
            <Icon size={17} /><span>{name}</span>
          </button>)}
        </nav>
        <div className="header-actions">
        <button className="settings-button" aria-label={dark ? 'Use light mode' : 'Use dark mode'} title={dark ? 'Use light mode' : 'Use dark mode'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="settings-button" aria-label="Settings" title="Settings" onClick={() => setSettings(true)}><Settings2 size={19} /></button>
        </div>
      </div>
    </header>
    <main className="shell">
      <section className="intro">
        <div>
          <div className="city"><MapPin size={14} /> New York City</div>
          <h1>Your digest</h1>
        </div>
        <div className="feed-state"><span className={snapshot?.updatedAt ? 'online' : ''} />
          {snapshot?.updatedAt ? 'Last updated: ' + lastUpdated.format(new Date(snapshot.updatedAt)) + ' New York time' :
            snapshot?.preview ? 'Local preview · spreadsheet export' : 'Awaiting first daily sync'}
        </div>
      </section>
      {unavailable && <div className="notice" role="status">{snapshot ? 'Showing the last available digest.' : 'The digest feed is currently unavailable.'}</div>}
      <section aria-labelledby="section-title" className="listing">
        <div className={view === 'Opportunities' ? "section-top opportunities-heading" : "section-top"}>
          <h2 id="section-title">{headings[view]}</h2>
          {view === 'Opportunities' && <button className="button" aria-pressed={housingOnly} onClick={() => setHousingOnly(!housingOnly)}><House size={17} /> Housing</button>}
          {view === 'Jobs' && <label className="search"><Search size={17} /><input type="search" placeholder="Search jobs..." aria-label="Search jobs" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label>}
        </div>
        {(view === 'Jobs' || view === 'Saved') && <div className="filterbar">
          <div className="filters" aria-label={view + ' filters'}>
            {view === 'Jobs' && jobFilters.map(filter => <button key={filter} aria-pressed={filter === jobFilter} onClick={() => { setJobFilter(filter); setPage(1) }}>{filter}</button>)}
            {view === 'Saved' && tabs.map(([filter, label]) => <button key={filter} aria-pressed={filter === savedTab} onClick={() => setSavedTab(filter)}>{label}</button>)}
          </div>
          {view === 'Jobs' && <label className="sort"><ArrowDown size={15} /><select aria-label="Sort jobs" value={sort} onChange={event => { setSort(event.target.value as 'new' | 'old'); setPage(1) }}>
            <option value="new">Newest first</option><option value="old">Oldest first</option>
          </select><ChevronDown size={13} /></label>}
        </div>}
        {view === 'Jobs' && (visibleJobs.length ? <>
          {([['New Today', true], ['Previous Opportunities', false]] as const).map(([label, fresh]) => {
            const group = visibleJobs.filter(job => (job.firstSeen === today) === fresh)
            return group.length > 0 && <div key={label} className="group"><h3>{label} <span>{group.length}</span></h3><div className="cards">{group.map(job => card(job))}</div></div>
          })}
          <div className="pagination"><span>{filteredJobs.length} jobs · Page {currentPage} of {pages}</span>
            <button disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); document.querySelector('.listing')?.scrollIntoView() }}><ArrowLeft size={16} /> Previous</button>
            <button disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); document.querySelector('.listing')?.scrollIntoView() }}>Next <ArrowRight size={16} /></button>
          </div>
        </> : <Empty icon={<BriefcaseBusiness />} title={loading ? 'Loading jobs…' : 'No jobs match this view'} detail={search ? 'Try a different search or filter.' : 'New listings appear after the daily update.'} />)}
        {view === 'News' && <>
          {featuredArticles.length > 0 && <ArticleCarousel articles={featuredArticles} render={article => card(article, false, false, true)} />}
          {reading.length > 0 && <ArticleCarousel title="📖 Continue reading"
            articles={reading.map(({ article }) => allArticles.find(item => item.id === article.id) ?? article)}
            render={article => card(article)} />}
          {latestStories.length > 0 && <section className="group"><h3>Latest stories</h3>
            <div className="cards article-grid">{latestStories.map(article => card(article))}</div>
          </section>}
          {!featuredArticles.length && !latestStories.length && !reading.length && <Empty icon={<Newspaper />} title={loading ? 'Loading news…' : 'No recent news'} detail="New articles appear after the next spreadsheet update." />}
        </>}
        {(view === 'Events' || view === 'Networking') && <Schedule key={view}
          items={events.filter(event => /networking/i.test(event.category) === (view === 'Networking'))}
          today={today} isOpportunity={false} render={item => card(item)} />}
        {view === 'Opportunities' && <>
          {soon.length > 0 && <section className="group schedule-today"><h3>Priority deadlines</h3>
            <div className="cards">{soon.map(item => card(item))}</div>
          </section>}
          {!!moreOpportunities.length && <div className="spaced">
            <Schedule items={moreOpportunities} today={today} isOpportunity render={(item, compact) => card(item, compact)} />
          </div>}
          {!listedOpportunities.length && <p className="quiet">{housingOnly ? 'No open housing opportunities.' : 'No open opportunities.'}</p>}
        </>}
        {view === 'Saved' && <>
          {(savedTab === 'all' || savedTab === 'event') && checkIn.length > 0 && <section className="group">
            <h3>Did you go yesterday?</h3>
            <div className="cards compact-cards">{checkIn.map(item => card(item, true, true))}</div>
          </section>}
          {savedItems.length > 0 && <div className="cards spaced">{savedItems.map(item => card(item, item.kind === 'event' || item.kind === 'opportunity', true))}</div>}
          {!savedItems.length && (!(savedTab === 'all' || savedTab === 'event') || !checkIn.length) &&
            <Empty icon={savedTab === 'hidden' ? <EyeOff /> : <Bookmark />}
              title={savedTab === 'activity' ? 'No activity yet' : savedTab === 'hidden' ? 'No hidden jobs' : 'Nothing saved here yet'}
              detail={savedTab === 'activity' ? 'Mark an event attended or an opportunity sent to see it here.' : savedTab === 'hidden' ? 'Jobs you hide can be restored here.' : 'Use Save on an article, event, or opportunity to keep it here.'} />}
        </>}
      </section>
    </main>
    {feedback && <div className="toast" role="status">{feedback}</div>}
    {settings && <Modal title="Settings" close={() => setSettings(false)}>
      <section className="modal-section"><h3>Appearance</h3>
        <div className="filters spaced" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map(value => <button key={value} aria-pressed={value === theme} onClick={() => setTheme(value)}>
            {{ system: 'System', light: 'Light', dark: 'Dark' }[value]}
          </button>)}
        </div>
      </section>
      <section className="modal-section"><h3>Design</h3>
        <div className="design-options" role="group" aria-label="Design">
          {([['1', 'Design 1', 'Original'], ['2', 'Design 2', 'Editorial'], ['3', 'Design 3', 'News style']] as const).map(([value, label, name]) =>
            <button key={value} className="design-option" aria-pressed={design === value} onClick={() => setDesign(value)}>
              <span className={'design-swatch swatch-' + value} aria-hidden="true"><span /><span /><span /></span>
              <strong>{label}</strong><span>{name}</span>
            </button>)}
        </div>
      </section>
      <section className="modal-section"><h3>Transit directions</h3>
        <label className="field">Starting address<input type="text" value={origin} placeholder="Use your location in Google Maps"
          onChange={event => {
            setOrigin(event.target.value)
            try { localStorage.setItem('digest:transit-origin', event.target.value) } catch {}
          }} /></label>
        <p>Google Maps receives this address when you open directions. It’s stored in this browser.</p>
      </section>
      <section className="modal-section"><h3>Browser data</h3><p>Saves, reading progress, and activity are stored in this browser. Clearing site data can remove them.</p>
        {personal.profile && <label className="check"><input type="checkbox" checked={includeProfile} onChange={event => setIncludeProfile(event.target.checked)} /> Include the CV profile in this backup</label>}
        <div className="modal-actions">
          <button className="primary" disabled={!storageReady} onClick={() => {
            const { profile, ...records } = personal
            downloadJson({ version: 2, ...records, ...(includeProfile && profile && { profile }) }, 'digest-backup-' + today + '.json')
          }}><ArrowDownToLine size={16} /> Export Backup</button>
          <label className="button file-button">Import Backup<input type="file" accept=".json,application/json" disabled={!storageReady} onChange={event => void importFile(event, false)} /></label>
        </div>
        <p>Import merges your records. Matching items use the backup’s version.</p>
      </section>
      {!!allJobs.length && <section className="modal-section"><h3>Jobs and CV profile</h3><p>{personal.profile ? 'A CV profile is stored on this device.' : 'Load your private CV profile to generate tailored CVs.'}</p>
        <div className="modal-actions"><button className="button" onClick={() => { setSettings(false); switchTo('Jobs') }}>View job history</button><label className="button file-button"><FileText size={16} /> Import CV profile<input type="file" accept=".json,application/json" disabled={!storageReady} onChange={event => void importFile(event, true)} /></label>
          {personal.profile && <button className="button" onClick={() => void commit(current => ({ ...current, profile: undefined }))}>Remove profile</button>}
        </div>
      </section>}
    </Modal>}
    {reader && <Modal title={reader.title} close={() => setReader(undefined)} wide reading>
      <div className="article-byline dialog-subtitle"><Outlet article={reader} dark={dark} />
        {reader.author && <span>{reader.author}</span>}<span>{displayDate(reader.date)}</span>
      </div>
      <ArticleImage key={reader.id} article={reader} />
      {(reader.body || reader.description) && <p className="reader-body">{reader.body || reader.description}</p>}
      <div className="modal-actions reader-actions">
        <SourceLink url={reader.url} label="Open original" />
        {reader.feature && saveButton(reader)}
        <button className="button" disabled={!storageReady} onClick={() => toggleRead(reader)} aria-pressed={!!personal.reading?.[reader.id]?.read}>
          <Check size={16} /> {personal.reading?.[reader.id]?.read ? 'Read · Undo' : 'Mark as read'}
        </button>
      </div>
    </Modal>}
    {detail && <Modal title={detail.title} close={() => setDetail(undefined)} wide>
      <p className="dialog-subtitle">
        {detail.kind === 'event'
          ? [displayDate(detail.date), detail.time, detail.location, detail.address, detail.price].filter(Boolean).join(' · ')
          : [detail.organizer, detail.date ? 'Due ' + displayDate(detail.date) : detail.deadline, detail.price].filter(Boolean).join(' · ')}
      </p>
      {detail.description && <p className="reader-body">{detail.description}</p>}
      {detail.kind === 'opportunity' && detail.eligibility && <p className="reader-summary">{detail.eligibility}</p>}
      {detail.kind === 'event' && detail.notes && <p className="source-note">{detail.notes}</p>}
      <div className="modal-actions">
        <SourceLink url={detail.url} label={detail.kind === 'event' ? 'Event website' : 'Opportunity website'} />
        {detail.kind === 'event' && <TransitLink event={detail} origin={origin.trim()} />}
        {saveButton(detail)}
        {activityButton(detail)}
      </div>
    </Modal>}
    {note && <NoteDialog job={note} application={personal.applications[note.id]} close={() => setNote(undefined)} update={updateJob} />}
    {cv && <CVDialog job={cv} profile={personal.profile} close={() => setCV(undefined)} onImport={event => void importFile(event, true)} />}
  </>
}

function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty"><span>{icon}</span><h3>{title}</h3><p>{detail}</p></div>
}
function OpportunityCard({ record, today, saved, application, storageReady, onSave, onCV, onNote, onUpdate }: {
  record: Job; today: string; saved: boolean; application?: Application; storageReady: boolean
  onSave: () => void; onCV: (job: Job) => void; onNote: (job: Job) => void
  onUpdate: (job: Job, change: Partial<Application>) => Promise<boolean>
}) {
  const job = record
  const source = validUrl(job.url)
  const map = validUrl(job.map)
  const meta = [known(job.company), known(job.employment)]
  return <article className="card">
    <div className="card-main">
      <span className="card-icon blue"><BriefcaseBusiness size={21} /></span>
      <div className="card-content">
        <div className="card-title"><h3>{record.title}</h3>
          {record.top && <span className="badge top"><Sparkles size={12} /> Top Pick</span>}
          {job?.firstSeen === today && <span className="badge fresh">New</span>}
        </div>
        <div className="meta">{meta.filter(Boolean).map((item, index) => <span key={index}>{item}</span>)}</div>
        <div className="details">
          {known(record.location) && <span><MapPin size={14} />{map ? <a href={map} target="_blank" rel="noreferrer">{record.location}</a> : record.location}</span>}
          {known(job.salary) && <span className="price">{job.salary}</span>}
        </div>
        {record.description && <p className="description">{record.description}</p>}
        {record.notes && <p className="source-note">{record.notes}</p>}
        <div className="record-labels">
          {record.category && <span>{record.category}</span>}
          {job?.published && <span>{/^\d{4}-\d{2}-\d{2}$/.test(job.published) ? 'Published ' : ''}{job.published}</span>}
          {job?.firstSeen && <span>Discovered {job.firstSeen}</span>}
          {application?.status && application.status !== 'Not Applied' && <span className="applied-label">{application.status}{application.appliedAt && ' · ' + localDate(new Date(application.appliedAt))}</span>}
        </div>
      </div>
    </div>
    <div className="card-actions">
      {source && <a className="primary" href={source} target="_blank" rel="noreferrer">View Job <ArrowUpRight size={15} /></a>}
      <button className="button" disabled={!storageReady} onClick={onSave} aria-pressed={saved}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}</button>
      {job && <>
        <button className="button" disabled={!storageReady} onClick={() => onCV(job)}><FileText size={15} /> Generate CV</button>
        <button className="button" disabled={!storageReady || isApplied(application)} onClick={() => void onUpdate(job, { status: 'Applied' })}><Check size={15} /> {isApplied(application) ? 'Applied' : 'Mark as Applied'}</button>
        <button className="overflow button" aria-label={'Application details for ' + job.title} title="Status, notes, and visibility" disabled={!storageReady} onClick={() => onNote(job)}><Ellipsis size={20} /></button>
      </>}
    </div>
  </article>
}
function Modal({ title, close, children, wide = false, reading = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean; reading?: boolean }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  useEffect(() => {
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [dialog])
  const heading = <div className="dialog-top">
    <h2 id="dialog-title">{title}</h2>
    {!reading && <button className="settings-button" aria-label="Close dialog" onClick={close}><X size={20} /></button>}
  </div>
  return <dialog ref={setDialog} className={(wide ? 'wide' : '') + (reading ? ' reading-dialog' : '')} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="dialog-title">
    {reading ? <>
      <button type="button" className="reader-close" aria-label="Close reader" onClick={close}><X size={16} /> Close</button>
      <div className="reader-content">{heading}{children}</div>
    </> : <>{heading}{children}</>}
  </dialog>
}
function NoteDialog({ job, application, close, update }: { job: Job; application?: Application; close: () => void; update: (job: Job, change: Partial<Application>) => Promise<boolean> }) {
  const [status, setStatus] = useState(application?.status ?? 'Not Applied')
  const [note, setNote] = useState(application?.note ?? '')
  const [hidden, setHidden] = useState(!!application?.hidden)
  const [busy, setBusy] = useState(false)
  return <Modal title="Application details" close={close}>
    <p className="dialog-subtitle">{job.title}</p>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); if (await update(job, { status, note, hidden })) close(); else setBusy(false) }}>
      <label className="field">Status<select value={status} onChange={event => setStatus(event.target.value as Status)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Notes<textarea rows={5} value={note} onChange={event => setNote(event.target.value)} placeholder="Add a private note…" /></label>
      <label className="check"><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} /> Hide from the jobs list</label>
      <div className="modal-actions"><button className="primary" disabled={busy} type="submit">Save details</button></div>
    </form>
  </Modal>
}
function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}
function CVDialog({ job, profile, close, onImport }: { job: Job; profile?: Profile; close: () => void; onImport: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [attachedProfile, setAttachedProfile] = useState<Profile>()
  const [loadingAttached, setLoadingAttached] = useState(import.meta.env.DEV)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const controller = new AbortController()
    void fetch(import.meta.env.BASE_URL + 'preview/cv-profile.json', {
      headers: { 'X-Edward-Preview': 'cv' }, signal: controller.signal
    }).then(async response => {
      if (!response.ok) return
      const value: unknown = await response.json()
      if (isProfile(value) && !controller.signal.aborted) setAttachedProfile(value)
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setLoadingAttached(false)
    })
    return () => controller.abort()
  }, [])
  const source = attachedProfile ?? profile
  return <Modal title="Generate CV" close={close} wide>
    <p className="dialog-subtitle">{job.title}{known(job.company) && ' · ' + job.company}</p>
    {loadingAttached ? <p role="status">Loading attached CVs…</p> : source ? <CVEditor job={job} profile={source} /> : <div className="modal-section">
      <p>Import your private CV profile to tailor a CV for this opening.</p>
      <label className="button file-button"><FileText size={16} /> Import CV profile<input type="file" accept=".json,application/json" onChange={onImport} /></label>
    </div>}
  </Modal>
}
function CVEditor({ job, profile }: { job: Job; profile: Profile }) {
  const defaultLanguage = profile.pl ? 'pl' : 'en'
  const [language, setLanguage] = useState<'en' | 'pl'>(defaultLanguage)
  const [template, setTemplate] = useState<'classic' | 'compact'>('classic')
  const [drafts, setDrafts] = useState<Partial<Record<'en' | 'pl', { heading: string; body: string }>>>({})
  const draft = drafts[language] ?? makeCV(profile, job, language)
  return <>
    <div className="cv-controls">
      <label className="field">Language<select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'pl')}>
        {profile.pl && <option value="pl">Polish</option>}
        {profile.en && <option value="en">English</option>}
      </select></label>
      <label className="field">Template<select value={template} onChange={event => setTemplate(event.target.value as 'classic' | 'compact')}>
        <option value="classic">Classic</option><option value="compact">Compact</option>
      </select></label>
    </div>
    <label className="field">Heading<textarea rows={2} value={draft.heading} onChange={event => setDrafts({ ...drafts, [language]: { ...draft, heading: event.target.value } })} /></label>
    <label className="field">CV text<textarea rows={12} value={draft.body} onChange={event => setDrafts({ ...drafts, [language]: { ...draft, body: event.target.value } })} /></label>
    <div className="modal-actions"><button type="button" className="primary" onClick={() => window.print()}><ArrowDownToLine size={16} /> Export PDF</button></div>
    <p className="print-hint">Choose “Save as PDF” in the print dialog.</p>
    <div className={'print-cv ' + template}>{draft.heading.split('\n').map((line, index) => index === 0 ? <h1 key={index}>{line}</h1> : <p key={index}>{line}</p>)}
      {draft.body.split(/\n\n+/).map((block, index) => {
        const [first, ...lines] = block.split('\n')
        return /^(PROFILE|SKILLS|EXPERIENCE|EDUCATION|LANGUAGES|PROFIL|UMIEJĘTNOŚCI|DOŚWIADCZENIE|WYKSZTAŁCENIE|JĘZYKI)$/.test(first) ?
          <section key={index}><h2>{first}</h2><p>{lines.join('\n')}</p></section> : <p key={index}>{block}</p>
      })}
    </div>
  </>
}
function makeCV(profile: Profile, job: Job, language: 'en' | 'pl') {
  const source = profile[language]!
  const tokens = (text: string) => textKey(text).match(/[\p{L}\p{N}]+/gu) ?? []
  const jobText = ' ' + tokens([job.title, job.description, job.category].join(' ')).join(' ') + ' '
  const score = (phrases: string[]) => phrases.reduce((total, phrase) => {
    const sequence = tokens(phrase).join(' ')
    return total + Number(sequence.length > 1 && jobText.includes(' ' + sequence + ' '))
  }, 0)
  const headings = language === 'en' ? ['PROFILE', 'SKILLS', 'EXPERIENCE', 'EDUCATION', 'LANGUAGES'] :
    ['PROFIL', 'UMIEJĘTNOŚCI', 'DOŚWIADCZENIE', 'WYKSZTAŁCENIE', 'JĘZYKI']
  const skills = [...source.skills].sort((a, b) => score([b]) - score([a]))
  const experience = [...source.experience].sort((a, b) => score(b.keywords) - score(a.keywords))
  const experienceLines = experience.map(item => [item.heading, item.detail, ...item.bullets.map(bullet => '• ' + bullet)].filter(Boolean).join('\n'))
  const sections = [source.summary, skills.join(' · '), experienceLines.join('\n\n'), source.education.join('\n'), source.languages.join('\n')]
  return { heading: [profile.name, profile.contact].filter(Boolean).join('\n'), body: sections.map((section, i) => section && headings[i] + '\n' + section).filter(Boolean).join('\n\n') }
}
createRoot(document.getElementById('root')!).render(<App />)
