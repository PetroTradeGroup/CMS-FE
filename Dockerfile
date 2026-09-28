# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps first so this layer is cached across builds unless package*.json actually changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite only inlines VITE_* vars that exist at build time (they're compiled into the static JS,
# not read at container runtime) — so they must arrive as build args, not regular env vars set
# on the running container. Pass them via `docker build --build-arg` / compose's `build.args`.
ARG VITE_API_BASE_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID

RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
