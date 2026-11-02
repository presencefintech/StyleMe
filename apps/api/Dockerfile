# API NestJS. Contexte de build = racine du dépôt (monorepo pnpm).
FROM node:22-slim

# openssl : requis par Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production CI=true

# Dépendances d'abord (cache Docker) : les manifestes de tous les packages du workspace, puis install filtré.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# "." = la racine (prisma, tsx) ; les devDependencies restent installées : l'API tourne avec tsx.
# --ignore-scripts : le postinstall de @prisma/client échoue ici faute de schéma ; on génère explicitement plus bas.
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts --filter "@styleme/api..." --filter "."
RUN pnpm rebuild esbuild

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY prisma prisma
RUN pnpm exec prisma generate
# Télécharge dès maintenant les binaires Prisma (moteur de migration compris), pas au démarrage.
RUN pnpm exec prisma -v

EXPOSE 3001
# Les migrations sont appliquées au démarrage (un seul réplica). Le port vient de PORT (fourni par Railway).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && cd apps/api && pnpm exec tsx src/main.ts"]
