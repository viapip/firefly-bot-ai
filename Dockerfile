FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install yarn 4
RUN corepack enable && corepack prepare yarn@4.8.1 --activate

# Copy package files first (better layer caching)
COPY package.json yarn.lock* .yarnrc.yml* ./
COPY .yarn ./.yarn

# Install dependencies
RUN yarn install --immutable

# Copy application code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install yarn 4
RUN corepack enable && corepack prepare yarn@4.8.1 --activate

# Copy package files
COPY package.json yarn.lock* .yarnrc.yml* ./
COPY .yarn ./.yarn

# Install only production dependencies
RUN yarn install --immutable 

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "--experimental-modules", "--experimental-import-meta-resolve", "dist/index.mjs"]
