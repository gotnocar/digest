"""Build the NYC digest from the two listing workbooks or their XLSX exports."""
import hashlib
import io
import json
import re
import sys
import urllib.request
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

SOURCES = ('1DxssqawmGzlWn0Q_Esfxf18It_nnKX3goWzFAu0JSoM',
           '1n4-FtIN2L_ZuhNPvE7bDrp68uR-0nL1YnnK1gPIER5o')
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def workbook(payload):
    with zipfile.ZipFile(io.BytesIO(payload)) as book:
        shared = []
        if 'xl/sharedStrings.xml' in book.namelist():
            shared = [''.join(t.text or '' for t in entry.findall('.//m:t', NS))
                      for entry in ET.fromstring(book.read('xl/sharedStrings.xml'))]
        targets = {item.attrib['Id']: item.attrib['Target']
                   for item in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
        for tab in ET.fromstring(book.read('xl/workbook.xml')).find('m:sheets', NS):
            target = targets[tab.attrib[REL]]
            path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            root = ET.fromstring(book.read(path))
            folder, filename = path.rsplit('/', 1)
            rel_path = f'{folder}/_rels/{filename}.rels'
            links = {}
            if rel_path in book.namelist():
                rels = {item.attrib['Id']: item.attrib['Target']
                        for item in ET.fromstring(book.read(rel_path))}
                links = {link.attrib['ref']: rels.get(link.get(REL), '')
                         for link in root.findall('.//m:hyperlink', NS)}
            rows = []
            for row in root.findall('.//m:row', NS):
                values = {}
                for cell in row.findall('m:c', NS):
                    address = cell.attrib['r']
                    column = re.match('[A-Z]+', address).group()
                    value = cell.findtext('m:v', '', NS)
                    if cell.get('t') == 's':
                        value = shared[int(value)]
                    elif cell.get('t') == 'inlineStr':
                        value = ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
                    values[column] = (value.strip(), links.get(address, ''))
                rows.append(values)
            if rows:
                header, *data = rows
                yield tab.attrib['name'], [
                    {label: (url(link) or value if label.endswith(('link', 'Link', 'links')) else value)
                     for column, (label, _) in header.items() if label
                     for value, link in [row.get(column, ('', ''))]}
                    for row in data
                ]


def url(text):
    for candidate in text.splitlines():
        candidate = candidate.strip()
        try:
            parts = urlsplit(candidate)
            if parts.scheme in ('https', 'http') and parts.hostname:
                return candidate
        except ValueError:
            pass
    return ''


def day(text):
    if re.fullmatch(r'\d{5}(?:\.0+)?', text):
        return (datetime(1899, 12, 30) + timedelta(days=int(float(text)))).date().isoformat()
    for pattern in ('%b %d, %Y', '%B %d, %Y', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(text, pattern).date().isoformat()
        except ValueError:
            pass
    return ''


def tab_day(name):
    match = re.match(r'^[A-Za-z]+ \d{1,2}, \d{4}', name)
    return day(match[0]) if match else ''


def clock(text):
    if re.fullmatch(r'0(?:\.\d+)?', text):
        minutes = round(float(text) * 1440) % 1440
        return f'{minutes // 60 % 12 or 12}:{minutes % 60:02} {"AM" if minutes < 720 else "PM"}'
    return text


def ident(kind, *parts):
    key = '\x1f'.join(' '.join(part.casefold().split()) for part in parts)
    return kind + '-' + hashlib.sha256(key.encode()).hexdigest()[:24]


def news_edition(name):
    return tab_day(name), bool(re.search(r'\bPM\s*$', name, re.IGNORECASE))


def news_records(tabs):
    articles = {}
    editions = {}
    logos = {}
    for name, rows in sorted(tabs, key=lambda tab: news_edition(tab[0])):
        date, afternoon = news_edition(name)
        if not date:
            continue
        for row in rows:
            pick = 'Article' in row
            title = row.get('Article' if pick else 'Story', '')
            if not title:
                continue
            outlet = row.get('Source' if pick else 'Outlet', '')
            light, dark = logos.get(outlet.casefold(), ('', ''))
            logos[outlet.casefold()] = (url(row.get('Logo (light)', '')) or light,
                                       url(row.get('Logo (dark)', '')) or dark)
            key = ident('article', title, outlet)
            articles.pop(key, None)
            editions[key] = afternoon
            articles[key] = {
                'id': key, 'kind': 'article', 'title': title, 'date': date,
                'emoji': row.get('Emoji', ''), 'outlet': outlet, 'author': row.get('Author', ''),
                'category': row.get('Category', '') or ('Top Articles' if pick else ''),
                'top': pick or '⭐' in row.get('Top', ''), 'url': url(row.get('Article link', '')),
                'description': row.get('Why read it' if pick else 'Summary', ''),
                'body': row.get('Detailed version' if pick else 'Longer version', ''),
                'image': url(row.get('Image links' if pick else 'Image link', '')),
                'feature': pick,
            }
    for article in articles.values():
        article['logoLight'], article['logoDark'] = logos[article['outlet'].casefold()]
    return sorted(articles.values(), key=lambda row: (row['date'], row['feature'], editions[row['id']], row['top']), reverse=True)


def marked(text):
    return text.casefold() in ('true', 'yes', '1') or any(mark in text for mark in ('✔', '✓', '⭐', '✅'))


def city_records(tabs):
    events, opportunities = {}, {}
    for name, rows in tabs:
        if name.casefold() == 'opportunities':
            for row in rows:
                title = row.get('Opportunity', '')
                if not title:
                    continue
                organizer = row.get('Organizer', '')
                key = ident('opportunity', title, organizer)
                opportunities[key] = {
                    'id': key, 'kind': 'opportunity', 'title': title, 'organizer': organizer,
                    'emoji': row.get('Emoji', ''), 'category': row.get('Type', ''),
                    'description': row.get('Details', ''), 'eligibility': row.get('Eligibility', ''),
                    'price': row.get('Fee', ''), 'url': url(row.get('Link', '')),
                    'date': day(row.get('Deadline', '')), 'deadline': row.get('Deadline', ''),
                    'sourceStatus': row.get('Status', ''),
                    'top': marked(row.get('Top pick', '') or row.get('Top', '')),
                    'deadlineSoon': marked(row.get('Deadline soon', '')) or row.get('Status', '').casefold() == 'deadline soon',
                }
        elif date := tab_day(name):
            for row in rows:
                title = row.get('Event', '')
                if not title or row.get('Category', '').casefold() == 'opportunity':
                    continue
                location = row.get('Venue', '')
                key = ident('event', 'NYC', title, date, location or row.get('Address', ''))
                events[key] = {
                    'id': key, 'kind': 'event', 'title': title, 'date': date, 'location': location,
                    'emoji': row.get('Emoji', ''), 'category': row.get('Category', ''),
                    'top': marked(row.get('Top pick', '')),
                    'eventType': row.get('Type', ''), 'time': clock(row.get('Time', '')),
                    'address': row.get('Address', ''), 'price': row.get('Price', ''),
                    'description': row.get('Details', ''), 'notes': row.get('Notes', ''),
                    'url': url(row.get('Event Link', '')),
                    'directions': '', 'travel': row.get('Transit time (est.)', ''),
                }
    return list(events.values()), list(opportunities.values())


def download(source):
    address = f'https://docs.google.com/spreadsheets/d/{source}/export?format=xlsx'
    with urllib.request.urlopen(address, timeout=45) as response:
        payload = response.read(20_000_001)
    if len(payload) > 20_000_000:
        raise ValueError('Spreadsheet export exceeds 20 MB')
    return payload


def main():
    if len(sys.argv) not in (1, 3):
        raise SystemExit('Provide both workbook exports, news first and NYC second.')
    payloads = [Path(path).read_bytes() for path in sys.argv[1:]] if len(sys.argv) == 3 else [
        download(source) for source in SOURCES
    ]
    articles = news_records(workbook(payloads[0]))
    events, opportunities = city_records(workbook(payloads[1]))
    if not (articles and events and opportunities):
        raise ValueError('Each digest section needs listing rows before publishing')
    now = datetime.now(timezone.utc)
    today = now.astimezone(ZoneInfo('America/New_York')).date()
    cutoff = (today - timedelta(days=6)).isoformat()
    articles = [record for record in articles if record['date'] >= cutoff]
    if not articles:
        raise ValueError('The news workbook has no recent articles')
    events = [record for record in events if record['date'] >= (today - timedelta(days=1)).isoformat()]
    root = Path('public/data')
    manifest = root / 'latest.json'
    previous = json.loads(manifest.read_text())['file'] if manifest.exists() else ''
    timestamp = now.isoformat(timespec='seconds')
    filename = 'snapshot-' + uuid.uuid4().hex + '.json'
    snapshot = dict(updatedAt=timestamp, articles=articles, events=events, opportunities=opportunities, jobs=[])
    for path, content in [(root / filename, snapshot), (manifest, dict(file=filename, updatedAt=timestamp))]:
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(content, ensure_ascii=False) + '\n', encoding='utf-8')
        temp.replace(path)
    for path in root.glob('snapshot-*.json'):
        if path.name not in (filename, previous):
            path.unlink()
    print(f'Imported {len(articles)} articles, {len(events)} events and {len(opportunities)} opportunities')


if __name__ == '__main__':
    main()
