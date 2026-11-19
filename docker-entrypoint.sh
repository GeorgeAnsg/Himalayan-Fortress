#!/bin/sh
# El volumen de Coolify puede llegar con dueño root. Se arregla aquí, antes de
# bajar a `node`, y se sigue: si no se puede escribir, el servidor lo dirá en
# el primer guardado en vez de negarse a arrancar.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/app/data
  chown -R node:node /app/app/data 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
