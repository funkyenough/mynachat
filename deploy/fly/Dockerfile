# Fly.io: web + verifier + Caddy in one machine, sharing one volume at /data.
# Fly terminates TLS; Caddy routes /verifier/* to the verifier and the rest to the web app.
# Build context: repository root (see ../../fly.toml).

FROM node:22-bookworm-slim AS web
RUN npm install -g pnpm@10
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
COPY groups/ /app/groups/
RUN pnpm build

FROM rust:1.95-bookworm AS verifier
WORKDIR /src
COPY crates crates
COPY groups groups
COPY verifier verifier
WORKDIR /src/verifier
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/verifier/target \
    cargo build --release --bins && \
    mkdir -p /out && cp target/release/myna-verifier target/release/native_prover /out/

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=caddy:2 /usr/bin/caddy /usr/local/bin/caddy
COPY --from=verifier /out/ /usr/local/bin/
COPY --from=web /app/web /app/web
COPY groups/ /app/groups/
COPY deploy/fly/Caddyfile /etc/caddy/Caddyfile
COPY deploy/fly/start.sh /usr/local/bin/start.sh
ENV NODE_ENV=production \
    DB_PATH=/data/mynachat.sqlite \
    AUDIT_DIR=/data/audit \
    VERIFIER_AUDIT_DIR=/data/audit \
    AUDIT_ENABLED=1 \
    DEV_FAKE_MYNA=0 \
    DEV_FAKE_WORLD_ID=0 \
    VERIFIER_LISTEN=127.0.0.1:7047 \
    WEB_URL=http://127.0.0.1:3000 \
    RUST_LOG=info,yamux=warn,tlsn_mux=warn
WORKDIR /app/web
EXPOSE 8080
CMD ["bash", "/usr/local/bin/start.sh"]
