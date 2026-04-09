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

EXPOSE 3000

CMD ["pnpm", "start"]
