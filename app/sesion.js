/* Lo que el móvil recuerda entre aperturas.

   El token es la llave: con él el servidor sabe quién eres y en qué mesa
   estabas. `usuario` y `sala` se guardan solo para pintar la pantalla de
   inmediato —sin esperar a la red—; la verdad la manda el servidor en cuanto
   conecta. Si el token ya no vale, la app lo tira y vuelve a la entrada. */

const CLAVE = "madrigueras.sesion.v1";
const CLAVE_PENDIENTE = "madrigueras.pendiente.v1";

let memoria = null;

export function leer() {
  if (memoria) return memoria;
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (crudo?.token && crudo?.usuario?.id) memoria = crudo;
  } catch { /* almacén vacío o roto */ }
  return memoria;
}

export function guardar(token, usuario, sala = null) {
  memoria = { token, usuario, sala };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(memoria));
  } catch { /* modo privado: se juega igual, pero no se recuerda */ }
}

export function recordarSala(sala) {
  if (!memoria) return;
  memoria.sala = sala;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(memoria));
  } catch { /* nada */ }
}

export function borrar() {
  memoria = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch { /* nada */ }
}

export function token() {
  return leer()?.token ?? null;
}

export function usuario() {
  return leer()?.usuario ?? null;
}

/* El código de una invitación (`?sala=ABCDE`) se guarda hasta que hay sesión:
   si hay que entrar o crear cuenta primero, no se pierde por el camino. */
export function dejarPendiente(codigo) {
  const c = String(codigo ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  if (!c) return;
  try { sessionStorage.setItem(CLAVE_PENDIENTE, c); } catch { /* nada */ }
}

export function tomarPendiente() {
  try {
    const c = sessionStorage.getItem(CLAVE_PENDIENTE);
    if (c) sessionStorage.removeItem(CLAVE_PENDIENTE);
    return c || null;
  } catch {
    return null;
  }
}
