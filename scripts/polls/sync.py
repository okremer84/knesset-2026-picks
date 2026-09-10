"""Wikipedia polling importer. Python 3.11+; pip install beautifulsoup4."""
import argparse
import collections
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from bs4 import BeautifulSoup

URL = 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election'

def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def clean(cell):
    clone = BeautifulSoup(str(cell), 'html.parser')
    for n in clone.select('sup, .sortkey'):
        n.decompose()
    return ' '.join(clone.get_text(' ', strip=True).split())

def grid(table):
    """Expand spans by reusing the same cell object, not by copying values."""
    pending = {}
    for row in table.find_all('tr'):
        cells = {col: value[0] for col, value in pending.items()}
        pending = {col: (cell, left-1) for col, (cell, left) in pending.items() if left > 1}
        col = 0
        for cell in row.find_all(['th', 'td'], recursive=False):
            while col in cells:
                col += 1
            for offset in range(int(cell.get('colspan', 1))):
                cells[col+offset] = cell
                span = int(cell.get('rowspan', 1))
                if span > 1:
                    pending[col+offset] = (cell, span-1)
            col += int(cell.get('colspan', 1))
        yield cells

def measure(raw):
    if re.fullmatch(r'\d+', raw):
        return {'seats': int(raw), 'vote_percent': None, 'raw': raw}
    m = re.fullmatch(r'\(?([0-9]+(?:\.[0-9]+)?)%\)?', raw)
    if m and float(m[1]) < 3.25:
        return {'seats': 0, 'vote_percent': float(m[1]), 'raw': raw}
    # Missing or unusual values are never silently converted to zero.
    return {'seats': None, 'vote_percent': None, 'raw': raw}

def parse(html):
    soup = BeautifulSoup(html, 'html.parser')
    polls, review = [], []
    section = subsection = ''
    tables = 0
    for node in soup.find_all(['h2', 'h3', 'table']):
        if node.name == 'h2':
            section, subsection = node.get_text(' ', strip=True), ''
        elif node.name == 'h3':
            subsection = node.get_text(' ', strip=True)
        elif section == 'Seat projections' and subsection == '2026' and 'wikitable' in node.get('class', []):
            tables += 1
            headers = {}
            for row in grid(node):
                if 0 not in row:
                    continue
                date_cell = row[0]
                date = date_cell.get('data-sort-value', '')
                if not re.fullmatch(r'2026-\d{2}-\d{2}', date):
                    # Only genuine header rows may change the column mapping.
                    if any(c.name == 'th' for c in row.values()):
                        for col, cell in row.items():
                            value = clean(cell)
                            if value and cell.name == 'th':
                                headers[col] = value
                    elif re.search(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b', clean(date_cell)) and len({id(c) for c in row.values()}) > 5:
                        review.append({'reason': 'Unrecognized date; row not imported', 'row': [clean(c) for c in row.values()]})
                    continue
                dt.date.fromisoformat(date)
                if len({id(c) for c in row.values()}) < 5:
                    continue  # Dated political event, not a poll.
                meta = {headers.get(i, ''): cell for i, cell in row.items()}
                if not {'Polling firm', 'Publisher', 'Sample size'} <= meta.keys():
                    raise ValueError('Wikipedia metadata columns changed')
                pollster, publisher = clean(meta['Polling firm']), clean(meta['Publisher'])
                sources = set()
                for name in ['Polling firm', 'Publisher']:
                    for ref in meta[name].select('sup a[href]'):
                        target = soup.find(id=ref['href'].split('#')[-1])
                        if target:
                            sources.update(a['href'] for a in target.select('a.external[href]') if a['href'].startswith('http'))
                results, seen = [], set()
                for i, cell in row.items():
                    label = headers.get(i, '')
                    if label in {'Fieldwork date', 'Polling firm', 'Publisher', 'Sample size', 'Gov.', 'Others', 'Other'}:
                        continue
                    if id(cell) in seen:
                        continue
                    seen.add(id(cell))
                    labels = list(dict.fromkeys(headers.get(j, '') for j, c in row.items() if c is cell))
                    results.append({'party': ' / '.join(labels), **measure(clean(cell))})
                total = sum(r['seats'] or 0 for r in results)
                issues = []
                if total != 120:
                    issues.append(f'Seat total is {total}, expected 120')
                if any(r['seats'] is not None and not 0 <= r['seats'] <= 120 for r in results):
                    issues.append('Invalid seat count')
                if any(not r['party'] for r in results):
                    issues.append('Missing party header')
                if not sources:
                    issues.append('No original source link resolved')
                # Distinct polls from the same firm/publisher/end date require review.
                key = digest(packed([date, pollster.casefold(), publisher.casefold()]))
                polls.append({'id': key, 'fieldwork_end': date, 'fieldwork_label': clean(date_cell),
                    'pollster': pollster, 'publisher': publisher, 'sample_size_raw': clean(meta['Sample size']),
                    'results': results, 'sources': sorted(sources), 'issues': issues})
    if tables == 0 or not polls:
        raise ValueError('No 2026 seat polls found; source layout may have changed')
    counts = collections.Counter(p['id'] for p in polls)
    for p in polls:
        if counts[p['id']] > 1:
            p['issues'].append('Multiple rows share this poll identity; manual reconciliation required')
    return polls, review

def fetch():
    req = Request(URL, headers={'User-Agent': os.getenv('WIKI_USER_AGENT', 'ElectionFantasySync/0.1 (personal polling research)'), 'Accept': 'text/html'})
    for attempt in range(3):
        try:
            with urlopen(req, timeout=45) as response:
                return response.read().decode('utf-8')
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)

def atomic_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    tmp.replace(path)

def sync(html, root):
    polls, review = parse(html)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    snapshot = digest(html)
    (root / 'snapshots').mkdir(exist_ok=True)
    (root / 'snapshots' / f'{snapshot}.html').write_text(html)
    db = sqlite3.connect(root / 'polls.sqlite3')
    db.executescript('''CREATE TABLE IF NOT EXISTS revisions (
      poll_id TEXT, hash TEXT, body TEXT, first_seen TEXT, snapshot TEXT,
      PRIMARY KEY(poll_id,hash));
      CREATE TABLE IF NOT EXISTS runs (at TEXT, snapshot TEXT, summary TEXT);''')
    new = 0
    with db:
        for poll in polls:
            body = packed(poll)
            new += db.execute('INSERT OR IGNORE INTO revisions VALUES (?,?,?,?,?)',
                (poll['id'], digest(body), body, now, snapshot)).rowcount
        good = [p for p in polls if not p['issues']]
        bad = [p for p in polls if p['issues']]
        summary = {'at': now, 'source': URL, 'snapshot': snapshot, 'observed': len(polls),
            'valid': len(good), 'review': len(bad)+len(review), 'new_revisions': new}
        db.execute('INSERT INTO runs VALUES (?,?,?)', (now, snapshot, packed(summary)))
    db.close()
    if not good:
        raise ValueError('No validated polls; existing export retained')
    # Exports reflect the current source; removed rows remain in revision history.
    atomic_json(root / 'polls.json', {'sync': summary, 'polls': good})
    atomic_json(root / 'review.json', {'polls': bad, 'unparsed_rows': review})
    atomic_json(root / 'status.json', summary)
    return summary

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--html', type=Path, help='Import a saved HTML snapshot instead of fetching')
    ap.add_argument('--data-dir', type=Path, default=Path('data'))
    args = ap.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    with (args.data_dir / 'sync.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another sync is running', file=sys.stderr)
            return 1
        try:
            print(packed(sync(args.html.read_text() if args.html else fetch(), args.data_dir)))
            return 0
        except Exception as exc:
            atomic_json(args.data_dir / 'last-error.json', {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'error': str(exc)})
            print(f'Sync failed: {exc}', file=sys.stderr)
            return 1

if __name__ == '__main__':
    sys.exit(main())
