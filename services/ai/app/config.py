import os
from dataclasses import dataclass

# "disabled"       : /moderate répond 503 -> l'API Node échoue le job, aucune photo n'est livrée (fail-closed, défaut).
# "dev-permissive" : approuve tout. DÉVELOPPEMENT UNIQUEMENT, jamais en production.
MODERATION_MODES = ("disabled", "dev-permissive")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_key: str
    moderation_mode: str
    upscale_factor: int

    @staticmethod
    def from_env() -> "Settings":
        """Fail-fast : une variable manquante empêche le démarrage."""
        missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.environ.get(k)]
        if missing:
            raise RuntimeError(f"Configuration invalide, variables manquantes : {', '.join(missing)}")
        mode = os.environ.get("AI_MODERATION_MODE", "disabled")
        if mode not in MODERATION_MODES:
            raise RuntimeError(f"AI_MODERATION_MODE doit être l'un de {MODERATION_MODES}, reçu : {mode!r}")
        factor = int(os.environ.get("AI_UPSCALE_FACTOR", "2"))
        if not 1 <= factor <= 4:
            raise RuntimeError("AI_UPSCALE_FACTOR doit être entre 1 et 4")
        return Settings(
            supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
            service_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            moderation_mode=mode,
            upscale_factor=factor,
        )
