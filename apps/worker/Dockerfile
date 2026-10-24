# Bouwen vanaf de root van de repo: docker compose build (zie docker-compose.yml)
FROM node:22-slim AS build
RUN npm install -g pnpm@10.18.3
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @huurradar/worker
COPY apps/worker apps/worker
RUN pnpm --filter @huurradar/worker build && pnpm --filter @huurradar/worker deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production TZ=Europe/Amsterdam
WORKDIR /app
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/package.json package.json
COPY --from=build /app/apps/worker/dist dist
USER node
# Gezond als de worker de afgelopen 20 minuten een run heeft afgerond.
HEALTHCHECK --interval=5m --timeout=10s --start-period=2m \
  CMD node -e "const s=require('fs').statSync('/tmp/huurradar-heartbeat');process.exit(Date.now()-s.mtimeMs<20*60e3?0:1)"
CMD ["node", "dist/index.js"]
