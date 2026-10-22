from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import local_session
from app.config import settings
from app.main import app
from app.services import credential_store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'local_unlock_key_path', str(tmp_path / 'unlock.key'))
    local_session.initialize_local_session()
    with TestClient(app, base_url='http://localhost') as c:
        yield c
    local_session.lock_session()


def unlock(client):
    key = Path(settings.local_unlock_key_path).read_text()
    response = client.post('/api/session/unlock', json={'key': key})
    assert response.status_code == 200
    return {'X-Workbench-Session': response.json()['token']}


@pytest.mark.parametrize('method,path', [
    ('get','/api/profiles'), ('post','/api/profiles'),
    ('get','/api/profiles/1/snapshot'), ('delete','/api/profiles/1'),
    ('get','/api/data-pull/stream/1'), ('get','/api/auth/status/1'),
    ('get','/api/inventory/summary'), ('get','/openapi.json'),
])
def test_profile_header_is_not_authority(client, method, path):
    response = getattr(client, method)(path, headers={'X-Profile-Id':'1'})
    assert response.status_code == 401


def test_invalid_key_and_untrusted_origin_or_host_fail(client):
    assert client.post('/api/session/unlock', json={'key':'invalid'}).status_code == 401
    key = Path(settings.local_unlock_key_path).read_text()
    assert client.post('/api/session/unlock', json={'key':key}, headers={'Origin':'https://example.com'}).status_code == 403
    assert client.get('/health', headers={'Host':'example.com'}).status_code == 403


def test_valid_session_can_read_local_profiles(client, monkeypatch):
    from app.dependencies import get_db
    from unittest.mock import MagicMock
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    async def fake_db():
        yield db
    app.dependency_overrides[get_db] = fake_db
    try:
        assert client.get('/api/profiles', headers=unlock(client)).json() == {'profiles': []}
    finally:
        app.dependency_overrides.clear()


def test_lock_revokes_session_and_cloud_credentials(client):
    headers = unlock(client)
    credential_store._store[123] = object()
    assert client.post('/api/session/lock', headers=headers).status_code == 200
    assert credential_store._store == {}
    assert client.get('/api/profiles', headers=headers).status_code == 401


def test_expiry_and_restart_revoke_access(client, monkeypatch):
    headers = unlock(client)
    monkeypatch.setattr(local_session, '_expires_at', 0)
    assert client.get('/api/profiles', headers=headers).status_code == 401
    headers = unlock(client)
    old_key = Path(settings.local_unlock_key_path).read_text()
    local_session.initialize_local_session()
    assert client.get('/api/profiles', headers=headers).status_code == 401
    assert client.post('/api/session/unlock', json={'key': old_key}).status_code == 401


def test_preflight_and_error_cors(client):
    origin = {'Origin':'http://localhost:5173'}
    response = client.options('/api/profiles', headers={**origin, 'Access-Control-Request-Method':'GET', 'Access-Control-Request-Headers':'x-workbench-session'})
    assert response.status_code == 200
    response = client.get('/api/profiles', headers=origin)
    assert response.status_code == 401
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'


def test_tokens_in_urls_are_not_accepted(client):
    token = unlock(client)['X-Workbench-Session']
    assert client.get('/api/profiles', params={'token':token}).status_code == 401
