# Control plane image. The solver image is sandbox/Dockerfile and stays free of secrets.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN mkdir -p /data && chown node:node /data

ENV NODE_OPTIONS=--experimental-sqlite
ENV DATABASE_PATH=/data/drivein.sqlite
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/server.ts"]
