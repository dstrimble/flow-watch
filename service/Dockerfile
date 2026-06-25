# Use Node.js LTS
FROM node:20-alpine

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/America/Chicago /etc/localtime \
    && echo "America/Chicago" > /etc/timezone
ENV TZ=America/Chicago

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "scheduleService.js"]
