#!/usr/bin/env node
/* El servidor: sirve la app, las cuentas y las mesas.

   Reparto de responsabilidades:
   · `almacen.mjs` — el SQLite (cuentas, sesiones, salas, suscripciones).
   · `auth.mjs`    — nombres, contraseñas, tokens y el freno de intentos.
   · `salas.mjs`   — vestíbulo, asientos, turnos, final y caducidad.
   · `juego/`      — a qué se juega. La plataforma no lo mira por dentro.
   · este archivo  — HTTP, socket.io y el reparto de vistas.

   Una sola instancia. El `.db` es un fichero: dos réplicas con el mismo volumen
   se pisarían. Para eso haría falta un Postgres y repartir salas entre procesos.

   La versión viaja en el saludo del socket. Un cliente con la app vieja recibe
   el aviso y no puede jugar hasta recargar: era el problema de tener dos
   versiones en la misma mesa. */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

import * as almacen from "./almacen.mjs";
import * as auth from "./auth.mjs";
import * as push from "./push.mjs";
import { versiones } from "./version.mjs";
import { Mesas, limpiarCodigo, TTL } from "./salas.mjs";
import { listaJuegos, juego as buscarJuego } from "../juego/registro.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
/* `PORT=0` (algunos entornos lo dejan así para «elige tú») no sirve: aquí
   manda Coolify, que espera 3000. */
const PUERTO = Number(process.env.PORT) || 3000;
const { version: VERSION, arte: ARTE } = versiones();

console.log(`[madrigueras] versión ${VERSION} · arte ${ARTE} · ${os.hostname()}`);

/* ── Utilidades HTTP ───────────────────────────────────────────────────── */

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function json(res, estado, cuerpo) {
  if (res.writableEnded) return;
  res.writeHead(estado, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(cuerpo));
}

async function cuerpoJSON(req, limite = 16_000) {
  return new Promise((resolve) => {
    let datos = "";
    let roto = false;
    req.on("data", (trozo) => {
      if (roto) return;
      datos += trozo;
      if (datos.length > limite) {
        roto = true;
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (roto) return;
      try {
        resolve(JSON.parse(datos || "{}"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function ipDe(req) {
  const reenviada = req.headers["x-forwarded-for"];
  if (typeof reenviada === "string" && reenviada) return reenviada.split(",")[0].trim();
  return req.socket.remoteAddress ?? "?";
}

function publico(usuario) {
  return { id: usuario.id, nombre: usuario.nombre, avatar: usuario.avatar };
}

function usuarioDePeticion(req) {
  const cabecera = String(req.headers.authorization ?? "");
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  if (!token) return null;
  return almacen.usuarioDeSesion(auth.hashToken(token)) ?? null;
}

/* ── Las mesas ─────────────────────────────────────────────────────────── */

/* Sockets por mesa, para poder mandar a cada uno su vista (que no es la misma
   para todos: cada jugador ve lo suyo). */
const conexiones = new Map(); /* codigo → Set<socket> */

const mesas = new Mesas({
  version: VERSION,
  difundir: (sala) => difundir(sala),
  avisar: (usuarioId, aviso) => avisar(usuarioId, aviso),
});

function socketsDe(codigo) {
  let s = conexiones.get(codigo);
  if (!s) {
    s = new Set();
    conexiones.set(codigo, s);
  }
  return s;
}

function jugadoresPublicos(sala, usuarioId) {
  return sala.datos.jugadores.map((j) => ({
    id: j.id,
    nombre: j.nombre,
    avatar: j.avatar,
    listo: !!j.listo,
    conectado: mesas.vivoDe(sala, j.id).conectado,
    tu: j.id === usuarioId,
  }));
}

function vistaPara(sala, usuarioId) {
  const juego = mesas.juegoDe(sala);
  const jugadores = jugadoresPublicos(sala, usuarioId);

  if (sala.fase === "vestibulo") {
    return {
      tipo: "vestibulo",
      version: VERSION,
      codigo: sala.codigo,
      juego: { id: sala.juego, nombre: juego?.nombre ?? sala.juego },
      min: juego?.min ?? 2,
      max: juego?.max ?? 8,
      fase: sala.fase,
      anfitrion: sala.anfitrion,
      tu: usuarioId,
      soyAnfitrion: sala.anfitrion === usuarioId,
      jugadores,
      todosListos: jugadores.length > 0 && jugadores.every((j) => j.listo),
      tieneBot: juego?.bot != null,
      log: sala.log.slice(-20),
    };
  }

  const estado = sala.datos.estado;
  let publica = {};
  let privada = {};
  let acciones = [];
  let turno = null;
  if (juego && estado) {
    try {
      publica = juego.publica(estado);
      privada = juego.vista(estado, usuarioId);
      turno = juego.turno(estado);
      if (sala.fase === "jugando") acciones = juego.legales(estado, usuarioId);
    } catch (err) {
      console.log(`[mesa ${sala.codigo}] no se pudo componer la vista: ${err?.message ?? err}`);
    }
  }

  const final = sala.datos.final
    ? {
        cuando: sala.datos.final.cuando,
        puestos: sala.datos.final.puestos.map((p, i) => {
          const j = jugadores.find((x) => x.id === p.jugadorId);
          return {
            puesto: i + 1,
            jugadorId: p.jugadorId,
            nombre: j?.nombre ?? "—",
            avatar: j?.avatar ?? "0",
            puntos: p.puntos,
            tu: p.jugadorId === usuarioId,
          };
        }),
      }
    : null;

  return {
    tipo: "vista",
    version: VERSION,
    codigo: sala.codigo,
    juego: { id: sala.juego, nombre: juego?.nombre ?? sala.juego },
    fase: sala.fase,
    anfitrion: sala.anfitrion,
    soyAnfitrion: sala.anfitrion === usuarioId,
    tu: usuarioId,
    jugadores,
    turno,
    esMiTurno: turno === usuarioId,
    publica,
    privada,
    acciones,
    log: sala.log.slice(-60),
    final,
  };
}

function difundir(sala) {
  for (const socket of socketsDe(sala.codigo)) {
    const usuarioId = socket.data.usuario?.id;
    if (!usuarioId) continue;
    /* Si ya no está sentado (le han sacado), se le avisa y se le saca de la
       sala del socket. */
    if (!sala.datos.jugadores.some((j) => j.id === usuarioId)) {
      socket.leave(sala.codigo);
      socket.data.codigo = null;
      socket.emit("fuera", { codigo: sala.codigo });
      socketsDe(sala.codigo).delete(socket);
      continue;
    }
    socket.emit("mesa", vistaPara(sala, usuarioId));
  }
}

async function avisar(usuarioId, aviso) {
  const subs = almacen.suscripcionesDe(usuarioId);
  for (const s of subs) await push.enviar(s, aviso);
}

/* ── HTTP ──────────────────────────────────────────────────────────────── */

const httpServidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://local");
  const ruta = decodeURIComponent(url.pathname);

  /* Cabeceras para todos. La CSP deja pasar el cliente de socket.io (mismo
     origen) y nada de terceros. */
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "same-origin");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; connect-src 'self' ws: wss:; manifest-src 'self'; " +
      "base-uri 'none'; form-action 'self'"
  );

  /* ── API ── */
  if (ruta === "/api/version") {
    return json(res, 200, { version: VERSION, arte: ARTE });
  }

  if (ruta === "/api/juegos") {
    return json(res, 200, { juegos: listaJuegos() });
  }

  if (ruta === "/api/push") {
    if (req.method === "GET") {
      const clave = push.clavePublica();
      return json(res, clave ? 200 : 503, { clave });
    }
    if (req.method === "POST") {
      const usuario = usuarioDePeticion(req);
      if (!usuario) return json(res, 401, { error: "sin sesión" });
      const cuerpo = await cuerpoJSON(req, 8000);
      const suscripcion = cuerpo?.suscripcion;
      if (!suscripcion?.endpoint) return json(res, 400, { error: "falta la suscripción" });
      almacen.guardarSuscripcion(usuario.id, suscripcion);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "solo GET o POST" });
  }

  if (ruta === "/api/cuentas" && req.method === "POST") {
    const cuerpo = await cuerpoJSON(req);
    const nombre = String(cuerpo?.nombre ?? "").trim();
    const clave = String(cuerpo?.contrasena ?? "");
    if (!auth.nombreValido(nombre)) {
      return json(res, 400, { error: "El nombre va de 2 a 18 letras, sin símbolos raros." });
    }
    if (!auth.claveValida(clave)) {
      return json(res, 400, { error: "La contraseña necesita al menos 4 caracteres." });
    }
    const nombreClave = auth.normalizar(nombre);
    if (almacen.usuarioPorClave(nombreClave)) {
      return json(res, 409, { error: "Ese nombre ya está cogido. Entra con tu contraseña." });
    }
    const { hash, sal } = auth.hashear(clave);
    const usuario = {
      id: auth.nuevoId(),
      nombre,
      nombreClave,
      hash,
      sal,
      avatar: auth.avatarAlAzar(),
    };
    try {
      almacen.crearUsuario(usuario);
    } catch {
      return json(res, 409, { error: "Ese nombre ya está cogido." });
    }
    const token = auth.nuevoToken();
    almacen.crearSesion(auth.hashToken(token), usuario.id, auth.caducidadSesion());
    return json(res, 200, { token, usuario: publico(usuario) });
  }

  if (ruta === "/api/sesion") {
    if (req.method === "DELETE") {
      const cabecera = String(req.headers.authorization ?? "");
      const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
      if (token) almacen.borrarSesion(auth.hashToken(token));
      return json(res, 200, { ok: true });
    }
    if (req.method !== "POST") return json(res, 405, { error: "solo POST o DELETE" });
    const cuerpo = await cuerpoJSON(req);
    const nombre = String(cuerpo?.nombre ?? "").trim();
    const clave = String(cuerpo?.contrasena ?? "");
    const nombreClave = auth.normalizar(nombre);
    const ip = ipDe(req);

    if (auth.frenado(ip, nombreClave)) {
      return json(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
    }
    const fila = almacen.usuarioPorClave(nombreClave);
    if (!fila || !auth.comprobar(clave, fila.sal, fila.hash)) {
      auth.anotarFallo(ip, nombreClave);
      return json(res, 401, { error: "Nombre o contraseña incorrectos." });
    }
    almacen.tocarUsuario(fila.id);
    const token = auth.nuevoToken();
    almacen.crearSesion(auth.hashToken(token), fila.id, auth.caducidadSesion());
    const sala = mesas.porCodigo(almacen.salaDe(fila.id) ?? "");
    return json(res, 200, {
      token,
      usuario: publico(fila),
      sala: sala ? { codigo: sala.codigo, fase: sala.fase } : null,
    });
  }

  if (ruta === "/api/yo" && req.method === "GET") {
    const usuario = usuarioDePeticion(req);
    if (!usuario) return json(res, 401, { error: "sin sesión" });
    const codigo = almacen.salaDe(usuario.id);
    const sala = codigo ? mesas.porCodigo(codigo) : null;
    return json(res, 200, {
      usuario: publico(usuario),
      sala: sala ? { codigo: sala.codigo, fase: sala.fase } : null,
    });
  }

  /* Para el enlace directo: antes de enseñar el vestíbulo, ¿existe la mesa? */
  if (ruta.startsWith("/api/sala/") && req.method === "GET") {
    const codigo = limpiarCodigo(ruta.slice("/api/sala/".length));
    const sala = mesas.porCodigo(codigo);
    if (!sala) return json(res, 404, { existe: false });
    const juego = mesas.juegoDe(sala);
    return json(res, 200, {
      existe: true,
      codigo: sala.codigo,
      fase: sala.fase,
      juego: juego?.nombre ?? sala.juego,
      jugadores: sala.datos.jugadores.length,
      max: juego?.max ?? 8,
    });
  }

  /* ── Estático ── */
  if (ruta === "/") {
    res.writeHead(302, { location: "/app/" });
    return res.end();
  }
  let rel = ruta.replace(/^\/+/, "");
  /* Se sirven dos cosas: la app y los tableros de los juegos. El motor del
     juego (las reglas) no sale del servidor. */
  const permitido = rel.startsWith("app/") || rel.startsWith("juego/cliente/");
  if (!permitido) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("no está");
  }
  if (rel.endsWith("/")) rel += "index.html";
  const archivo = path.resolve(RAIZ, rel);
  const raices = [path.join(RAIZ, "app"), path.join(RAIZ, "juego", "cliente")];
  if (!raices.some((r) => archivo.startsWith(r + path.sep))) {
    res.writeHead(403);
    return res.end("fuera");
  }
  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("no está");
    }
    const ext = path.extname(archivo);
    res.writeHead(200, {
      "content-type": TIPOS[ext] || "application/octet-stream",
      /* Nada de caché del navegador: el service worker es quien decide, y así
         una recarga normal no se queda con un JS viejo. */
      "cache-control": "no-store",
      "service-worker-allowed": "/",
    });
    res.end(datos);
  });
});

/* ── Sockets ───────────────────────────────────────────────────────────── */

const io = new Server(httpServidor, {
  serveClient: true,
  pingInterval: 20_000,
  pingTimeout: 25_000,
  maxHttpBufferSize: 64_000,
});

/* El saludo trae el token y la versión de la app que está abierta. */
io.use((socket, next) => {
  const token = String(socket.handshake.auth?.token ?? "");
  if (!token) return next(new Error("sin_sesion"));
  const usuario = almacen.usuarioDeSesion(auth.hashToken(token));
  if (!usuario) return next(new Error("sesion_caducada"));
  socket.data.usuario = usuario;
  socket.data.version = String(socket.handshake.auth?.v ?? "");
  next();
});

io.on("connection", (socket) => {
  const usuario = socket.data.usuario;

  /* Si la app está desfasada, se le dice ya: el cliente enseña el modal. */
  if (socket.data.version !== VERSION) {
    socket.emit("version", { version: VERSION });
  }

  const sala = mesas.deUsuario(usuario.id);
  if (sala) {
    socket.join(sala.codigo);
    socket.data.codigo = sala.codigo;
    socketsDe(sala.codigo).add(socket);
    mesas.conectar(usuario.id, socket.id);
    socket.emit("mesa", vistaPara(sala, usuario.id));
  } else {
    socket.emit("sinMesa", {});
  }

  /* Envoltorio: cualquier acción de juego exige la versión del servidor y una
     mesa donde estés sentado. */
  const conMesa = (fn) => (datos, acuse) => {
    if (socket.data.version !== VERSION) {
      socket.emit("version", { version: VERSION });
      return responder(acuse, { error: "Tu app es de otra versión. Actualiza para seguir." });
    }
    const actual = mesas.deUsuario(usuario.id);
    if (!actual) {
      return responder(acuse, { error: "No estás en ninguna madriguera." });
    }
    if (socket.data.codigo !== actual.codigo) {
      socket.join(actual.codigo);
      socket.data.codigo = actual.codigo;
      socketsDe(actual.codigo).add(socket);
    }
    try {
      /* Las negativas de la mesa («no es tu turno», «falta gente») se devuelven
         tal cual: son parte del juego, no un fallo. Solo lo inesperado se
         convierte en un error genérico. */
      const salida = fn(actual, datos);
      responder(acuse, salida?.error ? salida : { ok: true });
    } catch (err) {
      console.log(`[socket] ${usuario.nombre}: ${err?.message ?? err}`);
      responder(acuse, { error: "Algo ha fallado en la mesa." });
    }
  };

  const responder = (acuse, valor) => {
    if (typeof acuse === "function") acuse(valor);
    else if (valor?.error) socket.emit("error", { texto: valor.error });
  };

  socket.on("crear", ({ juego } = {}, acuse) => {
    if (socket.data.version !== VERSION) {
      socket.emit("version", { version: VERSION });
      return responder(acuse, { error: "Actualiza la app para jugar." });
    }
    const r = mesas.crear(usuario, juego);
    if (r.error) return responder(acuse, r);
    entrar(socket, r.sala);
    responder(acuse, { ok: true, codigo: r.sala.codigo });
  });

  socket.on("unirse", ({ codigo } = {}, acuse) => {
    if (socket.data.version !== VERSION) {
      socket.emit("version", { version: VERSION });
      return responder(acuse, { error: "Actualiza la app para jugar." });
    }
    const r = mesas.unirse(usuario, codigo);
    if (r.error) return responder(acuse, r);
    entrar(socket, r.sala);
    responder(acuse, { ok: true, codigo: r.sala.codigo });
  });

  socket.on("listo", conMesa((sala, { valor }) => mesas.listo(usuario.id, valor)));
  socket.on("empezar", conMesa(() => mesas.empezar(usuario.id)));
  socket.on("accion", conMesa((sala, accion) => mesas.accion(usuario.id, accion)));
  socket.on("añadir-bot", conMesa(() => mesas.añadirBot(usuario.id)));
  socket.on("revancha", conMesa(() => mesas.revancha(usuario.id)));

  socket.on("salir", (datos, acuse) => {
    const r = mesas.abandonar(usuario.id);
    if (socket.data.codigo) {
      socket.leave(socket.data.codigo);
      socketsDe(socket.data.codigo).delete(socket);
      socket.data.codigo = null;
    }
    socket.emit("sinMesa", {});
    responder(acuse, r?.error ? r : { ok: true });
  });

  socket.on("pedirMesa", () => {
    const actual = mesas.deUsuario(usuario.id);
    if (!actual) return socket.emit("sinMesa", {});
    if (socket.data.codigo !== actual.codigo) {
      socket.join(actual.codigo);
      socket.data.codigo = actual.codigo;
      socketsDe(actual.codigo).add(socket);
    }
    socket.emit("mesa", vistaPara(actual, usuario.id));
  });

  socket.on("disconnect", () => {
    const codigo = socket.data.codigo;
    if (codigo) socketsDe(codigo).delete(socket);
    mesas.desconectar(usuario.id, socket.id);
  });
});

/* Sentar a un socket en una mesa y contárselo a todos, incluido él. */
function entrar(socket, sala) {
  const anterior = socket.data.codigo;
  if (anterior && anterior !== sala.codigo) {
    socket.leave(anterior);
    socketsDe(anterior).delete(socket);
  }
  socket.join(sala.codigo);
  socket.data.codigo = sala.codigo;
  socketsDe(sala.codigo).add(socket);
  /* `conectar` ya reparte la mesa a todos, con las marcas de conectado al día. */
  mesas.conectar(socket.data.usuario.id, socket.id);
}

/* ── Arranque y purgas ─────────────────────────────────────────────────── */

httpServidor.listen(PUERTO, () => {
  console.log(`[madrigueras] http://127.0.0.1:${PUERTO}/app/`);
});

/* Cada 10 minutos: sesiones caducadas, frenos viejos y mesas sin actividad. */
const mantenimiento = setInterval(() => {
  try {
    almacen.limpiarSesiones();
    auth.limpiarFrenos();
    mesas.purgar();
  } catch (err) {
    console.log(`[mantenimiento] ${err?.message ?? err}`);
  }
}, 10 * 60 * 1000);
mantenimiento.unref?.();

const cerrar = () => {
  console.log("[madrigueras] cerrando");
  try { almacen.cerrar(); } catch { /* nada */ }
  process.exit(0);
};
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);

export { io, mesas, VERSION, TTL };
