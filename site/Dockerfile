# --- build the website ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/.npmrc ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# --- run the server (serves the API and the built website) ---
ARG DENO_VERSION=2.9.6
FROM denoland/deno:${DENO_VERSION}
WORKDIR /app
COPY server/deno.json ./
COPY server/src ./src
COPY server/base44 ./base44
COPY --from=web /web/dist ./web
# Pre-fetch dependencies so start-up doesn't need the network.
RUN deno cache --unstable-sloppy-imports src/main.ts src/cli/import.ts src/cli/check.ts \
 && mkdir -p /data && chown -R deno:deno /data /app
USER deno
ENV WEB_DIR=/app/web DATA_DIR=/data PORT=8080 NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD ["deno", "eval", "const r = await fetch('http://127.0.0.1:8080/api/health'); Deno.exit(r.ok ? 0 : 1)"]
# --allow-all: the 112 backend functions are your own code and call many outside services.
CMD ["deno", "run", "--allow-all", "--unstable-sloppy-imports", "src/main.ts"]
