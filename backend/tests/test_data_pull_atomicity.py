import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base, AssessmentSnapshotDB, CustomerProfileDB
from app.routers import data_pull
from app.services import credential_store


@pytest.mark.asyncio
@pytest.mark.parametrize('fail,expired', [(False, False), (True, False), (False, True)])
async def test_pull_preserves_previous_evidence_on_failure_and_other_profiles(monkeypatch, fail, expired):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        db.add_all([CustomerProfileDB(id=n, customer_name=f'Synthetic {n}') for n in (1,2)])
        db.add_all([AssessmentSnapshotDB(profile_id=n, module_name='inventory.summary', data_json='{"old":true}') for n in (1,2)])
        await db.commit()
    seen = []
    class Collector:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def delete(self, path, headers):
            seen.append(headers)
            return httpx.Response(200, json={})
        async def get(self, path, headers):
            seen.append(headers)
            return httpx.Response(500 if fail else 200, json={'detail':'Synthetic failure'} if fail else {'total_resources':3})
    monkeypatch.setattr(data_pull.httpx, 'AsyncClient', Collector)
    monkeypatch.setattr(data_pull, 'async_session', sessions)
    monkeypatch.setattr(data_pull, 'PULL_STEPS', [data_pull.PullStep('Inventory','inventory.summary','/api/inventory/summary')])
    monkeypatch.setattr(data_pull, 'valid_session', lambda _: not expired)
    monkeypatch.setattr(credential_store, 'get_credential', lambda _: object())
    events = [x async for x in data_pull._run_pull(1,'http://127.0.0.1:8000','synthetic-session')]
    assert all(x['X-Workbench-Session'] == 'synthetic-session' and x['X-Profile-Id'] == '1' for x in seen)
    async with sessions() as db:
        rows = (await db.execute(select(AssessmentSnapshotDB))).scalars().all()
        values = {r.profile_id:json.loads(r.data_json) for r in rows}
        assert values[2] == {'old':True}
        assert values[1] == ({'old':True} if fail or expired else {'total_resources':3})
    assert any(('event: failed' if fail else 'event: error' if expired else 'event: complete') in x for x in events)
    await engine.dispose()
