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

  /* Nav, mano y box al body para position:fixed real (no relativo a #pantalla) */
  document.getElementById("bw-nav-global")?.remove();
  document.querySelector("body > .bw-mano-wrap")?.remove();
  document.querySelector("body > .bw-panel.box-panel")?.remove();
  document.querySelector("body > .bw-panel.acciones-panel")?.remove();

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
  accPanel.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".bw-accion-item");
    if (!b || !enviarAccion) return;
    const accion = accionesMesa[Number(b.dataset.i)];
    if (!accion) return;
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
    sueloEl?.style.setProperty("--py-flags",    `${sy * 0.15}px`);
    sueloEl?.style.setProperty("--px-flags",    `${sy * -0.35}px`);
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
    document.body.classList.remove("bw-himalaya", "mapa-himalaya");
    const res = await salirMesa();
    if (res?.error) aviso(res.error, { error: true });
  });

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
    manoWrap.classList.toggle("oculto", id !== "cartas");
  }
  navEl2.querySelectorAll(".bw-nav-tab").forEach(tab => {
    tab.addEventListener("click", () => activarTab(tab.dataset.tab));
  });
  /* Se recuerda la pestaña abierta entre repintados (el servidor empuja estado
     a menudo y no queremos que el panel se cierre solo). */
  activarTab(tabMesa);
}

/* ── Mi búnker: escena completa del demo ──────────────────────────────────── */

/* Máximos de producción con todo puesto: 3 monedas y 2 monjes de base, más
   1+2+3+4 monedas y 0+1+1+2 monjes de las cuatro cartas de recursos, más la
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
  const lanzaderas = priv?.lanzaderas ?? [null, null];
  const s    = j?.senderos ?? [{}, {}, {}];
  const torres = j?.bunker?.torres ?? [null, null, null];
  const tot = totalesBunker(j?.bunker);

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
    [{l:"24.09",t:"77.4"},{l:"24.25",t:"64.6"},{l:"24.5",t:"52.9"},{l:"25.16",t:"41.5"},{l:"25.78",t:"33.66",base:true}],
    [{l:"50.02",t:"77.4"},{l:"49.61",t:"64.6"},{l:"49.2",t:"52.9"},{l:"49.2",t:"41.5"},{l:"49.26",t:"33.66",base:true}],
    [{l:"78.15",t:"77.4"},{l:"76.09",t:"64.6"},{l:"75.67",t:"52.9"},{l:"73.2",t:"41.5"},{l:"74.13",t:"33.66",base:true}],
  ];
  const TORRES_POS = [{l:"25.78",t:"32.28"},{l:"49.92",t:"32.28"},{l:"74.13",t:"32.28"}];

  /* Fichas reales */
  const fichasHtml = [0,1,2].flatMap(i =>
    [0,1,2,3].map(paso => {
      const f = fichaEn(s[i], paso);
      if (!f) return "";
      const pos = LOSAS[i][paso];
      const esAtacante = f.tipo === "atacante";
      const cls = esAtacante ? (f.dueno ? "ajena" : "atacante") : "mia";
      return `<div class="ficha ${cls}" style="left:${pos.l}%;top:${pos.t}%">${nivelDe(f)}</div>`;
    })
  ).join("");

  /* Torres */
  const torresHtml = [0,1,2].map(i => {
    const t = torres[i];
    const pos = TORRES_POS[i];
    if (!t || !t.nivel)
      return `<div class="hueco" style="left:${pos.l}%;top:${pos.t}%">+</div>`;
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
  const slotPos = [{l:"37.6",t:"63.5"},{l:"37.6",t:"73.1"},{l:"62.7",t:"64.1"},{l:"63.1",t:"72.7"}];
  const slotsHtml = slotPos.map((pos, i) => {
    const mon = box[i];
    return `<div class="fort-slot${mon ? " fort-slot-lleno" : ""}" style="left:${pos.l}%;top:${pos.t}%">${mon ? `M${mon.nivel ?? "?"}` : ""}</div>`;
  }).join("");

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
              <div class="fort-plat energia" style="left:30.3%;top:31.8%">
                <div class="fort-dot"></div>
                <div class="fort-label">Monedas ${tot.monedas}<span class="fort-tot"> de ${MAX_MONEDAS}</span></div>
                <div class="fort-nivel filas monedas">${filas(tot.monedas, [4, 5, 5])}</div>
              </div>
              <div class="fort-plat vida" style="left:69.3%;top:31.8%">
                <div class="fort-dot"></div>
                <div class="fort-label">Monjes ${tot.monjes}<span class="fort-tot"> de ${MAX_MONJES}</span></div>
                <div class="fort-nivel filas">${filas(tot.monjes, [3, 4])}</div>
              </div>
              <div class="fort-circulo" style="left:31.4%;top:52.1%">
                <div class="fort-label">Laboratorio · ${lab}</div>
                <div class="fort-nivel">${dots(lab,4)}</div>
              </div>
              <div class="fort-circulo" style="left:49.8%;top:52.5%">
                <div class="fort-label">Ciencia · ${cien}</div>
                <div class="fort-nivel">${dots(cien, 2)}</div>
              </div>
              <div class="fort-circulo" style="left:69.4%;top:52.2%">
                <div class="fort-label">Armería · ${arm}</div>
                <div class="fort-nivel">${dots(arm,3)}</div>
              </div>
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
            <div class="num-calle" style="left:24.5%;top:83%">1</div>
            <div class="num-calle" style="left:49.2%;top:83%">2</div>
            <div class="num-calle" style="left:73.2%;top:83%">3</div>
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

  const chip = (cls, texto, valor, tope, titulo) =>
    `<span class="bw-hud-chip ${cls}" title="${titulo}">${texto ? `<em>${texto}</em>` : ""}<b>${valor}</b>${tope != null ? `<i>/${tope}</i>` : ""}</span>`;

  /* Grid de turnos pegado al fondo de la barra: un slot por jugador. El del
     que tiene el turno va en blanco; los demás, apagados. */
  const turnos = jugadoresMesa.map(p => {
    const activo = p.id === turnoMesa;
    return `<div class="bw-turno${activo ? " activo" : ""}" data-jugador="${esc(p.id)}">
      <span class="bw-turno-progreso"></span>
      <span class="bw-turno-nombre">${esc(p.id === yoMesa ? `${p.nombre} · tú` : p.nombre)}</span>
    </div>`;
  }).join("");
  const nTurnos = Math.max(1, jugadoresMesa.length);

  return `
    <div class="bw-hud">
      <div class="bw-hud-caja">
      <div class="bw-hud-datos">
        ${chip("ener", "Monedas", energia, null, `Monedas que te quedan este turno. Produces ${tot.monedas} por turno.`)}
        ${chip("acc", "Monjes", acciones, null, `Monjes que te quedan este turno. Produces ${tot.monjes} por turno.`)}
        ${chip("luna", "🌙", lunaMesa, null, "Luna en curso")}
        ${chip("vida", "❤", vida, 20, "Vida del búnker")}
      </div>
      <div class="bw-hud-turnos" style="grid-template-columns:repeat(${nTurnos},minmax(0,1fr))">${turnos}</div>
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
  const lista = accionesMesa ?? [];
  let cuerpo;
  if (lista.length) {
    cuerpo = `<div class="bw-acciones">${lista.map((a, i) =>
      `<button type="button" class="bw-accion-item" data-i="${i}">${esc(a.etiqueta ?? a.texto ?? "Acción")}</button>`
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

/* ── Carta de Destino del turno ─────────────────────────────────────────── */

function textoDestino(d) {
  const amenaza = ["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival"].includes(d.tipo);
  const n = d.nivelReal ?? (amenaza && nivelEnemigoMesa === 1 ? Math.min(1, d.nivel ?? 1) : d.nivel);
  const nota = (d.nivel && n !== d.nivel)
    ? ` · la carta es de nivel ${d.nivel}, la luna lo deja en ${n}`
    : "";
  switch (d.tipo) {
    case "amenaza":         return `Monstruo nivel ${n} en la casilla de entrada · prioridad ${d.prio?.join(", ")}${nota}`;
    case "amenaza_triple":  return `3 monstruos nivel ${n}, uno en cada calle${nota}`;
    case "amenaza_doble":   return `2 monstruos nivel ${n} en 2 calles · prioridad ${d.prio?.join(", ")}${nota}`;
    case "amenaza_rival":   return `Monstruo nivel ${n} en 1 calle de cada rival · prioridad ${d.prio?.join(", ")}${nota}`;
    case "calma":           return "Calma… no hay monstruos nuevos en el horizonte";
    case "buscar_bunker":   return "Busca en el mazo una carta de búnker que necesites y colócala";
    case "aniquilar_entrada": return "Todos los monstruos en las entradas de calle son aniquilados";
    case "aniquilar_nivel": return "Todos los monstruos de nivel 3 o inferiores mueren. Quítalos de los senderos";
    case "matar_mayor":     return "El monstruo de más rango que ataca tu búnker muere. Quítalo del sendero";
    case "avanzar_extra":   return "Todos los monstruos atacantes de tus senderos avanzan un paso más";
    case "miedo":           return "Todos los atacantes de la mesa retroceden una casilla";
    case "convertir_aliado":return "Convierte un monstruo atacante en un monstruo tuyo. Gíralo";
    case "subir_monstruos": return "Tus monstruos de nivel 5 o inferior suben un rango";
    case "bajar_monstruos": return "Tus monstruos de nivel 2 o superior bajan un rango";
    case "colocar_monstruos": return `Coloca ${d.cantidad ?? 3} monstruos de nivel ${n} saliendo de tu búnker`;
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
  subir_laboratorio:    "Subir laboratorio",
  subir_recursos:       "Subir recursos",
  subir_lab_o_arm:      "Laboratorio o armería",
};

let enviarAccion = null;
let salirMesa = null;
let nivelEnemigoMesa = 1;
let accionesMesa = [];
let boxActual = [];
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

const BASE_IMG = "/app/juegos/bunker-wars/img";
const CARD_BG  = `${BASE_IMG}/card.png`;
const SLOTS_CIENCIA = 2;

function defsCarta(c) {
  const defs = {
    recursos:    { emoji: "⚡", label: c.titulo ?? `Recursos nv${c.nivel ?? ""}`, cls: "recursos",    costo: c.coste },
    armeria:     { emoji: "🔧", label: c.titulo ?? `Armería nv${c.nivel ?? ""}`,  cls: "armeria",     costo: c.coste },
    laboratorio: { emoji: "🧪", label: c.titulo ?? `Laboratorio nv${c.nivel ?? ""}`, cls: "laboratorio", costo: c.coste },
    ciencia:     { emoji: "🔬", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Ciencia", cls: "ciencia", costo: c.coste },
    ciencia_i:   { emoji: "⚗️", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Inmediata", cls: "ciencia_i", costo: c.coste },
  };
  return defs[c.tipo] ?? { emoji: "?", label: c.tipo ?? "Carta", cls: "", costo: c.coste ?? 0 };
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
      <span class="bw-carta-nombre">${esc(c.titulo ?? t.label)}</span>
      <div class="bw-carta-img"><img src="${esc(img)}" alt=""></div>
    </div>
  `;
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
          ? "Ya no te quedan monjes este turno."
          : !tocaMesa || faseMesa !== "acciones"
            ? "Solo se puede jugar en tu fase de acciones, cuando te toca."
            : "";

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-carta";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="${esc(d.titulo)}">
      <button type="button" class="bw-modal-x" aria-label="Cerrar">×</button>
      <div class="bw-carta-grande">
        <span class="bw-carta-coste-grande${sinEnergia ? " sin-energia" : ""}">${d.coste}</span>
        <div class="bw-carta-grande-img"><img src="${esc(d.img ?? "")}" alt=""></div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(d.titulo)}</div>
          <p class="bw-carta-grande-desc">${esc(d.descripcion)}</p>
        </div>
      </div>
      <div class="bw-modal-acciones">
        ${reemplazos
          ? reemplazos.map(c => `<button type="button" class="bw-modal-usar" data-reemplazo="${esc(c.efecto ?? "")}"${jugable ? "" : " disabled"}>Quitar ${esc(NOMBRES_EFECTO[c.efecto] ?? c.titulo ?? c.efecto ?? "?")}</button>`).join("")
          : elecciones
            ? elecciones.map(a => `<button type="button" class="bw-modal-usar" data-accion="${accionesMesa.indexOf(a)}"${jugable ? "" : " disabled"}>${esc(a.edificio ? (a.edificio === "armeria" ? "Subir armería" : "Subir laboratorio") : (a.etiqueta ?? a.texto ?? "Usar carta"))}</button>`).join("")
            : `<button type="button" class="bw-modal-usar"${jugable ? "" : " disabled"}${opciones.length === 1 ? ` data-accion="${accionesMesa.indexOf(opciones[0])}"` : ""}>Usar carta</button>`}
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
    .bw-panel.box-panel, .bw-panel.acciones-panel {
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
      width:max(80px,21vw); aspect-ratio:1024/1536;
      border-radius:5px;
      background:url('${CARD_BG}') center/100% 100% no-repeat;
      box-shadow:0 8px 20px rgba(0,0,0,.65);
      display:flex; flex-direction:column; align-items:center;
      padding-top:9%; gap:2px;
      color:#2a1808;
      /* Asoma más carta: 54 % (57 px) → 45 % (68 px) → 39 % (~75 px) */
      transform:translateY(39%);
      transition:transform .18s ease, box-shadow .18s ease;
      position:relative; user-select:none;
    }
    /* Todas las cartas suben igual al pulsarlas, aunque no te llegue para
       jugarla: la animación no depende de si la carta es jugable. */
    .bw-carta:hover, .bw-carta:active {
      /* Al pulsarla sube solo un 10 % del alto, no el 37 % de antes */
      transform:translateY(29%); box-shadow:0 14px 28px rgba(0,0,0,.8);
    }
    .bw-carta.descartable { outline:2px solid rgba(224,83,63,.7); }
    .bw-carta .bw-carta-coste {
      position:absolute; top:calc(3.5% - 2px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 max(7px,0.98vw)/1 ui-serif,serif;
      color:#7a1010;
    }
    .bw-carta .bw-carta-img {
      order:2;
      /* 26 % → 34 % → 41 %: el dibujo queda un 55 % más grande que al principio.
         Sin transform, porque un transform aquí aísla al <img> y el
         mix-blend-mode:multiply deja de fundirse con el papel de la carta. */
      flex:0 0 41%; width:91%;
      margin-top:3px;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
    }
    .bw-carta .bw-carta-img img {
      width:100%; height:100%; object-fit:contain;
      mix-blend-mode:multiply;
    }
    .bw-carta .bw-carta-nombre {
      order:1;
      width:100%; text-align:center;
      font:700 max(8px,1vw)/1.2 ui-serif,serif;
      color:#2a1808; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      margin-top:-17px;
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
    .bw-carta-coste-grande {
      position:absolute; top:calc(3.5% - 5px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 16px/1 ui-serif,serif; color:#7a1010;
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
      mix-blend-mode:multiply; transform:translateY(22px);
    }
    .bw-carta-grande-texto {
      display:flex; flex-direction:column; justify-content:flex-start;
      gap:5px; padding-top:4%; margin-top:30px;
    }
    .bw-carta-grande-titulo { font:700 16px/1.3 ui-serif,serif; color:#7a1010; text-align:center; }
    .bw-carta-grande-desc {
      margin:4px 0 0; padding:0;
      font:400 11px/1.4 ui-serif,serif; color:#3a2010; text-align:center;
    }
    /* Centrados y por encima de la carta, que si no les tapa la mitad */
    .bw-modal-acciones { display:flex; justify-content:center; gap:10px; position:relative; z-index:3; }
    .bw-modal-acciones button {
      padding:0 24px; min-height:38px; border-radius:5px;
      font-size:14px; font-weight:800; cursor:pointer; border:none;
    }
    .bw-modal-usar { background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a; }
    .bw-modal-usar:disabled { opacity:.5; cursor:not-allowed; }

    /* Modal envío */
    /* Pie del modal: por qué no se puede usar la carta */
    .bw-modal-nota {
      /* Colgada debajo del modal y fuera del flujo: al salir no empuja la carta
         hacia arriba, simplemente aparece en el hueco de abajo */
      position:absolute; top:calc(100% + 10px); left:50%; transform:translateX(-50%);
      margin:0; padding:9px 12px; border-radius:10px;
      background:rgba(18,16,14,.92); border:1px solid rgba(244,236,221,.12);
      font-size:12.5px; line-height:1.4; text-align:center; max-width:230px;
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
      top: calc(env(safe-area-inset-top, 0px) + 39px + min(33.34vw, 173px)) !important;
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
    body.bw-himalaya .bw-panel.box-panel, body.bw-himalaya .bw-panel.acciones-panel {
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
      /* 3:1 como el arte; tope de 520 px de ancho para que en pantallas
         grandes el marco no se coma la escena. */
      position: fixed; left: 0; right: 0; width: min(100%, 520px);
      margin: 0 auto;
      top: calc(env(safe-area-inset-top, 0px) + 33px);
      z-index: 16; box-sizing: border-box; pointer-events: none;
      aspect-ratio: 2172 / 724;
      background: url('${BASE_IMG}/marco.png') center / 100% 100% no-repeat;
    }
    /* Hueco interior del marco, en % del propio marco: deja fuera tejado,
       banderines, columnas y peana. */
    .bw-hud-caja {
      position: absolute;
      left: 11.5%; right: 11%; top: 37%; bottom: 17.5%;
      display: flex; flex-direction: column;
      justify-content: center; gap: 4px;
      padding: 1px 6px; overflow: hidden;
    }
    .bw-hud-datos {
      display: flex; align-items: center; gap: 8px;
      min-width: 0; overflow: hidden;
    }
    .bw-hud .bw-hud-chip b, .bw-hud .bw-hud-chip em { font-size: 10px; }
    /* Grid de turnos: un slot por jugador, pegado al fondo de la barra */
    .bw-hud-turnos { display: grid; gap: 3px; }
    .bw-turno {
      position: relative; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      min-width: 0; height: 18px; padding: 0 5px;
      border-radius: 4px;
      background: rgba(42,32,24,.10);
      border: 1px solid rgba(42,32,24,.22);
      font: 600 8px/1 ui-sans-serif, system-ui, sans-serif;
      color: rgba(42,32,24,.6);
    }
    .bw-turno-nombre {
      position: relative; z-index: 1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* Relleno del slot: aquí irá avanzando el turno del jugador */
    .bw-turno-progreso {
      position: absolute; left: 0; top: 0; bottom: 0; width: var(--p, 0%);
      background: rgba(42,32,24,.16);
    }
    /* El que tiene el turno: slot relleno de tinta, como un sello */
    .bw-turno.activo {
      background: #2a2018; color: #f6ecd9; border-color: #2a2018;
    }
    .bw-turno.activo .bw-turno-progreso { background: rgba(255,255,255,.22); }
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
      min-height:calc(93.47vw + 100px); /* garantía de altura mínima */
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
      height:calc(430px + 46.74vw);
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
      margin-top:180px;
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
      margin-top:-293px;
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
      display:flex; flex-direction:column; align-items:center; gap:3px;
      transform:translate(-50%,-50%);
    }
    .fort-plat .fort-dot {
      width:max(8px,1.1vw); height:max(8px,1.1vw);
      border-radius:50%;
    }
    .fort-plat.energia .fort-dot { background:#facc15; box-shadow:0 0 8px #facc15; }
    .fort-plat.vida    .fort-dot { background:#34d399; box-shadow:0 0 8px #34d399; }
    .fort-label {
      font-size:max(10px,1.2vw); font-weight:700; letter-spacing:.01em;
      color:#fff;
      background:rgba(0,0,0,.72);
      border-radius:999px; padding:3px 10px;
      border:1px solid rgba(255,255,255,.32);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      white-space:nowrap; line-height:1.3;
      text-shadow:0 1px 3px rgba(0,0,0,.8);
    }
    .fort-circulo {
      position:absolute;
      transform:translate(-50%,-50%);
      display:flex; flex-direction:column; align-items:center; gap:2px;
    }
    .fort-circulo .fort-label { border-color:rgba(130,160,255,.55); }
    .fort-nivel {
      display:flex; gap:max(3px,.4vw); align-items:center;
      background:rgba(0,0,0,.7); border-radius:999px;
      padding:max(2px,.3vw) max(5px,.6vw);
      border:1px solid rgba(255,255,255,.2);
    }
    .fort-nivel i {
      display:block;
      width:max(7px,.85vw); height:max(7px,.85vw);
      border-radius:50%;
      border:.5px solid rgba(255,255,255,.7);
      background:transparent;
    }
    .fort-nivel i.lleno { background:rgba(255,255,255,.9); }
    .fort-tot { opacity:.62; font-weight:600 }
    /* Huecos en varias filas: pastilla rectangular y puntos algo más pequeños */
    .fort-nivel.filas { flex-direction:column; gap:max(2px,.3vw); border-radius:9px; }
    .fort-fila { display:flex; gap:max(3px,.35vw); justify-content:center; }
    .fort-nivel.filas i { width:max(6px,.68vw); height:max(6px,.68vw); }
    .fort-slot {
      position:absolute;
      transform:translate(-50%,-50%);
      width:max(30px,3.2vw); height:max(30px,3.2vw);
      border-radius:5px;
      background:rgba(0,0,0,.7);
      border:2px dashed rgba(255,255,255,.85);
      box-shadow:0 0 10px rgba(0,0,0,.8), inset 0 0 6px rgba(0,0,0,.5);
    }
    .fort-slot.fort-slot-lleno {
      border-style:solid; border-color:#4a90d9;
      background:rgba(74,144,217,.35); color:#8dc0f0;
      display:flex; align-items:center; justify-content:center;
      font:800 max(8px,1.1vw)/1 ui-monospace,monospace;
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
    .capa-flags {
      position:absolute; left:calc(-5% - 50px); right:calc(-5% + 50px); width:110%;
      pointer-events:none;
      top:0;
      height:calc(70vw);
      background-image:url('${BASE_IMG}/mapas/nieve/flags.png');
      background-size:60% auto;
      background-position:left -90px;
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(var(--px-flags, 0px)) translateY(var(--py-flags, 0px));
      will-change:transform;
    }
    .capa-flags-r {
      position:absolute; left:-5%; right:-5%; width:110%;
      pointer-events:none;
      top:0;
      height:calc(70vw);
      background-image:url('${BASE_IMG}/mapas/nieve/flags-r.png');
      background-size:60% auto;
      background-position:right -80px;
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(calc(-1 * var(--px-flags, 0px))) translateY(var(--py-flags, 0px));
      will-change:transform;
    }

    /* niebla inferior */
    .capa-bottom-fog {
      position:absolute; bottom:0; left:0; right:0; height:40%;
      background-image:url('${BASE_IMG}/mapas/nieve/bottom-fog.png');
      background-size:cover;
      background-position:center bottom;
      z-index:2;
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
      position:absolute; left:0; right:0; bottom:0;
      top:calc(93.47vw - 113px);
      width:100%; height:auto; z-index:1; overflow:visible;
      -webkit-mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
      mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
    }
    .tablero {
      position:absolute; left:0; right:0; bottom:0;
      top:calc(93.47vw - 113px);
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

    /* fichas */
    .ficha {
      position:absolute; width:calc(7 * var(--u)); aspect-ratio:1;
      margin:calc(-3.5 * var(--u)) 0 0 calc(-3.5 * var(--u));
      border-radius:50%; border:calc(.41 * var(--u)) solid rgba(0,0,0,.45);
      display:grid; place-items:center; cursor:pointer;
      font-weight:700; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size:calc(2.7 * var(--u)); line-height:1; color:#fff;
      z-index:5;
      box-shadow:0 6px 10px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.35);
    }
    .ficha.mia      { background:radial-gradient(circle at 35% 30%, #7fb4ea, var(--azul) 62%, #2a5c92) }
    .ficha::after {
      content:""; position:absolute; left:50%; top:132%;
      width:calc(7 * var(--u)); height:calc(2.5 * var(--u));
      transform:translate(-50%,-50%);
      border-radius:50%; z-index:-1;
      background:radial-gradient(closest-side, rgba(0,0,0,.5), transparent);
    }
    .ficha:active { filter:brightness(1.15) }
    .ficha.atacante { background:radial-gradient(circle at 35% 30%, #f0836f, var(--rojo) 62%, #8e2b1e) }
    .ficha.ajena    {
      background:radial-gradient(circle at 35% 30%, #c08ad6, var(--morado) 62%, #5c2a72);
      border-style:dashed; border-color:rgba(255,255,255,.55);
    }

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
    .num-calle {
      position:absolute; margin:calc(-2.07 * var(--u)) 0 0 calc(-2.07 * var(--u));
      width:calc(4.13 * var(--u)); aspect-ratio:1; border-radius:50%;
      background:rgba(0,0,0,.45); border:calc(.2 * var(--u)) solid rgba(195,204,212,.2);
      display:grid; place-items:center;
      font-weight:700; font-family:ui-monospace,monospace;
      font-size:calc(1.86 * var(--u)); line-height:1; color:rgba(195,204,212,.7);
      z-index:3;
    }
  </style>`;
}

