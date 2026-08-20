FROM mcr.microsoft.com/devcontainers/base:trixie
COPY --from=node:latest /usr/local/bin/node /usr/local/bin/node
COPY --from=node:latest /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --chmod=755 docs/install-skills.sh /usr/local/bin/install-xFrame-ai-skills.sh
COPY docs/examples/conceptlab /examples/conceptlab
