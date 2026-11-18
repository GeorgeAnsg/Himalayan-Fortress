/* El vestíbulo: el código, el modo de partida, los que han llegado y el botón
   de empezar. El código vive en la cabecera y se copia con un icono, para no
   gastar media pantalla en una caja. */

import { h, esc, avatarSVG, copiar, aviso } from "../ui.js";

export function pintar(raiz, { mesa, alListo, alEmpezar, alSalir, alAñadirBot, alPersonalizar }) {
  const anfitrion = mesa.jugadores.find((j) => j.id === mesa.anfitrion);
  const yo = mesa.jugadores.find((j) => j.tu);
  const listos = mesa.jugadores.filter((j) => j.listo).length;
  const faltan = mesa.jugadores.length < mesa.min;
  const config = mesa.personalizacion ?? { modo: "todos", equipos: {} };
  const modo = config.modo === "equipos" ? "equipos" : "todos";
  const equipos = config.equipos ?? {};
  const equiposDistintos = new Set(mesa.jugadores.map((j, i) => {
    const n = Number(equipos[j.id]);
    return n === 0 || n === 1 ? n : i % 2;
  }));
  const equiposOk = modo !== "equipos" || equiposDistintos.size >= 2;
  const puedeEmpezar = mesa.soyAnfitrion && mesa.todosListos && !faltan && equiposOk;
  const editable = !!mesa.soyAnfitrion;

  const portada = mesa.juego?.id ? `/app/juegos/${encodeURIComponent(mesa.juego.id)}/img/vestibulo.webp` : null;

  const nodo = h(`
    <section>
      <div class="cabecera-mesa">
        <p class="subtitulo" style="margin:0">Vestíbulo</p>
        <div class="codigo-cabecera">
          <span class="codigo-cabecera-valor mono">${esc(mesa.codigo)}</span>
          <button class="copiar-icono" id="copiar" type="button" aria-label="Copiar código" title="Copiar código">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="8" y="8" width="11" height="11" rx="2"></rect>
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
            </svg>
          </button>
        </div>
      </div>

      ${mesa.juego?.sinPersonalizacion ? "" : `
      <section class="personalizacion">
        <div class="modo-opciones" role="group" aria-label="Modo de juego">
          <button type="button" class="modo-opcion ${modo === "todos" ? "on" : ""}"
                  data-modo="todos" ${editable ? "" : "disabled"}>Todos contra todos</button>
          <button type="button" class="modo-opcion ${modo === "equipos" ? "on" : ""}"
                  data-modo="equipos" ${editable ? "" : "disabled"}>Por equipos</button>
        </div>
      </section>`}

      <section class="seccion" style="margin-top:24px">
        <div class="mesa-cabecera">
          <p class="subtitulo" style="margin:0">En la mesa · ${mesa.jugadores.length} de ${mesa.max}${faltan ? ` · faltan ${mesa.min - mesa.jugadores.length}` : ""}</p>
          ${mesa.soyAnfitrion && mesa.tieneBot && mesa.jugadores.length < mesa.max
            ? `<button class="boton-texto" id="añadir-bot" type="button">Añadir bot</button>`
            : ""}
        </div>
        <ul class="jugadores">
          ${mesa.jugadores.map((j, i) => {
            const n = Number(equipos[j.id]);
            const equipo = n === 0 || n === 1 ? n : i % 2;
            return `<li class="jugador${j.tu ? " tu" : ""}">
              <span class="avatar">${avatarSVG(j.avatar)}</span>
              <span class="nombre">
                ${esc(j.nombre)}
                <small>${j.tu ? "tú" : j.id === mesa.anfitrion ? "anfitrión" : "invitado"}${modo === "equipos" ? ` · ${!j.conectado ? "sin conexión" : j.listo ? `listo <span style="color:#4caf50">✓</span>` : "esperando"}` : ""}</small>
              </span>
              ${modo === "equipos" ? `
                <span class="equipo-botones">
                  <button type="button" data-equipo-id="${esc(j.id)}" data-equipo="0"
                          class="equipo-0${equipo === 0 ? " on" : ""}" ${editable ? "" : "disabled"}>Azul</button>
                  <button type="button" data-equipo-id="${esc(j.id)}" data-equipo="1"
                          class="equipo-1${equipo === 1 ? " on" : ""}" ${editable ? "" : "disabled"}>Rojo</button>
                </span>` : `${!j.conectado
                ? `<span class="estado-punto fuera"><i></i>sin conexión</span>`
                : j.listo
                  ? `<span class="estado-punto listo"><i></i>listo</span>`
                  : `<span class="estado-punto"><i></i>esperando</span>`}`}
            </li>`;
          }).join("")}
        </ul>
      </section>

      <div class="acciones">
        <button class="boton ${yo?.listo ? "secundario" : ""}" id="listo" type="button">
          ${yo?.listo ? "Quitar «listo»" : "Estoy listo"}
        </button>

        ${mesa.soyAnfitrion
          ? `<button class="boton" id="empezar" type="button" ${puedeEmpezar ? "" : "disabled"}>
               Empezar la partida
             </button>
             <p class="nota centrado" id="motivo">${
               listos < mesa.jugadores.length
                 ? `Faltan ${mesa.jugadores.length - listos} por decir que están listos.`
                 : faltan
                   ? `Hacen falta al menos ${mesa.min} jugadores.`
                   : !equiposOk
                     ? "Hacen falta los dos equipos con jugadores."
                     : "Todo listo: abre la partida."
             }</p>`
          : `<p class="nota centrado">${esc(anfitrion?.nombre ?? "El anfitrión")} abre la partida cuando todos estéis listos.</p>`}

        <button class="boton peligro" id="salir" type="button">Salir del vestíbulo</button>
      </div>
    </section>
  `);

  if (portada) {
    nodo.classList.add("vestibulo-portada");
    nodo.style.setProperty("--vbg", `url('${portada}')`);
  }

  nodo.querySelector("#copiar").addEventListener("click", async (ev) => {
    const boton = ev.currentTarget;
    const ok = await copiar(mesa.codigo);
    if (!ok) return aviso("No se pudo copiar. Apunta el código a mano.", { error: true });
    boton.classList.add("copiado");
    boton.title = "Copiado";
    boton.setAttribute("aria-label", "Código copiado");
    setTimeout(() => {
      boton.classList.remove("copiado");
      boton.title = "Copiar código";
      boton.setAttribute("aria-label", "Copiar código");
    }, 1400);
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

  const personalizar = async (datos) => {
    if (!editable || typeof alPersonalizar !== "function") return;
    const r = await alPersonalizar(datos);
    if (r?.error) aviso(r.error, { error: true });
  };

  for (const boton of nodo.querySelectorAll("[data-modo]")) {
    boton.addEventListener("click", () => {
      if (!editable) return;
      boton.disabled = true;
      personalizar({ modo: boton.dataset.modo });
    });
  }

  for (const boton of nodo.querySelectorAll("[data-equipo-id]")) {
    boton.addEventListener("click", () => {
      if (!editable) return;
      const id = boton.dataset.equipoId;
      const valor = Number(boton.dataset.equipo);
      personalizar({ equipos: { ...equipos, [id]: valor } });
    });
  }

  nodo.querySelector("#salir").addEventListener("click", () => alSalir());

  raiz.append(nodo);
  return nodo;
}
