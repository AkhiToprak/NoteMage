# Multi-stage build for Next.js

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY quizzard/package.json quizzard/package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY quizzard/package.json quizzard/package-lock.json* ./
COPY quizzard/ ./
# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

# Stage 3: Development (for docker-compose dev environment)
FROM node:20-alpine AS dev
WORKDIR /app
COPY quizzard/package.json quizzard/package-lock.json* ./
RUN npm ci
COPY quizzard/ ./
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Stage 4: Production
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY quizzard/package.json quizzard/package-lock.json* ./
RUN npm ci --only=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY quizzard/next.config.ts ./
EXPOSE 3000
CMD ["npm", "run", "start"]
