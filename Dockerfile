FROM node:24-slim

RUN apt-get update && apt-get install -y ffmpeg postgresql-client yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

# Optional runtime secret mount location (e.g. yt-dlp cookies file)
RUN mkdir -p /app/secrets

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./

COPY artifacts/ ./artifacts/
COPY lib/ ./lib/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

RUN NODE_ENV=production pnpm run build:prod

RUN ls -la artifacts/landing/dist/public/ || (echo "ERROR: landing dist missing" && exit 1)
RUN ls -la artifacts/daytabs/dist/public/ || (echo "ERROR: daytabs dist missing" && exit 1)
RUN ls -la artifacts/api-server/dist/ || (echo "ERROR: api-server dist missing" && exit 1)

EXPOSE 3000

CMD ["sh", "-c", "node /app/scripts/wait-for-db.js && pnpm --filter @workspace/db run push && sh /app/scripts/start-api-and-worker.sh"]
