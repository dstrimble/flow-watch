# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/build /usr/share/nginx/html/
# Copy entrypoint to generate env.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Nginx config snippet (below we’ll add Cache-Control for env.js)
COPY nginx.conf /etc/nginx/conf.d/default.conf

ENV REACT_APP_API_HOST=""

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx","-g","daemon off;"]