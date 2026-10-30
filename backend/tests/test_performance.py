import asyncio
import threading
import unittest
from unittest.mock import AsyncMock, Mock, patch
from app.services import database_io, deepseek


class PerformanceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database_io._limiter = None

    async def test_waiting_database_does_not_block_event_loop(self):
        entered, release = threading.Event(), threading.Event()
        def slow():
            entered.set()
            release.wait(2)
            return 'saved'
        task = asyncio.create_task(database_io.run_db(slow))
        try:
            for _ in range(100):
                if entered.is_set(): break
                await asyncio.sleep(.01)
            self.assertTrue(entered.is_set())
            self.assertFalse(task.done())
            self.assertEqual(await asyncio.wait_for(asyncio.sleep(0, result='responsive'), .2), 'responsive')
        finally:
            release.set()
        self.assertEqual(await task, 'saved')

    async def test_database_failures_are_not_hidden(self):
        with self.assertRaisesRegex(ValueError, 'database failure'):
            await database_io.run_db(Mock(side_effect=ValueError('database failure')))

    async def test_shared_ai_client_survives_requests_and_closes_once(self):
        client = Mock(close=AsyncMock())
        with patch.object(deepseek, '_shared_client', None), patch.object(deepseek, 'get_client', return_value=client) as factory:
            await deepseek.start_clients()
            for _ in range(2):
                async with deepseek.client_session() as session:
                    self.assertIs(session, client)
            factory.assert_called_once()
            client.close.assert_not_awaited()
            await deepseek.close_clients()
            await deepseek.close_clients()
            client.close.assert_awaited_once()
