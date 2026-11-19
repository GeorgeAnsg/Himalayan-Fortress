/* Vestíbulo de Say My Name — porta pantallaVestibulo de corvus/app/app.js.
   El CSS (say-my-name.css) se carga con id="smn-css" para que limpiar()
   lo elimine al salir, evitando conflictos con otros juegos. */

import { h }                           from "./ui.js";
import { tema }                        from "./contenido.js";
import { retratoDe, RETRATO_PLACEHOLDER } from "./imagenes.js";

function asegurarCSS() {
  if (document.getElementById("smn-css")) return;
  const link = document.createElement("link");
  link.id    = "smn-css";
  link.rel   = "stylesheet";
  link.href  = "/app/juegos/say-my-name/say-my-name.css";
  document.head.append(link);
}

/* Descripción corta de cada habilidad, igual que HAB_DESC en corvus app.js */
const HAB_DESC = {
  ganzua:   "Roba un objeto y quita trancas",
  tranca:   "Bloquea una puerta y golpea",
  lupa:     "Interroga y ve un rasgo ajeno",
  vaso:     "Aturde a otro jugador",
  manos:    "Coge un objeto sin ser visto",
  antorcha: "Revela quién está escondido",
  cepo:     "Trampa: inmoviliza al siguiente que entre",
  humo:     "Bloquea registrar y usar objetos en la sala",
  cuerda:   "Ata: impide moverse en la próxima jornada",
  empujon:  "Empuja a alguien a una sala contigua",
  capa:     "4 movimientos gratis hasta hacer otra acción",
};

/* Estado de la hoja de ajustes (si está abierta o no) */
let marcaAjustes = null;
const ajustesAbiertos = () => !!marcaAjustes?.isConnected;

/* Auto-asigna personaje al entrar (primer hueco libre), igual que en corvus
   con ELEGIR_PERSONAJE = false. Se hace una sola vez y no se repite si ya
   hay personaje asignado. No bloquea el render: el retrato aparece en el
   siguiente repintado que llega del servidor. */
function autoAsignarSiNecesario(deps) {
  const { mesa, alPersonalizar } = deps;
  const yo = mesa.jugadores.find((j) => j.tu);
  if (!yo) return;
  if (mesa.personalizacion?.personajes?.[yo.id]) return; /* ya asignado */

  const tomados = new Set(Object.values(mesa.personalizacion?.personajes ?? {}));
  const libre = tema.apodos.find((a) => !tomados.has(a.apodo));
  if (libre) alPersonalizar({ personaje: libre.apodo });
}

export function pintar(raiz, deps) {
  asegurarCSS();
  autoAsignarSiNecesario(deps);

  /* Mantener la hoja de ajustes viva entre repintados, igual que en corvus.
     Hay que apuntar si estaba abierta antes de vaciar la pantalla —al
     vaciarla, la marca deja de estar conectada— y volver a colgarla después:
     si se cuelga antes, el repintado se la lleva por delante. */
  const abierta = ajustesAbiertos();
  _renderizar(raiz, deps);
  if (abierta) abrirAjustesMesa(raiz, deps);
}

function _renderizar(raiz, deps) {
  raiz.replaceChildren();
  raiz.append(pantallaVestibulo(raiz, deps));
}

function repintar(raiz, deps) { _renderizar(raiz, deps); }

function pantallaVestibulo(raiz, deps) {
  const { mesa, alListo, alPersonalizar, alEmpezar, alSalir } = deps;
  const yo        = mesa.jugadores.find((j) => j.tu);
  const yaListo   = !!yo?.listo;

  const wrap = h("div", { class: "inicio" });

  /* Código de sala */
  wrap.append(
    h("div", { class: "inicio-codigo-bloque inicio-codigo-arriba" },
      h("p", { class: "inicio-label", text: "Código de sala" }),
      h("p", { class: "inicio-codigo", text: (mesa.codigo ?? "…").toUpperCase() })
    )
  );

  /* Lista de jugadores */
  wrap.append(h("p", { class: "inicio-label", text: "Jugadores" }));
  const lista = h("div", { class: "inicio-lista" });

  for (const j of mesa.jugadores) {
    const apodo = mesa.personalizacion?.personajes?.[j.id] ?? null;

    const avatar = h("div", { class: "inicio-jugador-avatar" });
    if (apodo) {
      const img = document.createElement("img");
      img.src = retratoDe(apodo);
      img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
      avatar.append(img);
    } else {
      avatar.append(h("span", { text: "?" }));
    }
    const info = h("div", { class: "inicio-jugador-info" },
      h("span", { class: "inicio-jugador-nombre", text: j.nombre }),
      apodo ? h("span", { class: "inicio-jugador-personaje", text: apodo }) : null
    );
    const fila = h("div", {
      class: "inicio-jugador"
        + (j.id === mesa.anfitrion ? " anfitrion" : "")
        + (!j.conectado && !j.esBot ? " fuera" : ""),
    },
      avatar, info,
      j.listo ? h("span", { class: "inicio-jugador-tick", text: "✓" }) : null,
      j.esBot ? h("span", { class: "inicio-opcion-lbl", text: "bot" }) : null,
      j.id === mesa.anfitrion ? h("span", { class: "inicio-opcion-lbl", text: "anfitrión" }) : null,
      !j.conectado && !j.esBot ? h("span", { class: "inicio-opcion-lbl", text: "sin conexión" }) : null,
    );
    lista.append(fila);
  }
  wrap.append(lista);

  /* Metadato: min–max jugadores */
  wrap.append(h("p", { class: "inicio-meta", text: `${mesa.min}–${mesa.max} jugadores` }));

  /* Botones */
  const botones = h("div", { class: "inicio-botones" });

  /* "Estoy listo": siempre visible (no hay elección de personaje previa) */
  botones.append(
    h("button", {
      class: "boton inicio-listo-btn" + (yaListo ? " hecho" : ""),
      text: yaListo ? "Quitar listo" : "Estoy listo",
      onclick: (ev) => { ev.currentTarget.disabled = true; alListo(!yaListo); },
    })
  );
  wrap.append(botones);

  if (mesa.soyAnfitrion) {
    const suficientes  = mesa.jugadores.length >= mesa.min;
    const sinListos    = mesa.jugadores.filter((j) => !j.listo);
    const todosListos  = suficientes && sinListos.length === 0;
    botones.append(
      h("button", {
        class: "boton inicio-entrar", text: "Comenzar partida",
        disabled: !todosListos,
        onclick: (ev) => { ev.currentTarget.disabled = true; alEmpezar(); },
      }),
      ...(!suficientes ? [
        h("p", { class: "inicio-faltan",
          text: mesa.tieneBot
            ? `Faltan jugadores (mínimo ${mesa.min}): elige la mesa en Ajustes y los huecos libres los llenan bots.`
            : `Faltan jugadores (mínimo ${mesa.min}).` })
      ] : sinListos.length > 0 ? [
        h("p", { class: "inicio-faltan",
          text: sinListos.length === 1
            ? `Falta que se marque listo ${sinListos[0].nombre}.`
            : `Faltan por marcarse listos: ${sinListos.map((j) => j.nombre).join(", ")}.` })
      ] : []),
      h("button", { class: "boton secundario inicio-eliminar", text: "Eliminar partida", onclick: alSalir })
    );

    /* Engranaje de ajustes (solo anfitrión) */
    const btnAjustes = document.createElement("button");
    btnAjustes.className = "inicio-ajustes";
    btnAjustes.type = "button";
    btnAjustes.setAttribute("aria-label", "Ajustes de la mesa");
    btnAjustes.setAttribute("title", "Ajustes de la mesa");
    btnAjustes.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.1 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.69 2.69l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46V20.5a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1.04-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.69-2.69l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97H3.5a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.46-1.04 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.69-2.69l.06.06a1.6 1.6 0 0 0 1.76.32h.08A1.6 1.6 0 0 0 10.2 3.1V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.69 2.69l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97H21a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.8.96z"/></svg>';
    btnAjustes.addEventListener("click", () => abrirAjustesMesa(raiz, deps));
    wrap.append(btnAjustes);
  } else {
    botones.append(
      h("button", { class: "boton secundario inicio-salir", text: "Salir de la sala", onclick: alSalir })
    );
    wrap.append(h("p", { class: "inicio-espera", text: "Esperando que el anfitrión comience…" }));
  }

  /* Reglas colapsables */
  const reglas = document.createElement("details");
  reglas.className = "inicio-reglas";
  reglas.innerHTML = `<summary>¿Cómo se juega?</summary>
<p><b>Objetivo:</b> cada personaje que ves es una persona de la mesa con un nombre de verdad. Averigua quién es quién y sal por la puerta del Vestíbulo antes que nadie.</p>
<p><b>Rasgos:</b> cada personaje tiene tres rasgos de corte (collar, corona, banda…). Con los tres identificados sabes quién es. En el Pergamino → Sospechas los vas marcando.</p>
<p><b>Objetos:</b> cada jugador tiene objetos propios. Si te llevas el de otro al sitio donde sirve y lo usas, te dice un rasgo de su dueño. Uno solo no desvela nada: hay que usarlo.</p>
<p><b>Acciones:</b> 6 PA por jornada, no se acumulan. Moverse 1 · registrar 1 · usar un objeto 1 · esconder 1 · soltar 1 · guardar 1 · cotillear 1 · salir 1.</p>
<p><b>Salir:</b> solo cuenta si aciertas todos los nombres de la mesa.</p>`;
  wrap.append(reglas);

  return wrap;
}

/* Tamaño de la mesa: humano(s) que hay y bots en el resto. Se listan los
   asientos posibles desde el mínimo del juego, más el de «solo humanos»
   cuando todavía no llega al mínimo, como en la app original, donde «Mesa»
   era el primer campo de los ajustes. */
function selectorJugadores(mesa) {
  const humanos = mesa.jugadores.filter((j) => !j.esBot).length;
  const desde = Math.max(Math.max(2, mesa.min), humanos);
  const valores = Array.from({ length: mesa.max - desde + 1 }, (_, i) => desde + i);
  if (humanos < desde) valores.unshift(humanos);

  const elegidoGuardado = mesa.personalizacion?.nJugadores;
  const elegido = Number.isFinite(elegidoGuardado) ? elegidoGuardado : humanos;

  const sel = document.createElement("select");
  sel.className = "inicio-select";
  sel.setAttribute("aria-label", "Número de jugadores");
  for (const n of valores) {
    const op = document.createElement("option");
    op.value = String(n);
    op.textContent = n === humanos
      ? `Solo humanos (${n})`
      : `${n} jugadores (${n - humanos} ${n - humanos === 1 ? "bot" : "bots"})`;
    op.selected = n === elegido;
    sel.append(op);
  }
  return sel;
}

/* Hoja de ajustes de la mesa (solo anfitrión), igual que en corvus app.js */
function abrirAjustesMesa(raiz, deps) {
  const { mesa, alPersonalizar } = deps;
  const pers = mesa.personalizacion ?? {};

  /* Estado local: cambios no se emiten hasta «Hecho» */
  const registroLocal = { total: pers.registroTotal ?? true };

  const habsGuardadas = pers.habsConfig ?? [];
  const inicioGuardado = new Set(pers.habsInicio ?? []);

  const habsDisponibles = tema.habilidades.filter((h) => !h.oculto);
  const habsLocal = habsDisponibles.map((hab) => {
    const saved = habsGuardadas.find((c) => c.clase === hab.clase);
    return { clase: hab.clase, nombre: hab.nombre, enPartida: saved?.enPartida ?? true };
  });
  const inicioLocal = new Set(inicioGuardado);

  /* -- Selector: tamaño de la mesa, el primero de la hoja -- */
  const selMesa = mesa.tieneBot ? selectorJugadores(mesa) : null;
  /* Como el resto de la hoja, no se emite hasta «Hecho». */
  let mesaLocal = Number.isFinite(pers.nJugadores) ? pers.nJugadores : null;
  selMesa?.addEventListener("change", () => { mesaLocal = Number(selMesa.value); });

  /* -- Selector: registroTotal -- */
  const selRegistro = document.createElement("select");
  for (const [val, lbl] of [["true", "Toda la sala de golpe"], ["false", "Dos huecos por acción"]]) {
    const op = document.createElement("option");
    op.value = val;
    op.textContent = lbl;
    op.selected = (val === "true") === registroLocal.total;
    selRegistro.append(op);
  }
  selRegistro.addEventListener("change", () => { registroLocal.total = selRegistro.value === "true"; });

  /* -- Toggles de habilidades -- */
  function mkToggle(checked, disabled) {
    const el = document.createElement("input");
    el.type = "checkbox"; el.checked = checked;
    el.style.cssText = "width:0;height:0;opacity:0;position:absolute";
    const slider = document.createElement("span");
    slider.className = "ajuste-toggle-slider";
    const label = document.createElement("label");
    label.className = "ajuste-toggle";
    if (disabled) label.style.opacity = "0.3";
    label.append(el, slider);
    return { el, label };
  }

  const filaHabs = habsLocal.map((hab, i) => {
    const { el: tPartidaEl, label: tPartidaLabel } = mkToggle(hab.enPartida, false);
    const { el: tInicioEl, label: tInicioLabel } = mkToggle(inicioLocal.has(hab.clase), !hab.enPartida);
    if (!hab.enPartida) tInicioEl.disabled = true;

    tPartidaEl.addEventListener("change", () => {
      habsLocal[i].enPartida = tPartidaEl.checked;
      if (!tPartidaEl.checked) { inicioLocal.delete(hab.clase); tInicioEl.checked = false; }
      fila.classList.toggle("ajuste-hab-fila--off", !tPartidaEl.checked);
      tInicioEl.disabled = !tPartidaEl.checked;
      tInicioLabel.style.opacity = tPartidaEl.checked ? "" : "0.3";
    });
    tInicioEl.addEventListener("change", () => {
      if (tInicioEl.checked) inicioLocal.add(hab.clase);
      else inicioLocal.delete(hab.clase);
    });

    const fila = document.createElement("div");
    fila.className = "ajuste-hab-fila" + (hab.enPartida ? "" : " ajuste-hab-fila--off");
    fila.append(
      tPartidaLabel,
      (() => {
        const info = document.createElement("div");
        info.className = "ajuste-hab-info";
        const nombre = document.createElement("span");
        nombre.className = "ajuste-hab-nombre";
        nombre.textContent = hab.nombre.replace(/^(una?|unos)\s/i, "");
        const desc = document.createElement("span");
        desc.className = "ajuste-hab-desc";
        desc.textContent = HAB_DESC[hab.clase] ?? hab.clase;
        info.append(nombre, desc);
        return info;
      })(),
      (() => { const s = document.createElement("span"); s.className = "ajuste-hab-lbl"; s.textContent = "inicio"; return s; })(),
      tInicioLabel
    );
    return fila;
  });

  /* Botón «Hecho» — emite al servidor */
  const btnHecho = document.createElement("button");
  btnHecho.className = "boton";
  btnHecho.textContent = "Hecho";
  btnHecho.addEventListener("click", () => {
    marcaAjustes = null;
    hoja.remove();
    alPersonalizar({
      ...(mesaLocal != null ? { nJugadores: mesaLocal } : {}),
      registroTotal: registroLocal.total,
      habsConfig: habsLocal.map(({ clase, enPartida }) => ({ clase, enPartida })),
      habsInicio: [...inicioLocal],
    });
  });

  /* -- Montar hoja (estructura: .velo + .panel > .asa + h2 + .cuerpo) -- */
  const hoja = document.createElement("div");
  hoja.className = "hoja";

  const velo = document.createElement("div");
  velo.className = "velo";
  velo.addEventListener("click", () => { marcaAjustes = null; hoja.remove(); });

  const panel = document.createElement("div");
  panel.className = "panel";

  const asa = document.createElement("div");
  asa.className = "asa";

  const h2 = document.createElement("h2");
  h2.textContent = "Ajustes de la mesa";

  const cuerpo = document.createElement("div");
  cuerpo.className = "cuerpo";

  const campoMesa = document.createElement("label");
  campoMesa.className = "campo";
  campoMesa.textContent = "Mesa";
  if (selMesa) campoMesa.append(selMesa);

  const campoReg = document.createElement("label");
  campoReg.className = "campo";
  campoReg.textContent = "Registrar";
  campoReg.append(selRegistro);

  const tituloHabs = document.createElement("div");
  tituloHabs.className = "titulo";
  tituloHabs.style.marginTop = "18px";
  tituloHabs.textContent = "Habilidades";

  const notaHabs = document.createElement("p");
  notaHabs.className = "ajuste-habs-nota";
  notaHabs.textContent = "Inicio: se reparte una al empezar (no vuelve a rotación).";

  const listaHabs = document.createElement("div");
  listaHabs.className = "ajuste-habs";
  listaHabs.append(...filaHabs);

  cuerpo.append(...(selMesa ? [campoMesa] : []), campoReg, tituloHabs, notaHabs, listaHabs, btnHecho);
  panel.append(asa, h2, cuerpo);
  hoja.append(velo, panel);

  /* Marcar para que repintar la sepa mantener */
  marcaAjustes = selRegistro;

  /* Añadir al raiz si no está ya, luego animar */
  raiz.querySelector(".hoja")?.remove();
  raiz.append(hoja);
  requestAnimationFrame(() => hoja.classList.add("abierta"));
}

