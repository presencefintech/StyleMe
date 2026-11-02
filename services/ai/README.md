# StyleMe AI service (FastAPI)

Microservice interne appelé par l'API Node (`AI_MODE=local`, `LOCAL_AI_URL`). Il lit les photos dans Supabase
Storage, les traite et écrit le résultat dans le bucket `results`. **Ne pas l'exposer sur Internet** : il n'a pas
d'authentification propre (il écoute sur 127.0.0.1).

| Endpoint | Rôle | État |
|---|---|---|
| `POST /upscale` | agrandit (×`AI_UPSCALE_FACTOR`, défaut 2) | Pillow (Lanczos). Remplaçable par Real-ESRGAN |
| `POST /restore-face` | restauration du visage | léger renforcement de netteté. Remplaçable par GFPGAN |
| `POST /remove-bg` | détourage | `rembg` si installé, sinon image inchangée (avertissement dans les logs) |
| `POST /apply-template` | fond d'occasion | 501 (v2) |
| `POST /moderate` | modération entrée/sortie | **fail-closed** : 503 tant que non configuré |

## Modération

Par défaut `/moderate` répond **503**, donc l'API Node fait échouer le job (aucune photo livrée, 0 crédit).
- **Développement** : `AI_MODERATION_MODE=dev-permissive` approuve tout, sans analyse. Jamais en production.
- **Production** : utiliser `MODERATION_PROVIDER=sightengine` côté API Node (nudité + risque mineur). Ce service ne
  détecte pas les mineurs.

## Lancer (Windows)

1. Installer Python 3.11+ (python.org, cocher « Add to PATH »).
2. Depuis `services/ai` :
   ```
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file ../../.env
   ```
   Variables lues : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_MODERATION_MODE`, `AI_UPSCALE_FACTOR`.
3. Tests : `pytest`.

Le détourage de qualité : `pip install rembg onnxruntime` (télécharge un modèle au premier appel).
