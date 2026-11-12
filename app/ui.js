/* Piezas de interfaz que usan todas las pantallas: crear nodos, avatares,
   avisos flotantes y modales. Sin framework a propósito: son cuatro cosas. */

const PLANTILLA = document.createElement("template");

export function h(html) {
  PLANTILLA.innerHTML = String(html).trim();
  return PLANTILLA.content.firstElementChild;
}

export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ── Avatares ──────────────────────────────────────────────────────────── */

/* Doce topos, dibujados aquí y no descargados: no hay imágenes que cachear ni
   peticiones que fallen sin red. El índice viene de la cuenta. */
const PALETAS = [
  { fondo: "#3a2a1b", pelo: "#c98f52", morro: "#f0cf9e" },
  { fondo: "#26301c", pelo: "#93a86b", morro: "#e6edcd" },
  { fondo: "#2f2230", pelo: "#b08ab5", morro: "#efdcef" },
  { fondo: "#33211c", pelo: "#c67f66", morro: "#f3d2c4" },
  { fondo: "#1d2a31", pelo: "#7fa3ad", morro: "#dcebef" },
  { fondo: "#302a15", pelo: "#c9b45f", morro: "#f1e9bd" },
];

export function avatarSVG(indice, { tam = 40 } = {}) {
  const i = Math.abs(Number(indice) || 0) % 12;
  const pal = PALETAS[i % PALETAS.length];
  const orejas = i % 3;

  const oreja = {
    0: `<ellipse cx="12" cy="13" rx="5.6" ry="6.4" fill="${pal.pelo}"/><ellipse cx="32" cy="13" rx="5.6" ry="6.4" fill="${pal.pelo}"/>`,
    1: `<path d="M8 17 L11 5 L17 13 Z" fill="${pal.pelo}"/><path d="M36 17 L33 5 L27 13 Z" fill="${pal.pelo}"/>`,
    2: `<ellipse cx="9" cy="19" rx="5" ry="6.6" fill="${pal.pelo}" transform="rotate(-18 9 19)"/><ellipse cx="35" cy="19" rx="5" ry="6.6" fill="${pal.pelo}" transform="rotate(18 35 19)"/>`,
  }[orejas];

  const ojos = i % 2 === 0
    ? `<circle cx="17.5" cy="24" r="1.9" fill="#171310"/><circle cx="26.5" cy="24" r="1.9" fill="#171310"/>`
    : `<path d="M15.4 24.5 q2.1 -2.4 4.2 0" stroke="#171310" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M24.4 24.5 q2.1 -2.4 4.2 0" stroke="#171310" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 44 44" width="${tam}" height="${tam}" role="img" aria-label="avatar">
    <rect width="44" height="44" fill="${pal.fondo}"/>
    ${oreja}
    <circle cx="22" cy="25" r="12" fill="${pal.pelo}"/>
    <ellipse cx="22" cy="29.5" rx="6.4" ry="4.6" fill="${pal.morro}"/>
    ${ojos}
    <ellipse cx="22" cy="27.4" rx="1.7" ry="1.2" fill="#7c4a33"/>
  </svg>`;
}

/* Un icono de usuario de trazo, para la barra: sin círculo ni fondo. */
export function iconoUsuario(tam = 20) {
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Tu cuenta">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>`;
}

/* ── Avisos en pantalla ────────────────────────────────────────────────── */

const cajaAvisos = () => document.getElementById("avisos");

export function aviso(texto, { error = false, ms = 3200 } = {}) {
  const nodo = h(`<div class="toast${error ? " error" : ""}">${esc(texto)}</div>`);
  cajaAvisos().append(nodo);
  setTimeout(() => {
    nodo.style.opacity = "0";
    nodo.style.transition = "opacity .25s";
    setTimeout(() => nodo.remove(), 260);
  }, ms);
}

/* ── Modal ─────────────────────────────────────────────────────────────── */

let abierto = null;

/* Un modal con botones. Devuelve una promesa con el `valor` del botón pulsado.
   `obligatorio` quita la X y el clic fuera: se usa para la versión nueva. */
export function modal({ titulo, texto = "", botones = [], obligatorio = false, html = "", clase = "" }) {
  cerrarModal();
  const capa = document.getElementById("capa");
  const caja = h(`
    <div class="modal${obligatorio ? " obligatorio" : ""}${clase ? " " + clase : ""}" role="dialog" aria-modal="true">
      ${obligatorio ? "" : `<button class="cerrar" type="button" aria-label="Cerrar">×</button>`}
      <h2>${esc(titulo)}</h2>
      ${texto ? `<p>${esc(texto)}</p>` : ""}
      ${html}
      <div class="fila"></div>
    </div>
  `);

  return new Promise((resolver) => {
    const fila = caja.querySelector(".fila");
    for (const b of botones) {
      const boton = h(`<button class="boton ${b.estilo ?? "secundario"}" type="button">${esc(b.texto)}</button>`);
      boton.addEventListener("click", () => {
        cerrarModal();
        resolver(b.valor ?? b.texto);
      });
      fila.append(boton);
    }
    caja.querySelector(".cerrar")?.addEventListener("click", () => {
      cerrarModal();
      resolver(null);
    });
    capa.innerHTML = "";
    capa.append(caja);
    capa.hidden = false;
    abierto = { capa, resolver, obligatorio };
  });
}

export function cerrarModal() {
  if (!abierto) return;
  abierto.capa.hidden = true;
  abierto.capa.innerHTML = "";
  abierto = null;
}

export function hayModal() {
  return !!abierto;
}

/* ── Portapapeles ──────────────────────────────────────────────────────── */

/* `navigator.clipboard` solo existe en https o localhost. En una LAN por http
   —que es como se prueba en el móvil— hace falta el truco del textarea. */
export async function copiar(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* se intenta el otro camino */ }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ── Varios ────────────────────────────────────────────────────────────── */

export function enlaceSala(codigo) {
  const url = new URL("./", document.baseURI);
  url.searchParams.set("sala", codigo);
  return url.toString();
}

export function fechaCorta(ms) {
  try {
    return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
