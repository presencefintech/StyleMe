import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main as main_module
from app import segment
from app.config import Settings
from app.main import app, get_settings, get_storage
from app.storage import StorageError


class FakeStorage:
    def __init__(self):
        self.files: dict[tuple[str, str], bytes] = {}
        self.uploads: list[tuple[str, str]] = []

    def download(self, bucket, key):
        return self.files[(bucket, key)]

    def upload(self, bucket, key, data, content_type):
        self.files[(bucket, key)] = data
        self.uploads.append((bucket, key))


def png(w=40, h=40) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, format="PNG")
    return buf.getvalue()


class FakeSam:
    """Remplace SAM : compte les analyses (lentes) et les décodages (rapides)."""

    def __init__(self, monkeypatch, candidates=None):
        self.encodes = 0
        self.decodes = 0
        self.candidates = candidates
        monkeypatch.setattr(segment, "encode", self._encode)
        monkeypatch.setattr(segment, "decode", self._decode)
        main_module._cache.clear()
        main_module._selections.clear()

    def _encode(self, img):
        self.encodes += 1
        return segment.Prepared(np.zeros((1,)), (img.height, img.width), np.eye(3))

    def _decode(self, prepared, x, y):
        self.decodes += 1
        h, w = prepared.original_size
        if self.candidates is not None:
            return self.candidates(h, w)
        obj = np.zeros((h, w), dtype=bool)
        obj[h // 2 : h // 2 + 4, w // 2 : w // 2 + 4] = True  # petit objet autour du centre
        return [segment.Candidate(np.ones((h, w), dtype=bool), 0.99), segment.Candidate(obj, 0.8)]


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def client(storage):
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_settings] = lambda: Settings("https://x.supabase.co", "k", "disabled", 2)
    yield TestClient(app)
    app.dependency_overrides.clear()


def click(client, x=0.5, y=0.5, key="u1/in"):
    return client.post("/segment", json={"bucket": "sources", "key": key, "x": x, "y": y})


# --- pick_mask / overlay -------------------------------------------------------------------------------------

def test_pick_mask_prefers_best_score_but_never_the_whole_image():
    h = w = 20
    small = np.zeros((h, w), dtype=bool); small[8:12, 8:12] = True
    big = np.ones((h, w), dtype=bool)
    other = np.zeros((h, w), dtype=bool); other[0:3, 0:3] = True  # ne contient pas le clic
    cands = [segment.Candidate(big, 0.99), segment.Candidate(other, 0.95), segment.Candidate(small, 0.7)]
    assert segment.pick_mask(cands, 9, 9).sum() == small.sum()
    with pytest.raises(segment.NoObjectFound):
        segment.pick_mask([segment.Candidate(big, 0.9)], 9, 9)
    with pytest.raises(segment.NoObjectFound):
        segment.pick_mask([segment.Candidate(other, 0.9)], 9, 9)


def test_pick_mask_falls_back_to_the_smallest_mask_when_everything_is_large():
    h = w = 20
    huge = np.ones((h, w), dtype=bool)
    large = np.zeros((h, w), dtype=bool); large[:, :14] = True    # 70 % : gros objet
    larger = np.zeros((h, w), dtype=bool); larger[:, :17] = True  # 85 % : à la limite
    picked = segment.pick_mask([segment.Candidate(huge, 0.99), segment.Candidate(larger, 0.9), segment.Candidate(large, 0.5)], 3, 3)
    assert picked.sum() == large.sum()


def test_overlay_dims_the_rest_and_keeps_the_object_visible_even_when_red():
    base = Image.new("RGB", (40, 40), (200, 200, 200))
    base.paste((255, 0, 0), (15, 15, 25, 25))
    mask = Image.new("L", (40, 40), 0)
    mask.paste(255, (15, 15, 25, 25))
    out = segment.overlay(base, mask)
    assert out.getpixel((20, 20)) == (255, 0, 0)
    assert out.getpixel((2, 2)) == (80, 80, 80)
    assert out.getpixel((14, 20)) == (255, 255, 255)


def test_overlay_data_url_is_a_small_inline_jpeg():
    base = Image.new("RGB", (3000, 2000), (120, 120, 120))
    mask = Image.new("L", (3000, 2000), 0)
    mask.paste(255, (1000, 800, 1500, 1200))
    url = segment.overlay_data_url(base, mask)
    assert url.startswith("data:image/jpeg;base64,")
    preview = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    assert max(preview.size) == segment.PREVIEW_SIDE and preview.size == (1024, 683)


# --- /segment : aperçu instantané, rien dans le stockage ---------------------------------------------------------

def test_segment_returns_an_inline_preview_and_uploads_nothing(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    r = click(client)
    assert r.status_code == 200
    body = r.json()
    assert body["overlay"].startswith("data:image/jpeg;base64,") and body["selectionId"]
    assert storage.uploads == []  # aucun envoi au stockage : c'est ce qui rend l'aperçu instantané


def test_many_clicks_analyse_the_photo_once(client, storage, monkeypatch):
    sam = FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    ids = {click(client, x, 0.5).json()["selectionId"] for x in (0.5, 0.52, 0.54)}
    assert sam.encodes == 1 and sam.decodes == 3
    assert len(ids) == 3


def test_validates_coordinates_and_reports_missing_object(client, storage, monkeypatch):
    FakeSam(monkeypatch, candidates=lambda h, w: [segment.Candidate(np.ones((h, w), dtype=bool), 0.9)])
    storage.files[("sources", "u1/in")] = png()
    for bad in ({"x": -0.1, "y": 0.5}, {"x": 0.5, "y": 1.5}):
        assert client.post("/segment", json={"bucket": "sources", "key": "u1/in", **bad}).status_code == 422
    assert click(client).status_code == 422  # tout est « trop grand » : aucun objet


def test_bad_image_is_415(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/bad")] = b"not an image"
    assert click(client, key="u1/bad").status_code == 415


# --- /commit : le masque n'est envoyé qu'à la confirmation -----------------------------------------------------

def test_commit_uploads_the_normalised_photo_once_and_a_mask_per_confirmation(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    first = click(client).json()["selectionId"]
    second = click(client, 0.52, 0.5).json()["selectionId"]
    a = client.post("/commit", json={"bucket": "sources", "key": "u1/in", "selectionId": first})
    b = client.post("/commit", json={"bucket": "sources", "key": "u1/in", "selectionId": second})
    assert a.status_code == b.status_code == 200
    assert a.json()["image"] == b.json()["image"]                    # photo normalisée partagée
    assert a.json()["mask"]["key"] != b.json()["mask"]["key"]
    img = Image.open(io.BytesIO(storage.files[("results", a.json()["image"]["key"])]))
    mask = Image.open(io.BytesIO(storage.files[("results", a.json()["mask"]["key"])]))
    assert mask.size == img.size and mask.mode == "L"
    assert mask.getpixel((20, 20)) == 255 and mask.getpixel((0, 0)) == 0
    assert len([u for u in storage.uploads if u[1].endswith(".base.jpg")]) == 1


def test_commit_rejects_unknown_or_foreign_selections(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    storage.files[("sources", "u2/other")] = png()
    sel = click(client).json()["selectionId"]
    assert client.post("/commit", json={"bucket": "sources", "key": "u1/in", "selectionId": "nope"}).status_code == 404
    # une sélection ne peut être confirmée que pour la photo sur laquelle elle a été faite
    assert client.post("/commit", json={"bucket": "sources", "key": "u2/other", "selectionId": sel}).status_code == 404


def test_commit_storage_outage_is_502(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    sel = click(client).json()["selectionId"]
    monkeypatch.setattr(storage, "upload", lambda *a, **k: (_ for _ in ()).throw(StorageError("down")))
    assert client.post("/commit", json={"bucket": "sources", "key": "u1/in", "selectionId": sel}).status_code == 502


# --- /prepare ---------------------------------------------------------------------------------------------------

def test_prepare_warms_the_cache_so_the_first_click_is_fast(client, storage, monkeypatch):
    sam = FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png()
    assert client.post("/prepare", json={"bucket": "sources", "key": "u1/in"}).json() == {"ready": True}
    assert sam.encodes == 1
    assert click(client).status_code == 200
    assert sam.encodes == 1


def test_prepare_rejects_bad_image_and_unknown_bucket(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/bad")] = b"not an image"
    assert client.post("/prepare", json={"bucket": "sources", "key": "u1/bad"}).status_code == 415
    assert client.post("/prepare", json={"bucket": "selfies-training", "key": "u1/x"}).status_code == 422


# --- Rectangle tracé à la main (comme une capture d'écran) -----------------------------------------------------

def box(client, x0, y0, x1, y1, key="u1/in"):
    return client.post("/segment", json={"bucket": "sources", "key": key, "box": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}})


def test_box_mask_is_exactly_the_drawn_rectangle():
    m = segment.box_mask((100, 50), (0.2, 0.4, 0.6, 0.8))
    assert m.size == (100, 50) and m.mode == "L"
    assert m.getpixel((30, 25)) == 255 and m.getpixel((10, 25)) == 0 and m.getpixel((30, 5)) == 0 and m.getpixel((70, 25)) == 0
    with pytest.raises(segment.NoObjectFound):
        segment.box_mask((100, 50), (0.5, 0.5, 0.51, 0.51))  # trop petit : un clic raté, pas une sélection


def test_dragging_a_rectangle_selects_that_area_and_commits_a_matching_mask(client, storage, monkeypatch):
    sam = FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png(40, 40)
    r = box(client, 0.25, 0.25, 0.75, 0.75)
    assert r.status_code == 200 and r.json()["overlay"].startswith("data:image/jpeg;base64,")
    assert sam.decodes == 0                                   # le rectangle n'a pas besoin de SAM
    done = client.post("/commit", json={"bucket": "sources", "key": "u1/in", "selectionId": r.json()["selectionId"]})
    assert done.status_code == 200
    mask = Image.open(io.BytesIO(storage.files[("results", done.json()["mask"]["key"])]))
    assert mask.getpixel((20, 20)) == 255 and mask.getpixel((2, 2)) == 0


def test_invalid_selection_requests_are_rejected(client, storage, monkeypatch):
    FakeSam(monkeypatch)
    storage.files[("sources", "u1/in")] = png(40, 40)
    assert box(client, 0.7, 0.2, 0.3, 0.8).status_code == 422          # x1 <= x0
    assert box(client, -0.1, 0.2, 0.5, 0.8).status_code == 422         # hors image
    assert box(client, 0.5, 0.5, 0.505, 0.505).status_code == 422      # trop petit
    both = {"bucket": "sources", "key": "u1/in", "x": 0.5, "y": 0.5, "box": {"x0": 0.1, "y0": 0.1, "x1": 0.5, "y1": 0.5}}
    assert client.post("/segment", json=both).status_code == 422       # point ET rectangle
    assert client.post("/segment", json={"bucket": "sources", "key": "u1/in"}).status_code == 422  # ni l'un ni l'autre
