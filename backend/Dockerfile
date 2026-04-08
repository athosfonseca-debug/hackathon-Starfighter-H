FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
