# Verifier (TLSNotary MPC-TLS + WebSocket->TCP relay). Build context: repository root
# (the criteria crate embeds ../groups/catalog.json at compile time).
FROM rust:1.95-bookworm AS build
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

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/ /usr/local/bin/
ENV VERIFIER_LISTEN=0.0.0.0:7047 AUDIT_DIR=/audit
EXPOSE 7047
CMD ["myna-verifier"]
