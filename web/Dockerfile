# Web app (Next.js). Build context: repository root (needs ../groups/catalog.json).
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@10
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
COPY groups/ /app/groups/
RUN pnpm build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/web
COPY --from=build /app/web ./
COPY groups/ /app/groups/
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
