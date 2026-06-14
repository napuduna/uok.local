FROM node:24-alpine AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN corepack pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN corepack pnpm build

FROM node:24-alpine AS api
WORKDIR /workspace
ENV NODE_ENV=production
ENV API_PORT=4000
RUN corepack enable
COPY --from=builder /workspace ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM node:24-alpine AS worker
WORKDIR /workspace
ENV NODE_ENV=production
ENV WORKER_PORT=4001
RUN corepack enable
COPY --from=builder /workspace ./
EXPOSE 4001
CMD ["node", "apps/worker/dist/main.js"]

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
