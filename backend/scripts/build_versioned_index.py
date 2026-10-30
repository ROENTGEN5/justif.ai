"""Build a new index, fail on incomplete writes, and verify count before activation."""
import argparse
import hashlib
import json
from pathlib import Path
import time


def missing_chunks(index, batch, corpus_hash):
    """Skip only records whose identity, text and corpus version match exactly."""
    from app.services.corpus_identity import chunk_id
    found = index.fetch(ids=[chunk_id(c.url, c.chunk_index) for c in batch]).vectors
    missing = []
    for chunk in batch:
        vector = found.get(chunk_id(chunk.url, chunk.chunk_index))
        if vector is None:
            missing.append(chunk)
            continue
        meta = vector.metadata or {}
        if (meta.get('corpus_sha256') != corpus_hash or meta.get('text') != chunk.text
                or meta.get('url') != chunk.url or meta.get('chunk_index') != chunk.chunk_index
                or meta.get('id_schema') != 'canonical-url-v2'):
            raise ValueError('Existing record differs from candidate; refusing resume')
    return missing


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv',required=True)
    parser.add_argument('--index',required=True)
    parser.add_argument('--upload',action='store_true')
    parser.add_argument('--resume',action='store_true',help='Validate and skip already uploaded records')
    parser.add_argument('--embedding-provider',choices=('auto','local'),default='auto')
    args=parser.parse_args()
    from app.config import settings
    from app.services.rag import load_and_chunk_csv, embed_documents
    from app.services.corpus_identity import chunk_id
    from pinecone import Pinecone, ServerlessSpec
    if args.index == settings.PINECONE_INDEX_NAME:
        raise ValueError('Use a fresh index; active index cannot be overwritten')
    chunks=load_and_chunk_csv(args.csv)
    ids=[chunk_id(c.url,c.chunk_index) for c in chunks]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate document/chunk IDs')
    manifest=dict(csv_sha256=hashlib.sha256(Path(args.csv).read_bytes()).hexdigest(),
        index=args.index,expected_vectors=len(ids),id_schema='canonical-url-v2',verified=False)
    output=Path(args.csv).with_suffix('.index-manifest.json')
    if args.resume:
        previous=json.loads(output.read_text(encoding='utf-8'))
        if any(previous.get(k)!=manifest[k] for k in ('csv_sha256','index','expected_vectors','id_schema')):
            raise ValueError('Resume manifest does not match candidate and target')
    if args.upload:
        output.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(manifest),flush=True)
    if not args.upload: return
    pc=Pinecone(api_key=settings.PINECONE_API_KEY)
    exists=args.index in [i.name for i in pc.list_indexes()]
    if exists and not args.resume:
        raise ValueError('Target already exists; use --resume for validated recovery')
    if not exists and args.resume:
        raise ValueError('Resume target does not exist')
    local_client=None
    if args.embedding_provider=='local':
        import ollama
        local_client=ollama.Client(host=settings.OLLAMA_BASE_URL)
        local_client.show('nomic-embed-text')
    if not exists:
        pc.create_index(name=args.index,dimension=768,metric='cosine',
            spec=ServerlessSpec(cloud='aws',region='us-east-1'))
    for attempt in range(60):
        if pc.describe_index(args.index).status['ready']: break
        time.sleep(2)
    else: raise RuntimeError('Index readiness timeout')
    index=pc.Index(args.index)
    description=pc.describe_index(args.index)
    if description.dimension!=768 or description.metric!='cosine':
        raise ValueError('Index dimension/metric mismatch')
    for start in range(0,len(chunks),50):
        batch=chunks[start:start+50]
        if args.resume:
            batch=missing_chunks(index,batch,manifest['csv_sha256'])
        if not batch:
            if start%1000==0: print('Verified existing',start+50,'/',len(chunks),flush=True)
            continue
        if local_client is not None:
            embeddings=local_client.embed(model='nomic-embed-text',
                input=['search_document: '+c.text for c in batch])['embeddings']
        else:
            embeddings=embed_documents([c.text for c in batch])
        if len(embeddings)!=len(batch) or any(len(v)!=768 for v in embeddings):
            raise ValueError('Embedding shape mismatch')
        vectors=[]
        for c,embedding in zip(batch,embeddings):
            meta=c.to_dict();meta.update(chunk_index=c.chunk_index,total_chunks=c.total_chunks,
                text=c.text,corpus_sha256=manifest['csv_sha256'],id_schema='canonical-url-v2')
            vectors.append(dict(id=chunk_id(c.url,c.chunk_index),values=embedding,metadata=meta))
        index.upsert(vectors=vectors)
        if start%1000==0: print('Uploaded',start+len(batch),'/',len(chunks),flush=True)
    for attempt in range(30):
        if index.describe_index_stats().total_vector_count==len(chunks): break
        time.sleep(2)
    else: raise RuntimeError('Vector count verification failed')
    sample=[chunks[i] for i in sorted({0,len(chunks)//2,len(chunks)-1})]
    fetched=index.fetch(ids=[chunk_id(c.url,c.chunk_index) for c in sample]).vectors
    for c in sample:
        if fetched[chunk_id(c.url,c.chunk_index)].metadata.get('text')!=c.text:
            raise RuntimeError('Sample text verification failed')
    manifest.update(verified=True,verification='Count and three exact-text samples; retrieval evaluation still required')
    output.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('Built and count-verified. Run retrieval acceptance before switching configuration.')


if __name__=='__main__': main()
