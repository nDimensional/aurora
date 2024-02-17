FROM node:18-alpine

WORKDIR /app
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY ./dist ./dist

ENV NODE_ENV production

RUN npm ci

CMD ["npm", "run", "start"]
