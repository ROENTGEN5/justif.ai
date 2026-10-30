"""Read-only retrieval checks against the staged corpus using local embeddings."""
import json
from pathlib import Path
from datetime import datetime, timezone


def main():
    from app.config import settings
    from app.services.rag import RAGService
    manifest_path=Path('data/corpus-update-20261028/candidate.index-manifest.json')
    manifest=json.loads(manifest_path.read_text())
    if not manifest.get('verified'): raise ValueError('Upload verification is missing')
    settings.PINECONE_INDEX_NAME=manifest['index']
    settings.NOMIC_API_KEY=''  # This process only; no cloud request or environment-file edit.
    service=RAGService();service.initialize()
    if not service.is_ready: raise RuntimeError('Index unavailable')
    if service._total_vectors!=manifest['expected_vectors']: raise ValueError('Count mismatch')
    cases=[('RA 8792 Section 6 electronic documents','Republic Act No. 8792'),
           ('RA 11058 Section 8 personal protective equipment','Republic Act No. 11058'),
           ('RA 12321 Section 1 Last Mile GIDA Schools','Republic Act No. 12321'),
           ('RA 12326 barangay officials term','Republic Act No. 12326')]
    rows=[]
    for query,title in cases:
        results=service.search(query,top_k=5,strict=True,law_query=query)
        passed=bool(results) and all(r.chunk.short_title.casefold()==title.casefold() for r in results)
        rows.append(dict(query=query,passed=passed,sources=[r.chunk.to_dict() for r in results],
                         evidence=[r.chunk.text for r in results]))
        print(query, 'PASS' if passed else 'FAIL',flush=True)
    report=dict(index=manifest['index'],csv_sha256=manifest['csv_sha256'],
        checked_at=datetime.now(timezone.utc).isoformat(),embedding_provider='local',
        scope='Four named-law retrieval smoke checks; not legal accuracy evaluation',cases=rows)
    path=manifest_path.with_name('retrieval-acceptance.json')
    path.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    if not all(r['passed'] for r in rows): raise SystemExit(1)


if __name__=='__main__': main()
