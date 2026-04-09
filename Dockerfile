FROM node:24-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./

COPY artifacts/ ./artifacts/
COPY lib/ ./lib/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

RUN NODE_ENV=production pnpm run build:prod

RUN ls -la artifacts/landing/dist/ || (echo "ERROR: landing dist missing" && exit 1)
RUN ls -la artifacts/daytabs/dist/ || (echo "ERROR: daytabs dist missing" && exit 1)
RUN ls -la artifacts/api-server/dist/ || (echo "ERROR: api-server dist missing" && exit 1)

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
