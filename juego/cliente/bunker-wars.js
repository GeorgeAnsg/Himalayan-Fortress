/* Cliente visual de Bunker Wars — Himalayan Fortress */

import { esc, avatarSVG, modal } from "../../app/ui.js";

export function pintar(contenedor, { publica, privada, jugadores, tu, acciones, alAccion, alSalir }) {
  if (!publica) { contenedor.innerHTML = "Cargando…"; return; }

  const { luna, fase, turnoActual, jugadores: tableros } = publica;
  const yo = tableros?.[tu] ?? null;
  const rivales = Object.values(tableros ?? {}).filter(j => j.id !== tu);
  const teToca = privada?.teToca ?? false;

  enviarAccion = typeof alAccion === "function" ? alAccion : null;
  salirMesa = typeof alSalir === "function" ? alSalir : null;

  /* Fondo fijo del Himalaya */
  if (!document.getElementById("bw-cielo-global")) {
    const cielo = document.createElement("div");
    cielo.id = "bw-cielo-global";
    cielo.className = "cielo"; // usa el CSS del demo directamente
    document.body.appendChild(cielo);
  }
  document.body.classList.add("bw-himalaya", "mapa-himalaya");

  accionesMesa = acciones ?? [];
  boxActual = privada?.box ?? [];
  lanzaderasMesa = privada?.lanzaderas ?? [];
  energiaMesa = privada?.energia ?? 0;
  accionesRestantesMesa = privada?.accionesRestantes ?? 0;
  faseMesa = fase ?? null;
  tocaMesa = teToca;
  cienciasMesa = yo?.bunker?.ciencia ?? [];
  nivelEnemigoMesa = publica.nivelEnemigo ?? 1;
  lunaMesa = publica.luna ?? 1;
  /* Una línea por jugador en la barra; la tuya siempre la primera. */
  jugadoresMesa = Object.entries(tableros ?? {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.id === tu ? -1 : b.id === tu ? 1 : 0));
  turnoMesa = turnoActual ?? null;
  yoMesa = tu ?? null;

  contenedor.innerHTML = `
    ${css()}
    ${cssAdicional()}

    ${yo ? pintarMiBunker(yo, privada, fase) : ""}

  `;
  /* Las fichas que han avanzado esta ronda se deslizan hasta su casilla en vez
     de aparecer de golpe en ella. Solo cuenta como ronda de monstruos lo que
     se mueve sin ser tuyo (los que atacan tu búnker o los del enemigo) y los
     que acaban de aparecer: ahí se baja la vista al tablero y no se puede
     tocar nada mientras dura el deslizamiento. */
  /* Carta de Destino que anuncia algo de las escaleras: si va a salir ahora,
     las fichas esperan a que se cierre la carta y la vista baje al tablero. */
  const destino = privada?.cartaDestino ?? null;
  const tope = totalesBunker(yo?.bunker);
  const sinGastar = (privada?.energia ?? 0) >= tope.monedas
    && (privada?.accionesRestantes ?? 0) >= tope.monjes;
  const esMiCarta = destino?.jugadorId === tu;
  const saleDestino = !!destino && teToca && esMiCarta
    && fase === "acciones" && sinGastar && claveDestino(destino) !== destinoVisto;
  const esperaCarta = saleDestino && DESTINO_ESCALERAS.has(destino.tipo);

  const { ajenas: ajenasMovidas, reproducir } = animarFichas(contenedor, { diferir: esperaCarta });
  const ajenasAhora = contenedor.querySelectorAll(".ficha.atacante, .ficha.ajena").length;
  const aparecen = ajenasPrevias !== null && ajenasAhora > ajenasPrevias;
  ajenasPrevias = ajenasAhora;
  const rondaDeMonstruos = ajenasMovidas > 0 || aparecen;
  avanceRetenido = esperaCarta && rondaDeMonstruos ? reproducir : null;
  if (rondaDeMonstruos && !esperaCarta) {
    bajarAlTablero();
    bloquearPorAvance(true);
  } else if (!rondaDeMonstruos) {
    bloquearPorAvance(false);
  }

  /* Nav, mano y box al body para position:fixed real (no relativo a #pantalla) */
  document.getElementById("bw-nav-global")?.remove();
  document.querySelector("body > .bw-mano-wrap")?.remove();
  document.querySelector("body > .bw-panel.box-panel")?.remove();
  document.querySelector("body > .bw-panel.acciones-panel")?.remove();
  document.querySelector("body > .bw-panel.manuscritos-panel")?.remove();

  const navEl2 = document.createElement("nav");
  navEl2.id = "bw-nav-global";
  navEl2.className = "bw-nav";
  /* position y bottom inline para que sea inmediato, antes del primer paint */
  /* Sin fixed: el menú es la última fila de la columna de la app. */
  navEl2.style.cssText = "width:100%;flex:0 0 auto;";
  navEl2.innerHTML = `
    <button class="bw-nav-tab activo" data-tab="cartas" type="button">
      <span>Fortaleza</span>
    </button>
    <button class="bw-nav-tab" data-tab="box" type="button">
      <span>Box</span>
    </button>
    <button class="bw-nav-tab" data-tab="acciones" type="button">
      <span>Acciones</span>
    </button>
    <button class="bw-nav-tab" data-tab="manuscritos" type="button">
      <span>Manuscritos</span>
    </button>`;
  document.body.appendChild(navEl2);

  /* Alto real de la barra y del menú, en vivo: de ahí cuelgan el escenario, la
     mano y el panel del box. Cualquier notch o barra del navegador entra aquí. */
  const medirAlto = () => {
    const b = document.getElementById("barra");
    const n = document.getElementById("bw-nav-global");
    const raiz = document.documentElement;
    if (b) raiz.style.setProperty("--alto-barra", Math.max(0, Math.round(b.getBoundingClientRect().bottom)) + "px");
    if (n) {
      /* Su propio alto, no innerHeight - nav.top: el menú cierra la columna, y
         la mano y el panel se cuelgan de él. Con innerHeight, en iOS la mano
         caía por debajo del menú (la franja amarilla en Safari). */
      raiz.style.setProperty("--alto-nav", Math.max(0, Math.round(n.getBoundingClientRect().height)) + "px");
    }
  };
  medirAlto();
  addEventListener("resize", medirAlto);
  if (window.visualViewport) visualViewport.addEventListener("resize", medirAlto);
  setTimeout(medirAlto, 60);

  const descartando = fase === "descartar" && !!privada?.teToca;
  const mano = privada?.mano ?? [];
  const manoWrap = document.createElement("div");
  manoWrap.className = `bw-mano-wrap${descartando ? " descartando" : ""}`;
  manoWrap.innerHTML = `<div class="bw-mano">${mano.length ? mano.map(c => pintarCarta(c, privada, fase, yo?.bunker)).join("") : ""}</div>`;
  document.body.appendChild(manoWrap);

  const boxPanel = document.createElement("div");
  boxPanel.className = "bw-panel box-panel oculto";
  boxPanel.innerHTML = pintarBox(privada);
  document.body.appendChild(boxPanel);

  /* Panel de acciones: mismo prototipo que el del box, con todas las que
     puedes hacer ahora mismo. */
  const accPanel = document.createElement("div");
  accPanel.className = "bw-panel acciones-panel oculto";
  accPanel.innerHTML = pintarAcciones();
  document.body.appendChild(accPanel);

  /* Manuscritos: la referencia de reglas, para consultar sin salir de la mesa */
  const manPanel = document.createElement("div");
  manPanel.className = "bw-panel manuscritos-panel oculto";
  manPanel.innerHTML = pintarManuscritos();
  document.body.appendChild(manPanel);

  accPanel.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".bw-accion-item");
    if (!b || !enviarAccion) return;
    const accion = accionesMesa[Number(b.dataset.i)];
    if (!accion) return;
    /* «Terminar acciones» cierra el panel: la ronda de monstruos que viene
       detrás se ve en el tablero, no debajo de las acciones. Se cambia de
       pestaña (y no solo se oculta) para que no vuelva a abrirse al repintar. */
    if (accion.tipo === "pasar") activarTab("box");
    const items = [...accPanel.querySelectorAll(".bw-accion-item")];
    items.forEach(x => { x.disabled = true; });
    const r = await enviarAccion(accion);
    if (r?.error) {
      aviso(r.error, { error: true });
      items.forEach(x => { x.disabled = false; });
    }
  });

  /* Parallax: el contenedor de scroll en el motor es #pantalla, no window */
  const pantalla = document.getElementById("pantalla");
  const sueloEl = contenedor.querySelector(".suelo");
  let rafPending = false;
  function parallax() {
    rafPending = false;
    const sy = pantalla ? pantalla.scrollTop : window.scrollY;
    const max = pantalla
      ? pantalla.scrollHeight - pantalla.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const t = max > 0 ? sy / max : 0;
    sueloEl?.style.setProperty("--py-clouds",   `${sy * 0.3}px`);
    sueloEl?.style.setProperty("--py-cloud",    `${sy * 0.2}px`);
    sueloEl?.style.setProperty("--py-cloud-sm", `${sy * -0.4}px`);
        /* Banderines en vertical: al hacer scroll se quedan un poco atrás (suben
       respecto del marco). Un 5 % más de esa subida es bajar el arrastre de
       0,15 a 0,1425. */
    sueloEl?.style.setProperty("--py-flags",   `${sy * 0.1425}px`);
        /* Banderines: se abren al hacer scroll (uno hacia cada lado). A −0,42 se
       separaban demasiado rápido; un 20 % menos lento es −0,336. */
    sueloEl?.style.setProperty("--px-flags",   `${sy * -0.336}px`);
    sueloEl?.style.setProperty("--py-fog",      `${(1 - t) * 40 + 50}px`);
  }
  (pantalla ?? window).addEventListener("scroll", () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(parallax); }
  }, { passive: true });
  parallax();

  /* Mano de cartas */
  const manoEl = manoWrap;
  manoEl?.addEventListener("click", async (ev) => {
    const carta = ev.target.closest(".bw-carta");
    if (!carta || !manoEl.contains(carta)) return;
    if (faseMesa === "descartar" && tocaMesa) {
      const uid = carta.dataset.uid;
      if (!uid || !enviarAccion) return;
      const r = await enviarAccion({ tipo: "descartar", cartaIds: [uid] });
      if (r?.error) aviso(r.error, { error: true });
      return;
    }
    abrirCarta(carta);
  });

  /* Acciones legales */
  const botones = [...contenedor.querySelectorAll(".bw-accion")];
  for (const b of botones) {
    b.addEventListener("click", async () => {
      const accion = acciones[Number(b.dataset.i)];
      if (!accion || !enviarAccion) return;
      /* «Terminar acciones» cierra el panel de acciones: lo que viene detrás (la
         ronda de monstruos) hay que verlo en el tablero, no bajo el panel. Se
         cambia de pestaña para que tampoco vuelva a abrirse al repintar. */
      if (accion.tipo === "pasar") activarTab("box");
      botones.forEach((x) => { x.disabled = true; });
      const r = await enviarAccion(accion);
      if (r?.error) {
        aviso(r.error, { error: true });
        botones.forEach((x) => { x.disabled = false; });
      }
    });
  }

  /* Salir */
  contenedor.querySelector(".bw-salir")?.addEventListener("click", async () => {
    if (!salirMesa) return;
    const r = await modal({
      titulo: "¿Salir de la partida?",
      texto: "Tu asiento queda libre y la partida sigue sin ti. Para volver a jugar tendrás que crear otra mesa o entrar con su código.",
      botones: [
        { texto: "Seguir jugando", estilo: "secundario", valor: null },
        { texto: "Salir de la partida", estilo: "peligro", valor: "salir" },
      ],
    });
    if (r !== "salir") return;
    document.getElementById("bw-cielo-global")?.remove();
    document.getElementById("bw-nav-global")?.remove();
    document.querySelector("body > .bw-mano-wrap")?.remove();
    document.querySelector("body > .bw-panel.box-panel")?.remove();
  document.querySelector("body > .bw-panel.acciones-panel")?.remove();
  document.querySelector("body > .bw-panel.manuscritos-panel")?.remove();
    document.body.classList.remove("bw-himalaya", "mapa-himalaya");
    const res = await salirMesa();
    if (res?.error) aviso(res.error, { error: true });
  });

  /* Ciencia del HUD: al tocarla, sus cartas instaladas. */
  contenedor.querySelector(".bw-edif-ciencia")?.addEventListener("click", abrirCiencia);

  /* Box: clic en monstruo para mandarlo */
  const boxEl = contenedor.querySelector(".bw-box");
  boxEl?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".bw-box-slot[data-mon-id]");
    if (!slot) return;
    const mon = boxActual.find((m) => m?.id === slot.dataset.monId);
    if (mon) abrirEnvio(mon);
  });

  /* Tabs de navegación inferior */
  function activarTab(id) {
    tabMesa = id;
    navEl2.querySelectorAll(".bw-nav-tab").forEach(t => t.classList.toggle("activo", t.dataset.tab === id));
    boxPanel.classList.toggle("oculto", id !== "box");
    accPanel.classList.toggle("oculto", id !== "acciones");
    manPanel.classList.toggle("oculto", id !== "manuscritos");
    manoWrap.classList.toggle("oculto", id !== "cartas");
  }
  navEl2.querySelectorAll(".bw-nav-tab").forEach(tab => {
    tab.addEventListener("click", () => activarTab(tab.dataset.tab));
  });
  /* Se recuerda la pestaña abierta entre repintados (el servidor empuja estado
     a menudo y no queremos que el panel se cierre solo). */
  activarTab(tabMesa);

  /* Carta de Destino: sale sola al empezar TU turno, una sola vez.
     El motor resuelve «carta» y «energía» de golpe, así que la pista de que
     estás al principio del turno es que no has gastado nada: energía y
     acciones siguen en su tope. Con eso, si ya has jugado una carta o hecho
     una acción, o refrescas la app después, la carta no vuelve a salir; y en
     monstruos, avance o lanzadera tampoco, porque en esas fases ya se gastó.

     Si la carta habla de las escaleras, al cerrarla se baja al tablero y el
     movimiento de las fichas empieza cuando la vista está abajo del todo. */
  if (saleDestino) {
    destinoVisto = claveDestino(destino);
    abrirDestino(destino, {
      alCerrar: () => {
        const retenido = avanceRetenido;
        avanceRetenido = null;
        if (!retenido) { bajarAlTablero(); return; }
        bloquearPorAvance(true);
        bajarYDespues(retenido);
      },
    });
  }

  /* Fase LANZAR: el rival se elige en un modal, no en la lista de acciones. */
  const opcionesLanzar = accionesMesa.filter(a => a.tipo === "lanzar");
  if (fase === "lanzar" && teToca && opcionesLanzar.length && !document.querySelector(".bw-modal-fondo")) {
    abrirLanzar(opcionesLanzar);
  }

  /* Fase DESCARTAR: la mano entera en un modal, para elegir qué se tira. */
  if (fase !== "descartar") document.getElementById("bw-modal-descartar")?.remove();
  if (fase === "descartar" && teToca && !document.getElementById("bw-modal-descartar")) {
    abrirDescarte();
  }
}

/* ── Animación del avance ─────────────────────────────────────────────────── */

/* Última casilla conocida de cada ficha, para saber cuáles se han movido. */
const fichasPrevias = new Map();
/* Fichas de monstruos (ajenas o atacantes) que había en el tablero la última
   vez: si ahora hay más, es que acaban de aparecer. */
let ajenasPrevias = null;

/* Devuelve cuántas fichas se han movido, cuántas de ellas son monstruos que no
   son tuyos y una función para lanzar el deslizamiento cuando toque.

   Con `diferir` las fichas se quedan pintadas en su casilla de salida y el
   movimiento no empieza hasta llamar a `reproducir()`: así, cuando la carta de
   Destino anuncia algo de las escaleras, primero se cierra la carta y se baja
   al tablero, y solo entonces se ve aparecer o avanzar a los monstruos. */
function animarFichas(raiz, { diferir = false } = {}) {
  let movidas = 0;
  let ajenas = 0;
  const esAjena = (el) => el.classList.contains("atacante") || el.classList.contains("ajena");
  const pendientes = [];

  for (const el of raiz.querySelectorAll(".ficha[data-ol]")) {
    const ol = el.dataset.ol;
    const ot = el.dataset.ot;
    const finL = el.style.left;
    const finT = el.style.top;
    el.removeAttribute("data-ol");
    el.removeAttribute("data-ot");
    if (diferir) { el.style.left = `${ol}%`; el.style.top = `${ot}%`; }
    pendientes.push({ el, ol, ot, finL, finT });
    movidas++;
    if (esAjena(el)) ajenas++;
  }

  const reproducir = () => {
    for (const { el, ol, ot, finL, finT } of pendientes) {
      el.style.left = finL;
      el.style.top = finT;
      /* Web Animations: no hace falta que el navegador pinte antes la casilla de
         salida, así que la ficha se desliza siempre (2 s de casilla a casilla). */
      el.animate?.(
        [{ left: `${ol}%`, top: `${ot}%` }, { left: finL, top: finT }],
        { duration: 2000, easing: "cubic-bezier(.45,.05,.3,1)" }
      );
    }
  };

  if (!diferir) reproducir();
  return { movidas, ajenas, reproducir };
}

/* Lleva la pantalla hasta abajo y, cuando deja de moverse, hace lo que le
   manden. Se usa para que la animación no se gaste mientras todavía se está
   desplazando la vista. */
function bajarYDespues(alBajar) {
  const pantalla = document.getElementById("pantalla");
  if (!pantalla?.scrollTo) { alBajar?.(); return; }
  pantalla.scrollTo({ top: pantalla.scrollHeight, behavior: "smooth" });
  let ultima = pantalla.scrollTop;
  let quieta = 0;
  let frames = 0;
  const paso = () => {
    const y = pantalla.scrollTop;
    quieta = Math.abs(y - ultima) < 1 ? quieta + 1 : 0;
    ultima = y;
    /* Dos frames sin moverse o 1,2 s de tope: la vista ya está abajo. */
    if (quieta >= 2 || ++frames > 72) { alBajar?.(); return; }
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* Tipos de carta de Destino que hablan de las escaleras: monstruos que llegan,
   que avanzan, que se retiran, que cambian de nivel… Si sale una de estas, la
   vista baja al tablero antes de que se muevan las fichas. */
const DESTINO_ESCALERAS = new Set([
  "amenaza", "amenaza_doble", "amenaza_triple", "amenaza_rival",
  "colocar_monstruos", "aniquilar_entrada", "aniquilar_nivel", "matar_mayor",
  "avanzar_extra", "miedo", "convertir_aliado", "subir_monstruos", "bajar_monstruos",
]);
/* Avance retenido a la espera de que se cierre la carta de Destino. */
let avanceRetenido = null;

/* Ronda de monstruos: la vista baja sola hasta el tablero, que es donde ocurre
   el avance, para no perderse la animación de 2 s. */
function bajarAlTablero() {
  const pantalla = document.getElementById("pantalla");
  if (!pantalla?.scrollTo) return;
  /* Dos pasadas: la primera coloca el final actual y la segunda, tras el
     repintado, ajusta por si la escena ha cambiado de alto. */
  pantalla.scrollTo({ top: pantalla.scrollHeight, behavior: "smooth" });
  requestAnimationFrame(() => pantalla.scrollTo({ top: pantalla.scrollHeight, behavior: "smooth" }));
}

/* Mientras dura la fase de avance ninguna acción del usuario responde: no se
   toca una casilla que aún se está moviendo. Se apaga al llegar la siguiente
   fase; el reloj es solo una red por si esa fase no llegara. */
let relojAvance = null;
function bloquearPorAvance(activo) {
  clearTimeout(relojAvance);
  if (!activo) { document.body.classList.remove("bw-avanzando"); return; }
  document.body.classList.add("bw-avanzando");
  relojAvance = setTimeout(() => document.body.classList.remove("bw-avanzando"), 4000);
}

/* ── Modal de lanzadera: elegir rival y camino ───────────────────────────── */

function abrirLanzar(ops) {
  document.getElementById("bw-modal-lanzar")?.remove();

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-lanzar";
  fondo.className = "bw-modal-fondo";
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  const noLanzar = accionesMesa.find(a => a.tipo === "no_lanzar") ?? null;

  const enviar = async (accion, boton) => {
    if (!accion || !enviarAccion) return;
    if (boton) boton.disabled = true;
    /* Se cierra antes de enviar: si queda la otra lanzadera, el repintado
       vuelve a abrir el modal con la que falta. */
    cerrar();
    const r = await enviarAccion(accion);
    if (r?.error) aviso(r.error, { error: true });
  };

  /* Peldaños de una escalera, del 4 (junto a la fortaleza) al 1 (abajo). */
  const casillas = (s) => {
    const p = s?.posiciones ?? [];
    return [3, 2, 1, 0].map(k => {
      const f = p[k];
      if (!f) return `<i class="bw-lz-cas"></i>`;
      const at = f.tipo === "atacante";
      return `<i class="bw-lz-cas${at ? " at" : ""}" title="Peldaño ${k + 1}: ${at ? "atacante" : "suyo"} nivel ${f.nivel}">${f.nivel}</i>`;
    }).join("");
  };

  const listaRivales = () => [...new Set(ops.map(a => a.rivalId))].map(id => {
    const r = jugadoresMesa.find(x => x.id === id) ?? {};
    const torres = r.bunker?.torres ?? [];
    return `
      <button type="button" class="bw-lz-rival" data-rival="${esc(id)}" title="Lanzar a ${esc(r.nombre ?? "rival")}">
        <span class="bw-lz-cab">
          <b>${esc(r.nombre ?? "Rival")}</b>
          <span class="bw-lz-vida">❤ ${r.puntosMonsters ?? 0} / 20</span>
        </span>
        <span class="bw-lz-calles">
          ${(r.senderos ?? []).map(s => `
            <span class="bw-lz-calle">
              <span class="bw-lz-cid" title="Escalera ${s.id}: la ${escaleraDe(s.id)}">${s.id}</span>
              ${casillas(s)}
              <span class="bw-lz-torre">${torres[s.id - 1]?.nivel ? `T${torres[s.id - 1].nivel}` : "·"}</span>
            </span>`).join("")}
        </span>
      </button>`;
  }).join("");

  const pasoRivales = () => {
    fondo.innerHTML = `
      <div class="bw-lz">
        <div class="bw-lz-tit">Lanzar monstruo</div>
        <p class="bw-lz-sub">Elige a qué rival mandas lo que tienes en la lanzadera.</p>
        <div class="bw-lz-lista">${listaRivales()}</div>
        <div class="bw-lz-pie">
          ${noLanzar ? `<button type="button" class="bw-modal-usar bw-lz-nolanzar">No lanzar</button>` : ""}
        </div>
      </div>`;
    for (const b of fondo.querySelectorAll(".bw-lz-rival")) {
      b.addEventListener("click", () => pasoCaminos(b.dataset.rival));
    }
    fondo.querySelector(".bw-lz-nolanzar")?.addEventListener("click", (ev) => enviar(noLanzar, ev.currentTarget));
  };

  const pasoCaminos = (rivalId) => {
    const rival = jugadoresMesa.find(x => x.id === rivalId) ?? {};
    const suyas = ops
      .filter(a => a.rivalId === rivalId)
      .sort((a, b) => a.sendero - b.sendero || a.lanzadera - b.lanzadera);
    const dos = lanzaderasMesa.filter(Boolean).length > 1;
    fondo.innerHTML = `
      <div class="bw-lz">
        <div class="bw-lz-tit">¿Por qué camino de ${esc(rival.nombre ?? "el rival")}?</div>
        <div class="bw-lz-lista">
          ${suyas.map(a => {
            const mon = lanzaderasMesa[a.lanzadera] ?? null;
            return `<button type="button" class="bw-lz-camino" data-op="${accionesMesa.indexOf(a)}">
              Camino ${a.sendero}${dos ? ` · M${mon?.nivel ?? "?"} (L${a.lanzadera + 1})` : ""}
            </button>`;
          }).join("")}
        </div>
        <div class="bw-lz-pie">
          <button type="button" class="bw-lz-atras">Atrás</button>
        </div>
      </div>`;
    for (const b of fondo.querySelectorAll(".bw-lz-camino")) {
      b.addEventListener("click", () => enviar(accionesMesa[Number(b.dataset.op)], b));
    }
    fondo.querySelector(".bw-lz-atras").addEventListener("click", pasoRivales);
  };

  pasoRivales();
}

/* ── Modal de descarte: la mano en 2×2, se marcan y se tiran ─────────────── */

function abrirDescarte() {
  document.getElementById("bw-modal-descartar")?.remove();
  const mano = privadaMesa?.mano ?? [];
  if (!mano.length) return;

  /* Descartar es opcional: hasta 2 cartas por turno, o ninguna. */
  const maxDesc = 2;

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-descartar";
  fondo.className = "bw-modal-fondo";

  /* Las mismas cartas de papel del modal de una carta, cuatro y algo menores. */
  const celda = (c) => {
    const t = defsCarta(c);
    const coste = c.coste ?? t.costo ?? 0;
    return `
      <button type="button" class="bw-desc-celda" data-uid="${esc(c.uid ?? "")}">
        <div class="bw-carta-grande">
          <span class="bw-carta-coste-grande">${coste}</span>
          <div class="bw-carta-grande-img"><img src="${esc(imgCarta(c.tipo, c.nivel))}" alt=""></div>
          <div class="bw-carta-grande-texto">
            <div class="bw-carta-grande-titulo">${esc(t.label)}</div>
            <p class="bw-carta-grande-desc">${conNegritas(c.descripcion)}</p>
          </div>
        </div>
      </button>`;
  };

  fondo.innerHTML = `
    <div class="bw-modal bw-desc-modal" role="dialog" aria-modal="true" aria-label="Descartar cartas">
      <div class="bw-desc-tit">Descartar cartas</div>
      <div class="bw-desc-grid">${mano.map(celda).join("")}</div>
      <p class="bw-desc-nota"></p>
      <div class="bw-modal-acciones">
        <button type="button" class="bw-modal-usar bw-desc-ok" disabled>Descartar</button>
        <button type="button" class="bw-modal-usar bw-desc-no">No descartar</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const ok = fondo.querySelector(".bw-desc-ok");
  const nota = fondo.querySelector(".bw-desc-nota");
  const marcar = () => {
    const n = fondo.querySelectorAll(".bw-desc-celda.sel").length;
    ok.disabled = n === 0;
    ok.textContent = n ? `Descartar ${n}` : "Descartar";
    nota.textContent = n === maxDesc ? "Ya tienes las dos marcadas: quita una para cambiar." : "";
  };

  for (const b of fondo.querySelectorAll(".bw-desc-celda")) {
    b.addEventListener("click", () => {
      if (!b.classList.contains("sel") && fondo.querySelectorAll(".bw-desc-celda.sel").length >= maxDesc) return;
      b.classList.toggle("sel");
      marcar();
    });
  }

  const enviar = async (cartaIds, boton) => {
    if (!enviarAccion) return;
    if (boton) boton.disabled = true;
    const clave = [...cartaIds].sort().join(",");
    const op = accionesMesa.find(a => a.tipo === "descartar"
      && [...(a.cartaIds ?? [])].sort().join(",") === clave);
    /* Se cierra antes de enviar: si el turno sigue en descartar, se reabre. */
    fondo.remove();
    const r = await enviarAccion(op ?? { tipo: "descartar", cartaIds });
    if (r?.error) aviso(r.error, { error: true });
  };

  ok.addEventListener("click", () => {
    const ids = [...fondo.querySelectorAll(".bw-desc-celda.sel")].map(el => el.dataset.uid);
    if (ids.length) enviar(ids, ok);
  });
  fondo.querySelector(".bw-desc-no").addEventListener("click", (ev) => enviar([], ev.currentTarget));
  /* Sin X: se sale con «Descartar» o con «No descartar». */
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) enviar([]); });
}

/* ── Modal de la carta de Destino del turno ───────────────────────────────── */

let destinoVisto = null;

function claveDestino(d) {
  return [d?.luna, d?.jugadorId, d?.tipo, d?.nivel, d?.cantidad].join("|");
}

/* ── Lo que lee el jugador en la carta de Destino ──────────────────────────
   Dos capas: el nombre y el relato con ambientación (lo que se ve en la
   carta) y, debajo en pequeño, la regla exacta (textoDestino). */
const BESTIARIO = { 1: "rastreador", 2: "carroñero", 3: "yeti", 5: "coloso de hielo", 7: "devorador de cumbres" };
const BESTIARIO_PL = { 1: "rastreadores", 2: "carroñeros", 3: "yetis", 5: "colosos de hielo", 7: "devoradores de cumbres" };

/* A la fortaleza se sube: tres escaleras, la de la izquierda, la central y la
   de la derecha. El camino 1 es el de la izquierda. */
const ESCALERAS = { 1: "de la izquierda", 2: "central", 3: "de la derecha" };
const escaleraDe = (i) => ESCALERAS[i] ?? "central";

function nombreMonstruo(n) { return BESTIARIO[n] ?? `monstruo de nivel ${n}`; }
function pluralMonstruo(n) { return BESTIARIO_PL[n] ?? `monstruos de nivel ${n}`; }

function tituloDestino(d) {
  switch (d.tipo) {
    case "amenaza":           return "Avistamiento";
    case "amenaza_triple":    return "La horda avanza";
    case "amenaza_doble":     return "Dos sombras en la nieve";
    case "amenaza_rival":     return "Nadie queda a salvo";
    case "calma":             return "Calma";
    case "aniquilar_entrada": return "El viento purga";
    case "aniquilar_nivel":   return "Los débiles caen";
    case "matar_mayor":       return "Cae el más fuerte";
    case "avanzar_extra":     return "El paso se acelera";
    case "miedo":             return "Miedo";
    case "convertir_aliado":  return "Traición";
    case "subir_monstruos":   return "Ascenso";
    case "bajar_monstruos":   return "Degradación";
    case "colocar_monstruos": return "Los criaderos despiertan";
    case "carta_roja":        return "¡Luna roja!";
    default:                  return String(d.tipo ?? "Carta de Destino");
  }
}

/* Devuelve HTML ya escapado: el nombre del monstruo va en negrita */
function relatoDestino(d) {
  const n = d.nivelReal ?? d.nivel ?? 1;
  const escalera = escaleraDe(Array.isArray(d.prio) ? d.prio[0] : 1);
  const cant = d.cantidad ?? 3;
  const uno = `<strong>${esc(nombreMonstruo(n))}</strong>`;
  const varios = `<strong>${esc(pluralMonstruo(n))}</strong>`;
  const E = esc(escalera);
  switch (d.tipo) {
    case "amenaza":
      return `Un ${uno} acaba de ser avistado desde la fortaleza: sube por la escalera ${E}.`;
    case "amenaza_triple":
      return `Tres ${varios} salen de la niebla, uno por cada escalera.`;
    case "amenaza_doble":
      return `Dos ${varios} se acercan por dos de tus escaleras.`;
    case "amenaza_rival":
      return `Un ${uno} aparece en una escalera de cada fortaleza.`;
    case "calma":
      return "No hay monstruos nuevos en el horizonte: la montaña calla.";
    case "aniquilar_entrada":
      return "Una ventisca barre los primeros peldaños: lo que esperaba abajo desaparece.";
    case "aniquilar_nivel":
      return "Los monstruos de nivel 3 o menos son arrastrados por la nieve.";
    case "matar_mayor":
      return "El monstruo más poderoso que trepa tu fortaleza cae fulminado.";
    case "avanzar_extra":
      return "Los atacantes de tus escaleras redoblan el paso: suben un peldaño más.";
    case "miedo":
      return "Un rugido en la montaña hace retroceder a todos los atacantes de la mesa.";
    case "convertir_aliado":
      return "Un atacante despierta leal: cambia de bando y defiende tu fortaleza.";
    case "subir_monstruos":
      return "Tus monstruos de nivel 5 o menos suben de rango bajo la bendición.";
    case "bajar_monstruos":
      return "Los monstruos de nivel 2 o más pierden su rango: la montaña los humilla.";
    case "colocar_monstruos":
      return `Los criaderos han parido nuevas bestias: <strong>${cant} ${esc(pluralMonstruo(n))}</strong> aparecen en tu box, listas para salir a defenderte.`;
    case "carta_roja":
      return "La luna se tiñe de rojo: desde ahora los monstruos llegan con su nivel real.";
    default:
      return esc(textoDestino(d));
  }
}

function imgDestino(d) {
  const n = d.nivelReal ?? d.nivel ?? 1;
  const nv = n >= 5 ? 3 : n;
  const mapa = {
    amenaza: `monstruo-nv${nv}`,
    amenaza_triple: `monstruo-nv${nv}`,
    amenaza_doble: `monstruo-nv${nv}`,
    amenaza_rival: `monstruo-nv${nv}`,
    colocar_monstruos: `monstruo-nv${nv}`,
    calma: "defensa",
    buscar_bunker: "recursos",
    aniquilar_entrada: "ataque",
    aniquilar_nivel: "ataque",
    matar_mayor: "ataque",
    avanzar_extra: "avanzar",
    miedo: "retirar",
    convertir_aliado: "defensa",
    subir_monstruos: "monstruo-nv3",
    bajar_monstruos: "monstruo-nv1",
    carta_roja: "vida",
  };
  /* Versión azul del dibujo, ya recortada sin fondo blanco: así se funde con
     el papel con el multiply sin dejar el recuadro del fondo. */
  return `${BASE_IMG}/cartas/azul/${mapa[d.tipo] ?? "monstruo-nv1"}.png`;
}

function abrirDestino(d, { alCerrar } = {}) {
  document.getElementById("bw-modal-destino")?.remove();
  const fondo = document.createElement("div");
  fondo.id = "bw-modal-destino";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Carta de Destino">
      <div class="bw-carta-grande bw-destino-grande">
        <div class="bw-carta-grande-img"><img src="${esc(imgDestino(d))}" alt=""></div>
        <div class="bw-destino-tag bw-destino-etiqueta">Carta de Destino</div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(tituloDestino(d))}</div>
          <p class="bw-carta-grande-desc">${relatoDestino(d)}</p>
        </div>
      </div>
      <div class="bw-modal-acciones"><button type="button" class="bw-modal-usar">Entendido</button></div>
    </div>`;
  document.body.appendChild(fondo);

  /* Sin X y sin cerrar tocando el fondo: de aquí solo se sale con «Entendido»,
     para que la carta del turno no se quede sin leer. Al cerrar se avisa, que
     es cuando toca bajar al tablero y soltar las animaciones. */
  fondo.querySelector(".bw-modal-usar").addEventListener("click", () => {
    fondo.remove();
    alCerrar?.();
  });
}

/* ── Mi búnker: escena completa del demo ──────────────────────────────────── */

/* Máximos de producción con todo puesto: 3 monedas y 2 monjes de base, más
   1+2+3+4 monedas y 0+1+1+2 decretos de las cuatro cartas de recursos, más la
   prima de una «Subir recursos». */
const MAX_MONEDAS = 14;
const MAX_MONJES  = 7;

/* Totales del turno, igual que el motor: 3 monedas y 2 monjes de base, más lo
   que sume cada carta de recursos, más la prima de «Subir recursos». */
function totalesBunker(bunker) {
  const rec = bunker?.recursos ?? [];
  const monedasCartas = rec.reduce((s, c) =>
    s + (c.nivel >= 4 ? 4 : c.nivel >= 3 ? 3 : c.nivel >= 2 ? 2 : 1), 0);
  const monjesCartas = rec.reduce((s, c) =>
    s + (c.nivel >= 4 ? 2 : c.nivel >= 2 ? 1 : 0), 0);
  return {
    monedas: 3 + monedasCartas + (bunker?.extra?.monedas ?? 0),
    monjes: 2 + monjesCartas + (bunker?.extra?.monjes ?? 0),
    monedasCartas,
    monjesCartas,
  };
}

function pintarMiBunker(j, priv, fase) {
  const energia    = priv?.energia ?? 0;
  const mano       = priv?.mano ?? [];
  const descartando = fase === "descartar" && !!priv?.teToca;
  const arm  = j.bunker?.armeria     ?? 0;
  const lab  = j.bunker?.laboratorio ?? 0;
  const cien = (j.bunker?.ciencia ?? []).length;
  const box  = priv?.box ?? [];
  privadaMesa = priv ?? null;
  const lanzaderas = priv?.lanzaderas ?? [null, null];
  const s    = j?.senderos ?? [{}, {}, {}];
  const torres = j?.bunker?.torres ?? [null, null, null];
  /* Las dos cifras de la fortaleza son lo que te queda AHORA, no la producción
     del turno (esa ya va en el resumen de arriba, «N por luna nueva»): así
     bajan al jugar una carta, crear un monstruo o disparar una torre. */
  const quedan = {
    monedas:  energia,
    decretos: priv?.accionesRestantes ?? 0,
  };

  /* Puntos indicadores de nivel (dots) */
  const dots = (n, max) => Array.from({length: max}, (_, i) =>
    `<i class="${i < n ? "lleno" : ""}"></i>`).join("");

  /* Huecos de producción en filas: 14 monedas (4/5/5) y 7 monjes (3/4). Se
     rellenan hasta lo que generas ahora mismo, base incluida. */
  const filas = (n, corte) => {
    const tope = corte.reduce((s, k) => s + k, 0);
    let llenos = Math.min(tope, Math.max(0, n));
    return corte.map(k => `<span class="fort-fila">${Array.from({length: k}, () =>
      `<i class="${llenos-- > 0 ? "lleno" : ""}"></i>`).join("")}</span>`).join("");
  };

  /* Ficha en un paso del sendero */
  const fichaEn = (sd, paso) => {
    const p = sd?.posiciones;
    if (Array.isArray(p)) return p[paso] ?? null;
    return (sd?.monstruos ?? []).find(m => m.pos === paso) ?? null;
  };
  const nivelDe = f => f?.nivel ?? f?.fuerza ?? "?";

  /* Posiciones exactas del demo (% del tablero) */
  const LOSAS = [
    [{l:"24.09",t:"77.4"},{l:"24.25",t:"64.6"},{l:"24.5",t:"52.9"},{l:"25.16",t:"41.5"},{l:"26.55",t:"33.66",base:true}],
    [{l:"50.02",t:"77.4"},{l:"49.61",t:"64.6"},{l:"49.2",t:"52.9"},{l:"49.2",t:"41.5"},{l:"49.26",t:"33.66",base:true}],
    [{l:"78.15",t:"77.4"},{l:"76.09",t:"64.6"},{l:"75.67",t:"52.9"},{l:"73.2",t:"41.5"},{l:"74.13",t:"33.66",base:true}],
  ];
  /* La torre de la izquierda, 3 px a la derecha (0,77 % del ancho del tablero a
     390 px): la peana de su casilla se mueve con ella. */
  const TORRES_POS = [{l:"26.55",t:"32.28"},{l:"49.92",t:"32.28"},{l:"74.13",t:"32.28"}];

  /* Casilla virtual de entrada, una por escalera: la que sale de prolongar la
     recta que forman las dos primeras losas hacia abajo. No existe en el
     tablero, solo sirve para dibujar al monstruo naciendo por debajo y verle
     subir hasta su casilla cuando entra. */
  const ENTRADA = LOSAS.map(([a, b]) => ({
    l: (2 * Number(a.l) - Number(b.l)).toFixed(2),
    t: (2 * Number(a.t) - Number(b.t)).toFixed(2),
  }));

  /* Fichas reales */
  const fichasHtml = [0,1,2].flatMap(i =>
    [0,1,2,3].map(paso => {
      const f = fichaEn(s[i], paso);
      if (!f) return "";
      const pos = LOSAS[i][paso];
      const esAtacante = f.tipo === "atacante";
      const cls = esAtacante ? (f.dueno ? "ajena" : "atacante") : "mia";
      /* Si la ficha viene de otra casilla, se pinta en la de antes y se mueve
         a la nueva: así se ve el avance del turno. Si no la habíamos visto
         nunca y entra por el primer peldaño, sale de la casilla virtual de
         abajo: es la entrada desde la bruma. */
      const antes = f.id ? fichasPrevias.get(f.id) : null;
      const movida = !!antes && (antes.calle !== i || antes.paso !== paso);
      const entra = !antes && paso === 0;
      const desde = movida ? LOSAS[antes.calle][antes.paso] : (entra ? ENTRADA[i] : null);
      if (f.id) fichasPrevias.set(f.id, { calle: i, paso });
      const desdeAttr = desde ? ` data-ol="${desde.l}" data-ot="${desde.t}"` : "";
      /* Icono del monstruo: de espaldas (m1-t, sin cabeza) cuando sube la
         escalera atacando el fuerte, y de frente (m1-f, la cabeza hacia abajo)
         cuando lo defiende. Encima lleva una pastilla con su fuerza. Las
         imágenes están en /app/juegos/bunker-wars/img/monstruos/. */
      const imgFrontal = `${BASE_IMG}/monstruos/m1-f.png`;
      const imgTrasera = `${BASE_IMG}/monstruos/m1-t.png`;
      const img = esAtacante ? imgTrasera : imgFrontal;
      return `<div class="ficha ${cls}" data-fid="${esc(f.id ?? "")}"${desdeAttr} style="left:${pos.l}%;top:${pos.t}%"><img src="${img}" alt="monstruo" class="ficha-img"/><b class="ficha-nv">${nivelDe(f)}</b></div>`;
    })
  ).join("");

  /* Torres */
  const torresHtml = [0,1,2].map(i => {
    const t = torres[i];
    const pos = TORRES_POS[i];
    if (!t || !t.nivel)
      /* El + sube un 1,8 % del alto del tablero respecto al centro de la
         torre: en % para que la distancia crezca con el mapa. */
      return `<div class="hueco" style="left:${pos.l}%;top:calc(${pos.t}% - 1.8%)">+</div>`;
    const nv = t.nivel;
    return `
      <div class="torre nv${nv}${t.inhabilitada ? " bloqueada" : ""}" style="left:${pos.l}%;top:${pos.t}%">
        <div class="anillo"><span></span></div>
        <div class="planta"></div>
        <div class="alzado"></div>
        ${t.inhabilitada ? `<div class="bloqueo">✕</div>` : ""}
        <div class="nivel"><i></i><i></i><i></i></div>
      </div>`;
  }).join("");

  /* Lanzaderas */
  const lanzHtml = [{l:"37.1",t:"77.7"},{l:"63.3",t:"77.9"}].map((pos, i) => {
    const l = lanzaderas[i];
    return `<div class="lanzadera" style="left:${pos.l}%;top:${pos.t}%">${l ? nivelDe(l)+"▲" : ""}</div>`;
  }).join("");

  /* Losas */
  const losasHtml = LOSAS.flatMap(calles => calles.map(pos =>
    `<div class="losa${pos.base ? " base-torre" : ""}" style="left:${pos.l}%;top:${pos.t}%"></div>`
  )).join("");

  /* Slots de box en la fort-ui */
  /* Cuatro huecos de la fortaleza: arriba-izquierda, abajo-izquierda,
     arriba-derecha y abajo-derecha. Los retoques van en --u (1 % del ancho del
     mundo) para que sigan en su sitio al girar el móvil. */
  const slotPos = [
    { l:"37.6%",                            t:"calc(63.5% - 1.28 * var(--u))" },  // 5 px arriba
    { l:"calc(37.6% + 0.51 * var(--u))",   t:"calc(73.1% - 1.28 * var(--u))" },  // 5 arriba, 2 dcha
    { l:"calc(62.7% + 0.51 * var(--u))",   t:"calc(64.1% - 2.56 * var(--u))" },  // 10 arriba, 2 dcha
    { l:"63.1%",                            t:"calc(72.7% - 0.51 * var(--u))" },  // 2 px arriba
  ];
  const slotsHtml = slotPos.map((pos, i) => {
    const mon = box[i];
    // pos.l y pos.t ya traen su unidad (% o calc), así que no se les añade otra
    return `<div class="fort-slot${mon ? " fort-slot-lleno" : ""}" style="left:${pos.l};top:${pos.t}">${mon ? `M${mon.nivel ?? "?"}` : ""}</div>`;
  }).join("");

  /* Los tres edificios de la fortaleza, con el mismo modelo: arriba la
     pastilla borgoña con un hueco por nivel, y debajo la imagen del edificio
     dentro de su caja. La imagen se pinta siempre: si el nivel es 0 se usa el
     arte del nivel 1, para poder colocar el edificio antes de construirlo. */
  const edificioFortaleza = (izq, arriba, nivel, max, archivo, topPastilla = null) => `
              <div class="fort-circulo fort-circulo-edif" style="left:${izq};top:${arriba}">
                <div class="fort-nivel"${topPastilla == null ? "" : ` style="top:${topPastilla}"`}>${dots(nivel, max)}</div>
                <img src="${BASE_IMG}/edificios/${archivo}" class="fort-edif-img" alt="">
              </div>`;

  return `
    ${pintarHud(j, priv)}
    <section class="escena">
      <div class="mundo">
        <div class="suelo">
          <div class="capa-himalaya capa-bg-clouds"></div>
          <div class="capa-himalaya capa-cloud-l"></div>
          <div class="capa-himalaya capa-cloud-r"></div>
          <div class="capa-himalaya capa-flags"></div>
          <div class="capa-himalaya capa-flags-r"></div>
          <div class="capa-himalaya bloque-mapa">
            <img src="${BASE_IMG}/mapas/nieve/fortress.png" class="img-fortress" alt="">
            <img src="${BASE_IMG}/mapas/nieve/stairs.png"   class="img-stairs"   alt="">
            <div class="fort-ui">
              <div class="fort-plat energia" style="left:20.5%;top:25.5%">
                <div class="fort-cifra">${quedan.monedas}</div>
                <div class="fort-pila-caja coins">
                  <img src="${pilaCoins(quedan.monedas)}" class="fort-pila" alt="">
                </div>
              </div>
              <div class="fort-plat vida" style="left:80.5%;top:25.4%">
                <div class="fort-cifra">${quedan.decretos}</div>
                <div class="fort-pila-caja decrees">
                  <img src="${pilaDecrees(quedan.decretos)}" class="fort-pila" alt="">
                </div>
              </div>
              ${edificioFortaleza("76.2%", "42.47%", lab,  4, `criadero${lab > 0 ? lab : 1}.png`)}
              ${edificioFortaleza("49.9%", "50.9%",  cien, 2, "laboratorio.png", "0")}
              ${edificioFortaleza("24.2%", "42.47%", arm,  3, `armeria${arm > 0 ? arm : 1}.png`)}
              ${slotsHtml}
            </div>
          </div>
          <div class="capa-himalaya capa-bottom-fog"></div>
        </div>

        <svg class="caminos" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="lecho" d="M24.5 100 L24.5 0"/>
          <path class="lecho" d="M49.2 100 L49.2 0"/>
          <path class="lecho" d="M73.2 100 L73.2 0"/>
        </svg>

        <div class="tablero">
          <div class="bw-layer">
            <div class="num-calle" style="left:calc(24.5% - 0.51 * var(--u));top:83%">1</div>
            <div class="num-calle" style="left:calc(49.2% + 0.77 * var(--u));top:83%">2</div>
            <div class="num-calle" style="left:calc(73.2% + 4.62 * var(--u));top:83%">3</div>
          </div>
          <div class="bw-layer">${lanzHtml}</div>
          <div class="bw-layer">${losasHtml}</div>
          <div class="bw-layer">${torresHtml}</div>
          <div class="bw-layer">${fichasHtml}</div>
        </div>
      </div>
    </section>

  `;
}

/* ── HUD: el turno de un vistazo ──────────────────────────────────────────
   Una línea arriba a la izquierda con lo del turno —monedas y monjes que
   quedan sobre los que generas—, la luna y la vida del búnker. */

function pintarHud(j, priv) {
  const tot = totalesBunker(j?.bunker);
  const energia = priv?.energia ?? 0;
  const acciones = priv?.accionesRestantes ?? 0;
  const vida = Math.max(0, 20 - (j?.puntosMonsters ?? 0));

  /* Las mejoras de la fortaleza: armería (torres de ataque) y criadero
     (crear monstruos). Los nombres internos siguen siendo armeria y
     laboratorio. */
  const armeria = j?.bunker?.armeria ?? 0;
  const criadero = j?.bunker?.laboratorio ?? 0;
  const ciencia = (j?.bunker?.ciencia ?? []).length;
  const ICONO = (n) => `${BASE_IMG}/iconos/${n}.png`;

  /* Un punto por nivel de edificio: lleno en rojo los que tiene. */
  const puntos = (n, max = 4) => Array.from({ length: max }, (_, i) =>
    `<i class="${i < n ? "llena" : ""}"></i>`).join("");

  /* La unidad de la partida es la luna: cada luna nueva, tantas monedas. */
  const recurso = (icono, nombre, turno, quedan) => `
        <div class="bw-rec" title="${nombre}: ${turno} por ciclo. Te quedan ${quedan}.">
          <img src="${ICONO(icono)}" alt="">
          <b>${turno}<em>/ciclo</em></b>
        </div>`;
  /* Un hueco de la fila de abajo: icono, nombre y, o los puntos de nivel, o
     un valor de texto (los huecos libres del box). */
  const edificio = (icono, nombre, nivel, max = 4, valor = null) => `
        <div class="bw-edif" title="${nivel == null ? nombre : `${nombre} a nivel ${nivel}`}">
          ${icono ? `<img src="${ICONO(icono)}" alt="">` : ""}
          <span class="bw-edif-nombre">${nombre}</span>
          ${valor ?? `<span class="bw-edif-puntos">${puntos(nivel, max)}</span>`}
        </div>`;

  /* Grid de turnos pegado al fondo del marco: un slot por jugador. */
  const turnos = jugadoresMesa.map(p => {
    const activo = p.id === turnoMesa;
    return `<div class="bw-turno${activo ? " activo" : ""}" data-jugador="${esc(p.id)}"></div>`;
  }).join("");
  const nTurnos = Math.max(1, jugadoresMesa.length);
  const nivelVida = vida > 12 ? "alta" : vida > 6 ? "media" : "baja";

  /* Tres filas: arriba las monedas, la vida y los decretos; en medio los
     cuatro huecos de la fortaleza; abajo la franja de turnos. */
  return `
    <div class="bw-hud">
      <div class="bw-hud-aviso" title="Turno en curso">
        <span class="bw-hud-aviso-texto">${tocaMesa ? "¡Es tu turno!" : "Espera tu turno"}</span>
        <div class="bw-hud-turnos aviso" style="grid-template-columns:repeat(${nTurnos},minmax(0,1fr))">${turnos}</div>
      </div>
      <div class="bw-hud-caja" title="Fortaleza: producción, vida y edificios">
        <div class="bw-hud-cuerpo">
          <div class="bw-hud-fila arriba">
            <div class="bw-hud-celda izq">${recurso("monedas", "Monedas", tot.monedas, energia)}</div>
            <div class="bw-hud-vida ${nivelVida}" title="Vida del búnker: ${vida} de 20">
              <img src="${ICONO("escudo")}" alt="">
              <b>${vida}/20</b>
            </div>
            <div class="bw-hud-celda der">${recurso("pergaminos", "Decretos", tot.monjes, acciones)}</div>
          </div>
          <div class="bw-hud-fila medio">
            ${edificio(null, "Armería", armeria, 3)}
            <button type="button" class="bw-edif bw-edif-ciencia" data-ciencia="1"
                    title="Ciencia: ${ciencia} de ${SLOTS_CIENCIA}. Toca para ver las cartas instaladas.">
              <span class="bw-edif-nombre">Ciencia</span>
              <span class="bw-edif-puntos">${puntos(ciencia, SLOTS_CIENCIA)}</span>
            </button>
            ${edificio(null, "Criadero", criadero, 4)}
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Box de monstruos ───────────────────────────────────────────────────── */

function pintarBox(priv) {
  const box = priv?.box ?? [];

  const caja = (b) => {
    const slots = Array.from({ length: 3 }, (_, k) => {
      const i = b * 3 + k;
      const m = box[i];
      return m
        ? `<div class="bw-box-slot lleno" data-mon-id="${esc(m.id)}" title="Monstruo ${m.nivel} (box ${b + 1}, hueco ${k + 1}): toca para enviarlo">M${m.nivel}</div>`
        : `<div class="bw-box-slot vacio" title="Box ${b + 1}, hueco ${k + 1} libre">${k + 1}</div>`;
    }).join("");
    const caminos = b === 0 ? "1 y 2" : "2 y 3";
    return `
      <div class="bw-caja">
        <div class="bw-caja-label">Box ${b + 1} <span class="bw-panel-sub">→ caminos ${caminos}</span></div>
        <div class="bw-box">${slots}</div>
      </div>`;
  };

  return `
    <div class="bw-panel-label">📦 Box <span class="bw-panel-sub">${box.filter(Boolean).length} / 6</span></div>
    <div class="bw-cajas">${caja(0)}${caja(1)}</div>
    <div class="bw-slot-sub" style="margin-top:6px">Toca un monstruo para mandarlo a la lanzadera o al inicio de un camino de su caja.</div>
  `;
}

/* ── Panel de acciones ─────────────────────────────────────────────────
   Todas las acciones legales de ahora mismo, una por botón. */

function pintarAcciones() {
  /* Lanzar y no lanzar se eligen en su propio modal: aquí solo estorban. */
  const lista = (accionesMesa ?? []).filter(a => a.tipo !== "lanzar" && a.tipo !== "no_lanzar");
  let cuerpo;
  if (lista.length) {
    cuerpo = `<div class="bw-acciones">${lista.map((a) =>
      `<button type="button" class="bw-accion-item" data-i="${accionesMesa.indexOf(a)}">${esc(a.etiqueta ?? a.texto ?? "Acción")}</button>`
    ).join("")}</div>`;
  } else {
    const nota = !tocaMesa
      ? "Esperando tu turno."
      : faseMesa === "descartar"
        ? "Ahora toca descartar: elige una carta de la mano."
        : "No te queda ninguna acción este turno.";
    cuerpo = `<div class="bw-slot-sub">${nota}</div>`;
  }
  return `
    <div class="bw-panel-label">▶ Acciones <span class="bw-panel-sub">${lista.length}</span></div>
    ${cuerpo}
    <div class="bw-slot-sub" style="margin-top:6px">Toca una acción para hacerla. Las cartas se juegan desde la mano.</div>
  `;
}

/* ── Manuscritos: la referencia de reglas del juego ─────────────────────── */

function pintarManuscritos() {
  const fila = (a, b, c) => `
    <div class="man-fila">
      <span class="man-a">${esc(a)}</span>
      <span class="man-b">${esc(b)}</span>
      ${c ? `<span class="man-c">${esc(c)}</span>` : "<span></span>"}
    </div>`;
  const seccion = (tit, cuerpo) => `
    <section class="man-sec">
      <div class="man-tit">${esc(tit)}</div>
      ${cuerpo}
    </section>`;
  const parrafo = (txt) => `<p class="man-p">${esc(txt)}</p>`;

  return `
    <div class="bw-panel-label">📜 Manuscritos <span class="bw-panel-sub">reglas de la fortaleza</span></div>

    ${seccion("Bestiario", `
      ${fila("Rastreador", "Nv 1", "1 pto · gratis")}
      ${fila("Carroñero", "Nv 2", "2 ptos · 1 mon.")}
      ${fila("Yeti", "Nv 3", "3 ptos · 2 mon.")}
      ${fila("Coloso de hielo", "Nv 5", "5 ptos · 3 mon.")}
      ${fila("Devorador de cumbres", "Nv 7", "7 ptos · no se crea")}
      ${parrafo("Los puntos se suman cuando el monstruo entra en tu fortaleza. Con más de 20, tu fortaleza cae.")}
    `)}

    ${seccion("Criadero", `
      ${fila("Criadero 1", "crea hasta Nv 1", "")}
      ${fila("Criadero 2", "crea hasta Nv 2", "2 mon.")}
      ${fila("Criadero 3", "crea hasta Nv 3", "2 mon.")}
      ${fila("Criadero 4", "crea hasta Nv 5", "2 mon.")}
      ${parrafo("Se sube en orden y la carta cuesta 2 monedas. El nivel 7 nunca sale del criadero: solo llega por Destino o subiendo de rango.")}
    `)}

    ${seccion("Armería", `
      ${fila("Armería 1", "torres Nv 1", "")}
      ${fila("Armería 2", "torres Nv 2", "2 mon.")}
      ${fila("Armería 3", "torres Nv 3", "2 mon.")}
      ${parrafo("Las tres torres se construyen en la peana del búnker, una por escalera, y cuestan 1, 2 y 3 monedas según su nivel.")}
    `)}

    ${seccion("Disparar con las torres", `
      ${parrafo("Toca un atacante que suba por tus escaleras: el daño de tus torres se suma y hay que igualar su nivel para matarlo.")}
      ${parrafo("Cada punto de daño cuesta 1 moneda. Una torre hace su nivel completo en su propia escalera y uno menos en las demás (la de nivel 1 no llega a las otras).")}
      ${parrafo("Mientras haya un atacante en el último peldaño de la escalera de una torre, esa torre queda apagada.")}
    `)}

    ${seccion("Las escaleras", `
      ${parrafo("A la fortaleza se sube. Hay tres escaleras: la de la izquierda, la central y la de la derecha, con cuatro peldaños cada una.")}
      ${parrafo("Los atacantes suben un peldaño al empezar tu turno; al subir desde el cuarto entran en la fortaleza y suman sus puntos.")}
      ${parrafo("Tus monstruos bajan hacia el primer peldaño y, al llegar, pasan a la lanzadera para lanzarlos el turno siguiente.")}
      ${parrafo("Si el atacante que llega a un peldaño es igual o más fuerte, mata al monstruo que lo defiende.")}
    `)}

    ${seccion("Recursos y ciencia", `
      ${fila("Recursos 1", "+1 moneda", "1 mon.")}
      ${fila("Recursos 2", "+2 monedas, +1 decreto", "2 mon.")}
      ${fila("Recursos 3", "+3 monedas, +1 decreto", "3 mon.")}
      ${fila("Recursos 4", "+4 monedas, +2 decretos", "4 mon.")}
      ${parrafo("Caben 4 cartas de recursos y pueden repetirse. La ciencia ocupa 2 huecos: disparar por 1 menos, crear monstruos por 1 menos y torres que hacen su nivel en cualquier escalera, 8 monedas cada una.")}
    `)}
  `;
}

/* ── Carta de Destino del turno ─────────────────────────────────────────── */

function textoDestino(d) {
  const amenaza = ["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival"].includes(d.tipo);
  const n = d.nivelReal ?? (amenaza && nivelEnemigoMesa === 1 ? Math.min(1, d.nivel ?? 1) : d.nivel);
  const nota = (d.nivel && n !== d.nivel)
    ? ` · la carta es de nivel ${d.nivel}, la luna lo deja en ${n}`
    : "";
  switch (d.tipo) {
    case "amenaza":         return `${nombreMonstruo(n)} (Nv ${n}) por la escalera ${escaleraDe(d.prio?.[0])}${nota}`;
    case "amenaza_triple":  return `3 ${pluralMonstruo(n)}, uno por escalera${nota}`;
    case "amenaza_doble":   return `2 ${pluralMonstruo(n)} en 2 escaleras${nota}`;
    case "amenaza_rival":   return `1 ${nombreMonstruo(n)} en una escalera de cada fortaleza${nota}`;
    case "calma":           return "Calma… no hay monstruos nuevos en el horizonte";
    case "buscar_bunker":   return "Busca en el mazo una carta de búnker que necesites y colócala";
    case "aniquilar_entrada": return "Todos los monstruos del primer peldaño son aniquilados";
    case "aniquilar_nivel": return "Todos los monstruos de nivel 3 o inferiores mueren. Quítalos de las escaleras";
    case "matar_mayor":     return "El monstruo de más rango que trepa tu fortaleza muere. Quítalo de la escalera";
    case "avanzar_extra":   return "Todos los atacantes de tus escaleras suben un peldaño más";
    case "miedo":           return "Todos los atacantes de la mesa retroceden una casilla";
    case "convertir_aliado":return "Convierte un monstruo atacante en un monstruo tuyo";
    case "subir_monstruos": return "Tus monstruos de nivel 5 o inferior suben un rango";
    case "bajar_monstruos": return "Tus monstruos de nivel 2 o superior bajan un rango";
    case "colocar_monstruos": return `Pon ${d.cantidad ?? 3} monstruos de nivel ${n} en tu box (criadero)`;
    case "carta_roja":      return "¡Carta roja! Desde ahora los monstruos suben de nivel";
    default:                return String(d.tipo ?? "");
  }
}

function pintarDestino(d, mazo) {
  if (!d) return "";
  const amenaza = ["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival"].includes(d.tipo);
  return `
    <div class="bw-destino${amenaza ? " amenaza" : ""}${d.tipo === "carta_roja" ? " roja" : ""}">
      <span class="bw-destino-tag">Carta de Destino</span>
      <span class="bw-destino-txt">${esc(textoDestino(d))}</span>
      <span class="bw-destino-mazo" title="Cartas que quedan en el mazo de Destino">${mazo ?? 0} en el mazo</span>
    </div>`;
}

/* ── Carta de mano ──────────────────────────────────────────────────────── */

const NOMBRES_EFECTO = {
  torreta_barata:       "Disparar barato",
  monstruo_barato:      "Monstruos baratos",
  torreta_universal:    "Torres universales",
  purga:                "Purga",
  avanzar_rival_1:      "Avanza al rival",
  subir_rango:          "Subir rango",
  convertir_aliado:     "Convertir aliado",
  bajar_nivel_enemigo:  "Bajar rango",
  evolucionar_torreta:  "Evolucionar torre",
  vuelo_seguro:         "Vuelo seguro",
  torreta2_gratis:      "Torre de nivel 2",
  monstruo3_gratis:     "Monstruo de nivel 3",
  subir_armeria:        "Subir armería",
  subir_laboratorio:    "Subir criadero",
  subir_recursos:       "Subir recursos",
  subir_lab_o_arm:      "Criadero o armería",
};

let enviarAccion = null;
let salirMesa = null;
let nivelEnemigoMesa = 1;
let accionesMesa = [];
let boxActual = [];
let lanzaderasMesa = [];
let privadaMesa = null;
let faseMesa = null;
let tocaMesa = false;
let cienciasMesa = [];
let lunaMesa = 1;
let jugadoresMesa = [];
let turnoMesa = null;
let yoMesa = null;
let tabMesa = "cartas";
let energiaMesa = 0;
let accionesRestantesMesa = 0;

const BASE_IMG   = "/app/juegos/bunker-wars/img";
const ASSETS_IMG = "/app/juegos/bunker-wars/img/coins-and-decrees";
const CARD_BG    = `${BASE_IMG}/card.png`;

/* Las pilas van 1:1 con la cifra (7 imágenes como tope). Antes las monedas se
   repartían sobre el máximo de producción (14), así que 4 monedas enseñaban la
   pila de 2: al pasar a «lo que queda» el dibujo tiene que ser el número. */
function pilaCoins(n)   { return `${ASSETS_IMG}/coins_${Math.min(7, Math.max(1, n))}.png`; }
function pilaDecrees(n) { return `${ASSETS_IMG}/decrees_${Math.min(7, Math.max(1, n))}.png`; }
const SLOTS_CIENCIA = 2;

function defsCarta(c) {
  const defs = {
    recursos:    { emoji: "⚡", label: c.titulo ?? `Recursos nv${c.nivel ?? ""}`, cls: "recursos",    costo: c.coste },
    armeria:     { emoji: "🔧", label: c.titulo ?? `Armería nv${c.nivel ?? ""}`,  cls: "armeria",     costo: c.coste },
    laboratorio: { emoji: "🧪", label: c.titulo ?? `Criadero nv${c.nivel ?? ""}`, cls: "laboratorio", costo: c.coste },
    ciencia:     { emoji: "🔬", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Ciencia", cls: "ciencia", costo: c.coste },
    ciencia_i:   { emoji: "⚗️", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Inmediata", cls: "ciencia_i", costo: c.coste },
  };
  const def = defs[c.tipo] ?? { emoji: "?", label: c.tipo ?? "Carta", cls: "", costo: c.coste ?? 0 };
  return { ...def, label: tituloCarta(c, def.label) };
}

/* Números romanos para los niveles de las cartas: II, III, IV */
const ROMANOS = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

/* "LABORATORIO 2" → "Laboratorio II": solo la primera letra en mayúscula y
   el nivel en palitos, como se lee en las cartas de papel. */
function tituloCarta(c, fallback) {
  let label = String(c?.titulo ?? fallback ?? "");
  if (!["laboratorio", "armeria", "recursos"].includes(c?.tipo)) return label;
  const m = label.match(/(\d+)\s*$/);
  const n = c?.nivel ?? (m ? Number(m[1]) : 0);
  label = label.replace(/\s*(nv\.?|nivel)?\s*\d+\s*$/i, "").trim().toLowerCase();
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return n ? `${label} ${ROMANOS[n] ?? n}` : label;
}

function imgCarta(tipo, nivel) {
  const mapa = {
    recursos:    "recursos",
    armeria:     "armeria",
    laboratorio: "laboratorio",
    ciencia:     "ciencia",
    ciencia_i:   "ciencia",
  };
  const nombre = mapa[tipo] ?? tipo;
  return `${BASE_IMG}/cartas/${nombre}.png`;
}

function cartaValida(c, bunker) {
  if (!bunker) return true;
  if (c.tipo === "armeria")     return c.nivel === (bunker.armeria ?? 0) + 1;
  if (c.tipo === "laboratorio") return c.nivel === (bunker.laboratorio ?? 0) + 1;
  if (c.tipo === "recursos")    return (bunker.recursos?.length ?? 0) < 4;
  if (c.tipo === "ciencia")     return !(bunker.ciencia ?? []).some(x => x.efecto === c.efecto);
  if (c.tipo === "ciencia_i") {
    if (c.efecto === "subir_armeria")     return (bunker.armeria ?? 0) < 3;
    if (c.efecto === "subir_laboratorio") return (bunker.laboratorio ?? 0) < 4;
    if (c.efecto === "subir_recursos")    return (bunker.recursos ?? []).some(r => (r.nivel ?? 1) < 4);
    if (c.efecto === "subir_lab_o_arm") {
      return (bunker.laboratorio ?? 0) < 4 || (bunker.armeria ?? 0) < 3;
    }
  }
  return true;
}

function pintarCarta(c, priv, fase, bunker) {
  const t = defsCarta(c);
  const coste = c.coste ?? t.costo ?? 0;
  const energia = priv?.energia ?? 0;
  const encaja = cartaValida(c, bunker);
  const jugable = encaja && fase === "acciones" && !!priv?.teToca
    && (priv?.accionesRestantes ?? 0) > 0 && energia >= coste;
  const sinEnergia = energia < coste;
  const descartable = fase === "descartar" && !!priv?.teToca;
  const img = imgCarta(c.tipo, c.nivel);

  return `
    <div class="bw-carta ${t.cls}${jugable ? " jugable" : " no-jugable"}${descartable ? " descartable" : ""}"
         data-uid="${esc(c.uid ?? "")}"
         data-tipo="${esc(c.tipo ?? "")}"
         data-coste="${coste}"
         data-efecto="${esc(c.efecto ?? "")}"
         data-titulo="${esc(c.titulo ?? t.label)}"
         data-descripcion="${esc(c.descripcion ?? "")}"
         data-emoji="${t.emoji}"
         data-img="${esc(img)}"
         data-encaja="${encaja ? "1" : "0"}"
         data-sin-energia="${sinEnergia ? "1" : "0"}"
         data-jugable="${jugable ? "1" : "0"}">
      <span class="bw-carta-coste">${coste}</span>
      <span class="bw-carta-nombre">${esc(t.label)}</span>
      <div class="bw-carta-img"><img src="${esc(img)}" alt=""></div>
    </div>
  `;
}

/* El texto de las cartas puede traer **negritas** para nombrar monstruos o
   edificios. Se escapa primero y después se convierten los pares de asteriscos
   en <b>: nunca se inyecta HTML que venga de fuera. */
function conNegritas(t) {
  return esc(t ?? "").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function abrirCarta(el) {
  cerrarCarta();
  const d = el.dataset;
  const jugable = d.jugable === "1";
  const sinEnergia = d.sinEnergia === "1";
  const reemplazos = d.tipo === "ciencia" && cienciasMesa.length >= SLOTS_CIENCIA ? cienciasMesa : null;
  const opciones = accionesMesa.filter(a => a.tipo === "mejorar_bunker" && a.cartaId === d.uid);
  const elecciones = !reemplazos && opciones.length > 1 ? opciones : null;

  /* Motivo por el que no se puede jugar, para el pie del modal. La energía se
     dice también aunque el coste ya vaya en rojo: nunca está de más el número. */
  const CON_OBJETIVO = ["subir_rango", "avanzar_rival_1", "convertir_aliado", "bajar_nivel_enemigo",
    "evolucionar_torreta", "vuelo_seguro", "torreta2_gratis", "monstruo3_gratis", "subir_lab_o_arm"];
  const sinObjetivo = jugable && CON_OBJETIVO.includes(d.efecto) && opciones.length === 0;
  /* Si el pie dice que no hay objetivo, el botón no puede quedarse activo. */
  const puedeUsar = jugable && !sinObjetivo;
  const motivo = jugable
    ? reemplazos
      ? "Tu búnker tiene dos ciencias. Al instalar esta sale una de las dos: elige cuál."
      : elecciones
        ? "Elige el objetivo de la carta."
        : sinObjetivo
          ? "Ahora mismo no hay ningún objetivo válido para esta carta: guárdala para más adelante."
          : ""
    : d.encaja === "0"
      ? d.tipo === "ciencia_i"
        ? "Ese edificio ya está a su nivel máximo, así que esta carta no subiría nada: guárdala para cuando lo amplíes."
        : "Esta carta no encaja en tu búnker ahora mismo: sube al nivel inmediatamente siguiente y no repitas lo que ya tienes."
      : sinEnergia
        ? ""
        : accionesRestantesMesa <= 0
          ? "Ya no te quedan decretos este turno."
          : !tocaMesa || faseMesa !== "acciones"
            ? "Solo se puede jugar en tu fase de acciones, cuando te toca."
            : "";

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-carta";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="${esc(tituloCarta(d, d.titulo))}">
      <button type="button" class="bw-modal-x" aria-label="Cerrar">×</button>
      <div class="bw-carta-grande">
        <span class="bw-carta-coste-grande${sinEnergia ? " sin-energia" : ""}">${d.coste}</span>
        <div class="bw-carta-grande-img"><img src="${esc(d.img ?? "")}" alt=""></div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(tituloCarta(d, d.titulo))}</div>
          <p class="bw-carta-grande-desc">${conNegritas(d.descripcion)}</p>
        </div>
      </div>
      <div class="bw-modal-acciones">
        ${reemplazos
          ? reemplazos.map(c => `<button type="button" class="bw-modal-usar" data-reemplazo="${esc(c.efecto ?? "")}"${jugable ? "" : " disabled"}>Quitar ${esc(NOMBRES_EFECTO[c.efecto] ?? c.titulo ?? c.efecto ?? "?")}</button>`).join("")
          : elecciones
            ? elecciones.map(a => `<button type="button" class="bw-modal-usar" data-accion="${accionesMesa.indexOf(a)}"${jugable ? "" : " disabled"}>${esc(a.edificio ? (a.edificio === "armeria" ? "Subir armería" : "Subir criadero") : (a.etiqueta ?? a.texto ?? "Usar carta"))}</button>`).join("")
            : `<button type="button" class="bw-modal-usar"${puedeUsar ? "" : " disabled"}${opciones.length === 1 ? ` data-accion="${accionesMesa.indexOf(opciones[0])}"` : ""}>Usar carta</button>`}
      </div>
      ${motivo ? `<p class="bw-modal-nota">${esc(motivo)}</p>` : ""}
    </div>
  `;
  document.body.appendChild(fondo);

  fondo.querySelector(".bw-modal-x").addEventListener("click", cerrarCarta);
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrarCarta(); });
  document.addEventListener("keydown", escaparCarta);

  if (jugable) {
    for (const usar of fondo.querySelectorAll(".bw-modal-usar")) {
      usar.addEventListener("click", () => {
        usar.disabled = true;
        usar.textContent = "Usando…";
        const idx = usar.dataset.accion;
        const accion = idx !== undefined && accionesMesa[Number(idx)]
          ? { ...accionesMesa[Number(idx)] }
          : { tipo: "mejorar_bunker", cartaId: d.uid };
        if (usar.dataset.reemplazo) accion.reemplazo = usar.dataset.reemplazo;
        usarCarta(accion, usar);
      });
    }
  }
}

function cerrarCarta() {
  document.getElementById("bw-modal-carta")?.remove();
  document.removeEventListener("keydown", escaparCarta);
}

/* ── Ciencia instalada: sus cartas, en el mismo papel que la carta grande ──
   Caben dos (SLOTS_CIENCIA): se muestran una al lado de la otra, o una sola
   si solo hay una. */
function abrirCiencia() {
  document.getElementById("bw-modal-ciencia")?.remove();
  const cartas = cienciasMesa ?? [];

  const celda = (c) => {
    const t = defsCarta(c);
    return `
      <div class="bw-carta-grande">
        <span class="bw-carta-coste-grande">${c.coste ?? 0}</span>
        <div class="bw-carta-grande-img"><img src="${esc(imgCarta(c.tipo, c.nivel))}" alt=""></div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(t.label)}</div>
          <p class="bw-carta-grande-desc">${conNegritas(c.descripcion)}</p>
        </div>
      </div>`;
  };

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-ciencia";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Ciencia instalada">
      <button type="button" class="bw-modal-x" aria-label="Cerrar">×</button>
      <div class="bw-ciencia-fila${cartas.length > 1 ? " dos" : ""}">
        ${cartas.length
          ? cartas.map(celda).join("")
          : `<p class="bw-modal-nota">Todavía no tienes ninguna ciencia instalada.</p>`}
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  const escapar = (ev) => { if (ev.key === "Escape") { cerrar(); document.removeEventListener("keydown", escapar); } };
  fondo.querySelector(".bw-modal-x").addEventListener("click", cerrar);
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener("keydown", escapar);
}

function abrirEnvio(mon) {
  const opciones = accionesMesa.filter((a) => a.monstruoId === mon.id);
  if (!opciones.length) {
    aviso("Ese monstruo no se puede mover ahora.", { error: true });
    return;
  }

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-envio";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-envio">
      <div class="bw-envio-titulo">Monstruo ${mon.nivel}</div>
      <div class="bw-envio-opciones">
        ${opciones.map((a, i) => `<button type="button" class="bw-envio-op" data-i="${i}">${esc(a.texto ?? "Mover")}</button>`).join("")}
      </div>
      <button type="button" class="bw-envio-cerrar">Cerrar</button>
    </div>
  `;
  document.body.appendChild(fondo);

  fondo.querySelector(".bw-envio-cerrar").addEventListener("click", () => fondo.remove());
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) fondo.remove(); });

  for (const b of fondo.querySelectorAll(".bw-envio-op")) {
    b.addEventListener("click", async () => {
      const accion = opciones[Number(b.dataset.i)];
      if (!accion || !enviarAccion) return;
      b.disabled = true;
      const r = await enviarAccion(accion);
      if (r?.error) {
        aviso(r.error, { error: true });
        b.disabled = false;
        return;
      }
      fondo.remove();
    });
  }
}

function escaparCarta(ev) {
  if (ev.key === "Escape") cerrarCarta();
}

async function usarCarta(accion, boton) {
  if (!enviarAccion) {
    aviso("Sin conexión con la mesa.", { error: true });
    return;
  }
  const etiqueta = boton?.textContent || "Usar carta";
  try {
    const r = await enviarAccion(accion);
    if (r?.error) {
      aviso(r.error, { error: true });
      if (boton) { boton.disabled = false; boton.textContent = etiqueta; }
      return;
    }
    cerrarCarta();
  } catch (e) {
    console.error("Error al usar la carta:", e);
    aviso("No se pudo usar la carta.", { error: true });
    if (boton) { boton.disabled = false; boton.textContent = etiqueta; }
  }
}

function aviso(mensaje, opciones = {}) {
  const container = document.querySelector(".avisos") || document.body;
  const avisoEl = document.createElement("div");
  avisoEl.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 12px 20px;
    background: ${opciones.error ? "#c0392b" : "#3498db"}; color: white;
    border-radius: 6px; z-index: 9999; max-width: 320px; font-size: 14px;`;
  avisoEl.textContent = mensaje;
  container.appendChild(avisoEl);
  setTimeout(() => avisoEl.remove(), 3000);
}

function labelFase(fase) {
  return {
    avance:   "Avanzando monstruos",
    lanzar:   "Lanzar monstruo",
    carta:    "Carta de Destino",
    energia:  "Recogiendo energía",
    acciones: "Acciones",
    descartar:"Descartar",
    fin:      "Partida terminada",
  }[fase] ?? fase ?? "—";
}

/* ── CSS del juego (cabecera, stats, destino, nav, cartas) ──────────────── */

function css() {
  return `<style>
    /* Cabecera — flota sobre la fortaleza */
    .bw-top {
      position:fixed; top:env(safe-area-inset-top, 0px); left:0; right:0; z-index:200;
      display:flex; gap:6px; align-items:center; flex-wrap:wrap;
      padding:8px 12px;
      background:linear-gradient(180deg, rgba(4,9,8,.82) 0%, transparent 100%);
      pointer-events:none; /* que no bloquee taps en la fortaleza */
    }
    .bw-top > * { pointer-events:auto; }
    .bw-luna { font-weight:700; font-size:14px; }
    .bw-luna.roja { color:#e74c3c; }
    .bw-fase { font-size:11px; padding:2px 9px; border-radius:99px;
                background:rgba(10,14,12,.72);
                border:1px solid rgba(244,236,221,.16); }
    .bw-rival { font-size:11px; padding:2px 9px; border-radius:99px;
                 background:rgba(10,14,12,.72);
                 border:1px solid rgba(244,236,221,.16);
                 display:flex; gap:4px; align-items:center; }
    .bw-rival.peligro { background:rgba(194,112,90,.22); color:#ffb4a2; border-color:rgba(194,112,90,.5); }
    .bw-salir { margin-left:auto; padding:3px 10px; border-radius:99px; cursor:pointer;
                font:inherit; font-size:11px; color:#ffb4a2;
                background:rgba(10,14,12,.72); border:1px solid rgba(194,112,90,.45); }
    .bw-salir:hover { background:rgba(194,112,90,.30); }

    /* Carta de Destino */
    .bw-destino { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                  padding:10px 16px; background:rgba(4,9,8,.72);
                  border-bottom:1px solid rgba(244,236,221,.08);
                  position:relative; z-index:20; color:#f4ecdd; }
    .bw-destino.amenaza { border-bottom-color:rgba(194,112,90,.35); background:rgba(194,112,90,.12); }
    .bw-destino.roja    { border-bottom-color:rgba(224,75,58,.45); background:rgba(224,75,58,.16); }
    .bw-destino-tag { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
                      color:#b7a992; }
    .bw-destino-txt { font-size:13px; font-weight:600; flex:1; min-width:200px; }
    .bw-destino-mazo { font-size:11px; color:#b7a992; }

    /* Acciones */
    .bw-acciones { display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 20px;
                   position:relative; z-index:20; }
    .bw-accion { padding:11px 16px; border-radius:5px; font-size:14px;
      font-weight:700; cursor:pointer; border:1px solid rgba(18,22,26,.35);
      background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a; }
    .bw-accion:hover { background:linear-gradient(180deg,#e8edf1,#adb9c3); }
    .bw-accion:disabled { opacity:.45; cursor:default; }

    /* Barra de navegación inferior */
    .bw-nav {
      position:fixed; bottom:0; left:0; right:0; z-index:9000;
      display:flex;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      min-height:56px;
      background:rgba(10,14,12,.96);
      backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
      border-top:1px solid rgba(232,222,200,.14);
    }
    .bw-nav::after {
      content:""; position:absolute; bottom:0; left:0; right:0;
      height:env(safe-area-inset-bottom, 0px);
      background:rgba(10,14,12,.96);
      transform:translateY(100%);
    }
    .bw-nav-tab {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:3px; padding:8px 0 0;
      background:none; border:none; cursor:pointer;
      color:rgba(234,227,211,.38);
      font:600 10px/1 ui-sans-serif,sans-serif;
      transition:color .15s;
      position:relative;
    }
    .bw-nav-tab svg { width:22px; height:22px; }
    .bw-nav-tab.activo { color:rgba(234,227,211,.98); }
    .bw-nav-tab.activo::after {
      content:""; position:absolute; top:0; left:50%; transform:translateX(-50%);
      width:32px; height:3px; background:#e8ddc8; border-radius:0 0 3px 3px;
    }
    .bw-nav-tab:hover { color:rgba(234,227,211,.75); }

    /* Paneles */
    .bw-panel.oculto, .bw-mano-wrap.oculto { display:none !important; }
    .bw-panel {
      border-radius:12px; border:1px solid rgba(244,236,221,.16);
      background:rgba(27,23,19,.95);
      padding:12px; margin:0 16px 10px; color:#f4ecdd;
      position:relative; z-index:20;
    }
    /* Box panel: flota encima del nav */
    .bw-panel.box-panel, .bw-panel.acciones-panel, .bw-panel.manuscritos-panel {
      position:fixed !important;
      bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important;
      left:0 !important; right:0 !important;
      margin:0 !important;
      border-radius:16px 16px 0 0 !important;
      max-height:50vh; overflow-y:auto;
      z-index:290 !important;
    }
    /* Botones de acción del panel: uno por acción legal */
    .bw-acciones { display:grid; gap:6px; }
    .bw-accion-item {
      width:100%; text-align:left; cursor:pointer;
      padding:9px 11px; border-radius:9px;
      font:700 12px/1.25 ui-sans-serif, system-ui, sans-serif;
      color:#f4ecdd; background:rgba(244,236,221,.08);
      border:1px solid rgba(244,236,221,.22);
    }
    .bw-accion-item:active { background:rgba(244,236,221,.2); }
    .bw-accion-item:disabled { opacity:.45; }
    .bw-panel-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
                       color:#b7a992; margin-bottom:10px; }
    .bw-panel-sub { font-weight:400; text-transform:none; letter-spacing:0; }
    .bw-slot-sub { font-size:10px; color:#8b7e6b; }
    .bw-cajas { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .bw-caja-label { font-size:10px; font-weight:800; letter-spacing:.06em;
                     text-transform:uppercase; color:#b7a992; margin-bottom:5px; }
    .bw-box { display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; }
    .bw-box-slot { height:34px; border-radius:8px; display:flex; align-items:center;
                   justify-content:center; font-size:11px; font-weight:800;
                   border:1px dashed rgba(244,236,221,.16); color:#8b7e6b; }
    .bw-box-slot.lleno { border-style:solid; border-color:#4a90d9;
                         background:rgba(74,144,217,.22); color:#8dc0f0; cursor:pointer; }
    .bw-box-slot.lleno:hover { background:rgba(74,144,217,.38); }

    /* Mano de cartas */
    .bw-mano-wrap {
      position:fixed; bottom:calc(56px + env(safe-area-inset-bottom, 0px)); left:0; right:0; z-index:200;
      display:flex; justify-content:center;
      pointer-events:none;
    }
    .bw-mano {
      display:flex;
      gap:10px;
      /* Las cartas sí se tocan, pero el hueco de la fila (por donde suben al
         pulsarlas) no debe tragarse el arrastre del fondo. */
      pointer-events:none;
    }
    .bw-carta {
      pointer-events:auto; cursor:pointer;
      /* Todo lo de dentro va en cqw: la carta se ve igual de grande o de
         pequeña, y lo de dentro escala con ella. */
      container-type:inline-size;
      width:max(80px,21vw); aspect-ratio:1024/1536;
      border-radius:5px;
      background:url('${CARD_BG}') center/100% 100% no-repeat;
      box-shadow:0 8px 20px rgba(0,0,0,.65);
      display:flex; flex-direction:column; align-items:center;
      padding-top:9%; gap:2px;
      color:#2a1808;
      /* Cuánto queda metida la carta bajo el menú: 54 % → 45 % → 39 % → 33 %
         → 43 % → 38 % → 43 % (los 5 puntos de abajo que faltaban). */
      transform:translateY(43%);
      transition:transform .18s ease, box-shadow .18s ease;
      position:relative; user-select:none;
    }
    /* Todas las cartas suben igual al pulsarlas, aunque no te llegue para
       jugarla: la animación no depende de si la carta es jugable. */
    .bw-carta:hover, .bw-carta:active {
      /* Al pulsarla sube solo un 5 % del alto, para que no dé un salto */
      transform:translateY(33%); box-shadow:0 14px 28px rgba(0,0,0,.8);
    }
    .bw-carta.descartable { outline:2px solid rgba(224,83,63,.7); }
    .bw-carta .bw-carta-coste {
      position:absolute; top:calc(3.5% - 2px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 8.5cqw/1 ui-serif,serif;
      color:#7a1010;
    }
    .bw-carta .bw-carta-img {
      order:2;
      /* 26 % → 34 % → 41 % → 49,2 % (+20 % sobre 41): el dibujo es cuadrado y
         el alto es lo que lo limita, así que subir el alto un 20 % lo agranda
         un 20 % sin tocar el ancho, que ya sobra.
         Sin transform, porque un transform aquí aísla al <img> y el
         mix-blend-mode:multiply deja de fundirse con el papel de la carta. */
      flex:0 0 49.2%; width:91%;
      margin-top:3px;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
      /* Los mismos 12 px que el título, con la misma técnica (solo pintura),
         para no repetir el transform que rompía el multiply del dibujo. */
      position:relative; top:8.5cqw;
    }
    .bw-carta .bw-carta-img img {
      width:100%; height:100%; object-fit:contain;
      mix-blend-mode:multiply;
    }
    .bw-carta .bw-carta-nombre {
      order:1;
      width:100%; text-align:center;
      font:700 calc(9.8cqw - 2px)/1.2 ui-serif,serif;
      color:#2a1808; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      /* −17 px sobre una carta de 82 px de ancho: en % del ancho, para que
         suba lo mismo en cualquier tamaño. */
      margin-top:-20.7cqw;
      /* 12 px más abajo dentro de la carta (14.6 cqw a 82 px de ancho), menos
         los 5 px que sube ahora (6.1 cqw): queda en 8.5 cqw. Se mueve sin
         tocar el reparto del flex, así que ni el título ni el dibujo cambian
         de tamaño ni empujan nada. */
      position:relative; top:8.5cqw;
    }

    /* Modal carta ampliada */
    .bw-modal-fondo {
      position:fixed; inset:0; background:rgba(0,0,0,.65);
      display:flex; align-items:center; justify-content:center;
      z-index:1000; padding:20px;
    }
    .bw-modal { position:relative; display:flex; flex-direction:column; align-items:center; gap:14px; }
    /* Cerrar: una X arriba a la derecha, fuera de la fila de botones */
    .bw-modal-x {
      position:absolute; top:-34px; right:-34px; z-index:5;
      width:32px; height:32px; border-radius:50%;
      display:grid; place-items:center; cursor:pointer;
      border:1px solid rgba(244,236,221,.28); background:rgba(18,16,14,.94);
      color:#f4ecdd; font:700 18px/1 ui-sans-serif,system-ui,sans-serif;
    }
    .bw-carta-grande {
      /* Carta de papel de los modales: todo lo de dentro en cqw, para que la
         de descarte (más pequeña) salga idéntica en proporciones. */
      container-type:inline-size;
      width:min(58vw,230px); aspect-ratio:1024/1536;
      border-radius:9px;
      background:url('${CARD_BG}') center/100% 100% no-repeat;
      box-shadow:0 24px 60px rgba(0,0,0,.9);
      display:grid;
      grid-template-rows:54% 1fr;
      padding:7% 9% 7%;
      color:#2a1808;
      position:relative;
      animation:bwCartaAbre .18s ease;
    }
    @keyframes bwCartaAbre { from { opacity:0; transform:scale(.9) translateY(10px); } to { opacity:1; transform:none; } }
    /* Ciencia instalada: una o dos cartas, una al lado de la otra. Con dos se
       estrechan para que quepan de sobra en el móvil. */
    .bw-ciencia-fila { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .bw-ciencia-fila.dos .bw-carta-grande { width: min(42vw, 172px); }
    .bw-carta-coste-grande {
      position:absolute; top:calc(3.5% - 5px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 8.5cqw/1 ui-serif,serif; color:#7a1010;
    }
    /* Sin energía para pagarla: el número de coste en rojo intenso con sombra */
    .bw-carta-coste-grande.sin-energia {
      color:#e81010;
      text-shadow:0 0 4px #000, 0 1px 3px #000, 0 2px 6px rgba(0,0,0,.7);
    }
    .bw-carta-grande-img {
      border-radius:3px; overflow:visible;
      display:flex; align-items:center; justify-content:center;
    }
    .bw-carta-grande-img img {
      width:85%; height:85%; object-fit:contain;
      mix-blend-mode:multiply; transform:translateY(11.7cqw);
    }
    .bw-carta-grande-texto {
      display:flex; flex-direction:column; justify-content:flex-start;
      gap:2.6cqw; padding-top:4%; margin-top:15.9cqw;
    }
    .bw-carta-grande-titulo { font:700 8.5cqw/1.3 ui-serif,serif; color:#7a1010; text-align:center; }
    /* Descripción de las cartas del modal: la tipografía plana que hicimos
       para la carta de Destino (sin serif, peso normal, poco aire) */
    .bw-carta-grande-desc {
      margin:2.1cqw 0 0; padding:0;
      font-family:inherit; font-weight:400;
      font-size:6.8cqw; line-height:1.35;
      letter-spacing:.02em;
      -webkit-font-smoothing:auto;
      color:#3a2010; text-align:center;
    }
    /* El relato, 2 px más pegado al titular */
    .bw-destino-grande .bw-carta-grande-desc { margin-top:calc(2.1cqw - 2px); }
    /* Centrados y por encima de la carta, que si no les tapa la mitad */
    .bw-modal-acciones { display:flex; justify-content:center; gap:10px; position:relative; z-index:3; }
    .bw-modal-acciones button {
      padding:0 24px; min-height:38px; border-radius:5px;
      font-size:14px; font-weight:800; cursor:pointer; border:none;
    }
    /* Misma tipografía que el título de las cartas (ui-serif, 700) */
    .bw-modal-acciones button.bw-modal-usar {
      font-family:ui-serif, serif; font-weight:700;
    }
    .bw-modal-usar { background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a; }
    /* Deshabilitado: oscuro y opaco. Con opacidad se transparentaba lo de
       detrás y no se leía el estado. */
    .bw-modal-usar:disabled {
      background:#1d2126; color:#6f7783;
      box-shadow:inset 0 0 0 1px rgba(244,236,221,.14);
      cursor:not-allowed;
    }

    /* Carta de Destino: papel azul propio. La imagen va en el hueco de arriba,
       la etiqueta en la banda del centro y el texto debajo de la raya. */
    .bw-destino-grande {
      display:block; padding:0;
      background:url('${BASE_IMG}/destiny.png') center / 100% 100% no-repeat;
    }
    .bw-destino-grande .bw-carta-grande-img {
      position:absolute; left:13%; right:13%; top:calc(7% + 13px); height:37%;
    }
    /* El dibujo ya viene en azul y sin fondo (cartas/azul): un 10 % más
       pequeño, sin filtro ni velo sobre el papel. */
    .bw-destino-grande .bw-carta-grande-img img {
      width:100%; height:100%;
      transform:scale(.9); transform-origin:center center;
    }
    .bw-destino-etiqueta {
      position:absolute; left:6%; right:6%; top:calc(49% + 19px);
      text-align:center; color:#2c4d7d;
    }
    .bw-destino-grande .bw-carta-grande-texto {
      position:absolute; left:9%; right:9%; top:calc(63% - 5px); bottom:4%;
      margin:0; padding:0; gap:2cqw;
    }
    /* Cabe el relato y la regla en el hueco de abajo */
    .bw-destino-grande .bw-carta-grande-desc { font-size:5.2cqw; }
    /* El titular también en azul, no en el rojo de las cartas de búnker, y
       4 px más abajo para que respire respecto a la raya. Dos puntos de letra
       menos: iba enorme. */
    .bw-destino-grande .bw-carta-grande-titulo {
      color:#1a3560;
      /* 11 px = los 4 de antes más 7 que lo baja */
      margin-top:11px;
      font-size:calc(8.5cqw - 3px);
    }
    /* El relato con la MISMA tipografía que la etiqueta «Carta de Destino»:
       la sans del cuerpo (plana, sin serif), en minúsculas normales. */
    .bw-destino-grande .bw-carta-grande-desc {
      /* Azul más oscuro que el del titular: el relato va sobre papel claro y
         necesita más contraste para leerse de un tirón */
      color:#1e3a60; font-weight:400;
      /* La app pinta con antialiased, que en Retina deja la letra fina: aquí
         se vuelve al suavizado normal para que el relato no parezca light. */
      -webkit-font-smoothing:auto;
      font-family:inherit;
      /* El .1em de la etiqueta solo sirve para dos palabras en mayúsculas:
         en un párrafo separa las letras dentro de cada palabra y no se lee. */
      letter-spacing:.02em; text-transform:none;
      font-size:calc(4.8cqw + 0.5px); line-height:1.28;
    }
    /* El tipo de monstruo, en negrita dentro del relato */
    .bw-destino-grande .bw-carta-grande-desc strong { font-weight:800; }

    /* ── Manuscritos ── */
    .man-sec { margin-bottom:14px; }
    .man-sec:last-child { margin-bottom:2px; }
    .man-tit {
      font:700 12px/1.2 ui-serif,serif; color:#e8d9b8;
      letter-spacing:.06em; text-transform:uppercase;
      margin:0 0 6px; padding-bottom:4px;
      border-bottom:1px solid rgba(244,236,221,.14);
    }
    .man-fila {
      display:grid; grid-template-columns:1fr auto auto; gap:10px;
      font-size:12px; line-height:1.35; padding:3px 0; color:#d8cdb8;
    }
    .man-fila:nth-of-type(even) { background:rgba(244,236,221,.05); }
    .man-b { color:#b7a992; font-weight:700; text-align:right; white-space:nowrap; }
    .man-c { color:#8b7e6b; text-align:right; white-space:nowrap; min-width:64px; }
    .man-p { margin:6px 0 0; font-size:11.5px; line-height:1.45; color:#c2b6a0; }

    /* ── Modal de descarte: las cartas de papel del modal de una, en 2×2 ── */
    .bw-desc-modal { width:min(90vw,400px); }
    .bw-desc-tit {
      font:800 15px/1.2 ui-serif,serif; color:#f4ecdd; text-align:center;
      letter-spacing:.07em; text-transform:uppercase;
      text-shadow:0 2px 10px rgba(0,0,0,.95);
    }
    .bw-desc-grid {
      /* Ancho tope para que las cuatro quepan de alto, y flex en vez de grid:
         si quedan 3 cartas, la tercera se centra en su propia fila. */
      display:flex; flex-wrap:wrap; justify-content:center; align-items:flex-start;
      gap:12px; width:100%; max-width:330px; margin:0 auto;
    }
    .bw-desc-celda {
      display:block; padding:0; border:none; background:none; cursor:pointer;
      position:relative; flex:0 0 calc(50% - 6px);
    }
    .bw-desc-celda .bw-carta-grande {
      /* border-box: sin esto el padding del 9 % se suma al ancho y la carta se
         sale de su hueco del grid. */
      box-sizing:border-box;
      width:100%; pointer-events:none; animation:none;
      box-shadow:0 10px 24px rgba(0,0,0,.72);
    }
    .bw-desc-celda.sel .bw-carta-grande { outline:2px solid #e0a33f; outline-offset:2px; }
    .bw-desc-celda.sel::after {
      content:"✓"; position:absolute; top:-7px; right:-7px;
      width:22px; height:22px; border-radius:50%;
      background:#e0a33f; color:#20140a;
      display:grid; place-items:center; font-size:13px; font-weight:900;
      box-shadow:0 2px 6px rgba(0,0,0,.6);
    }
    .bw-desc-celda .bw-carta-coste-grande { top:calc(3.5% - 2px); }
    .bw-desc-nota {
      margin:0; min-height:14px; text-align:center;
      font-size:11px; line-height:1.35; color:#e0a33f;
      text-shadow:0 2px 8px rgba(0,0,0,.9);
    }

    /* ── Modal de lanzadera ── */
    .bw-lz {
      width:min(92vw,420px); max-height:80vh; overflow:auto;
      background:linear-gradient(180deg,#20242a,#14181d);
      border:1px solid rgba(244,236,221,.16); border-radius:12px;
      padding:14px; color:#f4ecdd;
      display:flex; flex-direction:column; gap:10px;
    }
    .bw-lz-tit { font:800 16px/1.2 ui-serif,serif; text-align:center; }
    .bw-lz-sub { margin:0; font-size:12px; color:#b7a992; text-align:center; }
    .bw-lz-lista { display:flex; flex-direction:column; gap:8px; }
    .bw-lz-rival {
      display:flex; flex-direction:column; gap:6px; text-align:left;
      padding:10px; border-radius:10px; cursor:pointer; font:inherit;
      background:rgba(244,236,221,.06); border:1px solid rgba(244,236,221,.16);
      color:#f4ecdd;
    }
    .bw-lz-rival:active { background:rgba(244,236,221,.18); }
    .bw-lz-cab { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:14px; }
    .bw-lz-vida { font-size:12px; color:#e0533f; }
    .bw-lz-calles { display:flex; flex-direction:column; gap:4px; }
    .bw-lz-calle { display:flex; align-items:center; gap:4px; }
    .bw-lz-cid { font-size:10px; font-weight:800; color:#8b7e6b; width:18px; }
    .bw-lz-cas {
      width:18px; height:18px; border-radius:4px; font-style:normal;
      display:grid; place-items:center; font-size:10px; font-weight:800;
      background:rgba(0,0,0,.35); border:1px dashed rgba(244,236,221,.18); color:#7f7466;
    }
    .bw-lz-cas.at { border-style:solid; border-color:#8a5cd6; background:rgba(138,92,214,.3); color:#e6dcff; }
    .bw-lz-torre { margin-left:auto; font-size:10px; font-weight:800; color:#c9a227; }
    .bw-lz-pie { display:flex; justify-content:center; gap:10px; }
    .bw-lz-camino {
      padding:12px; border-radius:8px; border:none; cursor:pointer;
      font:800 13px/1 ui-serif,serif;
      background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a;
    }
    .bw-lz-atras {
      padding:0 20px; min-height:36px; border-radius:5px; cursor:pointer;
      font:800 13px/1 ui-serif,serif; border:none;
      background:rgba(244,236,221,.14); color:#f4ecdd;
    }

    /* Modal envío */
    /* Pie del modal: por qué no se puede usar la carta */
    .bw-modal-nota {
      /* Colgada debajo del modal y fuera del flujo: al salir no empuja la carta
         hacia arriba, simplemente aparece en el hueco de abajo */
      position:absolute; top:calc(100% + 10px); left:50%; transform:translateX(-50%);
      margin:0; padding:9px 12px; border-radius:10px;
      background:rgba(18,16,14,.92); border:1px solid rgba(244,236,221,.12);
      font-size:12.5px; line-height:1.4; text-align:center;
      /* 60 % del ancho de la pantalla: con el tope de 230 px salía estrecho. */
      width:60vw; max-width:none; box-sizing:border-box;
      color:#b7a992;
    }

    .bw-envio { width:min(340px,92vw); background:#f4ecdd; color:#12100e;
                border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px;
                box-shadow:0 18px 50px rgba(0,0,0,.45); }
    .bw-envio-titulo { font-size:17px; font-weight:800; text-align:center; }
    .bw-envio-opciones { display:flex; flex-direction:column; gap:7px; }
    .bw-envio-op { padding:11px 12px; border-radius:9px; font-size:14px; font-weight:700;
                   cursor:pointer; border:1px solid rgba(18,16,14,.25);
                   background:#fff; color:#12100e; text-align:left; }
    .bw-envio-op:hover { background:#d6dee5; }
    .bw-envio-op:disabled { opacity:.5; cursor:default; }
    .bw-envio-cerrar { padding:11px 12px; border-radius:9px; font-size:14px; font-weight:800;
                       cursor:pointer; border:none; background:#12100e; color:#f4ecdd; }
  </style>`;
}

/* ── CSS adicional: el demo completo + overrides de la app ──────────────── */

function cssAdicional() {
  return `<style>
    /* ── Full-screen takeover ── */
    html:has(body.bw-himalaya), body.bw-himalaya {
      /* Negro puro: es el color que asoma en la franja del safe-area de abajo */
      background: #000 !important; padding:0 !important; margin:0 !important;
      /* Una sola columna a la altura real de la pantalla (dvh sigue a la barra
         del navegador): barra arriba, escenario en medio, menú al final. Nada
         va fixed abajo, así que el menú no puede quedarse flotando. */
      height: 100% !important; overflow: hidden !important;
      overscroll-behavior: none !important;
    }
    body.bw-himalaya {
      display: flex !important;
      flex-direction: column !important;
      /* 100% del documento, no 100dvh: en la PWA instalada el dvh se queda
         corto y por eso quedaba franja negra entre el menú y el borde. */
      height: 100% !important;
      min-height: 100% !important;
    }
    body.bw-himalaya .fondo { display: none !important; }
    body.bw-himalaya .barra {
      position: relative !important; top: auto !important;
      left: auto !important; right: auto !important; bottom: auto !important;
      flex: 0 0 auto !important; width: 100% !important;
      padding-top: env(safe-area-inset-top, 0px) !important;
    }
    body.bw-himalaya #pantalla {
      /* Segunda fila de la columna: ocupa todo el hueco que dejan barra y menú.
         Ya no se calcula con 29/56 ni con safe-areas, así que no puede sobrar
         ni faltar nada (ese sobrante era el negro de abajo). */
      position: relative !important;
      top: auto !important; left: auto !important; right: auto !important; bottom: auto !important;
      flex: 1 1 auto !important;
      min-height: 0 !important;
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: none !important;
      z-index: 1 !important;
      background: transparent !important;
    }
    /* Nada dentro del juego debe quedar acotado a 560px */
    body.bw-himalaya #pantalla * { max-width: none; box-sizing: border-box; }
    /* El aviso de turno de la plataforma deja de empujar la escena hacia abajo:
       pasa a pastilla fija sobre el mapa, como los chips del demo. */
    body.bw-himalaya .turno-aviso {
      position: fixed !important;
      /* Debajo del marco: 33 px del alto + el marco completo */
      top: calc(env(safe-area-inset-top, 0px) + 59px + min(66.1vw, 354px)) !important;
      left: 50% !important; right: auto !important; bottom: auto !important;
      transform: translateX(-50%) !important;
      margin: 0 !important; width: auto !important; max-width: 86vw !important;
      padding: 3px 10px !important; border-radius: 999px !important;
      font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif !important;
      white-space: nowrap !important; overflow: hidden !important;
      text-overflow: ellipsis !important;
      z-index: 15 !important; pointer-events: none !important;
      background: rgba(0,0,0,.62) !important;
      border: 1px solid rgba(255,255,255,.18) !important;
      backdrop-filter: blur(6px) !important; -webkit-backdrop-filter: blur(6px) !important;
      box-shadow: none !important;
    }

    /* El menú ya rellena su safe-area con padding: el ::after que se salía por
       debajo sólo añadía una banda oscura tras el footer. */
    body.bw-himalaya .bw-nav::after { display: none !important; }
    body.bw-himalaya .bw-nav {
      /* Última fila de la columna, en el flujo: pegado al borde inferior por
         construcción, sin safe-area ni ::after que dejen franja negra. */
      position: relative !important;
      bottom: auto !important; left: auto !important; right: auto !important; top: auto !important;
      flex: 0 0 auto !important;
      /* margin-top:auto lo empuja al fondo de la columna aunque el escenario
         venga corto: no depende de que los altos cuadren. */
      margin-top: auto !important;
      width: 100% !important;
      height: 34px !important; min-height: 34px !important;
      padding-bottom: 0 !important;
      /* Negro total, sin transparencia ni desenfoque detras */
      background: #000 !important;
      backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
    }
    body.bw-himalaya .bw-nav-tab { padding: 0 !important; gap: 0 !important; font-size: 11px !important; }
    /* 34 px = alto del menú (antes 56, con iconos): si no se mide, la mano se
       queda justo encima de él en vez de flotar 22 px más arriba. */
    body.bw-himalaya .bw-mano-wrap { bottom: var(--alto-nav, 34px) !important; }
    /* Ribete de piedra justo encima del menú: es el borde del que salen las
       cartas. Va dentro del contenedor de la mano (mismo borde inferior) y por
       encima de las cartas, que asoman por detrás. */
    body.bw-himalaya .bw-mano-wrap::after {
      content:"";
      position:absolute; left:0; right:0; bottom:-3px;
      height:10px;
      background:url('${BASE_IMG}/ribete.png') left bottom / auto 100% repeat-x;
      pointer-events:none;
      z-index:3;
    }
    body.bw-himalaya .bw-panel.box-panel, body.bw-himalaya .bw-panel.acciones-panel,
    body.bw-himalaya .bw-panel.manuscritos-panel {
      bottom: var(--alto-nav, 34px) !important;
      /* Mismo negro que la barra del menú */
      background: #000 !important;
    }

    /* ── Barra de información del turno ──
       Del borde izquierdo (donde empiezan las monedas) hasta la derecha de la
       pantalla, 50 px de alto y el mismo fondo translúcido que los datos. */
    /* Marco de piedra con tejado tibetano: la barra entera es el marco y todo
       lo del turno va dentro del panel de pergamino (ver .bw-hud-caja). */
    .bw-hud {
      /* 3:1 como el arte, al 90 % del ancho y centrado. Va dentro de la escena
         (no fijo): así sube y baja con el castillo al hacer scroll. */
      position: absolute; left: 50%; transform: translateX(-50%);
      width: min(90%, 520px);
      /* 20 px más abajo que el borde de la escena (antes 6). */
      top: 26px;
      z-index: 16; box-sizing: border-box; pointer-events: none;
      /* El marco nuevo: 2172 × 1477, con el pergamino grande abajo y una
         franja de papel arriba para lo que venga. El pequeño (marco.png)
         sigue siendo el del aviso de versión nueva. */
      aspect-ratio: 2172 / 1477;
      background: url('${BASE_IMG}/marco-new.png') center / 100% 100% no-repeat;
      /* Contenedor propio: lo de dentro se mide en cqw (1 % del ancho del
         marco), que es el único ancho honesto aquí — el marco es min(90%,
         520px) y con vw se descuadraría en escritorio al salir la barra. */
      container-type: inline-size;
    }
    /* Banda de papel de arriba del marco (del 16,4 % al 27 % del alto): el
       aviso de turno y, justo debajo, los cuadraditos de la barrita. */
    .bw-hud-aviso {
      position: absolute; left: 23.5cqw; right: 23.3cqw;
      top: 16.5%; height: 10.3%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end;
      gap: .7cqw; pointer-events: none;
      /* Aire dentro de la franja amarilla del turno: 0,3 % arriba y abajo y
         1 % a los lados del propio marco. */
      padding: 0.3% 1%;
    }
    .bw-hud-aviso-texto {
      font: 700 2.6cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #7a1010; letter-spacing: .02em; white-space: nowrap;
      margin-bottom: .4cqw;
    }
    /* Los cuadraditos del turno, dentro del aviso: más cortos que la franja del
       fondo del pergamino y con el ancho del marco como unidad. */
    .bw-hud-aviso .bw-hud-turnos { width: 100%; height: 1.3cqw; gap: .6cqw; }
    .bw-hud-aviso .bw-turno {
      height: 100%; border-radius: 1cqw; border-width: .45cqw;
    }
    .bw-hud-aviso .bw-turno:not(.activo) { border-width: 1px; }

    /* Hueco interior del marco, en % del propio marco: deja fuera tejado,
       banderines, columnas y peana. */
    .bw-hud-caja {
      position: absolute;
      /* Hueco del pergamino grande medido sobre el marco de 2172 × 1477: el
         papel va del 11,4 % al 88,6 % de ancho y del 40,9 % al 79,4 % de
         alto. La caja se queda dentro: 11,5 % / 11 % de ancho y 40,9 % /
         23,3 % de alto (acaba 2,6 puntos antes del filo de abajo). */
      left: 11.5%; right: 11%; top: 40.9%; bottom: 20.5%;
      display: flex; flex-direction: column;
      justify-content: center; gap: .4cqw;
      padding: 2%; overflow: hidden;
    }

    /* ── La fortaleza de un vistazo ──
       Dos filas: arriba tres huecos iguales —producción, vida y edificios— y
       debajo una entera con la luna y la franja de turnos. */
    .bw-hud-cuerpo {
      display: flex; flex-direction: column; justify-content: flex-start;
      gap: 1.5cqw; min-width: 0;
      /* Ocupa todo el hueco del pergamino: así la fila del escudo puede crecer
         y los slots quedan pegados al padding de abajo. */
      flex: 1 1 auto;
    }
    .bw-hud-caja img { display: block; object-fit: contain; }

    /* Fila de arriba: monedas a la izquierda, vida en el centro y decretos a
       la derecha. */
    .bw-hud-fila { display: grid; align-items: center; min-width: 0; }
    .bw-hud-fila.arriba {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      /* Crece hasta el padding de arriba y empuja armería/ciencia/criadero
         contra el de abajo. */
      flex: 1 1 auto;
    }
    .bw-hud-fila.arriba > .bw-hud-celda.izq  { grid-column: 1; }
    .bw-hud-fila.arriba > .bw-hud-vida       { grid-column: 2 / 4; }
    .bw-hud-fila.arriba > .bw-hud-celda.der  { grid-column: 4; }
    .bw-hud-celda { display: flex; justify-content: center; min-width: 0; }
    /* Fila del medio: cuatro columnas. Armería en la primera, la ciencia
       ocupando las dos del centro y el criadero en la última. */
    /* Fila del medio: cuatro columnas. Armería en la primera, la ciencia
       ocupando las dos del centro y el criadero en la última. La fila se
       hace un 10% más ancha para dar respiro a los puntos y que la
       separación coincida con la de la fortaleza. */
    .bw-hud-fila.medio { grid-template-columns: repeat(4, minmax(0, 1.1fr)); gap: .7cqw; }
    .bw-hud-fila.medio > .bw-edif:nth-child(1) { grid-column: 1; }
    .bw-hud-fila.medio > .bw-edif-ciencia    { grid-column: 2 / 4; }
    .bw-hud-fila.medio > .bw-edif:nth-child(3) { grid-column: 4; }

    /* producción: icono y «6 por luna nueva» */
    .bw-hud-prod { display: flex; flex-direction: column; gap: .6cqw; min-width: 0; }
    /* El recurso va en columna y centrado: icono, la cifra y, debajo, «por
       ciclo» (antes decía «por luna nueva»). */
    .bw-hud-celda .bw-rec {
      flex-direction: column; align-items: center; gap: .2cqw; min-width: 0;
      margin-inline: auto;
    }
    .bw-hud-celda .bw-rec b { display: flex; align-items: baseline; gap: .2cqw; }
    .bw-rec { display: flex; align-items: center; gap: .8cqw; min-width: 0; }
    .bw-rec img { width: 3.5cqw; height: 3.5cqw; flex: 0 0 auto; object-fit: contain; }
    /* Todo el texto del resumen va en el rojo de los puntos y en la serif de
       las cartas. */
    .bw-rec b {
      font: 700 3cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #7a1010;
    }
    .bw-rec em {
      font-style: normal; color: rgba(122, 16, 16, .85); white-space: nowrap;
      font: 600 2.4cqw/1 ui-serif, Georgia, "Times New Roman", serif;
    }

    /* vida en el centro */
    .bw-hud-vida { display: flex; flex-direction: column; align-items: center; gap: .2cqw; }
    .bw-hud-vida img { width: 5.4cqw; height: 5.4cqw; object-fit: contain; }
    .bw-hud-vida b {
      font: 700 3cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #7a1010; white-space: nowrap;
    }

    /* edificios: icono, nombre y puntos de nivel en rojo. En la fila del medio
       son cuatro y van apilados (icono, nombre, puntos) para que quepan. */
    .bw-hud-edif { display: flex; flex-direction: column; gap: .6cqw; min-width: 0; }
    .bw-edif { display: flex; align-items: center; gap: .6cqw; min-width: 0; }
    /* Los cuatro huecos de la fortaleza: sin icono, cada uno en su caja roja
       de esquinas redondeadas con el texto en blanco roto. */
    .bw-hud-fila.medio .bw-edif {
      flex-direction: column; justify-content: center; gap: .8cqw; min-width: 0;
      background: #7a1010; border-radius: 1cqw;
      /* 10 % más alta que antes (1,6 / 1,7 → 1,76 / 1,87). */
      padding: 1.76cqw .6cqw 1.87cqw;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
    }
    .bw-hud-fila.medio .bw-edif-nombre { color: #f4ecdd; }
    /* La ciencia es un botón (abre sus cartas): sin borde ni fuente de sistema. */
    .bw-edif-ciencia {
      font: inherit; color: inherit; -webkit-appearance: none; appearance: none;
      border: 0; cursor: pointer;
    }
    .bw-edif-ciencia:active { filter: brightness(1.18); }
    .bw-hud-fila.medio .bw-edif-valor  { color: #f4ecdd; }
    /* Dentro de la caja roja los puntos van en blanco roto: relleno si el nivel
       está conseguido, solo el aro si no. */
    .bw-hud-fila.medio .bw-edif-puntos { margin-left: 0; }
    .bw-hud-fila.medio .bw-edif-puntos i { border-color: rgba(244, 236, 221, .65); }
    .bw-hud-fila.medio .bw-edif-puntos i.llena {
      background: #f4ecdd; border-color: #f4ecdd;
    }
    .bw-edif-valor {
      font: 700 2.2cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #7a1010; white-space: nowrap;
    }
    .bw-edif img { width: 2.5cqw; height: 2.5cqw; flex: 0 0 auto; }
    .bw-edif-nombre {
      font: 600 2.2cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #7a1010; white-space: nowrap;
    }
    /* En cqw (1 % del ancho del marco): antes iba en var(--u) sin calc(), que
       es CSS inválido y dejaba los puntos sin tamaño. */
    .bw-edif-puntos { display: flex; gap: .6cqw; margin-left: .5cqw; }
    .bw-edif-puntos i {
      box-sizing: border-box;
      /* 20 % menos que 2cqw (2 × 0,8 = 1,6cqw). */
      width: 1.6cqw; height: 1.6cqw; border-radius: 50%;
      border: 1px solid rgba(122, 16, 16, .55); background: transparent;
    }
    .bw-edif-puntos i.llena { background: #7a1010; border-color: #7a1010; }

    /* ── Antes aquí iba el bloque temporal de colores de depuración. fuera. */

    /* fila entera de abajo: la franja de turnos, dentro del padding como el
       resto (los márgenes negativos la sacaban fuera del papel por los lados). */
    .bw-hud-pie {
      grid-column: 1 / -1; flex: 0 0 auto;
      display: flex; align-items: center; gap: 1.2cqw;
      margin: 0;
    }
    .bw-hud-pie .bw-luna { width: 2.3cqw; height: 2.3cqw; flex: 0 0 auto; }
    .bw-hud-pie .bw-hud-turnos { flex: 1; }
    /* Pilas en la fortaleza: media talla (28 px, antes 56) y encogiendo con
       el mapa, para que en un móvil pequeño no se coman la peana. El alto va
       en proporción (height:auto). El desplazamiento vive en la caja para que
       la pila y su nombre suban juntos. */
    .fort-pila-caja { position:relative; }
    /* +4 px las monedas y +2 px los decretos sobre lo que había (−22 / −19),
       descontando los 3 px que sube la columna al encoger el círculo. */
    .fort-pila-caja.coins   { transform: translateY(calc(-5.9 * var(--u))); }
    .fort-pila-caja.decrees { transform: translateY(calc(-4.6 * var(--u))); }
    /* Todo en --u (1 % del ancho del mundo) para que pilas, círculos y huecos
       crezcan con la imagen de la fortaleza al girar el móvil. */
    .fort-pila { width: calc(8.6 * var(--u)); height: auto; display: block; margin: calc(.5 * var(--u)) auto 0; filter: drop-shadow(0 6px 12px rgba(0,0,0,.85)); }
    /* El nombre, colgando justo debajo de la pila y en el color de su moneda. */
    .fort-nombre {
      position:absolute; top:100%; left:50%; transform:translateX(-50%);
      /* Bajada desde el borde de la pila: 1 px de aire + 5 px + 10 px. Con
         top:100%, el margen positivo baja el tag; el negativo lo sube. */
      margin-top:calc(4.1 * var(--u)); white-space:nowrap;
      /* La tipografía plana de la carta de Destino: la del cuerpo, sin serif,
         en peso 500 (un punto por encima del normal, sin llegar a la negrita). */
      font-family:inherit; font-weight:500;
      font-size:calc(2.3 * var(--u)); line-height:1; letter-spacing:.02em;
      /* Mismo modelo que los círculos de camino: flex centrado, sin borde, el
         relleno de arriba que corrige la métrica y la misma altura que ellos. */
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; text-align:center;
      min-height:calc(4.95 * var(--u));
      /* El relleno va abajo, no arriba, y a media subida: con el .9u completo
         la letra se pasaba de alta. */
      padding:0 calc(1.8 * var(--u)) calc(.45 * var(--u)); border-radius:999px;
      /* Fondo del color del tipo (rojo / dorado oscuro) al 80 % y texto blanco. */
      color:#fff;
      border:0;
      text-shadow:none;
    }
    /* Pill del nombre: decretos en el rojo corporativo, monedas en dorado
       oscuro. Texto blanco en las dos. */
    .fort-plat.energia .fort-nombre { background:rgba(138,106,26,.8); }  /* monedas: dorado oscuro */
    .fort-plat.vida    .fort-nombre { background:rgba(122,16,16,.8); }  /* decretos: rojo */
    /* La pila de monedas sube 5 px más que la de decretos: el nombre compensa
       esos 5 px para que los dos textos queden a la misma altura. */
    .fort-pila-caja.coins .fort-nombre { margin-top:calc(5.4 * var(--u)); }
    /* Grid de turnos: una barra larga por jugador al fondo del marco. La del
       jugador en curso va rellena de rojo; las demás, solo con el borde. */
    .bw-hud-turnos { display: grid; gap: 3px; height: 6px; }
    .bw-turno {
      box-sizing: border-box; height: 6px; border-radius: 3px;
      padding: 0; background: transparent;
      border: 1.5px solid #7a1010;
    }
    .bw-turno.activo { background: #7a1010; }
    /* Dentro de la barra los datos no llevan pastilla propia: manda el fondo de
       la barra. */
    /* Dentro del pergamino el texto va en tinta oscura: los chips pierden su
       pastilla y su sombra. */
    .bw-hud .bw-hud-chip {
      background: transparent; border: 0; padding: 0;
      color: #2a2018; text-shadow: none;
    }
    .bw-hud-chip {
      display: inline-flex; align-items: baseline; gap: 3px;
      font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; color: #fff;
      background: rgba(0,0,0,.74); border: 1px solid rgba(255,255,255,.22);
      border-radius: 999px; padding: 3px 8px;
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      text-shadow: 0 1px 2px rgba(0,0,0,.75);
    }
    .bw-hud-chip i { font-style: normal; font-weight: 600; opacity: .62 }
    .bw-hud-chip em { font-style: normal; font-weight: 600; letter-spacing: .01em; opacity: .8 }

    /* ── Variables del demo ── */
    :root {
      --tinta:#050b0a;
      --suelo:#1d2c24;
      --losa:#2c3d34;
      --borde:rgba(232,222,200,.14);
      --laton:#b9c3cc;
      --texto:#eae3d3;
      --apagado:rgba(234,227,211,.55);
      --azul:#4a90d9;
      --rojo:#e0533f;
      --morado:#9b59b6;
    }

    /* ── Cielo fijo (el div #bw-cielo-global lleva class="cielo") ── */
    .cielo {
      position:fixed; inset:0; z-index:0; pointer-events:none;
      background:
        radial-gradient(60% 30% at 50% 6%, rgba(140,180,200,.10), transparent 70%),
        linear-gradient(180deg, rgba(5,11,10,.10) 0%, rgba(3,7,7,.34) 55%, rgba(4,9,8,.72) 100%),
        radial-gradient(90% 50% at 50% 0%, #10201a 0%, #081210 55%, #040908 100%);
    }

    /* ── Escena ── */
    .escena { position:relative; z-index:1; padding-bottom:0; }

    /* ── Claro ── */
    .mundo {
      position:relative;
      width:100%;
      container-type:inline-size;
      /* Único mando del aire entre el marco y el castillo. Lo usan el bloque
         del mapa y el tablero (fichas, lanzaderas, torres): así los círculos
         de las escaleras se mueven siempre con la imagen. */
      /* El marco, en medidas reutilizables: 90 % del ancho del mundo (el mismo
         ancho que usa su regla: 90 % del contenedor) con tope de 520 px, y su
         alto según el arte 2172 × 1477. Va en --u (1 % del ancho del mundo) y
         no en vw: con barra de scroll el 90 % del contenedor y el 90 vw no
         miden lo mismo —la barra entra en vw y no en el %—, y el marco se
         quedaba más estrecho que su alto calculado: todo se descuadraba al
         cambiar el ancho de la ventana. */
      --ancho-marco: min(90 * var(--u), 520px);
      --alto-marco: calc(var(--ancho-marco) * 1477 / 2172);
      /* Aire hasta el castillo: 26 px de la escena + el marco entero + 43 px de
         aire. Antes eran 276 px en seco y, al ensanchar la pantalla, el marco
         crecía y la fortaleza se le metía debajo: la distancia cambiaba con el
         ancho. De aquí cuelgan el castillo, la escalera, los caminos y el
         tablero. */
      --margen-castillo: calc(26px + var(--alto-marco) + 11 * var(--u));
      /* Solape de la escalera sobre la fortaleza: 253 px cuando el mundo mide
         390 px, o sea el 64,9 % del ancho (bajada de 40 px sobre los 293
         originales). En proporción para que las dos imágenes se hagan
         pequeñas y grandes juntas: con 293 px fijos, al encoger la pantalla la
         escalera subía sola respecto a la fortaleza. */
      --solape-escalera: calc(66.7 * var(--u));
      /* Dónde empieza la imagen de las escaleras (y por tanto el tablero),
         medido en --u (1 % del ancho del mundo) y no en vw: así cuelga de la
         imagen y no del viewport. */
      --tope-castillo: calc(var(--margen-castillo) + 93.47 * var(--u) - var(--solape-escalera));
      /* Hueco de suelo por debajo de la escalera: alarga el scroll sin mover
         el tablero, que descuenta lo mismo por abajo. */
      --aire-escalera: 50px;
    }
    /* --u = 1% del ancho del mundo (1cqw): fallback con vw si container-query no disponible */
    @supports (container-type:inline-size) {
      .mundo { --u:1cqw; }
    }
    @supports not (container-type:inline-size) {
      .mundo { --u:1vw; }
    }

    .suelo {
      position:relative; width:100%; overflow:hidden;
      min-height:calc(93.47 * var(--u) + 100px); /* garantía de altura mínima */
      background:var(--mapa-url, url('${BASE_IMG}/mapas/mapa-selva.webp')) top center / 100% auto no-repeat;
    }
    .capa-himalaya { display:none; position:absolute; left:0; right:0; background-size:cover; background-repeat:no-repeat; }
    body.mapa-himalaya .suelo { background:none !important; }
    body.mapa-himalaya .suelo::after { display:none !important; }
    body.mapa-himalaya .capa-himalaya { display:block; }

    /* bg-clouds: pegada a la escena, como en el demo (si va fixed se queda
       clavada a la pantalla y se despega de la fortaleza al bajar) */
    .capa-bg-clouds {
      position:absolute; top:0; left:0; right:0;
      pointer-events:none;
      /* 300 px más alta que antes (430 + 46,74vw): baja hasta tapar el negro
         que asomaba detrás de la fortaleza al hacer scroll. */
      height:calc(730px + 46.74vw);
      background-image:url('${BASE_IMG}/mapas/nieve/bg-clouds.jpg');
      background-size:cover;
      background-position:top center;
      transform:translateY(var(--py-clouds, 0px));
      will-change:transform;
      z-index:0;
    }

    /* bloque mapa */
    .bloque-mapa {
      position:relative;
      margin-top:var(--margen-castillo);
      width:100%; height:auto;
      display:none;
    }
    body.mapa-himalaya .bloque-mapa { display:block; }
    .bloque-mapa .img-fortress {
      display:block;
      width:96%; margin:0 auto;
      position:relative; z-index:1;
    }
    .bloque-mapa .img-stairs {
      display:block;
      width:100%;
      /* El solape va en % del ancho (ver --solape-escalera en .mundo): fijo en
         px, la escalera se despegaba de la fortaleza al cambiar el tamaño. */
      margin-top:calc(-1 * var(--solape-escalera));
      /* Aire por debajo de la imagen: alarga el suelo (y el scroll). La misma
         medida se descuenta en caminos y tablero para que no se estiren. */
      margin-bottom:var(--aire-escalera);
    }

    /* fort-ui */
    .fort-ui {
      position:absolute; left:2%; width:96%; top:0;
      aspect-ratio:1178/1147;
      z-index:2; pointer-events:none;
    }
    .fort-ui > * { pointer-events:auto; }
    .fort-plat {
      position:absolute;
      display:flex; flex-direction:column; align-items:center; gap:calc(.77 * var(--u));
      transform:translate(-50%,-50%);
      filter: drop-shadow(0 6px 18px rgba(0,0,0,.7));
    }
    /* El número solo, en un círculo, en el sitio que ocupaba el texto. */
    .fort-cifra {
      display:flex; align-items:center; justify-content:center;
      transform:translateY(calc(-1 * var(--u)));
      box-sizing:border-box;
      width:calc(4.95 * var(--u)); height:calc(4.95 * var(--u));
      border-radius:50%;
      font:800 calc(2.3 * var(--u))/1 ui-sans-serif, system-ui, sans-serif;
      border:0;
      box-shadow:0 1px 4px rgba(0,0,0,.55);
    }
    .fort-plat.energia .fort-cifra { background:rgba(138,106,26,.9); color:#fff; position:relative; top:calc(-3.82 * var(--u)); left:calc(1.35 * var(--u)); }
    .fort-plat.energia .fort-pila-caja { position:relative; top:calc(-2.25 * var(--u)); left:calc(.9 * var(--u)); }
    .fort-plat.vida    .fort-cifra { background:rgba(122,16,16,.9); color:#fff; position:relative; top:calc(-3.82 * var(--u)); left:calc(-1.35 * var(--u)); }
    .fort-plat.vida    .fort-pila-caja { position:relative; top:calc(-3.15 * var(--u)); left:calc(-.9 * var(--u)); }

    .fort-label {
      font-size:calc(2.56 * var(--u)); font-weight:700; letter-spacing:.01em;
      color:#fff;
      background:rgba(0,0,0,.72);
      border-radius:999px; padding:calc(.77 * var(--u)) calc(2.56 * var(--u));
      border:1px solid rgba(255,255,255,.32);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      white-space:nowrap; line-height:1.3;
      text-shadow:0 1px 3px rgba(0,0,0,.8);
    }
    .fort-circulo {
      position:absolute;
      transform:translate(-50%,-50%);
      display:flex; flex-direction:column; align-items:center; gap:calc(.5 * var(--u));
    }
    /* Sin position aquí: lo pone .fort-circulo (absolute). Con relative, el
       left/top de cada edificio solo lo desplazaba desde donde caía en el
       flujo y las posiciones en % no significaban lo que parecían. */
    .fort-circulo-edif {
      display:inline-block;
      padding:calc(4 * var(--u));
    }
    .fort-circulo-edif .fort-nivel {
      position:absolute;
      top:calc(2.5 * var(--u) + 3px);
      left:50%; transform:translateX(-50%);
      z-index:2;
      background:rgb(122,16,16);
      border:0;
      padding:calc(1.4 * var(--u));
      gap:3px;
      white-space:nowrap;
    }
    .fort-circulo-edif .fort-nivel i {
      width:calc(1.4 * var(--u)); height:calc(1.4 * var(--u));
    }
    .fort-edif-img {
      width: calc(22 * var(--u)); height: auto;
      display: block;
    }
    .fort-circulo .fort-label { border-color:rgba(130,160,255,.55); }
    .fort-nivel {
      display:flex; gap:calc(.77 * var(--u)); align-items:center;
      background:rgba(0,0,0,.7); border-radius:999px;
      padding:calc(.51 * var(--u)) calc(1.28 * var(--u));
      border:1px solid rgba(255,255,255,.2);
    }
    .fort-nivel i {
      display:block;
      width:calc(1.79 * var(--u)); height:calc(1.79 * var(--u));
      border-radius:50%;
      border:.5px solid rgba(255,255,255,.7);
      background:transparent;
    }
    .fort-nivel i.lleno { background:rgba(255,255,255,.9); }
    .fort-tot { opacity:.62; font-weight:600 }
    /* Huecos en varias filas: pastilla rectangular y puntos algo más pequeños */
    .fort-nivel.filas { flex-direction:column; gap:calc(.51 * var(--u)); border-radius:9px; }
    .fort-fila { display:flex; gap:calc(.9 * var(--u)); justify-content:center; }
    .fort-nivel.filas i { width:calc(1.54 * var(--u)); height:calc(1.54 * var(--u)); }
    .fort-slot {
      position:absolute;
      transform:translate(-50%,-50%);
      width:calc(7.7 * var(--u)); height:calc(7.7 * var(--u));
      border-radius:5px;
      background:rgba(0,0,0,.7);
      border:2px dashed rgba(255,255,255,.85);
      box-shadow:0 0 10px rgba(0,0,0,.8), inset 0 0 6px rgba(0,0,0,.5);
    }
    .fort-slot.fort-slot-lleno {
      border-style:solid; border-color:#4a90d9;
      background:rgba(74,144,217,.35); color:#8dc0f0;
      display:flex; align-items:center; justify-content:center;
      font:800 calc(2.05 * var(--u))/1 ui-monospace,monospace;
    }

    /* nubes */
    .capa-cloud-l {
      position:absolute; top:100px; left:-200px; width:300px; height:300px;
      pointer-events:none;
      background-image:url('${BASE_IMG}/mapas/nieve/cloud.png');
      background-size:contain;
      background-repeat:no-repeat;
      background-position:top right;
      mix-blend-mode:screen;
      z-index:5;
      transform:translateY(var(--py-cloud-sm, 0px));
      will-change:transform;
    }
    .capa-cloud-r {
      position:absolute; top:calc(300px + 5vw); left:calc(100% - 100px); width:300px; height:300px;
      pointer-events:none;
      background-image:url('${BASE_IMG}/mapas/nieve/cloud.png');
      background-size:contain;
      background-repeat:no-repeat;
      background-position:top left;
      mix-blend-mode:screen;
      z-index:5;
      transform:translateY(var(--py-cloud-sm, 0px));
      will-change:transform;
    }

    /* banderines: fixed, anclados a la zona de la fortaleza */
    /* Los banderines arrancan justo en el borde de abajo del marco: 6 px de la
       escena más el alto del marco (un tercio de su ancho, tope 520). */
    .capa-flags {
      position:absolute;
      /* Todo en % del ancho del mundo: los −50 px de antes se quedaban clavados
         al cambiar el ancho y descuadraban el banderín. −5 % − 50 px a 390 px
         de ancho equivale a −17,8 %, 2 puntos más hacia fuera y 20 px (5,1 %)
         de vuelta hacia dentro. */
      left:calc(-19.8% + 5.1 * var(--u)); width:110%;
      pointer-events:none;
      /* Cuelgan del borde de abajo del marco (26 px de la escena + su alto),
         25 px por encima de ese borde. El alto del marco ya es proporcional, así
         que la distancia se mantiene al cambiar el ancho. */
      /* 30 px más arriba, en --u (7,7 % del ancho: a 390 px son esos 30 px),
         1 punto de subida al abrirse hacia fuera, 20 px (5,1 %) más y 8 px
         (2,05 %) de vuelta abajo: 7,7 + 1 + 5,1 − 2,05. */
      top:calc(26px + var(--alto-marco) - 25px - 11.8 * var(--u));
      height:calc(70 * var(--u));
      background-image:url('${BASE_IMG}/mapas/nieve/flags.png');
      background-size:60% auto;
      /* Los −90 px de subida del dibujo, en --u (1 % del ancho): −23,1 % a
         390 px. En píxeles fijos el banderín no subía igual al cambiar el
         tamaño. */
      background-position:left calc(-23 * var(--u));
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(var(--px-flags, 0px)) translateY(var(--py-flags, 0px));
      will-change:transform;
    }
    .capa-flags-r {
      /* 30 px más a la derecha que el resto del mapa: manda el left porque con
         width:110% el right queda ignorado. Los +23 px van en % (−5 % + 23 px a
         390 px equivale a 0,9 %), 2 puntos más hacia fuera y 20 px (5,1 %) de
         vuelta hacia dentro. */
      position:absolute; left:calc(2.9% - 5.1 * var(--u)); right:-5%; width:110%;
      pointer-events:none;
      /* Mismo borde de abajo del marco y misma subida de 25 px que el otro. */
      top:calc(26px + var(--alto-marco) - 25px - 11.8 * var(--u));
      height:calc(70 * var(--u));
      background-image:url('${BASE_IMG}/mapas/nieve/flags-r.png');
      background-size:60% auto;
      /* Los −80 px, en --u: −20,5 % a 390 px de ancho. */
      background-position:right calc(-20.5 * var(--u));
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(calc(-1 * var(--px-flags, 0px))) translateY(var(--py-flags, 0px));
      will-change:transform;
    }

    /* niebla inferior: 100 px más alta que su 40 % del suelo (crece hacia
       arriba, porque va anclada por abajo). */
    .capa-bottom-fog {
      position:absolute; bottom:0; left:0; right:0; height:calc(40% + 100px);
      background-image:url('${BASE_IMG}/mapas/nieve/bottom-fog.png');
      background-size:cover;
      background-position:center bottom;
      /* Por encima del tablero (z-index 2): así el monstruo que entra aparece
         entre la bruma en vez de por delante de ella. */
      z-index:4;
      transform:translateY(var(--py-fog, 0px));
      will-change:transform;
    }

    .suelo::after {
      content:""; position:absolute; inset:0;
      background:
        linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 45%, transparent 100%) top / 100% calc(12 * var(--u)) no-repeat,
        linear-gradient(180deg, rgba(0,0,0,.18) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.35) 100%);
    }

    /* ── Caminos ── */
    .caminos {
      position:absolute; left:0; right:0; bottom:var(--aire-escalera);
      top:var(--tope-castillo);
      width:100%; height:auto; z-index:1; overflow:visible;
      -webkit-mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
      mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
    }
    .tablero {
      position:absolute; left:0; right:0; bottom:var(--aire-escalera);
      /* Mismo ancla que los caminos: el alto de la escalera, salga el ancho que
         salga. El bottom descuenta el aire de debajo de la escalera para que
         las losas no se muevan al dar más suelo. */
      top:var(--tope-castillo);
      height:auto; z-index:2;
    }
    .caminos .lecho { fill:none; stroke:transparent; stroke-width:calc(14 * var(--u)); vector-effect:non-scaling-stroke }

    .bw-layer { position:absolute; inset:0; pointer-events:none }
    .bw-layer > * { pointer-events:auto }

    /* losas */
    .losa {
      position:absolute; width:calc(11.2 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-5.6 * var(--u));
      border-radius:50%;
      border:2px dashed rgba(255,255,255,.75);
      background:rgba(255,255,255,.12);
      z-index:2;
    }
    .losa.base-torre { border:none }

    /* fichas: el monstruo es la imagen, apoyado en la losa y centrado; arriba
       lleva una pastilla redonda con su fuerza, como los decretos del HUD. */
    .ficha {
      position:absolute; width:calc(7 * var(--u)); aspect-ratio:1;
      margin:calc(-3.5 * var(--u)) 0 0 calc(-3.5 * var(--u));
      display:grid; place-items:center; cursor:pointer; z-index:5;
    }
    .ficha-img {
      position:absolute; left:50%; bottom:50%; transform:translateX(-50%);
      /* Un tercio del tamaño natural de la lámina (121 × 224 px). */
      width:calc(8.5 * var(--u)); height:auto; pointer-events:none;
      filter:drop-shadow(0 calc(.5 * var(--u)) calc(1 * var(--u)) rgba(0,0,0,.5));
    }
    .ficha::after {
      content:""; position:absolute; left:50%; top:100%;
      width:calc(9 * var(--u)); height:calc(2.5 * var(--u));
      transform:translate(-50%,-50%);
      border-radius:50%; z-index:-1;
      background:radial-gradient(closest-side, rgba(0,0,0,.5), transparent);
    }
    .ficha:active { filter:brightness(1.15) }
    /* TEMPORAL: marco la caja de la ficha para ver dónde cae de verdad. */
    .ficha { outline:1px solid rgba(0,255,102,.95); background:rgba(0,255,102,.22); }
    .ficha-nv {
      position:absolute; left:50%; bottom:calc(14 * var(--u));
      transform:translateX(-50%);
      width:calc(4.4 * var(--u)); height:calc(4.4 * var(--u));
      display:grid; place-items:center; border-radius:50%;
      background:#7a1010; color:#f4ecdd;
      border:calc(.3 * var(--u)) solid rgba(244,236,221,.9);
      font:700 calc(2.6 * var(--u))/1 ui-serif, Georgia, "Times New Roman", serif;
      box-shadow:0 calc(.4 * var(--u)) calc(1 * var(--u)) rgba(0,0,0,.45);
      pointer-events:none;
    }
    .ficha.mia .ficha-nv      { background:#2a5c92; }
    .ficha.ajena .ficha-nv    { background:#5c2a72; }

    /* torres */
    .torre {
      position:absolute; width:calc(9.5 * var(--u)); aspect-ratio:1;
      margin:calc(-9.5 * var(--u)) 0 0 calc(-4.75 * var(--u));
      z-index:3;
    }
    .torre .planta {
      position:absolute; inset:0;
      background:url('${BASE_IMG}/torres/torre-planta-nv1.png') no-repeat center / contain;
      z-index:1; opacity:0;
    }
    .torre.nv2 .planta { background-image:url('${BASE_IMG}/torres/torre-planta-nv2.png') }
    .torre.nv3 .planta { background-image:url('${BASE_IMG}/torres/torre-planta-nv3.png') }
    .torre .alzado {
      position:absolute; left:50%; bottom:0;
      width:calc(16.5 * var(--u)); height:calc(16.5 * var(--u));
      margin-left:calc(-8.25 * var(--u)); transform-origin:50% 100%;
      background:url('${BASE_IMG}/torres/torre-alzado-nv1.png') no-repeat center bottom / contain;
      opacity:1;
    }
    .torre.nv2 .alzado { background-image:url('${BASE_IMG}/torres/torre-alzado-nv2.png') }
    .torre.nv3 .alzado { background-image:url('${BASE_IMG}/torres/torre-alzado-nv3.png') }
    .torre .nivel {
      position:absolute; bottom:calc(-2.2 * var(--u)); left:50%;
      transform:translateX(-50%);
      display:flex; gap:calc(.55 * var(--u)); align-items:center; z-index:4;
      background:rgba(0,0,0,.7); border-radius:999px;
      padding:calc(.4 * var(--u)) calc(.8 * var(--u));
    }
    .torre .nivel i {
      display:block; width:calc(1.4 * var(--u)); height:calc(1.4 * var(--u));
      border-radius:50%; border:.5px solid rgba(255,255,255,.7); background:transparent;
    }
    .torre.nv1 .nivel i:nth-child(1),
    .torre.nv2 .nivel i:nth-child(-n+2),
    .torre.nv3 .nivel i { background:rgba(255,255,255,.9); }
    .torre .bloqueo {
      display:none;
      position:absolute; bottom:calc(1 * var(--u)); left:50%;
      transform:translateX(-50%);
      z-index:5;
      width:calc(5.4 * var(--u)); height:calc(5.4 * var(--u));
      border-radius:50%;
      background:rgba(0,0,0,.85);
      border:1px solid rgba(224,83,63,.6);
      align-items:center; justify-content:center;
      font-size:calc(3.1 * var(--u)); line-height:1;
      color:var(--rojo); font-weight:900;
    }
    .torre.bloqueada .bloqueo { display:flex; }
    .torre .anillo {
      position:absolute; left:100%; top:50%;
      transform:translateY(-50%); z-index:4;
      margin-left:calc(1.03 * var(--u));
      display:flex; flex-direction:column; gap:calc(.62 * var(--u));
      width:calc(1.65 * var(--u));
    }
    .torre .anillo::before,
    .torre .anillo::after,
    .torre .anillo span {
      content:""; display:block; width:calc(1.65 * var(--u)); height:calc(1.65 * var(--u));
      border-radius:calc(.41 * var(--u));
      background:rgba(185,195,204,.2);
      border:1px solid rgba(185,195,204,.35);
    }
    .torre.nv1 .anillo::after { background:#b9c3cc; border-color:#b9c3cc }
    .torre.nv2 .anillo span  { background:#b9c3cc; border-color:#b9c3cc }
    .torre.nv2 .anillo::after{ background:#b9c3cc; border-color:#b9c3cc }
    .torre.nv3 .anillo::before{ background:#b9c3cc; border-color:#b9c3cc }
    .torre.nv3 .anillo span  { background:#b9c3cc; border-color:#b9c3cc }
    .torre.nv3 .anillo::after{ background:#b9c3cc; border-color:#b9c3cc }

    /* hueco de torre */
    .hueco {
      position:absolute; width:calc(11.2 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-5.6 * var(--u));
      border-radius:50%;
      border:2px dashed rgba(255,255,255,.75);
      background:rgba(255,255,255,.12);
      color:rgba(255,255,255,.75); display:grid; place-items:center;
      font-weight:300; font-size:calc(3.5 * var(--u)); line-height:1;
      z-index:3; cursor:pointer;
    }
    .hueco:active { background:rgba(255,255,255,.22); }

    /* lanzaderas */
    .lanzadera {
      position:absolute; width:calc(11.2 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-5.6 * var(--u));
      border-radius:50%;
      border:2px dashed rgba(255,255,255,.75);
      background:rgba(255,255,255,.12);
      z-index:2;
    }

    /* número de calle */
    /* Mientras las fichas avanzan no responde nada: ni el tablero, ni el box,
       ni la mano, ni la barra. El scroll de #pantalla sigue vivo para poder
       seguir la animación. */
    body.bw-avanzando #pantalla *,
    body.bw-avanzando .bw-mano-wrap,
    body.bw-avanzando .bw-panel,
    body.bw-avanzando #bw-nav-global,
    body.bw-avanzando #barra,
    body.bw-avanzando .bw-modal-fondo { pointer-events:none !important; }

    .num-calle {
      position:absolute; margin:calc(-2.48 * var(--u)) 0 0 calc(-2.48 * var(--u));
      /* Círculo un 20 % mayor (4.13 → 4.95u) y letra un punto más. */
      width:calc(4.95 * var(--u)); aspect-ratio:1; border-radius:50%;
      /* Solo el fondo translúcido: el número va blanco a plena opacidad. */
      background:rgba(122,16,16,.8); border:0;
      /* Flex y un pelín de relleno arriba: con la métrica mono el dígito
         quedaba un poco alto; el padding lo baja sin mover el círculo. */
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; padding:calc(.55 * var(--u)) 0 0; text-align:center;
      font-weight:700; font-family:ui-monospace,monospace;
      font-size:calc(2.11 * var(--u)); line-height:1; color:#fff;
      z-index:3;
    }
  </style>`;
}

