/* Avisos al móvil con la app cerrada: Web Push de verdad.

   Con la app cerrada no hay JavaScript que enseñe una notificación, así que
   empuja el servidor: cifra un paquete pequeño con la suscripción del móvil y
   lo manda al servicio de push (FCM, Mozilla, Apple). El service worker lo
   despierta y pinta el aviso.

   Las claves VAPID identifican a este servidor y **tienen que durar**: si
   cambian, todas las suscripciones viejas dejan de valer. Por eso, si no vienen
   por entorno, se generan una vez y se guardan al lado de la base —en el
   volumen del contenedor—, no dentro de la imagen. */

import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { RUTA as RUTA_DB, borrarSuscripcion } from "./almacen.mjs";

const CONTACTO = process.env.VAPID_CONTACTO || "mailto:hola@madrigueras.app";
const FICHERO = path.join(path.dirname(RUTA_DB), "vapid.json");

let claves = null;

function cargar() {
  if (claves) return claves;
  const delEntorno = process.env.VAPID_PUBLICO && process.env.VAPID_PRIVADO;
  if (delEntorno) {
    claves = { publicKey: process.env.VAPID_PUBLICO, privateKey: process.env.VAPID_PRIVADO };
  } else {
    try {
      const guardadas = JSON.parse(fs.readFileSync(FICHERO, "utf8"));
      if (guardadas?.publicKey && guardadas?.privateKey) claves = guardadas;
    } catch { /* la primera vez no hay fichero */ }
    if (!claves) {
      claves = webpush.generateVAPIDKeys();
      try {
        fs.mkdirSync(path.dirname(FICHERO), { recursive: true });
        fs.writeFileSync(FICHERO, JSON.stringify(claves), { mode: 0o600 });
      } catch (err) {
        console.log(`[push] no se pudieron guardar las claves: ${err.message}`);
      }
    }
  }
  webpush.setVapidDetails(CONTACTO, claves.publicKey, claves.privateKey);
  return claves;
}

export function clavePublica() {
  return cargar().publicKey;
}

/* Un aviso: { titulo, cuerpo, etiqueta, url }. `etiqueta` es lo que evita que
   el mismo aviso se apile tres veces cuando llega por dos caminos. */
export async function enviar(suscripcion, datos) {
  try {
    cargar();
    await webpush.sendNotification(suscripcion, JSON.stringify(datos), { TTL: 600 });
    return true;
  } catch (err) {
    /* 404 y 410: el móvil ya no tiene esa suscripción. Se borra para no
       reintentar en cada jugada el resto de la partida. */
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      try { borrarSuscripcion(suscripcion.endpoint); } catch { /* nada */ }
    } else {
      console.log(`[push] fallo ${err?.statusCode ?? ""}: ${err?.message ?? err}`);
    }
    return false;
  }
}
