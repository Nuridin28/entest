# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the application source code
COPY . .

# Build the application (output to build-output, т.к. volume перезапишет /app/dist)
RUN npm run build && mv /app/dist /app/build-output && chmod -R 755 /app/build-output

# Stage 2: Development server
FROM node:20-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"] 