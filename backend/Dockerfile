FROM node:22-slim

WORKDIR /app

COPY shared ./shared
COPY backend/package*.json ./backend/
RUN npm --prefix backend install --omit=dev

COPY backend ./backend

EXPOSE 4000
CMD ["node", "backend/src/server.js"]
