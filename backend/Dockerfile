FROM node:20-slim

# Install GCC, G++, Python 3, and basic tools for executing user code
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3 \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose backend port
EXPOSE 5000

# Start compiled backend server
CMD ["npm", "start"]
