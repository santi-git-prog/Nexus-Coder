FROM node:20-slim

# Install GCC, G++, Python 3, and basic tools for executing user code
# python3-is-python creates a 'python' symlink pointing to python3
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3 \
    python3-is-python \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

ENV NODE_ENV=production

# Expose backend port
EXPOSE 5000

# Start compiled backend server
CMD ["npm", "start"]
