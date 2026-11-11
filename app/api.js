/* Las cuatro llamadas HTTP que no van por socket: cuentas, versión, la mesa
   donde estabas y la suscripción de push.

   El token va en `Authorization`, nunca en la URL: las URLs acaban en logs y
   en el historial del navegador. */

import { token as tokenGuardado } from "./sesion.js";

async function pedir(ruta, { metodo = "GET", cuerpo = null, conToken = false } = {}) {
  const cabeceras = { accept: "application/json" };
  if (cuerpo) cabeceras["content-type"] = "application/json";
  const t = tokenGuardado();
  if (conToken && t) cabeceras.authorization = `Bearer ${t}`;

  let res;
  try {
    res = await fetch(new URL(ruta, document.baseURI), {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      cache: "no-store",
    });
  } catch {
    return { error: "No hay conexión con el servidor." };
  }

  let datos = null;
  try { datos = await res.json(); } catch { datos = null; }

  if (!res.ok) {
    return { error: datos?.error || `El servidor respondió ${res.status}.`, estado: res.status, datos };
  }
  return { datos, estado: res.status };
}

export function version() {
  return pedir("/api/version");
}

export function juegos() {
  return pedir("/api/juegos");
}

export function crearCuenta(nombre, contrasena) {
  return pedir("/api/cuentas", { metodo: "POST", cuerpo: { nombre, contrasena } });
}

export function entrar(nombre, contrasena) {
  return pedir("/api/sesion", { metodo: "POST", cuerpo: { nombre, contrasena } });
}

export function salir() {
  return pedir("/api/sesion", { metodo: "DELETE", conToken: true });
}

export function yo() {
  return pedir("/api/yo", { conToken: true });
}

export function mirarSala(codigo) {
  return pedir(`/api/sala/${encodeURIComponent(codigo)}`);
}

export function clavePush() {
  return pedir("/api/push");
}

export function suscribirPush(suscripcion) {
  return pedir("/api/push", { metodo: "POST", cuerpo: { suscripcion }, conToken: true });
}
