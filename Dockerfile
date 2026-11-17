# Fixes #31 (Dockerfile hardening) and #45 (Node version alignment with CI):
# the image pins the same Node 24 as CI, installs from the lockfile, and
# runs as a non-root user.
FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/telegram-bot/package.json apps/telegram-bot/
COPY apps/bale-bot/package.json apps/bale-bot/
COPY packages/domain/package.json packages/domain/

RUN npm ci --omit=dev

COPY apps ./apps
COPY packages ./packages

# Fixes #31: never run the API as root inside the container.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
  && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000)).then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
