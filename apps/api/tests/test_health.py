from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str)


def test_unknown_route_returns_structured_error(client: TestClient) -> None:
    response = client.get("/v1/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]
