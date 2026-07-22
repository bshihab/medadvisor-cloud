# MedAdvisor API — Cloud Run container
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Require the lockfile and install exactly what it pins (reproducible builds).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# Drop privileges: run as the image's built-in unprivileged `node` user.
USER node
EXPOSE 8080
CMD ["node", "index.js"]
