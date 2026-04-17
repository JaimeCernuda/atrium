FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate


FROM base AS build
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.build.json ./apps/server/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared/src ./packages/shared/src
COPY apps/server/src ./apps/server/src
COPY apps/server/prisma ./apps/server/prisma
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public

RUN cd apps/server && pnpm exec prisma generate
RUN pnpm build
RUN pnpm --filter @atrium/server --prod --legacy deploy /deploy


FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST=/app/web

COPY --from=build /deploy ./
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/prisma ./prisma
COPY --from=build /app/apps/web/dist ./web

RUN pnpm exec prisma generate

EXPOSE 8090
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
