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

RUN ls -la artifacts/landing/dist/ || echo "LANDING DIST MISSING"
RUN ls -la artifacts/daytabs/dist/ || echo "DAYTABS DIST MISSING"

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
