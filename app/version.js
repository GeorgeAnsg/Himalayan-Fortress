/* La versión nueva.

   Lo que pasaba antes: una pestaña con la app vieja y otra con la nueva
   jugando la misma mesa, y errores que solo se arreglaban recargando a mano.
   Aquí la app **compara su versión con la del servidor** cada poco y al volver
   a la pestaña; si no coinciden, sale un modal que no se puede cerrar y que
   recarga. El servidor, además, rechaza jugadas de un cliente desfasado, así
   que el modal no es un adorno: sin recargar no se juega.

   La versión no se sube a mano: la calcula el servidor con el contenido de
   `app/` y `juego/`. Cualquier cambio de código cambia la huella. */

import { modal } from "./ui.js";
import * as api from "./api.js";

let cargada = null;
let yaAvisado = false;
let temporizador = null;

export function versionCargada() {
  return cargada;
}

export function fijarCargada(v) {
  cargada = v;
}

/* Recarga de verdad: se le dice al service worker que la versión en espera
   tome el mando y, en cuanto lo hace, se recarga una sola vez. Si no hay
   service worker (o tarda), se recarga igual: la app se sirve sin caché. */
async function recargar() {
  let recargado = false;
  const unaVez = () => {
    if (recargado) return;
    recargado = true;
    location.reload();
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.waiting) {
      navigator.serviceWorker.addEventListener("controllerchange", unaVez, { once: true });
      reg.waiting.postMessage({ tipo: "actualizar" });
    } else if (reg) {
      await reg.update();
    }
  } catch { /* se recarga igual */ }
  setTimeout(unaVez, 1200);
}

export function avisarNueva(versionServidor) {
  if (yaAvisado) return;
  if (!cargada || !versionServidor) return;
  if (versionServidor === cargada) return;
  yaAvisado = true;

  modal({
    titulo: "Hay una versión nueva",
    texto:
      "La app ha cambiado mientras la tenías abierta. Actualiza para seguir jugando: " +
      "si no, la mesa rechazará tus jugadas.",
    obligatorio: true,
    botones: [{ texto: "Actualizar ahora", estilo: "boton", valor: "actualizar" }],
  }).then((r) => {
    if (r === "actualizar") recargar();
  });
}

/* Vigila: al arrancar, cada 40 s y cada vez que la pestaña vuelve al frente
   (es cuando de verdad importa: el móvil estuvo guardado en el bolsillo). */
export function vigilar() {
  if (temporizador) return;
  const mirar = async () => {
    if (yaAvisado || !cargada) return;
    const { datos } = await api.version();
    if (datos?.version) avisarNueva(datos.version);
  };
  temporizador = setInterval(mirar, 40_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) mirar();
  });
  window.addEventListener("online", mirar);
  mirar();
}

export function reiniciarAviso() {
  yaAvisado = false;
}
