# Build stage
FROM node:24-alpine AS build

ARG VITE_API_BASE_URL=
ARG VITE_DEFAULT_USER_ID=test-user

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Vite picks up ENV vars at build time with higher priority than .env files
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DEFAULT_USER_ID=${VITE_DEFAULT_USER_ID}

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
