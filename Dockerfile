FROM node:22

EXPOSE 3000

# Use latest version of npm
RUN npm install npm@latest -g

COPY package.json package-lock.json* ./

RUN npm install --no-optional && npm cache clean --force
RUN npm install concurrently

# copy in our source code last, as it changes the most
WORKDIR /usr

COPY . .

CMD [ "npm", "run", "start" ]