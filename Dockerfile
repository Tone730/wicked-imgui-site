FROM node:20-alpine

WORKDIR /app
COPY server/package.json server/server.js ./
COPY downloads/latest.json ./latest.json

ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    PORT=8787 \
    DATA_FILE=/data/licenses.json \
    ACCOUNTS_FILE=/data/accounts.json \
    RELEASE_MANIFEST=/app/latest.json

RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8787
CMD ["node", "server.js"]
