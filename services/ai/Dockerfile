# Service IA (FastAPI + SAM + rembg). Contexte de build = racine du dépôt.
# Interne uniquement : aucune authentification, il ne doit jamais avoir de domaine public.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv

# libgomp : requis par onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/ai/requirements.txt .
RUN pip install -r requirements.txt

# Les modèles (~400 Mo) sont téléchargés À LA CONSTRUCTION, pas au premier clic d'un utilisateur.
RUN python -c "from rembg import new_session; new_session('u2net'); new_session('sam')"

COPY services/ai/app app

EXPOSE 8000
# "::" : écoute en IPv4 et IPv6, nécessaire pour le réseau privé Railway (service.railway.internal).
CMD ["sh", "-c", "uvicorn app.main:app --host :: --port ${PORT:-8000}"]
