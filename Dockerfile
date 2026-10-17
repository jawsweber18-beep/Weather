# Self-hosted build: standalone Node server, no Vercel needed.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:server && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 PGLITE_DATA_DIR=/data
COPY --from=build /app/.output ./.output
# For `npm run users` (account management).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
