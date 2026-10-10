# 整体与独立服务端共用编译步骤。 @author yahyaoo
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts && npm rebuild better-sqlite3 --no-audit --no-fund

FROM node:24-bookworm-slim AS server
WORKDIR /app
RUN apt-get update && (apt-get install -y --no-install-recommends libchromaprint-tools || true) && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json /app/index.js ./
COPY --from=builder /app/deploy/node/start.cjs ./deploy/node/start.cjs
VOLUME /app/data
ENV NODE_ENV=production DATA_PATH=/app/data LOG_PATH=/app/data/logs CONFIG_PATH=/app/data/config.js PORT=9527 CLIENT_MODE=external FPCALC_PATH=/usr/bin
EXPOSE 9527
CMD ["node", "index.js"]

FROM server AS all
COPY --from=builder /app/client ./client
ENV CLIENT_MODE=local
