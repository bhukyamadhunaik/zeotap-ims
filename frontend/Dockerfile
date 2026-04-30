FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# In dev mode, we'll just run dev server to see hot reloading
CMD ["npm", "run", "dev", "--", "--host"]
