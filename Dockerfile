FROM node:22-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @ledgercraft/api...

COPY api ./api
COPY packages/contracts ./packages/contracts

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
EXPOSE 3001

CMD ["pnpm", "--filter", "@ledgercraft/api", "start"]
