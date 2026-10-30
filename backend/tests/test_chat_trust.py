import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from fastapi import HTTPException
from app.services import request_replay, deepseek
from app.routes import chat
from app.models.schemas import ChatMessageRequest, CitationReportRequest

USER = SimpleNamespace(token='token', user_id='alice')
OTHER_USER = SimpleNamespace(token='other-token', user_id='bob')
CHAT_ID = '22222222-2222-2222-2222-222222222222'
MESSAGE_ID = '11111111-1111-1111-1111-111111111111'

class TrustTests(unittest.IsolatedAsyncioTestCase):
    async def test_completed_request_replayed_without_generation(self):
        endpoint = AsyncMock(return_value='new answer')
        endpoint.__name__ = 'send_message'
        wrapped = request_replay.idempotent(endpoint)
        saved = {'response': 'saved answer', 'message_id': MESSAGE_ID}
        with patch.object(request_replay, 'get_user_client', return_value=Mock()), patch.object(
            request_replay, 'run_db', AsyncMock(return_value=SimpleNamespace(data={'state':'done','result':saved}))):
            result = await wrapped(request=ChatMessageRequest(message='Question', request_id='request_123456789'), user=USER)
        self.assertEqual(result, saved)
        endpoint.assert_not_awaited()

    async def test_running_request_rejected_without_generation(self):
        endpoint = AsyncMock(); endpoint.__name__='send_message'
        with patch.object(request_replay, 'get_user_client', return_value=Mock()), patch.object(
            request_replay, 'run_db', AsyncMock(return_value=SimpleNamespace(data={'state':'busy'}))):
            with self.assertRaises(HTTPException) as error:
                await request_replay.idempotent(endpoint)(request=ChatMessageRequest(message='Question', request_id='request_123456789'),user=USER)
        self.assertEqual(error.exception.status_code,409)
        endpoint.assert_not_awaited()

    async def test_failed_generation_releases_request_for_retry(self):
        endpoint=AsyncMock(side_effect=ValueError('provider failed')); endpoint.__name__='send_message'
        db=AsyncMock(side_effect=[SimpleNamespace(data={'state':'claimed'}),SimpleNamespace(data=None)])
        with patch.object(request_replay,'get_user_client',return_value=Mock()),patch.object(request_replay,'run_db',db):
            with self.assertRaises(ValueError):
                await request_replay.idempotent(endpoint)(request=ChatMessageRequest(message='Question',request_id='request_123456789'),user=USER)
        self.assertEqual(db.await_count,2)
        self.assertIsNone(request_replay.active_request.get())

    async def test_report_uses_saved_answer_and_sources(self):
        client=Mock()
        db=AsyncMock(side_effect=[SimpleNamespace(data=[{'id':MESSAGE_ID,'content':'Saved answer','sources':[{'url':'official'}]}]),SimpleNamespace(data=[{'id':'report'}])])
        with patch.object(chat,'get_user_client',return_value=client),patch.object(chat,'run_db',db):
            result=await chat.report_citation(MESSAGE_ID,CitationReportRequest(reason='Unsupported claim'),USER)
        payload=client.table.return_value.insert.call_args.args[0]
        self.assertEqual(payload['message_content'],'Saved answer')
        self.assertEqual(payload['sources'],[{'url':'official'}])
        self.assertEqual(result,{'id':'report'})

    async def test_report_does_not_claim_success_on_failed_insert(self):
        db=AsyncMock(side_effect=[SimpleNamespace(data=[{'content':'Saved','sources':[]}]),SimpleNamespace(data=[])])
        with patch.object(chat,'get_user_client',return_value=Mock()),patch.object(chat,'run_db',db):
            with self.assertRaises(HTTPException) as error:
                await chat.report_citation(MESSAGE_ID,CitationReportRequest(reason='Incorrect source'),USER)
        self.assertEqual(error.exception.status_code,500)

    async def test_foreign_message_cannot_be_reported(self):
        with patch.object(chat,'get_user_client',return_value=Mock()),patch.object(chat,'run_db',AsyncMock(return_value=SimpleNamespace(data=[]))):
            with self.assertRaises(HTTPException) as error:
                await chat.report_citation(MESSAGE_ID,CitationReportRequest(reason='Incorrect source'),USER)
        self.assertEqual(error.exception.status_code,404)

    def test_atomic_save_uses_fenced_completion(self):
        client=Mock();client.rpc.return_value.execute.return_value=SimpleNamespace(data={'message_id':MESSAGE_ID})
        token=request_replay.active_request.set({'key':'request','lease':'lease'})
        try:
            result=chat._save_chat_turn(client,'chat','question','answer',payload={'response':'answer','sources':[]})
        finally:
            request_replay.active_request.reset(token)
        self.assertEqual(result,MESSAGE_ID)
        client.table.assert_not_called()
        self.assertEqual(client.rpc.call_args.args[0],'complete_chat_request')

    async def test_stream_replay_returns_done_event_without_generation(self):
        endpoint=AsyncMock(); endpoint.__name__='stream_chat'
        saved={'response':'Saved answer','chat_id':'chat','sources':[]}
        with patch.object(request_replay,'get_user_client',return_value=Mock()),patch.object(request_replay,'run_db',AsyncMock(return_value=SimpleNamespace(data={'state':'done','result':saved}))):
            response=await request_replay.idempotent(endpoint)(request=ChatMessageRequest(message='Question',request_id='request_123456789'),user=USER)
            output=''.join([item async for item in response.body_iterator])
        self.assertIn('"type": "done"',output)
        self.assertIn('Saved answer',output)
        endpoint.assert_not_awaited()

    def test_excerpts_keep_source_number_section_and_distinct_chunks(self):
        from app.services.rag import ChunkMetadata, SearchResult, RAGService
        def chunk(text):
            return SearchResult(ChunkMetadata('Law','Law','RA','','https://official.test/law','Republic Acts',0,2,text),.9)
        first=chunk('Section 1. First passage.')
        first.evidence_span={'kind':'section','number':'1'}
        sources=RAGService().get_sources([first,chunk('Second passage.'),first])
        self.assertEqual(len(sources),1)
        self.assertEqual(sources[0]['citation_number'],1)
        self.assertEqual(sources[0]['section'],'section 1')
        self.assertEqual(sources[0]['excerpts'],['Section 1. First passage.','Second passage.'])
        self.assertEqual(sources[0]['legal_status'],'not_verified')

    async def test_cross_account_isolation_blocks_read_write_stream_upload_and_delete(self):
        """M11: Second account cannot read, write, stream, upload into, or delete another user's chat."""
        empty_check = AsyncMock(return_value=SimpleNamespace(data=[]))
        with patch.object(chat, 'get_user_client', return_value=Mock()), patch.object(chat, 'run_db', empty_check):
            with self.assertRaises(HTTPException) as read_err:
                await chat.get_chat_messages(CHAT_ID, user=OTHER_USER)
            self.assertEqual(read_err.exception.status_code, 404)

            with self.assertRaises(HTTPException) as write_err:
                await chat.send_message(request=ChatMessageRequest(message='Follow-up', chat_id=CHAT_ID), user=OTHER_USER)
            self.assertEqual(write_err.exception.status_code, 404)

            with self.assertRaises(HTTPException) as stream_err:
                await chat.stream_chat(request=ChatMessageRequest(message='Stream follow-up', chat_id=CHAT_ID), user=OTHER_USER)
            self.assertEqual(stream_err.exception.status_code, 404)

            with self.assertRaises(HTTPException) as delete_err:
                await chat.delete_chat(CHAT_ID, user=OTHER_USER)
            self.assertEqual(delete_err.exception.status_code, 404)

            fake_pdf = SimpleNamespace(
                content_type='application/pdf',
                filename='contract.pdf',
                read=AsyncMock(return_value=b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
            )
            with self.assertRaises(HTTPException) as upload_err:
                await chat.analyze_uploaded_file(
                    request_id=None,
                    file=fake_pdf,
                    chat_id=CHAT_ID,
                    user_prompt='Explain this',
                    user=OTHER_USER,
                )
            self.assertEqual(upload_err.exception.status_code, 404)

    def test_system_instruction_preserves_multilingual_three_part_guidance(self):
        self.assertIn('English, Filipino, or Taglish', deepseek.SYSTEM_INSTRUCTION)
        self.assertIn('short explanation', deepseek.SYSTEM_INSTRUCTION)
        self.assertIn('relevant legal sources [Source N]', deepseek.SYSTEM_INSTRUCTION)
        self.assertIn('practical next steps', deepseek.SYSTEM_INSTRUCTION)
