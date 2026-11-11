/* Cuentas: nombre + contraseña. Ni correo, ni teléfono, ni nombre de usuario
   que se pueda suplantar.

   El nombre es único *normalizado*: «Ana», «ana» y «aná» son la misma cuenta.
   La contraseña se guarda con `scrypt` y una sal por usuario; la comprobación
   es en tiempo constante. Del token de sesión solo queda el hash en disco: si
   alguien se lleva el `.db`, no puede sentarse como nadie. */

import crypto from "node:crypto";

const LARGO_NOMBRE = { min: 2, max: 18 };
const LARGO_CLAVE = { min: 4, max: 200 };
const DURACION_SESION = 90 * 24 * 60 * 60 * 1000; /* 90 días */
const INTENTOS = { max: 8, ventana: 10 * 60 * 1000 };

/* Cuántos avatares hay. El número va a la base; el dibujo lo pone la app. */
export const AVATARES = 12;

/* «Aná  Ruiz» → «ana ruiz»: para comparar nombres, no para mostrarlos. */
export function normalizar(nombre) {
  return String(nombre ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function nombreValido(nombre) {
  const n = String(nombre ?? "").trim();
  if (n.length < LARGO_NOMBRE.min || n.length > LARGO_NOMBRE.max) return false;
  /* Letras de cualquier alfabeto, números, espacio, guion y punto. Nada de
     etiquetas ni de barras que luego rompan una URL. */
  return /^[\p{L}\p{N} ._-]+$/u.test(n);
}

export function claveValida(clave) {
  const c = String(clave ?? "");
  return c.length >= LARGO_CLAVE.min && c.length <= LARGO_CLAVE.max;
}

export function hashear(clave) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(clave), sal, 64).toString("hex");
  return { hash, sal };
}

export function comprobar(clave, sal, hash) {
  let calculado;
  try {
    calculado = crypto.scryptSync(String(clave), sal, 64);
  } catch {
    return false;
  }
  const guardado = Buffer.from(String(hash), "hex");
  if (guardado.length !== calculado.length) return false;
  return crypto.timingSafeEqual(guardado, calculado);
}

/* ── Tokens de sesión ──────────────────────────────────────────────────── */

export function nuevoToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function caducidadSesion() {
  return Date.now() + DURACION_SESION;
}

export function nuevoId() {
  return crypto.randomUUID();
}

/* Un avatar estable por cuenta, elegido al crearla. */
export function avatarAlAzar() {
  return String(crypto.randomInt(AVATARES));
}

/* ── Freno a los intentos ──────────────────────────────────────────────── */

/* En memoria y por proceso, que es lo que hay: una instancia. No pretende
   parar un ataque distribuido; sí que nadie pruebe mil contraseñas seguidas
   contra el mismo nombre desde el mismo sitio. */
const intentos = new Map(); /* clave → { n, hasta } */

export function frenado(ip, nombreClave) {
  const clave = `${ip}|${nombreClave}`;
  const ahora = Date.now();
  const f = intentos.get(clave);
  if (!f || f.hasta < ahora) return false;
  return f.n >= INTENTOS.max;
}

export function anotarFallo(ip, nombreClave) {
  const clave = `${ip}|${nombreClave}`;
  const ahora = Date.now();
  const f = intentos.get(clave);
  if (!f || f.hasta < ahora) {
    intentos.set(clave, { n: 1, hasta: ahora + INTENTOS.ventana });
  } else {
    f.n += 1;
  }
  if (intentos.size > 5000) {
    for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
  }
}

export function limpiarFrenos() {
  const ahora = Date.now();
  for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
}
