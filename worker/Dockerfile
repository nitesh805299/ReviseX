FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

COPY shared ./shared
COPY worker/package*.json ./worker/
RUN npm --prefix worker install --omit=dev && npx --prefix worker playwright install chromium

COPY worker ./worker

EXPOSE 4001
CMD ["node", "worker/src/index.js"]
