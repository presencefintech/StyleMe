# Web Next.js. Contexte de build = racine du dépôt (monorepo pnpm).
FROM node:22-slim

RUN corepack enable
WORKDIR /app
ENV CI=true NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod=false --filter "@styleme/web..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Next fige NEXT_PUBLIC_* dans le JavaScript AU BUILD : l'URL publique de l'API doit être connue ici.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @styleme/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "cd apps/web && pnpm exec next start -p ${PORT:-3000}"]
