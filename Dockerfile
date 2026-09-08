# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder
WORKDIR /app
# `npm ci` runs in the build stage itself rather than in a separate `deps`
# stage. node_modules here is ~547 MB across ~32k files, and copying that
# across stages (`COPY --from=deps`) was slow enough to time out the Liara
# build. Installing it where it is used removes that copy entirely.
# package.json/package-lock.json are still copied ahead of the source so the
# install layer is cached against the lockfile, not against every edit.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The retrieval index is read at runtime with fs, so it is not bundled into
# the standalone output and must be copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
