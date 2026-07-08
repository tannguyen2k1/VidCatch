# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Set up environment variables at build-time. Next.js bakes 
# NEXT_PUBLIC_ variables into the compiled client-side JavaScript.


# Build the Next.js application
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Expose frontend port
EXPOSE 3000

# Start Next.js server
CMD ["npm", "run", "start"]
