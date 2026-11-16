/* El inicio: lo que hay después de entrar y no estar en ninguna mesa.

   Sirve para una cosa: abrir madriguera o meterse en una con un código. Si el
   servidor tiene un solo juego, no se pregunta cuál. */

import { h, esc, avatarSVG, aviso } from "../ui.js";

export function pintar(raiz, { usuario, sala = null, juegos = [], alCrear, alUnirse, alVolver, alSalir }) {
  /* Crear y entrar viven en la misma zona: el código no cambia de juego, así
     que se escribe una vez y la mesa decide con qué se juega. */
  const entrarHTML = `
    <div class="unirse">
      <input id="codigo" type="text" inputmode="text" maxlength="5" placeholder="CÓDIGO"
             aria-label="Código de la madriguera" autocomplete="off" spellcheck="false" />
      <button class="boton secundario" id="unirse" type="button" style="width:auto;padding:0 18px">Entrar</button>
    </div>`;

  const nodo = h(`
    <section>
      <div class="saludo" style="display:flex;align-items:center;gap:14px">
        <span class="avatar" style="width:52px;height:52px">${avatarSVG(usuario.avatar)}</span>
        <div>
          <p class="subtitulo" style="margin-bottom:2px">Dentro</p>
          <h1 class="titulo" style="margin:0">Hola, ${esc(usuario.nombre)}</h1>
        </div>
      </div>

      ${sala ? `
        <button class="tarjeta-volver" id="volver" type="button">
          <span class="avatar" style="width:38px;height:38px">${avatarSVG(usuario.avatar)}</span>
          <span class="crece">
            <strong>Volver a tu madriguera</strong>
            <span>${sala.fase === "jugando" ? "Partida en curso" : sala.fase === "final" ? "Resultados" : "Vestíbulo"} · código ${esc(sala.codigo)}</span>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      ` : ""}

      <section class="seccion" style="margin-top:22px">
        <p class="subtitulo">Juegos</p>
        <div class="acciones-inicio">
          ${juegos.length
            ? juegos.map((j) => `
                <article class="juego-slot">
                  <div class="juego-slot-cab">
                    <div class="juego-slot-info">
                      <strong class="juego-slot-nombre">${esc(j.nombre)}</strong>
                      <small>${esc(j.resumen ?? "")}</small>
                    </div>
                    <button class="boton chico" data-juego="${esc(j.id)}" type="button">Crear partida</button>
                  </div>
                  ${juegos.length === 1 ? entrarHTML : ""}
                </article>`).join("")
            : `<div class="vacio">No hay juegos instalados.</div>`}
          ${juegos.length > 1 ? entrarHTML : ""}
        </div>
      </section>

      <section class="seccion" style="margin-top:26px">
        <p class="subtitulo">Tu cuenta</p>
        <div class="panel" style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <span class="avatar" style="width:34px;height:34px">${avatarSVG(usuario.avatar)}</span>
          <div class="crece">
            <strong style="font-size:14.5px">${esc(usuario.nombre)}</strong>
            <div class="apagado" style="font-size:12.5px">Sesión guardada en este dispositivo</div>
          </div>
          <button class="boton fantasma chico" id="salir" type="button">Salir</button>
        </div>
      </section>
    </section>
  `);

  nodo.querySelector("#volver")?.addEventListener("click", () => alVolver());

  for (const b of nodo.querySelectorAll("[data-juego]")) {
    b.addEventListener("click", () => alCrear(b.dataset.juego));
  }

  const caja = nodo.querySelector("#codigo");
  const entrar = async () => {
    const codigo = caja.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
    if (codigo.length !== 5) return aviso("El código tiene cinco letras.", { error: true });
    caja.disabled = true;
    const r = await alUnirse(codigo);
    caja.disabled = false;
    if (r?.error) {
      aviso(r.error, { error: true });
      caja.select();
    }
  };
  nodo.querySelector("#unirse").addEventListener("click", entrar);
  caja.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); entrar(); }
  });
  nodo.querySelector("#salir").addEventListener("click", () => alSalir());

  raiz.append(nodo);
  return nodo;
}
