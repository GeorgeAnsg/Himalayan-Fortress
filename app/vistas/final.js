/* El final: quién ha ganado y cómo ha quedado cada uno.

   Los resultados se guardan con la mesa mientras dura (2 h sin actividad), no
   en un histórico: la cuenta es la identidad, no un perfil con estadísticas.
   Cuando haya varios juegos, cada uno puede traer su propio resumen en
   `final.puestos`, y aquí se pinta igual. */

import { h, esc, avatarSVG } from "../ui.js";

/* Cuando te destruyen el búnker a media partida, la mesa sigue jugando sin
   ti: mismo fondo que el vestíbulo, tu puesto y la lista de la mesa, que se va
   ordenando a medida que los demás caen. Cada difusión de la mesa vuelve a
   pintar esto, así que la clasificación se actualiza sola. */
export function pintarCaido(raiz, { mesa, alSalir }) {
  const publica = mesa.publica ?? {};
  const jugadores = publica.jugadores ?? {};
  const ids = Object.keys(jugadores);
  const total = ids.length;
  const eliminados = publica.eliminados ?? [];
  /* El primero que cae es el último de la mesa; el siguiente, el penúltimo. */
  const puestoDe = (id) => {
    const i = eliminados.findIndex((x) => x.jugadorId === id);
    return i < 0 ? null : total - i;
  };
  const miPuesto = puestoDe(mesa.tu);

  const filas = ids.map((id) => {
    const j = jugadores[id] ?? {};
    return {
      id,
      nombre: j.nombre ?? "—",
      avatar: j.avatar ?? "0",
      vivo: j.vivo !== false,
      puesto: puestoDe(id),
      puntos: j.puntosMonsters ?? 0,
      tu: id === mesa.tu,
    };
  }).sort((a, b) => {
    /* Primero los que siguen (por puntos) y después los caídos por puesto. */
    if (!a.puesto !== !b.puesto) return a.puesto ? 1 : -1;
    if (a.puesto && b.puesto) return a.puesto - b.puesto;
    return b.puntos - a.puntos;
  });

  const nodo = h(`
    <section>
      <p class="subtitulo" style="margin-bottom:4px">Madriguera <span class="mono">${esc(mesa.codigo)}</span></p>
      <h1 class="titulo">Has caído</h1>
      <p class="nota" style="margin-bottom:14px">
        ${miPuesto ? `Quedas <strong style="color:var(--plata-claro)">${miPuesto}º de ${total}</strong>. ` : ""}
        La mesa sigue sin ti: los demás siguen jugando y esto se va actualizando.
      </p>

      <div class="seccion">
        <div class="podio">
          ${filas.map((f) => `
            <div class="puesto${f.puesto === 1 ? " oro" : ""}${f.tu ? " tu" : ""}">
              <span class="num">${f.puesto ?? "·"}</span>
              <span class="avatar" style="width:38px;height:38px">${avatarSVG(f.avatar)}</span>
              <span>${esc(f.nombre)}${f.tu ? ' <small class="apagado">tú</small>' : ""}${f.vivo ? ' <small class="apagado">en juego</small>' : ""}</span>
              <span class="puntos mono">${f.puntos}</span>
            </div>`).join("")}
        </div>
      </div>

      <div class="acciones">
        <button class="boton fantasma" id="salir" type="button">Salir de la mesa</button>
      </div>
    </section>
  `);

  const portada = mesa.juego?.id ? `/app/juegos/${encodeURIComponent(mesa.juego.id)}/img/vestibulo.webp` : null;
  if (portada) {
    nodo.classList.add("vestibulo-portada");
    nodo.style.setProperty("--vbg", `url('${portada}')`);
  }

  nodo.querySelector("#salir")?.addEventListener("click", () => alSalir());
  raiz.append(nodo);
  return nodo;
}

export function pintar(raiz, { mesa, alRevancha, alSalir }) {
  const puestos = mesa.final?.puestos ?? [];
  const ganador = puestos[0];
  const anfitrion = mesa.jugadores.find((j) => j.id === mesa.anfitrion);

  const nodo = h(`
    <section>
      <p class="subtitulo" style="margin-bottom:4px">Madriguera <span class="mono">${esc(mesa.codigo)}</span></p>
      <h1 class="titulo">Se acabó</h1>
      <p class="nota" style="margin-bottom:18px">
        ${ganador
          ? `Gana <strong style="color:var(--plata-claro)">${esc(ganador.nombre)}</strong>${ganador.tu ? " (tú)" : ""}.`
          : "Partida terminada."}
      </p>

      <div class="podio">
        ${puestos.map((p) => `
          <div class="puesto${p.puesto === 1 ? " oro" : ""}${p.tu ? " tu" : ""}">
            <span class="num">${p.puesto}</span>
            <span class="avatar" style="width:38px;height:38px">${avatarSVG(p.avatar)}</span>
            <span>${esc(p.nombre)}${p.tu ? ' <small class="apagado">tú</small>' : ""}</span>
            <span class="puntos mono">${p.puntos}</span>
          </div>`).join("")}
        ${puestos.length === 0 ? `<div class="vacio">No hay resultados guardados.</div>` : ""}
      </div>

      <div class="acciones">
        ${mesa.soyAnfitrion
          ? `<button class="boton" id="revancha" type="button">Otra partida</button>`
          : `<p class="nota centrado">${esc(anfitrion?.nombre ?? "El anfitrión")} puede abrir otra partida.</p>`}
        <button class="boton fantasma" id="salir" type="button">Salir de la mesa</button>
      </div>

      <p class="sello">
        <span>◔</span>
        <span>Los resultados se quedan en la mesa dos horas sin actividad.</span>
      </p>
    </section>
  `);

  nodo.querySelector("#revancha")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const r = await alRevancha();
    if (r?.error) ev.currentTarget.disabled = false;
  });

  nodo.querySelector("#salir").addEventListener("click", () => alSalir());

  raiz.append(nodo);
  return nodo;
}
