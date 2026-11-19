/* La mesa.

   La plataforma pinta lo común —de quién es el turno— y le deja el tablero al
   juego: se carga `juego/cliente/<id>.js` y se le pasa la vista, incluida la
   orden de salir para que el juego ponga su propio botón donde le encaje. Si ese archivo no existe, se enseña un tablero mínimo con
   lo que haya en `publica`, para que un juego nuevo pueda empezar sin interfaz
   propia y añadirla después. */

import { h, esc, avatarSVG, modal, aviso } from "../ui.js";

/* Tableros ya importados, por juego. Con el módulo en memoria el repintado es
   síncrono: la app vacía #pantalla y el juego vuelve a pintar en la misma
   tacada, sin que llegue a verse el hueco negro entre una cosa y otra. */
const tableros = new Map();

/* Imágenes ya pedidas por juego: el hall, el vestíbulo y la mesa pueden pedir
   la misma precarga y solo se lanza una vez. Se guardan las Image() para que
   el navegador no las suelte antes de descargarlas. */
const imagenesPedidas = new Set();
const imagenesEnMemoria = [];
export function precargarImagenes(urls, clave = "") {
  if (!Array.isArray(urls) || !urls.length) return;
  if (clave) {
    if (imagenesPedidas.has(clave)) return;
    imagenesPedidas.add(clave);
  }
  for (const u of urls) {
    const img = new Image();
    img.src = u;
    imagenesEnMemoria.push(img);
  }
}

/* Descarga el tablero antes de entrar a la mesa. Así el primer pintado de la
   partida ya lo tiene en memoria y es síncrono: no se ve el hueco negro entre
   el vestíbulo y el juego. */
export function precargar(id, imagenes) {
  precargarImagenes(imagenes, id ? `img:${id}` : "");
  if (!id || tableros.has(id)) return;
  import(new URL(`../juego/cliente/${encodeURIComponent(id)}.js`, document.baseURI).href)
    .then((mod) => { if (typeof mod.pintar === "function") tableros.set(id, mod); })
    .catch(() => {});
}

export function getVestibulo(id) {
  return tableros.get(id)?.pintarVestibulo ?? null;
}

export function esperarVestibulo(id) {
  if (!id) return Promise.resolve(null);
  if (tableros.has(id)) return Promise.resolve(tableros.get(id)?.pintarVestibulo ?? null);
  return import(new URL(`../juego/cliente/${encodeURIComponent(id)}.js`, document.baseURI).href)
    .then((mod) => {
      if (typeof mod.pintar === "function") tableros.set(id, mod);
      return mod.pintarVestibulo ?? null;
    })
    .catch(() => null);
}

/* El juego cuelga de <body> el menú, la mano, los paneles, el cielo y sus
   modales. Al salir de la mesa o al volver al vestíbulo hay que retirarlos:
   vaciar #pantalla no se los lleva, y se quedaban encima del inicio. */
export function limpiar() {
  /* La música del juego se para ANTES de quitar el nodo: un <audio> sacado del
     documento sigue sonando. */
  document.querySelectorAll("body > #bw-musica-audio").forEach((a) => a.pause?.());
  document.querySelectorAll([
    "body > #bw-nav-global",
    "#barra #bw-sonido",
    "body > #bw-musica-audio",
    "body > .bw-mano-wrap",
    "body > .bw-panel",
    "body > .bw-panel-overlay",
    "body > .bw-turno-fin",
    "body > #bw-cielo-global",
    "body > #bw-zonas",
    "body > .bw-modal-fondo",
    "body > #smn-nav-global",
    "body > #smn-cabecera",
    "body > #smn-cuaderno-nav",
  ].join(",")).forEach((nodo) => nodo.remove());
  document.body.classList.remove("bw-himalaya", "mapa-himalaya", "bw-avanzando", "smn-en-partida");
  /* La hoja del juego trae sus propias variables en :root; si se queda en
     <head>, al volver al inicio pisa los colores de la app. Se reinstala sola
     la próxima vez que se pinte el tablero. */
  document.getElementById("bw-css")?.remove();
  document.getElementById("smn-css")?.remove();
  document.documentElement.style.removeProperty("--alto-nav");
  document.documentElement.style.removeProperty("--alto-barra");
}

export function pintar(raiz, { mesa, alAccion, alCuaderno, alSalir, scroll }) {
  const turno = mesa.jugadores.find((j) => j.id === mesa.turno);
  const ronda = mesa.publica?.ronda;
  const maxRondas = mesa.publica?.maxRondas;

  /* Cuando te toca no se dice nada: el turno ya se avisa en otro sitio. Solo
     queda el aviso de a quién se espera. El comentario va fuera de la
     plantilla, que si no se pinta como texto. */
  const nodo = h(`
    <section>
      ${mesa.esMiTurno
        ? ""
        : `<div class="turno-aviso espera" id="turno">${turno
            ? `Esperando a <strong>${esc(turno.nombre)}</strong>…`
            : "La mesa está abierta."}</div>`}

      <div id="tablero"></div>
    </section>
  `);

  const contenedor = nodo.querySelector("#tablero");
  /* El registro de la mesa (con su jornada) viaja al tablero: el juego lo usa
     para la crónica. */
  const opciones = { alAccion, alCuaderno, alSalir, scroll, log: mesa.log ?? [], ranking: mesa.ranking ?? [] };
  const cache = tableros.get(mesa.juego?.id);
  raiz.append(nodo);
  /* El nodo ya cuelga del documento antes de pintar el tablero: el juego mide
     sus posiciones al pintar y en un nodo suelto mediría todo a cero. */
  if (cache) pintarTablero(cache, contenedor, mesa, opciones);
  else cargarTablero(contenedor, mesa, opciones);
  return nodo;
}

function pintarTablero(mod, contenedor, mesa, { alAccion, alCuaderno, alSalir, scroll, log, ranking }) {
  contenedor.innerHTML = "";
  mod.pintar(contenedor, {
    publica: mesa.publica,
    privada: mesa.privada,
    jugadores: mesa.jugadores,
    tu: mesa.tu,
    acciones: mesa.acciones,
    ranking: ranking ?? mesa.ranking ?? [],
    alAccion,
    alCuaderno,
    alSalir,
    scroll,
    log: log ?? mesa.log ?? [],
  });
}

/* Se importa el tablero del juego. Si falla (juego sin interfaz, sin red), se
   queda un tablero genérico y la partida sigue siendo jugable. */
async function cargarTablero(contenedor, mesa, opciones) {
  const id = mesa.juego?.id;
  const url = new URL(`../juego/cliente/${encodeURIComponent(id)}.js`, document.baseURI).href;
  try {
    const mod = await import(url);
    if (typeof mod.pintar === "function") {
      tableros.set(id, mod);
      pintarTablero(mod, contenedor, mesa, opciones);
      return;
    }
    throw new Error("el juego no trae pintar()");
  } catch (err) {
    console.log("[tablero] se usa el genérico:", err?.message ?? err);
    contenedor.innerHTML = tableroGenerico(mesa);
  }
}

/* Tablero de emergencia: pistas con barra si el juego trae `publica.pistas`
   (que es lo que hace el de prueba), o la lista de jugadores con su avatar. */
function tableroGenerico(mesa) {
  const pistas = mesa.publica?.pistas;
  if (Array.isArray(pistas) && pistas.length) {
    const meta = mesa.publica.meta ?? 1;
    return pistas.map((p) => `
      <div class="pista${mesa.tu === p.id ? "" : " apagada"}">
        <span class="avatar" style="width:34px;height:34px">${avatarSVG(mesa.jugadores.find((j) => j.id === p.id)?.avatar ?? 0)}</span>
        <div>
          <div class="pista-cabeza">
            <span class="nombre">${esc(p.nombre)}</span>
            ${mesa.tu === p.id ? `<span class="marca-tu">tú</span>` : ""}
            <span class="marcador" style="margin-left:auto">${p.pos} / ${meta}</span>
          </div>
          <div class="carril"><div class="avance" style="width:${Math.max(0, Math.min(100, (p.pos / meta) * 100))}%"></div></div>
        </div>
      </div>`).join("");
  }
  return `<ul class="jugadores">${mesa.jugadores.map((j) => `
    <li class="jugador${j.tu ? " tu" : ""}">
      <span class="avatar">${avatarSVG(j.avatar)}</span>
      <span class="nombre">${esc(j.nombre)}${j.tu ? " (tú)" : ""}</span>
    </li>`).join("")}</ul>`;
}
