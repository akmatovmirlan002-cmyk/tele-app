# ===== 1-этап: куруу (TypeScript → JavaScript) =====
FROM node:20-alpine AS build
WORKDIR /app

# Көз карандылыктарды орнотобуз (кэш үчүн адегенде package файлдары)
COPY package*.json ./
RUN npm ci

# Булак кодду көчүрүп, компиляциялайбыз
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ===== 2-этап: иштетүү =====
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production көз карандылыктары гана
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Компиляцияланган код жана статикалык ассеттер
COPY --from=build /app/dist ./dist
COPY assets ./assets

# Telegram бот polling менен иштейт — порт ачуунун кереги жок
CMD ["node", "dist/main.js"]
