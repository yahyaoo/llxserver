# 客户端无需第三方 Node 依赖。 @author yahyaoo
FROM node:24-bookworm-slim
WORKDIR /app
COPY client ./client
COPY config.js ./config.js
COPY deploy/client/gateway.cjs ./deploy/client/gateway.cjs
ENV CLIENT_PORT=9528
EXPOSE 9528
CMD ["node", "deploy/client/gateway.cjs"]
