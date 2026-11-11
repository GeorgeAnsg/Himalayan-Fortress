# Madrigueras — la plataforma y los juegos, servidos por Node.
# Build context: esta carpeta.
FROM node:22-alpine

WORKDIR /app

# 3000 es el puerto que Coolify espera por defecto.
ENV NODE_ENV=production \
    PORT=3000

# Las únicas dependencias son socket.io y web-push. Se instalan desde el
# lockfile: el repo no lleva node_modules y el build no depende del Mac.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Lo que hace falta en marcha: la plataforma, los juegos y la app.
COPY plataforma ./plataforma
COPY juego ./juego
COPY app ./app

# La base y las claves VAPID viven en /datos, que es donde se monta el volumen.
# Se crea con el dueño correcto para que el proceso `node` pueda escribir.
RUN mkdir -p /datos && chown -R node:node /datos

# su-exec cambia de usuario sin fork: Node hereda el PID 1 y recibe SIGTERM.
RUN apk add --no-cache su-exec

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/api/version || exit 1

# Arranca como root solo para arreglar /datos, y cae a `node`.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "plataforma/servidor.mjs"]
