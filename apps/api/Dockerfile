# 백엔드 컨테이너. Dokploy 가 저장소 루트를 빌드 컨텍스트로 쓴다.
#
# 빌드: docker build -f apps/api/Dockerfile -t zlp-api .
# 실행: docker run -p 3000:3000 --env-file .env zlp-api

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- 의존성 ----
# 워크스페이스 매니페스트만 먼저 복사해 캐시가 잘 듣게 한다
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @zoom-live-participants/api --prod=false

# ---- 실행 ----
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/drizzle.config.ts apps/api/

# root 로 실행하지 않는다
USER node

EXPOSE 3000

# Node 22 의 타입 스트리핑으로 .ts 를 그대로 실행한다. 별도 빌드 단계가 없다.
CMD ["node", "--experimental-strip-types", "apps/api/src/main.ts"]
