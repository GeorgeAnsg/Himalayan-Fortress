/* Los avisos, en cuatro capas según dónde esté el jugador:

   1. El aviso en pantalla (toast) — siempre.
   2. Un timbre corto y una vibración — si el móvil lo permite.
   3. Notificación del sistema — si la app no está delante.
   4. Push del servidor — si la app está cerrada. Eso lo manda el servidor con
      la suscripción que se registra aquí.

   La única regla: no contar nada que la mesa no enseñe ya. El aviso de turno
   dice «te toca», no lo que ha pasado en la jugada de otro. */

import { aviso } from "./ui.js";
import * as api from "./api.js";

const CLAVE = "madrigueras.avisos.v1";

let pref = { on: true, sonido: true };
try {
  const guardado = JSON.parse(localStorage.getItem(CLAVE) || "null");
  if (guardado && typeof guardado.on === "boolean") pref = { ...pref, ...guardado };
} catch { /* sin almacén: se queda por defecto */ }

function guardarPref() {
  try { localStorage.setItem(CLAVE, JSON.stringify(pref)); } catch { /* nada */ }
}

export function preferencias() {
  return { ...pref };
}

export function activar(valor) {
  pref.on = !!valor;
  guardarPref();
}

export function activarSonido(valor) {
  pref.sonido = !!valor;
  guardarPref();
}

export function permiso() {
  return typeof Notification === "undefined" ? "no-soportado" : Notification.permission;
}

/* ── Timbre ────────────────────────────────────────────────────────────── */

let audio = null;

function timbre() {
  if (!pref.sonido) return;
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    audio = audio || new Contexto();
    if (audio.state === "suspended") audio.resume();
    const ahora = audio.currentTime;
    const tono = audio.createOscillator();
    const volumen = audio.createGain();
    tono.type = "sine";
    tono.frequency.setValueAtTime(660, ahora);
    tono.frequency.exponentialRampToValueAtTime(880, ahora + 0.12);
    volumen.gain.setValueAtTime(0.0001, ahora);
    volumen.gain.exponentialRampToValueAtTime(0.12, ahora + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.3);
    tono.connect(volumen).connect(audio.destination);
    tono.start(ahora);
    tono.stop(ahora + 0.32);
  } catch { /* sin audio, el aviso en pantalla queda */ }
}

/* ── Aviso local ───────────────────────────────────────────────────────── */

export async function avisarLocal(titulo, cuerpo = "", etiqueta = "madrigueras") {
  if (!pref.on) return;
  if (document.hidden) {
    timbre();
    try { navigator.vibrate?.([18, 60, 18]); } catch { /* nada */ }
    await sistema(titulo, cuerpo, etiqueta);
    return;
  }
  aviso(cuerpo ? `${titulo} · ${cuerpo}` : titulo, { ms: 4200 });
  timbre();
}

/* Notificación del sistema. En Android hace falta que la pinte el service
   worker; `new Notification` se ignora. */
async function sistema(titulo, cuerpo, etiqueta) {
  if (permiso() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(titulo, {
        body: cuerpo,
        tag: etiqueta,
        icon: "arte/icono.svg",
        badge: "arte/icono.svg",
        renotify: true,
        data: { url: "./" },
      });
      return;
    }
  } catch { /* se prueba el camino viejo */ }
  try { new Notification(titulo, { body: cuerpo, tag: etiqueta }); } catch { /* nada */ }
}

/* ── Push ──────────────────────────────────────────────────────────────── */

function base64aBytes(texto) {
  const limpio = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = "=".repeat((4 - (limpio.length % 4)) % 4);
  const crudo = atob(limpio + relleno);
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

export function pushSoportado() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

/* Solo se puede activar desde un gesto del usuario (un botón) y con la app
   instalada en iOS. Devuelve { ok } o { error } con algo que decir. */
export async function activarPush() {
  if (!pushSoportado()) return { error: "Este navegador no admite avisos con la app cerrada." };
  if (permiso() === "denied") return { error: "Los avisos están bloqueados en los ajustes del navegador." };

  const permisoPedido = permiso() === "granted" ? "granted" : await Notification.requestPermission();
  if (permisoPedido !== "granted") return { error: "Sin permiso no se pueden mandar avisos." };

  try {
    const reg = await navigator.serviceWorker.ready;
    const { datos } = await api.clavePush();
    if (!datos?.clave) return { error: "El servidor no tiene las claves de push." };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64aBytes(datos.clave),
      });
    }
    const r = await api.suscribirPush(sub.toJSON());
    if (r.error) return { error: r.error };
    pref.push = true;
    guardarPref();
    return { ok: true };
  } catch (err) {
    console.log("[avisos] push:", err);
    return { error: "No se pudo activar el aviso con la app cerrada." };
  }
}

/* ── Panel de avisos ───────────────────────────────────────────────────── */

export function abrirPanel() {
  const p = preferencias();
  const capa = document.getElementById("capa");
  const nodo = document.createElement("div");
  nodo.className = "modal";
  nodo.innerHTML = `
    <button class="cerrar" type="button" aria-label="Cerrar">×</button>
    <h2>Avisos</h2>
    <p>En este dispositivo.</p>
    <label style="display:flex;gap:10px;align-items:center;font-size:15px;margin-bottom:8px">
      <input id="av-on" type="checkbox" ${p.on ? "checked" : ""} style="width:auto" />
      Avisarme del turno y del final
    </label>
    <label style="display:flex;gap:10px;align-items:center;font-size:15px;margin-bottom:16px">
      <input id="av-sonido" type="checkbox" ${p.sonido ? "checked" : ""} style="width:auto" />
      Con timbre
    </label>
    <p class="nota" style="margin-bottom:10px">
      ${permiso() === "granted" ? "Notificaciones permitidas en este dispositivo." : "Notificaciones del sistema sin permiso todavía."}
      En iPhone, los avisos con la app cerrada solo llegan con la app instalada.
    </p>
    <button class="boton secundario" id="av-push" type="button">Activar avisos con la app cerrada</button>
    <button class="boton chico" id="av-cerrar" type="button" style="margin-top:10px;width:100%">Listo</button>
  `;
  capa.innerHTML = "";
  capa.append(nodo);
  capa.hidden = false;

  const cerrar = () => { capa.hidden = true; capa.innerHTML = ""; };
  nodo.querySelector(".cerrar").addEventListener("click", cerrar);
  nodo.querySelector("#av-cerrar").addEventListener("click", cerrar);
  nodo.querySelector("#av-on").addEventListener("change", (e) => activar(e.target.checked));
  nodo.querySelector("#av-sonido").addEventListener("change", (e) => activarSonido(e.target.checked));
  nodo.querySelector("#av-push").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    boton.textContent = "Activando…";
    const r = await activarPush();
    boton.disabled = false;
    boton.textContent = r.ok ? "Avisos activados" : "Activar avisos con la app cerrada";
    if (r.error) aviso(r.error, { error: true });
    else aviso("Listo: te avisaremos aunque cierres la app.");
  });
}

/* El estado del botón de la barra: encendido si hay avisos y permiso. */
export function estadoCampana() {
  return !!(pref.on && permiso() === "granted");
}
