FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable \
    && corepack prepare pnpm@9 --activate

COPY . .
RUN pnpm install --frozen-lockfile

CMD ["bun", "apps/server/src/index.ts"]