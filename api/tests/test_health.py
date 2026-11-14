from fastapi.testclient import TestClient

from retailflow_api.main import create_app
from helpers import FakeRunner, make_settings


def test_health_endpoint(tmp_path):
    app = create_app(make_settings(tmp_path), runner=FakeRunner())

    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
