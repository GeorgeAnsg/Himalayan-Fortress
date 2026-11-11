/* El inicio: lo que hay después de entrar y no estar en ninguna mesa.

   Sirve para una cosa: abrir madriguera o meterse en una con un código. Si el
   servidor tiene un solo juego, no se pregunta cuál. */

import { h, esc, avatarSVG, aviso } from "../ui.js";

export function pintar(raiz, { usuario, sala = null, juegos = [], alCrear, alUnirse, alVolver, alSalir }) {
  const varios = juegos.length > 1;
  const unico = juegos[0];

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
        <p class="subtitulo">Jugar</p>
        <div class="acciones-inicio">
          ${varios
            ? juegos.map((j) => `
                <button class="boton secundario" data-juego="${esc(j.id)}" type="button" style="flex-direction:column;align-items:flex-start;gap:2px;padding:15px 16px;text-align:left">
                  <strong style="font-size:16px">${esc(j.nombre)}</strong>
                  <small style="font-weight:400;color:var(--tinta-tenue);font-size:13px">${esc(j.resumen ?? "")}</small>
                </button>`).join("")
            : `<button class="boton" id="crear" type="button">Abrir una madriguera</button>`}

          <div class="unirse">
            <input id="codigo" type="text" inputmode="text" maxlength="5" placeholder="CÓDIGO"
                   aria-label="Código de la madriguera" autocomplete="off" spellcheck="false" />
            <button class="boton secundario" id="unirse" type="button" style="width:auto;padding:0 18px">Entrar</button>
          </div>
          <p class="nota">${unico ? esc(unico.nombre) + ". " : ""}Te damos un código de cinco letras para pasar.</p>
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
  nodo.querySelector("#crear")?.addEventListener("click", () => alCrear(unico?.id));

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
