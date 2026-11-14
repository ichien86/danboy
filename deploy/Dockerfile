# Satu Dockerfile, dua target: web (Next.js standalone) dan worker (BullMQ).
# Bangun dari akar repositori:
#   docker build -f deploy/Dockerfile --target web -t danboy-web:1.0.0 .
#   docker build -f deploy/Dockerfile --target worker -t danboy-worker:1.0.0 .

FROM node:22-bookworm-slim AS dasar
# MONGOMS_DISABLE_POSTINSTALL: jangan unduh biner mongod milik mongodb-memory-server (hanya untuk uji/dev)
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 MONGOMS_DISABLE_POSTINSTALL=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM dasar AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/excel/package.json packages/excel/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN NEXT_OUTPUT=standalone pnpm --filter @danboy/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Jakarta
WORKDIR /app
RUN groupadd -r danboy && useradd -r -g danboy danboy
COPY --from=build --chown=danboy:danboy /app/apps/web/.next/standalone ./
COPY --from=build --chown=danboy:danboy /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=danboy:danboy /app/apps/web/public ./apps/web/public
USER danboy
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/kesehatan').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM deps AS worker
ENV NODE_ENV=production TZ=Asia/Jakarta
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY scripts ./scripts
COPY tsconfig.base.json ./
RUN groupadd -r danboy && useradd -r -g danboy danboy && chown -R danboy:danboy /app
USER danboy
CMD ["node_modules/.bin/tsx", "apps/worker/index.ts"]
