# ==============================================================================
# HUNTER'S KITCHEN — PRODUCTION DOCKERFILE
# Multi-stage build for React/Vite Frontend + Express/PostgreSQL/Redis Backend
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend and Backend Assets
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies required for Vite and esbuild)
RUN npm ci

# Copy project source code
COPY . .

# Build Vite frontend assets and bundle Express server into dist/
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built distribution artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database
COPY --from=builder /app/data ./data

# Run as non-root node user for container runtime security
USER node

# Expose application port
EXPOSE 3000

# Container healthcheck using standard built-in endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the bundled Express server
CMD ["node", "dist/server.cjs"]
