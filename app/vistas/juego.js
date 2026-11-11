/* La mesa.

   La plataforma pinta lo común —de quién es el turno— y le deja el tablero al
   juego: se carga `juego/cliente/<id>.js` y se le pasa la vista, incluida la
   orden de salir para que el juego ponga su propio botón donde le encaje. Si ese archivo no existe, se enseña un tablero mínimo con
   lo que haya en `publica`, para que un juego nuevo pueda empezar sin interfaz
   propia y añadirla después. */

import { h, esc, avatarSVG, modal, aviso } from "../ui.js";

export function pintar(raiz, { mesa, alAccion, alSalir }) {
  const turno = mesa.jugadores.find((j) => j.id === mesa.turno);
  const ronda = mesa.publica?.ronda;
  const maxRondas = mesa.publica?.maxRondas;

  const nodo = h(`
    <section>
      <div class="turno-aviso ${mesa.esMiTurno ? "" : "espera"}" id="turno">
        ${mesa.esMiTurno
          ? "<strong>Te toca.</strong> Elige una jugada."
          : turno
            ? `Esperando a <strong>${esc(turno.nombre)}</strong>…`
            : "La mesa está abierta."}
      </div>

      <div id="tablero"></div>
    </section>
  `);

  cargarTablero(nodo.querySelector("#tablero"), mesa, { alAccion, alSalir });

  raiz.append(nodo);
  return nodo;
}

/* Se importa el tablero del juego. Si falla (juego sin interfaz, sin red), se
   queda un tablero genérico y la partida sigue siendo jugable. */
async function cargarTablero(contenedor, mesa, { alAccion, alSalir }) {
  const id = mesa.juego?.id;
  const url = new URL(`../juego/cliente/${encodeURIComponent(id)}.js`, document.baseURI).href;
  try {
    const mod = await import(url);
    if (typeof mod.pintar === "function") {
      contenedor.innerHTML = "";
      mod.pintar(contenedor, {
        publica: mesa.publica,
        privada: mesa.privada,
        jugadores: mesa.jugadores,
        tu: mesa.tu,
        acciones: mesa.acciones,
        alAccion,
        alSalir,
      });
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
