# Use Node.js with Chrome dependencies for Puppeteer
FROM node:20-bullseye

# Install Chrome dependencies for ARM64
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium instead of Chrome for ARM64 compatibility
RUN apt-get update && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Make port 3001 available to the world outside this container
EXPOSE 3001

# Define the command to run your app
CMD [ "node", "src/mcp-server.js" ]
