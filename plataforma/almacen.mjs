/* El almacén: un SQLite en disco, con el `node:sqlite` que viene en Node 22.
   Sin dependencias y sin ORM.

   Qué se guarda, y por qué:

   · `usuarios` y `sesiones` — la identidad es una cuenta, no un nombre suelto.
     El PIN/contraseña va con `scrypt` y sal por usuario; el token de sesión se
     guarda hasheado, así que quien lea el fichero no puede entrar como nadie.

   · `salas` — la mesa entera (vestíbulo o partida) en una columna JSON. El
     motor trabaja sobre un objeto; partirlo en columnas sería reescribirlo para
     no ganar nada. Aquí sí se guardan **también los vestíbulos**: si el
     contenedor se reinicia mientras la gente espera, la sala sigue ahí. Las
     columnas de fuera (`fase`, `actualizado`) son solo para buscar y purgar.

   · `asientos` — qué usuario está en qué sala. Es el índice que permite, al
     volver a abrir la app, devolver a cada uno a su mesa sin escribir el código.

   · `suscripciones` — los endpoints de Web Push, por usuario, no por partida:
     con la app cerrada hay que poder avisar de que le toca.

   Dónde vive el fichero: `MADRIGUERAS_DB` si está puesto; si no, `/datos/…`
   cuando existe `/datos` (el volumen del contenedor) y si no `datos/…` junto al
   proyecto, que es lo que se usa en local.

   Límite dicho claro: esto es para **una instancia**. Dos contenedores con el
   mismo fichero se pisarían. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

function elegirRuta() {
  if (process.env.MADRIGUERAS_DB) return process.env.MADRIGUERAS_DB;
  if (fs.existsSync("/datos")) return "/datos/madrigueras.db";
  return path.join(RAIZ, "datos", "madrigueras.db");
}

export const RUTA = elegirRuta();

let db = null;

function abrir() {
  if (db) return db;
  fs.mkdirSync(path.dirname(RUTA), { recursive: true });
  db = new DatabaseSync(RUTA);
  /* WAL: guardar una partida no bloquea a quien esté leyendo, y un corte de
     luz deja el fichero consistente. `NORMAL` es el equilibrio para un juego:
     se puede perder la última acción, nunca la mesa. */
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS usuarios (
      id           TEXT PRIMARY KEY,
      nombre       TEXT NOT NULL,
      nombre_clave TEXT NOT NULL UNIQUE,   -- normalizado: sin acentos, minúsculas
      hash         TEXT NOT NULL,
      sal          TEXT NOT NULL,
      avatar       TEXT NOT NULL,
      creado       INTEGER NOT NULL,
      ultima_vez   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash  TEXT PRIMARY KEY,
      usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      creada      INTEGER NOT NULL,
      ultima_vez  INTEGER NOT NULL,
      caduca      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id);

    CREATE TABLE IF NOT EXISTS salas (
      codigo      TEXT PRIMARY KEY,
      juego       TEXT NOT NULL,
      fase        TEXT NOT NULL,
      anfitrion   TEXT,
      actualizado INTEGER NOT NULL,
      datos       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asientos (
      codigo      TEXT NOT NULL REFERENCES salas(codigo) ON DELETE CASCADE,
      usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      PRIMARY KEY (codigo, usuario_id)
    );
    CREATE INDEX IF NOT EXISTS asientos_usuario ON asientos(usuario_id);

    CREATE TABLE IF NOT EXISTS suscripciones (
      id         TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL,
      claves     TEXT NOT NULL,
      creada     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS suscripciones_usuario ON suscripciones(usuario_id);
  `);
  return db;
}

/* ── Cuentas ───────────────────────────────────────────────────────────── */

export function crearUsuario(u) {
  abrir()
    .prepare(
      `INSERT INTO usuarios (id, nombre, nombre_clave, hash, sal, avatar, creado, ultima_vez)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(u.id, u.nombre, u.nombreClave, u.hash, u.sal, u.avatar, Date.now(), Date.now());
}

export function usuarioPorClave(nombreClave) {
  return abrir()
    .prepare("SELECT * FROM usuarios WHERE nombre_clave = ?")
    .get(nombreClave);
}

export function usuarioPorId(id) {
  return abrir().prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
}

export function tocarUsuario(id) {
  abrir().prepare("UPDATE usuarios SET ultima_vez = ? WHERE id = ?").run(Date.now(), id);
}

/* ── Sesiones ──────────────────────────────────────────────────────────── */

export function crearSesion(tokenHash, usuarioId, caduca) {
  const ahora = Date.now();
  abrir()
    .prepare(
      `INSERT INTO sesiones (token_hash, usuario_id, creada, ultima_vez, caduca)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(tokenHash, usuarioId, ahora, ahora, caduca);
}

/* Devuelve el usuario de una sesión viva, o null. De paso toca `ultima_vez`:
   quien juega no tiene que volver a entrar cada semana. */
export function usuarioDeSesion(tokenHash) {
  const fila = abrir()
    .prepare(
      `SELECT u.*, s.caduca FROM sesiones s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!fila) return null;
  if (fila.caduca < Date.now()) {
    borrarSesion(tokenHash);
    return null;
  }
  abrir().prepare("UPDATE sesiones SET ultima_vez = ? WHERE token_hash = ?").run(Date.now(), tokenHash);
  return fila;
}

export function borrarSesion(tokenHash) {
  abrir().prepare("DELETE FROM sesiones WHERE token_hash = ?").run(tokenHash);
}

export function limpiarSesiones(caducadas = true) {
  if (caducadas) {
    abrir().prepare("DELETE FROM sesiones WHERE caduca < ?").run(Date.now());
  }
}

/* ── Salas ─────────────────────────────────────────────────────────────── */

export function guardarSala(sala) {
  const base = abrir();
  base
    .prepare(
      `INSERT INTO salas (codigo, juego, fase, anfitrion, actualizado, datos)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(codigo) DO UPDATE SET
         juego = excluded.juego, fase = excluded.fase,
         anfitrion = excluded.anfitrion, actualizado = excluded.actualizado,
         datos = excluded.datos`
    )
    .run(sala.codigo, sala.juego, sala.fase, sala.anfitrion ?? null, Date.now(), JSON.stringify(sala.datos));

  base.prepare("DELETE FROM asientos WHERE codigo = ?").run(sala.codigo);
  const ins = base.prepare("INSERT OR IGNORE INTO asientos (codigo, usuario_id) VALUES (?, ?)");
  for (const j of sala.datos?.jugadores ?? []) {
    if (!j.esBot) ins.run(sala.codigo, j.id);
  }
}

export function borrarSala(codigo) {
  abrir().prepare("DELETE FROM salas WHERE codigo = ?").run(codigo);
}

/* Las salas que sobreviven a un reinicio. Cada una con su fecha: el servidor
   decide cuáles se tiran (vestíbulo inactivo 2 h; partida, 7 días). */
export function cargarSalas() {
  return abrir()
    .prepare("SELECT codigo, juego, fase, anfitrion, actualizado, datos FROM salas")
    .all()
    .map((f) => {
      try {
        /* `datos` es el paquete de la mesa (jugadores, estado del juego,
           semilla y crónica). Las columnas de fuera son solo para buscar. */
        return {
          codigo: f.codigo,
          juego: f.juego,
          fase: f.fase,
          anfitrion: f.anfitrion,
          actualizado: f.actualizado,
          datos: JSON.parse(f.datos),
        };
      } catch {
        borrarSala(f.codigo); /* ilegible: mejor perder una que no arrancar */
        return null;
      }
    })
    .filter(Boolean);
}

/* La sala donde está sentado un usuario, si está en alguna. */
export function salaDe(usuarioId) {
  return abrir()
    .prepare("SELECT codigo FROM asientos WHERE usuario_id = ? LIMIT 1")
    .get(usuarioId)?.codigo ?? null;
}

/* ── Suscripciones de push ─────────────────────────────────────────────── */

export function guardarSuscripcion(usuarioId, suscripcion) {
  const endpoint = String(suscripcion?.endpoint ?? "");
  if (!endpoint) return;
  abrir()
    .prepare(
      `INSERT INTO suscripciones (id, usuario_id, endpoint, claves, creada)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET claves = excluded.claves`
    )
    .run(endpoint, usuarioId, endpoint, JSON.stringify(suscripcion.keys ?? {}), Date.now());
}

export function borrarSuscripcion(endpoint) {
  abrir().prepare("DELETE FROM suscripciones WHERE id = ?").run(endpoint);
}

export function suscripcionesDe(usuarioId) {
  return abrir()
    .prepare("SELECT endpoint, claves FROM suscripciones WHERE usuario_id = ?")
    .all(usuarioId)
    .map((f) => ({ endpoint: f.endpoint, keys: JSON.parse(f.claves) }));
}

export function cerrar() {
  try { db?.close(); } catch { /* nada */ }
  db = null;
}
