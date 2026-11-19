import { h, esc, avatarSVG, aviso } from "../ui.js";
import { precargar } from "./juego.js";

export function pintar(raiz, { usuario, sala = null, juegos = [], juegoInicial = null, alCrear, alUnirse, alVolver, alSalir }) {
  let juegoActivo = null;
  let nodo;

  function mostrarSeleccion() {
    juegoActivo = null;
    renderizar();
  }

  function mostrarJuego(j) {
    juegoActivo = j;
    /* Al entrar al juego desde el hall, se descargan todas sus imágenes de una
       vez: al abrir la partida ya están en caché y no se bajan a mitad. */
    precargar(j.id, j.imagenes);
    renderizar();
  }

  function renderizar() {
    const nuevo = juegoActivo ? vistaJuego(juegoActivo) : vistaSeleccion();
    if (nodo) nodo.replaceWith(nuevo);
    else raiz.append(nuevo);
    nodo = nuevo;
  }

  function vistaSeleccion() {
    const el = document.createElement("section");
    el.className = "inicio-seleccion";

    /* Cabecera */
    const cab = h(`
      <div class="saludo" style="display:flex;align-items:center;gap:14px;padding:14px 0 10px">
        <span class="avatar" style="width:46px;height:46px">${avatarSVG(usuario.avatar)}</span>
        <div>
          <p class="subtitulo" style="margin-bottom:2px">Hall de juegos</p>
          <h1 class="titulo" style="margin:0">Hola, ${esc(usuario.nombre)}</h1>
        </div>
      </div>`);
    el.append(cab);

    if (sala) {
      const btn = h(`
        <button class="tarjeta-volver" id="volver" type="button">
          <span class="avatar" style="width:38px;height:38px">${avatarSVG(usuario.avatar)}</span>
          <span class="crece">
            <strong>Volver a tu madriguera</strong>
            <span>${sala.fase === "jugando" ? "Partida en curso" : sala.fase === "final" ? "Resultados" : "Vestíbulo"} · código ${esc(sala.codigo)}</span>
          </span>
          <span aria-hidden="true">→</span>
        </button>`);
      btn.addEventListener("click", () => alVolver());
      el.append(btn);
    }

    const lbl = document.createElement("p");
    lbl.className = "subtitulo";
    lbl.style.marginTop = "20px";
    lbl.textContent = "Juegos";
    el.append(lbl);

    if (!juegos.length) {
      el.append(h(`<div class="vacio">No hay juegos instalados.</div>`));
      return el;
    }

    const grid = document.createElement("div");
    grid.className = "juegos-grid";

    for (const j of juegos) {
      const card = document.createElement("article");
      card.className = "juego-card";
      if (j.id) card.style.backgroundImage = `url('/app/juegos/${encodeURIComponent(j.id)}/img/portada.webp')`;

      const btn = document.createElement("button");
      btn.className = "boton juego-card-btn";
      btn.type = "button";
      btn.textContent = "Jugar";
      btn.addEventListener("click", (ev) => { ev.stopPropagation(); mostrarJuego(j); });

      card.append(btn);
      card.addEventListener("click", () => mostrarJuego(j));
      grid.append(card);
    }

    el.append(grid);
    return el;
  }

  function vistaJuego(j) {
    const el = document.createElement("div");
    el.className = "inicio-juego";
    if (j.id) el.style.backgroundImage = `url('/app/juegos/${encodeURIComponent(j.id)}/img/portada.webp')`;

    const back = document.createElement("button");
    back.className = "inicio-juego-volver";
    back.type = "button";
    back.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    back.addEventListener("click", mostrarSeleccion);

    const pie = document.createElement("div");
    pie.className = "inicio-juego-pie";

    const btnCrear = document.createElement("button");
    btnCrear.className = "boton";
    btnCrear.type = "button";
    btnCrear.textContent = "Crear partida";
    btnCrear.addEventListener("click", () => alCrear(j.id));

    const unirse = document.createElement("div");
    unirse.className = "unirse";
    const caja = document.createElement("input");
    caja.id = "codigo";
    caja.type = "text";
    caja.inputMode = "text";
    caja.maxLength = 5;
    caja.placeholder = "CÓDIGO";
    caja.setAttribute("aria-label", "Código de la madriguera");
    caja.autocomplete = "off";
    caja.spellcheck = false;

    const btnEntrar = document.createElement("button");
    btnEntrar.className = "boton secundario";
    btnEntrar.type = "button";
    btnEntrar.style.cssText = "width:auto;padding:0 18px";
    btnEntrar.textContent = "Entrar";

    const entrar = async () => {
      const codigo = caja.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
      if (codigo.length !== 5) return aviso("El código tiene cinco letras.", { error: true });
      caja.disabled = true;
      btnEntrar.disabled = true;
      const r = await alUnirse(codigo);
      caja.disabled = false;
      btnEntrar.disabled = false;
      if (r?.error) { aviso(r.error, { error: true }); caja.select(); }
    };
    btnEntrar.addEventListener("click", entrar);
    caja.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); entrar(); } });

    unirse.append(caja, btnEntrar);
    pie.append(btnCrear, unirse);

    el.append(back, pie);
    return el;
  }

  if (juegoInicial) {
    const j = juegos.find(x => x.id === juegoInicial);
    if (j) { juegoActivo = j; precargar(j.id, j.imagenes); }
  }
  renderizar();
  return nodo;
}
