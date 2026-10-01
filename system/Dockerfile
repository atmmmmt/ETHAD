# One image: builds the web app and the API; the API serves both on :4000.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npx prisma generate && npm run build

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app/api
ENV NODE_ENV=production WEB_DIST=/app/web/dist
COPY --from=api /app/api/node_modules ./node_modules
COPY --from=api /app/api/dist ./dist
COPY --from=api /app/api/prisma ./prisma
COPY --from=api /app/api/package.json ./
COPY --from=web /app/web/dist /app/web/dist
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
