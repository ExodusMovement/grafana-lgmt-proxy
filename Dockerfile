FROM 534042329084.dkr.ecr.us-east-1.amazonaws.com/exodus/base-docker-images:amazonlinux2023-node20 AS builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=secret,id=npm,target=/root/.npmrc pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM 534042329084.dkr.ecr.us-east-1.amazonaws.com/exodus/base-docker-images:amazonlinux2023-node20
WORKDIR /app
ARG DEPLOYMENT_ID
ARG GIT_COMMIT_SHA
ENV DEPLOYMENT_ID=${DEPLOYMENT_ID}
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
COPY --chown=node:node --from=builder /build/dist ./dist
COPY --chown=node:node --from=builder /build/node_modules ./node_modules
COPY --chown=node:node --from=builder /build/package.json ./
COPY --chown=node:node entrypoint.sh ./
COPY --from=534042329084.dkr.ecr.us-east-1.amazonaws.com/infrastructure/secrets-manager-go:v2 --chmod=755 /secrets-manager-go /bin/secrets-manager-go
RUN chmod +x entrypoint.sh
USER node
EXPOSE 8085
ENTRYPOINT ["./entrypoint.sh"]
