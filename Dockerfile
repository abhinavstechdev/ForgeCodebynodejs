# -------------------------------------------------------------
# ForgeCode AI — Production Dockerfile for Voroa.com
# -------------------------------------------------------------

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Install node dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy full source
COPY . .

# Generate Prisma Client & Build Application
RUN npx prisma generate
RUN npm run build

# -------------------------------------------------------------
# Production Runner Image
# -------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install runtime dependencies for Git and execution tools
RUN apk add --no-cache git bash openssh

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Copy built frontend and compiled backend from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create storage directory for workspaces
RUN mkdir -p ./storage/workspaces

EXPOSE 3000

# Health check matching Voroa deployment target
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

CMD ["npm", "run", "start"]
