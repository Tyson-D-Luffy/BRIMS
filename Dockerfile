# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built assets and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/backend ./src/backend
COPY --from=builder /app/firebase-applet-config.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose ports for container environments
EXPOSE 3000
EXPOSE 8080

# Start the application
CMD ["node", "dist/server.cjs"]
