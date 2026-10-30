"""Durable request replay; fenced leases prevent a stale worker saving a second turn."""
import hashlib
import json
import re
from contextvars import ContextVar
from functools import wraps
from uuid import uuid4
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from app.services.database_io import run_db
from app.services.supabase_client import get_user_client

active_request = ContextVar('active_request', default=None)

def idempotent(endpoint):
    @wraps(endpoint)
    async def wrapped(*args, **kwargs):
        request = kwargs.get('request')
        key = request.request_id if request else kwargs.get('request_id')
        if not key:
            return await endpoint(*args, **kwargs)
        if not re.fullmatch(r'[a-zA-Z0-9_-]{16,100}', key):
            raise HTTPException(422, 'Invalid request ID')
        user = kwargs['user']
        client = get_user_client(user.token)
        if request:
            identity = request.model_dump(exclude={'request_id'})
        else:
            file = kwargs['file']
            from app.models.schemas import MAX_FILE_SIZE_BYTES
            data = await file.read(MAX_FILE_SIZE_BYTES + 1)
            await file.seek(0)
            identity = [kwargs.get('chat_id'), kwargs.get('user_prompt'), file.filename,
                        hashlib.sha256(data).hexdigest()]
        fingerprint = hashlib.sha256((endpoint.__name__ + json.dumps(identity, sort_keys=True)).encode()).hexdigest()
        lease = str(uuid4())
        state = (await run_db(client.rpc('claim_chat_request', {
            'p_id': key, 'p_fingerprint': fingerprint, 'p_lease': lease}).execute)).data
        if state['state'] == 'done':
            if endpoint.__name__ == 'stream_chat':
                async def replay():
                    yield 'data: ' + json.dumps({'type': 'done', **state['result']}) + '\n\n'
                return StreamingResponse(replay(), media_type='text/event-stream')
            return state['result']
        if state['state'] != 'claimed':
            raise HTTPException(409, 'This request is still processing. Retry shortly.' if state['state']=='busy' else 'Request ID belongs to different content.')
        context = {'client': client, 'key': key, 'lease': lease}
        async def release():
            await run_db(client.rpc('fail_chat_request', {'p_id': key, 'p_lease': lease}).execute)
        token = active_request.set(context)
        try:
            response = await endpoint(*args, **kwargs)
        except BaseException:
            await release()
            raise
        finally:
            active_request.reset(token)
        if isinstance(response, StreamingResponse):
            original = response.body_iterator
            async def stream():
                token = active_request.set(context)
                try:
                    async for item in original:
                        yield item
                finally:
                    active_request.reset(token)
                    await release()
            response.body_iterator = stream()
        return response
    return wrapped
