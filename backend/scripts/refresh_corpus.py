"""Collect missing official Republic Acts into a separate candidate CSV; resumable."""
import csv
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import httpx


def download(client, url, attempts=3):
    """Retry transient read-only requests; never cache error responses."""
    for attempt in range(attempts):
        try:
            response = client.get(url)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < attempts - 1:
                    time.sleep(2 ** attempt)
                    continue
            response.raise_for_status()
            return response.text
        except httpx.TransportError:
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)


class Body(HTMLParser):
    def __init__(self):
        super().__init__(); self.depth = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag == 'div':
            if self.depth: self.depth += 1
            elif 'single_content' in dict(attrs).get('class', '').split(): self.depth = 1
        if self.depth and tag in ('p','br','h2','h3','tr','li'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag == 'div' and self.depth: self.depth -= 1
    def handle_data(self, data):
        if self.depth: self.parts.append(data)


def main():
    csv.field_size_limit(2**30)
    folder = Path('data/corpus-update-20261028'); folder.mkdir(exist_ok=True)
    original = Path('data/final_clean_laws.csv')
    with original.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f); fields = reader.fieldnames; rows = list(reader)
    urls = {r['url'] for r in rows}
    raw = (folder/'ra-list.txt').read_text(encoding='utf-8')
    listing = json.loads(raw[raw.index('{"draw"'):])['data']
    failures = []; additions = []; relationships = []
    with httpx.Client(timeout=40, follow_redirects=True) as client:
        for title, date, anchor in listing:
            match = re.search(r"href=['\"]([^'\"]+)", anchor)
            if not match: continue
            url = html.unescape(match[1])
            if url in urls: continue
            cache = folder / (hashlib.sha256(url.encode()).hexdigest()+'.html')
            try:
                if not cache.exists():
                    cache.write_text(download(client, url), encoding='utf-8'); time.sleep(.15)
                parser = Body(); parser.feed(cache.read_text(encoding='utf-8'))
                text = re.sub(r'\n\s*\n+', '\n\n', ''.join(parser.parts)).strip()
                if len(text)<200 or not re.search(r'SEC(?:TION|\.)|Section', text):
                    raise ValueError('Missing substantive section text; manual review required')
                full_title = html.unescape(re.sub('<[^>]+>', '', anchor)).strip()
                citation = dict(short_title=title.title().replace('No.', 'No.'), title=full_title,
                    type='republic_act', date_of_enactment=date, source_checked_at='2026-10-28',
                    source_sha256=hashlib.sha256(cache.read_bytes()).hexdigest(), legal_status='unreviewed')
                additions.append(dict(text=text,citation_information=json.dumps(citation,ensure_ascii=False),
                    citations='[]',url=url,label='Republic Acts',text_length=len(text)))
                urls.add(url)
                if re.search('AMEND|REPEAL',full_title):
                    relationships.append(dict(source=url,title=full_title,status='candidate_requires_review'))
            except Exception as exc:
                failures.append(dict(url=url,error=type(exc).__name__,detail=str(exc)[:150]))
            if (len(additions)+len(failures))%25==0: print('Collected',len(additions),'failures',len(failures),flush=True)
    candidate=folder/'candidate.csv'
    with candidate.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows+additions)
    manifest=dict(status='candidate_not_approved_for_current_law_claims', original_rows=len(rows),
        added_rows=len(additions),failures=failures,scope='Missing URLs in official Republic Act listing only; other document types and existing text revisions pending',
        original_sha256=hashlib.sha256(original.read_bytes()).hexdigest(),candidate_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest())
    manifest['failure_counts'] = {kind: sum(f['error']==kind for f in failures) for kind in sorted({f['error'] for f in failures})}
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    (folder/'relationship_candidates.json').write_text(json.dumps(relationships,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in manifest.items() if k!='failures'},indent=2))


if __name__=='__main__': main()
