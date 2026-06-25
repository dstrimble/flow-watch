# Use official Node.js LTS image
FROM node:20-alpine
# Set working directory
WORKDIR /app
# Copy package.json and package-lock.json (if present)
COPY package.json ./
# Install dependencies
RUN npm install
# Install tzdata and set timezone to Central Time (America/Chicago)
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/America/Chicago /etc/localtime \
    && echo "America/Chicago" > /etc/timezone
ENV TZ=America/Chicago
# Copy the rest of the batch directory
COPY . ./
# Default command: run the scraper (accepts optional day override)
CMD ["node"]