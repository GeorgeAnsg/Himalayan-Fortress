/* El vestíbulo: el código, los que han llegado y el botón de empezar.

   El código se copia con un toque porque es lo que se pasa por WhatsApp; al
   lado está el enlace completo, que se pega y ya deja a la persona en la
   puerta. */

import { h, esc, avatarSVG, copiar, aviso, enlaceSala } from "../ui.js";

export function pintar(raiz, { mesa, alListo, alEmpezar, alSalir, alAñadirBot }) {
  const anfitrion = mesa.jugadores.find((j) => j.id === mesa.anfitrion);
  const yo = mesa.jugadores.find((j) => j.tu);
  const listos = mesa.jugadores.filter((j) => j.listo).length;
  const faltan = mesa.jugadores.length < mesa.min;
  const puedeEmpezar = mesa.soyAnfitrion && mesa.todosListos && !faltan;

  const nodo = h(`
    <section>
      <div class="cabecera-mesa">
        <div>
          <p class="subtitulo" style="margin-bottom:4px">Vestíbulo</p>
          <h1 class="titulo" style="font-size:26px">${esc(mesa.juego?.nombre ?? "La partida")}</h1>
        </div>
      </div>

      <div class="codigo-caja">
        <div class="crece">
          <p class="subtitulo" style="margin-bottom:4px">Código de la madriguera</p>
          <div class="codigo">${esc(mesa.codigo)}</div>
        </div>
        <div style="display:grid;gap:6px;justify-items:stretch">
          <button class="boton chico" id="copiar" type="button">Copiar código</button>
          <button class="boton fantasma chico" id="enlace" type="button">Copiar enlace</button>
        </div>
      </div>
      <p class="nota">Pasa el código o el enlace. Quien entre con su cuenta se sienta aquí.</p>

      <section class="seccion" style="margin-top:24px">
        <p class="subtitulo">En la mesa · ${mesa.jugadores.length} de ${mesa.max}${faltan ? ` · faltan ${mesa.min - mesa.jugadores.length}` : ""}</p>
        <ul class="jugadores">
          ${mesa.jugadores.map((j) => `
            <li class="jugador${j.tu ? " tu" : ""}">
              <span class="avatar">${avatarSVG(j.avatar)}</span>
              <span class="nombre">
                ${esc(j.nombre)}
                <small>${j.tu ? "tú" : j.id === mesa.anfitrion ? "anfitrión" : "invitado"}</small>
              </span>
              ${!j.conectado
                ? `<span class="estado-punto fuera"><i></i>sin conexión</span>`
                : j.listo
                  ? `<span class="estado-punto listo"><i></i>listo</span>`
                  : `<span class="estado-punto"><i></i>esperando</span>`}
            </li>`).join("")}
        </ul>
      </section>

      <div class="acciones">
        <button class="boton ${yo?.listo ? "secundario" : ""}" id="listo" type="button">
          ${yo?.listo ? "Quitar «listo»" : "Estoy listo"}
        </button>

        ${mesa.soyAnfitrion
          ? `${mesa.tieneBot
               ? `<button class="boton fantasma chico" id="añadir-bot" type="button">+ Bot</button>`
               : `<button class="boton fantasma chico" id="añadir-bot" type="button">+ Añadir bot</button>`}
             <button class="boton" id="empezar" type="button" ${puedeEmpezar ? "" : "disabled"}>
               Empezar la partida
             </button>
             <p class="nota centrado" id="motivo">${
               listos < mesa.jugadores.length
                 ? `Faltan ${mesa.jugadores.length - listos} por decir que están listos.`
                 : faltan
                   ? `Hacen falta al menos ${mesa.min} jugadores.`
                   : "Todo listo: abre la partida."
             }</p>`
          : `<p class="nota centrado">${esc(anfitrion?.nombre ?? "El anfitrión")} abre la partida cuando todos estéis listos.</p>`}

        <button class="boton peligro" id="salir" type="button">Salir del vestíbulo</button>
      </div>
    </section>
  `);

  const conCopiado = (boton, texto) => {
    const antes = boton.textContent;
    boton.textContent = "Copiado";
    boton.classList.add("copiado");
    setTimeout(() => {
      boton.textContent = antes;
      boton.classList.remove("copiado");
    }, 1400);
  };

  nodo.querySelector("#copiar").addEventListener("click", async (ev) => {
    const ok = await copiar(mesa.codigo);
    if (ok) conCopiado(ev.currentTarget, mesa.codigo);
    else aviso("No se pudo copiar. Apunta el código a mano.", { error: true });
  });

  nodo.querySelector("#enlace").addEventListener("click", async (ev) => {
    const ok = await copiar(enlaceSala(mesa.codigo));
    if (ok) conCopiado(ev.currentTarget);
    else aviso("No se pudo copiar el enlace.", { error: true });
  });

  nodo.querySelector("#listo").addEventListener("click", (ev) => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    alListo(!yo?.listo);
  });

  const empezar = nodo.querySelector("#empezar");
  empezar?.addEventListener("click", (ev) => {
    ev.currentTarget.disabled = true;
    alEmpezar();
  });

  nodo.querySelector("#añadir-bot")?.addEventListener("click", (ev) => {
    ev.currentTarget.disabled = true;
    alAñadirBot?.();
  });

  nodo.querySelector("#salir").addEventListener("click", () => alSalir());

  raiz.append(nodo);
  return nodo;
}
