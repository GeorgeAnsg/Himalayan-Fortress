/* El final: quién ha ganado y cómo ha quedado cada uno.

   Los resultados se guardan con la mesa mientras dura (2 h sin actividad), no
   en un histórico: la cuenta es la identidad, no un perfil con estadísticas.
   Cuando haya varios juegos, cada uno puede traer su propio resumen en
   `final.puestos`, y aquí se pinta igual. */

import { h, esc, avatarSVG } from "../ui.js";

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
