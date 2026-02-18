# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the application source code
COPY . .

# Build the application
RUN npm run build

# Ensure the dist directory exists and has proper permissions
RUN ls -la /app/dist && chmod -R 755 /app/dist

# The output of this stage is the /app/dist directory

# Stage 2: Development server
FROM node:20-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"] 