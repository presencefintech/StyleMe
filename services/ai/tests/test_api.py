import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import app, get_settings, get_storage
from app.storage import StorageError


class FakeStorage:
    def __init__(self):
        self.files: dict[tuple[str, str], bytes] = {}
        self.fail = False

    def download(self, bucket, key):
        if self.fail:
            raise StorageError("down")
        return self.files[(bucket, key)]

    def upload(self, bucket, key, data, content_type):
        self.files[(bucket, key)] = data


def png(w=20, h=10, mode="RGB") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, (w, h), "white").save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def storage():
    return FakeStorage()


def make_client(storage, moderation="disabled", factor=2):
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_settings] = lambda: Settings("https://x.supabase.co", "k", moderation, factor)
    return TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.clear()


def test_upscale_writes_a_bigger_png_into_results(storage):
    storage.files[("sources", "u1/in")] = png(20, 10)
    r = make_client(storage).post("/upscale", json={"bucket": "sources", "key": "u1/in"})
    assert r.status_code == 200
    ref = r.json()
    assert ref["bucket"] == "results" and ref["key"].startswith("u1/") and ref["key"].endswith(".png")
    assert Image.open(io.BytesIO(storage.files[("results", ref["key"])])).size == (40, 20)


def test_restore_face_and_remove_bg_keep_the_image(storage):
    storage.files[("results", "u1/a.png")] = png(8, 8)
    c = make_client(storage)
    for path in ("/restore-face", "/remove-bg"):
        r = c.post(path, json={"bucket": "results", "key": "u1/a.png"})
        assert r.status_code == 200
        assert Image.open(io.BytesIO(storage.files[("results", r.json()["key"])])).size == (8, 8)


def test_rejects_unknown_bucket_and_path_traversal(storage):
    c = make_client(storage)
    assert c.post("/upscale", json={"bucket": "selfies-training", "key": "u1/in"}).status_code == 422
    for key in ("../etc/passwd", "/abs", "u1//x", "u1/./x", ""):
        assert c.post("/upscale", json={"bucket": "sources", "key": key}).status_code == 422


def test_corrupt_image_is_422(storage):
    storage.files[("sources", "u1/bad")] = b"not an image"
    assert make_client(storage).post("/upscale", json={"bucket": "sources", "key": "u1/bad"}).status_code == 422
    assert make_client(storage).post("/segment", json={"bucket": "sources", "key": "u1/bad", "x": 0.5, "y": 0.5}).status_code == 415


def test_storage_outage_is_502(storage):
    storage.fail = True
    assert make_client(storage).post("/upscale", json={"bucket": "sources", "key": "u1/in"}).status_code == 502


def test_moderation_is_fail_closed_by_default(storage):
    r = make_client(storage).post("/moderate", json={"bucket": "sources", "key": "u1/in", "stage": "input"})
    assert r.status_code == 503


def test_moderation_dev_permissive_must_be_explicit(storage):
    r = make_client(storage, moderation="dev-permissive").post(
        "/moderate", json={"bucket": "sources", "key": "u1/in", "stage": "input"}
    )
    assert r.status_code == 200
    assert r.json() == {"approved": True, "nsfwScore": 0.0, "minorRisk": False, "faceCount": 1}


def test_apply_template_puts_the_cutout_on_the_occasion_background(storage):
    # sujet : carré rouge opaque au centre, reste transparent
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    img.paste((255, 0, 0, 255), (3, 3, 7, 7))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    storage.files[("results", "u1/cut.png")] = buf.getvalue()
    r = make_client(storage).post("/apply-template", json={"bucket": "results", "key": "u1/cut.png", "templateId": "diplome"})
    assert r.status_code == 200
    out = Image.open(io.BytesIO(storage.files[("results", r.json()["key"])])).convert("RGB")
    assert out.getpixel((5, 5)) == (255, 0, 0)  # le sujet est conservé
    assert out.getpixel((0, 0)) != (255, 0, 0) and out.getpixel((0, 0)) != (0, 0, 0)  # le fond est un dégradé


def test_apply_template_rejects_unknown_style_and_uncut_images(storage):
    storage.files[("results", "u1/plain.png")] = png(8, 8)
    c = make_client(storage)
    assert c.post("/apply-template", json={"bucket": "results", "key": "u1/plain.png", "templateId": "nope"}).status_code == 422
    assert c.post("/apply-template", json={"bucket": "results", "key": "u1/plain.png", "templateId": "mariage"}).status_code == 422


def test_settings_fail_fast(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        Settings.from_env()
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    monkeypatch.setenv("AI_MODERATION_MODE", "nope")
    with pytest.raises(RuntimeError, match="AI_MODERATION_MODE"):
        Settings.from_env()
