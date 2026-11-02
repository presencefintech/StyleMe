from typing import Protocol
from urllib.parse import quote

import httpx

MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024


class Storage(Protocol):
    def download(self, bucket: str, key: str) -> bytes: ...
    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None: ...


class StorageError(Exception):
    """Erreur du storage (réseau, 4xx/5xx Supabase)."""


class SupabaseStorage:
    """Lit/écrit dans Supabase Storage avec la clé service role (jamais exposée hors de ce service)."""

    def __init__(self, base_url: str, service_key: str, client: httpx.Client | None = None):
        self._base = f"{base_url}/storage/v1/object"
        self._headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
        self._client = client or httpx.Client(timeout=60.0)

    def _url(self, bucket: str, key: str) -> str:
        return f"{self._base}/{quote(bucket, safe='')}/{quote(key, safe='/')}"

    def download(self, bucket: str, key: str) -> bytes:
        try:
            res = self._client.get(self._url(bucket, key), headers=self._headers)
            res.raise_for_status()
        except httpx.HTTPError as e:
            raise StorageError(f"download {bucket}/{key} failed: {e}") from e
        if len(res.content) > MAX_DOWNLOAD_BYTES:
            raise StorageError("source image too large")
        return res.content

    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        try:
            res = self._client.post(
                self._url(bucket, key),
                headers={**self._headers, "Content-Type": content_type, "x-upsert": "true"},
                content=data,
            )
            res.raise_for_status()
        except httpx.HTTPError as e:
            raise StorageError(f"upload {bucket}/{key} failed: {e}") from e
