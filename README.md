# Madrigueras

La plataforma de partidas por turnos: **cuentas**, **vestíbulo**, **mesa**, **final** y todo lo
que hace falta alrededor (reconexión, avisos, versión, PWA). El juego va enchufado: hoy hay uno de
prueba para poder jugar la base de punta a punta.

Es la base que faltaba en *Say My Name*: allí la identidad era el nombre, no había cuentas y los
vestíbulos vivían solo en memoria.

## Arrancar en local

```bash
pnpm install
PORT=3000 node plataforma/servidor.mjs   # http://127.0.0.1:3000/app/
node --test pruebas/*.test.mjs           # 12 comprobaciones
```

Node 22 (`node:sqlite` viene dentro; al arrancar sale el aviso de que es experimental, solo eso).

## Qué hay dentro

```
plataforma/
  servidor.mjs   HTTP (estático + API) y socket.io
  almacen.mjs    el SQLite: usuarios, sesiones, salas, asientos, suscripciones
  auth.mjs       nombres, scrypt, tokens y freno de intentos
  salas.mjs      vestíbulo, asientos, turnos, final, caducidad y anfitrión heredable
  version.mjs    huella del código, para el aviso de versión nueva
  push.mjs       Web Push con claves VAPID que viven en el volumen
juego/
  contrato.md    lo que tiene que cumplir un juego (leer antes de enchufar uno)
  registro.mjs   la lista de juegos instalados
  carrera.js     el juego de prueba (servidor)
  cliente/       el tablero de cada juego (navegador)
app/
  app.js         arranque y cambio de pantalla
  vistas/        entrada, inicio, vestíbulo, juego, final
  socket.js      la conexión, con acuse y espera de conexión
  version.js     comparación de versión y modal obligatorio
  avisos.js      toast, timbre, notificación del sistema y push
  sw.js          red primero + caché de arte versionada
  api.js, sesion.js, ui.js, estilos.css
pruebas/         mesas y cuentas
```

## Cuentas

- **Nombre + contraseña.** Sin correo, sin invitado. El nombre es único normalizado («Aná» y
  «ana» son la misma cuenta).
- Contraseña con `scrypt` y sal por usuario; sesión con un token aleatorio del que **solo se
  guarda el hash**. El token vive en `localStorage` para que la PWA vuelva a su mesa al abrirse.
- Ocho intentos fallidos por IP y nombre cada diez minutos.

## Qué se guarda y qué no

En `/datos/madrigueras.db` (o `datos/` en local):

| Tabla | Qué es | Cuándo se va |
| --- | --- | --- |
| `usuarios` | cuenta: nombre, hash, avatar | no se va |
| `sesiones` | tokens hasheados | 90 días |
| `salas` | la mesa entera en JSON (vestíbulo o partida) | vestíbulo y final: 2 h sin actividad · partida: 7 días |
| `asientos` | quién está en qué sala (para reconectar) | con la sala |
| `suscripciones` | endpoints de push | si el móvil las rechaza (404/410) |

**No hay histórico de partidas**: ni estadísticas por cuenta ni ranking permanente. Los resultados
se ven en la mesa mientras dura (2 h). Es lo que pediste; añadirlo después es una tabla y una
pantalla.

Una sola instancia: el `.db` es un fichero. Dos réplicas con el mismo volumen se pisarían.

## Vestíbulo que sobrevive

El vestíbulo se guarda **también** antes de empezar. Si el contenedor se reinicia mientras la gente
espera, al volver cada uno entra en su asiento. Caduca a las **2 horas sin actividad**.

El anfitrión se hereda: si se cae (o cierra el móvil), a los **20 segundos** el mando pasa al
siguiente conectado. Los 20 segundos son para que un refresco de página no cambie el anfitrión.

## Versión nueva sin partidas mezcladas

El servidor calcula una huella del contenido de `app/` y `juego/` al arrancar (`/api/version`).

- La app compara su versión con la del servidor al arrancar, cada 40 s y al volver a la pestaña.
- Si no coinciden, sale un **modal que no se puede cerrar** con «Actualizar ahora»: recarga y listo.
- Además, la versión viaja en el saludo del socket: el servidor **rechaza jugadas de un cliente
  desfasado**. Sin recargar no se juega. Esto es lo que evita el lío de tener dos versiones en la
  misma mesa.
- El service worker **no recarga a nadie por su cuenta**: espera a que el jugador acepte.

## Avisos

Cuatro capas: toast → timbre y vibración → notificación del sistema si la app no está delante →
**Web Push** si está cerrada. El servidor empuja cuando pasa el turno a alguien desconectado, al
empezar y al terminar. Las claves VAPID se guardan en `/datos/vapid.json` si no vienen por entorno
(`VAPID_PUBLICO`, `VAPID_PRIVADO`, `VAPID_CONTACTO`); rotarlas invalida las suscripciones.

En iPhone, los avisos con la app cerrada solo llegan con la app **añadida a la pantalla de inicio**.

## Caché de imágenes

Red primero para el código: si hay servidor, se juega la versión nueva. El arte (`app/arte/`) va
**cache-first** en una caché cuyo nombre lleva la huella del arte (`madrigueras-arte-<huella>`):
si no cambia, no se vuelve a descargar; si cambia, la caché vieja se tira en el siguiente arranque
del service worker. Sin red, la pantalla abre igual y avisa de que no hay conexión.

## Enchufar el juego bueno

1. Leer `juego/contrato.md`.
2. Copiar el módulo a `juego/` y añadirlo a `juego/registro.mjs`.
3. Si quiere tablero propio, `juego/cliente/<id>.js` con `pintar(contenedor, { publica, privada,
   jugadores, tu, acciones })`. Si no, hay un tablero genérico.
4. Nada más: la plataforma no cambia.

## Desplegar en Coolify

1. **New Resource → Application** y el repo (esta carpeta como raíz, o con Base Directory
   `/madrigueras` si subes la carpeta que la contiene).
2. Build Pack **Dockerfile**, Dockerfile Location `/Dockerfile`, Ports Exposes **3000**.
3. **Persistent Storage**: volumen montado en **`/datos`**. Ahí viven la base y las claves VAPID.
   Sin volumen, cada despliegue se lleva las cuentas y las mesas.
4. Dominio con HTTPS (necesario para instalar la PWA y para push).
5. Deploy. La raíz redirige a `/app/`.

`HEALTHCHECK` consulta `/api/version`. El contenedor arranca como root solo para arreglar el dueño
de `/datos` y baja a `node`.

## Lo que falta

- El juego de verdad (hoy está el de prueba).
- Historial/estadísticas, si se quieren (hoy no se guarda nada al terminar).
- Varias instancias, si algún día hace falta: pediría Postgres y repartir salas.
