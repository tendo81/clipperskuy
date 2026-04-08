FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production 2>/dev/null || npm install --only=production

# Copy source
COPY . .

# Create data directory
RUN mkdir -p data

# Start bot
CMD ["node", "index.js"]
