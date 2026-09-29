# Image de production pour Coolify : build Next.js en mode standalone, puis une
# image d'execution minimale. Les donnees (jetons Google) vivent dans /app/.data,
# a monter en volume persistant.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
# Le tableau raisonne en heure belge (« aujourd'hui », « en retard ») : le
# conteneur aussi.
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Brussels \
    PORT=3737 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Cree avec le bon proprietaire : un volume neuf en herite au premier montage.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3737/api/health || exit 1
CMD ["node", "server.js"]
