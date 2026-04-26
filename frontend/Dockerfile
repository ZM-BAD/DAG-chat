# Build stage
FROM node:24-alpine AS build

ARG VITE_API_BASE_URL=
ARG DEFAULT_USER_ID=default-user

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# In Docker, loadEnv resolves '..' to / (WORKDIR is /app). The actual values come
# from these ENV directives (set via build args), not from a .env file on disk.
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV DEFAULT_USER_ID=${DEFAULT_USER_ID}

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
