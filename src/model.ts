export const statuses = ['Not Applied', 'Interested', 'Applied', 'Interview', 'Rejected', 'Offer'] as const
export type Status = typeof statuses[number]
export type RecordBase = { id: string; title: string; category: string; description: string; location: string; url: string; top: boolean; notes: string }
export type Job = RecordBase & { kind: 'job'; company: string; salary: string; employment: string; published: string; firstSeen: string; map: string }
export type Event = RecordBase & { kind: 'event'; emoji?: string; date: string; time: string; address: string; price: string; directions: string; travel: string; eventType: string }
export type Opportunity = Job | Event
type DigestBase = { id: string; title: string; date: string; emoji: string; category: string; description: string; url: string }
export type Article = DigestBase & { kind: 'article'; outlet: string; author: string; body: string; image: string; logoLight: string; logoDark: string; top: boolean; feature: boolean }
export type Listing = DigestBase & { kind: 'opportunity'; organizer: string; eligibility: string; deadline: string; price: string; sourceStatus: string; top?: boolean; deadlineSoon?: boolean }
export type Savable = Opportunity | Article | Listing
export type Reading = { article: Article; openedAt: string; read: boolean }
export type Activity = { item: Event | Listing; completedAt: string }
export type Snapshot = { updatedAt: string | null; jobs: Job[]; events: Event[]; articles?: Article[]; opportunities?: Listing[]; preview?: boolean }
export type Application = { status: Status; appliedAt?: string; note: string; hidden?: boolean; job: Job }
export type CVEntry = { heading: string; detail: string; bullets: string[]; keywords: string[] }
export type CVLanguage = { summary: string; skills: string[]; experience: CVEntry[]; education: string[]; languages: string[] }
export type Profile = { name: string; contact: string; en?: CVLanguage; pl?: CVLanguage }
export type Personal = { saved: Record<string, Savable>; reading?: Record<string, Reading>; activity?: Record<string, Activity>; applications: Record<string, Application>; profile?: Profile }
export const emptyPersonal: Personal = { saved: {}, applications: {} }

const newYork = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
export const localDate = (date = new Date()) => newYork.format(date)
export const shiftDay = (day: string, days: number) => {
  const date = new Date(day + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export const displayDate = (day: string) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/New_York'
}).format(new Date(day + 'T12:00:00Z'))
export const textKey = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ł', 'l')
export const validUrl = (value: string) => {
  try { return ['https:', 'http:'].includes(new URL(value).protocol) ? value : '' } catch { return '' }
}
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export const stringFields = (value: Record<string, unknown>, fields: string[]) => fields.every(field => typeof value[field] === 'string')
export const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
export function isProfile(value: unknown): value is Profile {
  if (!isObject(value) || !stringFields(value, ['name', 'contact']) || !String(value.name).trim() || !(value.en || value.pl)) return false
  return ([value.en, value.pl]).every(language => language === undefined || (
    isObject(language) && typeof language.summary === 'string' && strings(language.skills) &&
    strings(language.education) && strings(language.languages) && Array.isArray(language.experience) &&
    language.experience.every(entry => isObject(entry) && stringFields(entry, ['heading', 'detail']) && strings(entry.bullets) && strings(entry.keywords))
  ))
}
export function isOpportunity(value: unknown): value is Opportunity {
  return isObject(value) && typeof value.top === 'boolean' && stringFields(value, ['id', 'title', 'category', 'description', 'location', 'url', 'notes']) &&
    (value.kind === 'job' ? stringFields(value, ['company', 'salary', 'employment', 'published', 'firstSeen', 'map']) :
      value.kind === 'event' && (value.emoji === undefined || typeof value.emoji === 'string') && stringFields(value, ['date', 'time', 'address', 'price', 'directions', 'travel', 'eventType']) && /^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) && Number.isFinite(Date.parse(String(value.date))))
}
export function isArticle(value: unknown): value is Article {
  return isObject(value) && value.kind === 'article' && typeof value.top === 'boolean' && typeof value.feature === 'boolean' &&
    stringFields(value, ['id', 'title', 'date', 'emoji', 'category', 'description', 'url', 'outlet', 'author', 'body', 'image', 'logoLight', 'logoDark']) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) && Number.isFinite(Date.parse(String(value.date)))
}
export function isListing(value: unknown): value is Listing {
  return isObject(value) && value.kind === 'opportunity' &&
    (value.top === undefined || typeof value.top === 'boolean') &&
    (value.deadlineSoon === undefined || typeof value.deadlineSoon === 'boolean') &&
    stringFields(value, ['id', 'title', 'date', 'emoji', 'category', 'description', 'url', 'organizer', 'eligibility', 'deadline', 'price', 'sourceStatus']) &&
    (value.date === '' || (/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) && Number.isFinite(Date.parse(String(value.date)))))
}
export function readBackup(value: unknown): Personal {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2) || !isObject(value.saved) || !isObject(value.applications)) throw Error('Choose a valid Edward Updates 😎 backup.')
  for (const [id, record] of Object.entries(value.saved)) {
    if (!(isOpportunity(record) || isArticle(record) || isListing(record)) || id !== record.id) throw Error('The backup contains an invalid saved opportunity.')
  }
  for (const [id, record] of Object.entries(value.applications)) {
    if (!isObject(record) || !isOpportunity(record.job) || record.job.kind !== 'job' || id !== record.job.id ||
      !statuses.includes(record.status as Status) || typeof record.note !== 'string' ||
      (record.hidden !== undefined && typeof record.hidden !== 'boolean') ||
      (record.appliedAt !== undefined && typeof record.appliedAt !== 'string')) throw Error('The backup contains an invalid application.')
  }
  if (value.reading !== undefined && (!isObject(value.reading) || Object.entries(value.reading).some(([id, entry]) =>
    !isObject(entry) || !isArticle(entry.article) || id !== entry.article.id || typeof entry.read !== 'boolean' || typeof entry.openedAt !== 'string'
  ))) throw Error('The backup contains invalid reading progress.')
  if (value.activity !== undefined && (!isObject(value.activity) || Object.entries(value.activity).some(([id, entry]) =>
    !isObject(entry) || !(isListing(entry.item) || (isOpportunity(entry.item) && entry.item.kind === 'event')) ||
    id !== entry.item.id || typeof entry.completedAt !== 'string'
  ))) throw Error('The backup contains invalid activity.')
  if (value.profile !== undefined && !isProfile(value.profile)) throw Error('The backup contains an invalid CV profile.')
  return { saved: value.saved as Personal['saved'], reading: value.reading as Personal['reading'], activity: value.activity as Personal['activity'], applications: value.applications as Personal['applications'], profile: value.profile as Profile | undefined }
}
