FROM node:18

# Create app directory
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --force

# Copy MCP server files
COPY . .

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
