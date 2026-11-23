# PayLink UI — static interface served by Node (no build step).
# The app logic runs on-chain (PayLink on Aevum testnet); this image only
# serves the interface. The contract is NOT inside this image.
# NOTE: written, NOT built or tested — no Docker daemon in this environment.
# Build & run (needs Docker):
#   docker build -t paylink .
#   docker run -p 8080:8080 paylink
# Then open http://localhost:8080/?rpc=https://rpc-test.qday.info&paylink=0x<DEPLOYED>&from=<DEPLOY_BLOCK>
FROM node:24-alpine
WORKDIR /app
COPY web/ ./web/
COPY scripts/serve.mjs ./scripts/serve.mjs
EXPOSE 8080
CMD ["node", "scripts/serve.mjs", "8080"]
