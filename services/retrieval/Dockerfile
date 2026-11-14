FROM node:22-bookworm-slim
WORKDIR /service
ENV NODE_ENV=production MODEL_CACHE_DIR=/models RETRIEVAL_DATA_DIR=/data HOST=0.0.0.0 PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /models /data && chown node:node /models /data
COPY --chown=node:node encoder.mjs server.mjs ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
