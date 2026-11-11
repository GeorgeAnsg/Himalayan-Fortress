/* Cliente visual de Bunker Wars — fase 1: el búnker y el claro. */

import { esc, avatarSVG, modal } from "../../app/ui.js";

export function pintar(contenedor, { publica, privada, jugadores, tu, acciones, alAccion, alSalir }) {
  if (!publica) { contenedor.innerHTML = "Cargando…"; return; }

  const { luna, fase, turnoActual, jugadores: tableros } = publica;
  const yo = tableros?.[tu] ?? null;
  const rivales = Object.values(tableros ?? {}).filter(j => j.id !== tu);
  const teToca = privada?.teToca ?? false;

  enviarAccion = typeof alAccion === "function" ? alAccion : null;
  salirMesa = typeof alSalir === "function" ? alSalir : null;
  accionesMesa = acciones ?? [];
  boxActual = privada?.box ?? [];
  faseMesa = fase ?? null;
  tocaMesa = teToca;
  cienciasMesa = yo?.bunker?.ciencia ?? [];
  nivelEnemigoMesa = publica.nivelEnemigo ?? 1;

  contenedor.innerHTML = `
    ${css()}
    ${cssAdicional()}

    <!-- CABECERA -->
    <div class="bw-top">
      <span class="bw-luna${publica.nivelEnemigo === 2 ? " roja" : ""}" title="${
        publica.nivelEnemigo === 2
          ? "Luna roja: los monstruos llegan con su nivel real"
          : "Luna blanca: los monstruos entran como nivel 1"}">${publica.nivelEnemigo === 2 ? "🔴" : "🌙"} ${luna ?? "—"} / 25</span>
      <span class="bw-fase">${labelFase(fase)}</span>
      ${rivales.map(r => `
        <span class="bw-rival ${r.puntosMonsters >= 16 ? "peligro" : ""}">
          <span style="display:inline-flex;width:18px;height:18px">${avatarSVG(r.avatar)}</span>
          ${esc(r.nombre)} · ${r.puntosMonsters}/20
        </span>
      `).join("")}
      <button class="bw-salir" type="button" title="Salir de la partida">Salir</button>
    </div>

    ${yo ? pintarMiBunker(yo, privada, fase) : ""}

    ${teToca && acciones?.length ? `
      <div class="bw-acciones">
        ${acciones.map((a, i) => `<button type="button" class="bw-accion" data-i="${i}">${esc(a.texto ?? a.tipo ?? "Seguir")}</button>`).join("")}
      </div>
    ` : ""}
  `;

  /* Las cartas no llevan onclick: la CSP bloquea los manejadores en línea.
     Un solo listener delegado en la mano, enganchado después de pintar. */
  const manoEl = contenedor.querySelector(".bw-mano");
  manoEl?.addEventListener("click", async (ev) => {
    const carta = ev.target.closest(".bw-carta");
    if (!carta || !manoEl.contains(carta)) return;
    /* En la fase de descartar, tocar una carta ES descartarla: abrir el modal
       de "usar carta" ahí no descartaba nada y el jugador no sabía qué se
       estaba llevando la mesa. */
    if (faseMesa === "descartar" && tocaMesa) {
      const uid = carta.dataset.uid;
      if (!uid || !enviarAccion) return;
      const r = await enviarAccion({ tipo: "descartar", cartaIds: [uid] });
      if (r?.error) aviso(r.error, { error: true });
      return;
    }
    abrirCarta(carta);
  });

  /* Acciones legales que manda la mesa: Continuar, lanzar, construir… */
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

  /* Salir de la partida es cosa del juego, no de la cuenta: va en su cabecera
     y pide confirmación, porque deja el asiento libre para siempre. */
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
    const res = await salirMesa();
    if (res?.error) aviso(res.error, { error: true });
  });

  /* Un monstruo del box se clica para mandarlo a la lanzadera o a un sendero. */
  const boxEl = contenedor.querySelector(".bw-box");
  boxEl?.addEventListener("click", (ev) => {
    const slot = ev.target.closest(".bw-box-slot[data-mon-id]");
    if (!slot) return;
    const mon = boxActual.find((m) => m?.id === slot.dataset.monId);
    if (mon) abrirEnvio(mon);
  });
}

/* ── Mi búnker completo ─────────────────────────────────────────────────── */

function pintarMiBunker(j, priv, fase) {
  const energia  = priv?.energia ?? 0;
  const acciones = priv?.accionesRestantes ?? 0;
  const mano     = priv?.mano ?? [];
  const descartando = fase === "descartar" && !!priv?.teToca;

  return `
    <!-- STATS rápidos -->
    <div class="bw-stats">
      <span class="bw-stat-chip energia">⚡ ${energia}</span>
      <span class="bw-stat-chip acc">🎯 ${acciones}</span>
      <span class="bw-stat-chip pts ${j.puntosMonsters >= 16 ? "peligro" : ""}">
        💥 ${j.puntosMonsters}/20
      </span>
    </div>

    ${pintarDestino(priv?.cartaDestino, priv?.mazoDestino)}

    <!-- CLARO -->
    <div class="bw-panel claro-panel">
      <div class="bw-panel-label">Claro</div>
      ${pintarClaro(j, priv)}
    </div>

    <!-- BÚNKER -->
    <div class="bw-panel bunker-panel">
      <div class="bw-panel-label">Búnker</div>
      <div class="bw-slots">
        ${pintarSlotRecursos(j.bunker)}
        ${pintarSlotNivel("armeria",     "🔧 Armería",     j.bunker?.armeria     ?? 0, 3)}
        ${pintarSlotNivel("laboratorio", "🧪 Laboratorio", j.bunker?.laboratorio ?? 0, 4)}
        ${pintarSlotTorres(j.bunker)}
        ${pintarSlotCiencia(j.bunker?.ciencia ?? [])}
      </div>
    </div>

    ${pintarBox(priv)}

    <!-- MANO -->
    <div class="bw-panel mano-panel">
      <div class="bw-panel-label">Mano <span class="bw-panel-sub">${mano.length} / 4${descartando ? " · toca una carta para descartarla" : ""}</span></div>
      <div class="bw-mano">
        ${mano.length
          ? mano.map(c => pintarCarta(c, priv, fase, j.bunker)).join("")
          : `<span class="bw-vacío">Sin cartas</span>`}
      </div>
    </div>
  `;
}

/* ── Claro: imagen + grid 5×5 alineado ─────────────────────────────────── */

function pintarClaro(j, priv) {
  const s = j?.senderos ?? [{}, {}, {}];
  const lanzaderas = priv?.lanzaderas ?? [null, null];

  /* Ficha que ocupa una casilla del camino. El motor manda `posiciones`
     (array de 4); la partida antigua usaba `monstruos` con `pos`. */
  const fichaEn = (sd, paso) => {
    const p = sd?.posiciones;
    if (Array.isArray(p)) return p[paso] ?? null;
    return (sd?.monstruos ?? []).find((m) => m.pos === paso) ?? null;
  };
  const fuerzaDe = (f) => f.nivel ?? f.fuerza ?? "?";

  /* Casilla del camino, numerada 1-4: la 1 es el inicio (junto a la
     lanzadera) y la 4 es la que toca al búnker. */
  const celdaPaso = (sd, paso) => {
    const f = fichaEn(sd, paso);
    const n = paso + 1;
    const nv = f ? fuerzaDe(f) : null;
    /* En un mismo camino conviven dos monstruos que van en direcciones
       opuestas: el atacante rival entra por la casilla 1 y baja al búnker;
       el tuyo sale de la casilla 4 y sube a la lanzadera. El tuyo va en azul
       y cada ficha lleva su flecha para no perder de vista hacia dónde anda. */
    const esAtacante = f?.tipo === "atacante";
    const esPropio = f?.tipo === "monstruo";
    /* Atacante lanzado por otro jugador desde su lanzadera: va en morado, pero
       se mueve y combate igual que cualquier atacante de la carta de Destino. */
    const ajeno = esAtacante && !!f.dueno;
    const dir = esAtacante ? "▼" : esPropio ? "▲" : "";
    const quien = esAtacante
      ? "monstruo atacante enviado por un rival (va al búnker)"
      : "tu monstruo (va a la lanzadera)";
    /* La ficha lleva su nivel a la vista: un número suelto no decía si era un
       monstruo, una torre o basura de la casilla. */
    return `<div class="gc paso s ${f ? `mon ${esPropio ? "mio" : ajeno ? "ajeno" : "rival"}` : ""}" title="Camino, casilla ${n}${n === 1 ? " (inicio)" : ""}${
      f ? ` · ${quien} nivel ${nv}` : ""}">
      <span class="gc-num">${n === 1 ? "I(1)" : n}</span>
      ${f ? `<span class="gc-fuerza">M${nv}${dir ? `<span class="gc-dir">${dir}</span>` : ""}</span>` : ""}
    </div>`;
  };

  // conector entre caminos
  const celdaB = () => `<div class="gc b"></div>`;

  /* Lanzaderas: una por box. La 1 recibe lo del box 1 y la 2 lo del box 2, y
     también es donde acaban los monstruos que llegan por la casilla 1 de los
     caminos de al lado. */
  const celdaLanz = (n) => {
    const l = lanzaderas[n - 1] ?? null;
    return `<div class="gc lanz ${l ? "lleno" : ""}" title="Lanzadera ${n}${
      l ? ` · monstruo ${l.nivel} listo para lanzar` : " (vacía)"}">${l ? "▲" + l.nivel : ""}</div>`;
  };

  /* Posiciones de torre del búnker (una por calle: la N es del camino N).
     La torre dispara a cualquier camino, pero fuera del suyo hace 1 menos de
     daño. Queda inhabilitada mientras haya un atacante en la casilla 4 de su
     propio camino. */
  const celdaTorre = (i) => {
    const t = j?.bunker?.torres?.[i] ?? null;
    const n = t?.nivel ?? 0;
    const off = !!t && !!t.inhabilitada;
    const clases = ["torrepos", n > 0 ? "tor nv" + n : "", off ? "off" : ""].filter(Boolean).join(" ");
    const title = n === 0
      ? `Posición de torre ${i + 1} (calle del camino ${i + 1})`
      : `Torre ${i + 1} nivel ${n} · calle camino ${i + 1} · ${n} de daño en su calle, ${Math.max(0, n - 1)} en las demás`
        + (off ? " · INHABILITADA: atacante en la casilla 4 de su camino" : "");
    const dentro = n === 0
      ? "TORRE"
      : `<span>▲${n}</span>${off ? '<span class="gc-off">✕</span>' : ""}`;
    return `<div class="gc ${clases}" title="${title}">${dentro}</div>`;
  };

  return `
    <div class="bw-claro-wrap">
      <div class="bw-claro">
        <div class="bw-claro-cols">
          <span title="Camino 1">C1</span><span title="Lanzadera 1">L1</span><span title="Camino 2">C2</span><span title="Lanzadera 2">L2</span><span title="Camino 3">C3</span>
        </div>
        <div class="bw-claro-grid">
          <!-- casilla 1 de cada camino + lanzaderas -->
          ${celdaPaso(s[0],0)} ${celdaLanz(1)} ${celdaPaso(s[1],0)} ${celdaLanz(2)} ${celdaPaso(s[2],0)}
          <!-- casilla 2 -->
          ${celdaPaso(s[0],1)} ${celdaB()} ${celdaPaso(s[1],1)} ${celdaB()} ${celdaPaso(s[2],1)}
          <!-- casilla 3 -->
          ${celdaPaso(s[0],2)} ${celdaB()} ${celdaPaso(s[1],2)} ${celdaB()} ${celdaPaso(s[2],2)}
          <!-- casilla 4: junto al búnker -->
          ${celdaPaso(s[0],3)} ${celdaB()} ${celdaPaso(s[1],3)} ${celdaB()} ${celdaPaso(s[2],3)}
          <!-- posiciones de torre del búnker / boxes (el 1 entre caminos 1 y 2, el 2 entre 2 y 3) -->
          ${celdaTorre(0)} <div class="gc box">BOX 1</div> ${celdaTorre(1)} <div class="gc box">BOX 2</div> ${celdaTorre(2)}
        </div>
        <div class="bw-claro-leyenda">C = camino · L = lanzadera · I(1) = inicio del camino · TORRE = posición de torre del búnker<br>
          Tu monstruo en azul ▲ hacia la lanzadera · atacante en rojo ▼ hacia el búnker · en morado, el atacante que te ha enviado otro jugador</div>
      </div>
    </div>
  `;
}

/* ── Box de monstruos ───────────────────────────────────────────────────── */

function pintarBox(priv) {
  const box = priv?.box ?? [];

  /* Dos cajas de 3 huecos. Cada caja solo alcanza los dos caminos que toca. */
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
    <div class="bw-panel box-panel">
      <div class="bw-panel-label">📦 Box <span class="bw-panel-sub">${box.filter(Boolean).length} / 6</span></div>
      <div class="bw-cajas">${caja(0)}${caja(1)}</div>
      <div class="bw-slot-sub" style="margin-top:6px">Toca un monstruo para mandarlo a la lanzadera o al inicio de un camino de su caja.</div>
    </div>
  `;
}

/* ── Slots del búnker ───────────────────────────────────────────────────── */

/* Lo que aporta cada carta de recursos, igual que en el motor. */
function bonusRecurso(nivel) {
  if (nivel >= 4) return { e: 4, a: 2 };
  if (nivel === 3) return { e: 3, a: 1 };
  if (nivel === 2) return { e: 2, a: 1 };
  return { e: 1, a: 0 };
}

function pintarSlotRecursos(bunker) {
  const rec = bunker?.recursos ?? [];
  const max = 4;

  let extraE = 0;
  let extraA = 0;
  for (const c of rec) {
    const b = bonusRecurso(c.nivel ?? 1);
    extraE += b.e;
    extraA += b.a;
  }

  const slots = Array.from({ length: max }, (_, i) => {
    const c = rec[i];
    if (!c) return `<div class="bw-rec-slot vacio" title="Hueco de recursos libre">·</div>`;
    const b = bonusRecurso(c.nivel ?? 1);
    return `
      <div class="bw-rec-slot lleno n${Math.min(4, c.nivel ?? 1)}"
           title="${esc(c.descripcion ?? `Recursos ${c.nivel}`)}">
        <span class="bw-rec-nivel">R${c.nivel ?? 1}</span>
        <span class="bw-rec-bonus">+${b.e}⚡${b.a ? ` +${b.a}🎯` : ""}</span>
      </div>`;
  }).join("");

  return `
    <div class="bw-slot recursos">
      <div class="bw-slot-label">⚡ Recursos</div>
      <div class="bw-slot-body">
        <div class="bw-rec-slots">${slots}</div>
        <div class="bw-slot-sub">${rec.length} / ${max}</div>
        <div class="bw-rec-total">Total por turno</div>
        <div class="bw-rec-total bw-rec-cifras"><strong>${3 + extraE}⚡</strong> · <strong>${2 + extraA}🎯</strong></div>
      </div>
    </div>
  `;
}

function pintarSlotNivel(tipo, label, nivel, max) {
  const estrellas = nivel > 0
    ? `<span class="bw-nivel-stars">${"★".repeat(nivel)}${"☆".repeat(max - nivel)}</span>`
    : `<span class="bw-nivel-none">sin construir</span>`;

  return `
    <div class="bw-slot ${tipo}">
      <div class="bw-slot-label">${label}</div>
      <div class="bw-slot-body">
        ${estrellas}
        <div class="bw-slot-sub">Nv ${nivel} / ${max}</div>
      </div>
    </div>
  `;
}

/* Torres del búnker: 3 posiciones, cada una con su calle (camino 1–3). */
function pintarSlotTorres(bunker) {
  const torres = bunker?.torres ?? [null, null, null];
  const chips = Array.from({ length: 3 }, (_, i) => {
    const t = torres[i];
    if (!t) {
      return `<div class="bw-torre-chip" title="Posición de torre ${i + 1} libre (calle del camino ${i + 1})">·<span class="calle">C${i + 1}</span></div>`;
    }
    const title = `Torre ${i + 1} nivel ${t.nivel} · calle del camino ${i + 1} · ${t.nivel} de daño en su calle, ${Math.max(0, t.nivel - 1)} en las demás`
      + (t.inhabilitada ? " · inhabilitada: atacante en la casilla 4 de su camino" : "");
    return `<div class="bw-torre-chip nv${t.nivel}${t.inhabilitada ? " off" : ""}" title="${title}">▲${t.nivel}<span class="calle">C${i + 1}</span></div>`;
  }).join("");

  return `
    <div class="bw-slot torres">
      <div class="bw-slot-label">🛡 Torres</div>
      <div class="bw-slot-body">
        <div class="bw-torres">${chips}</div>
        <div class="bw-slot-sub">posiciones 1–3</div>
      </div>
    </div>
  `;
}

/* Ciencia permanente: dos huecos. Una tercera obliga a descartar una de las
   que ya están puestas. */
const SLOTS_CIENCIA = 2;

function pintarSlotCiencia(ciencias) {
  const huecos = Array.from({ length: SLOTS_CIENCIA }, (_, i) => {
    const c = ciencias[i];
    return c
      ? `<span class="bw-ciencia-chip" title="${esc(c.descripcion ?? "")}">${esc(NOMBRES_EFECTO[c.efecto] ?? c.titulo ?? c.efecto ?? "?")}</span>`
      : `<span class="bw-nivel-none">vacío</span>`;
  }).join("");
  return `
    <div class="bw-slot ciencia">
      <div class="bw-slot-label">🔬 Ciencia</div>
      <div class="bw-slot-body">
        ${huecos}
        <div class="bw-slot-sub">${ciencias.length} / ${SLOTS_CIENCIA}</div>
      </div>
    </div>
  `;
}

/* ── Carta de Destino del turno ─────────────────────────────────────────── */

/* Texto de la carta que ha caído este turno, con la redacción de la carta
   física. El motor manda tipo, nivel y prioridad. */
function textoDestino(d) {
  /* `nivelReal` es el que entra de verdad (antes de la carta roja todo baja a
     1). Si no coincide con el de la carta se dice, para que nadie busque un
     monstruo de nivel 5 que la luna no ha dejado entrar. */
  /* Mesas viejas traen la carta sin `nivelReal`: se deduce igual, porque antes
     de la carta roja la luna deja todo en nivel 1. */
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
    case "miedo":            return "Todos los atacantes de la mesa retroceden una casilla";
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

/* La plataforma inyecta aquí el envío de acciones (socket con acuse).
   Si no hay, el modal avisa en vez de fallar en silencio. */
let enviarAccion = null;
let salirMesa = null;
let nivelEnemigoMesa = 1;
let accionesMesa = [];
let boxActual = [];
let faseMesa = null;
let tocaMesa = false;
let cienciasMesa = [];

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

/* Misma regla que el motor: la carta tiene que encajar en el búnker. */
function cartaValida(c, bunker) {
  if (!bunker) return true;
  if (c.tipo === "armeria")     return c.nivel === (bunker.armeria ?? 0) + 1;
  if (c.tipo === "laboratorio") return c.nivel === (bunker.laboratorio ?? 0) + 1;
  if (c.tipo === "recursos")    return (bunker.recursos?.length ?? 0) < 4;
  if (c.tipo === "ciencia")     return !(bunker.ciencia ?? []).some(x => x.efecto === c.efecto);
  /* Misma regla que el motor: las subidas de nivel no se juegan al tope. */
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
  /* En la fase de descartar las cartas se tocan para descartarlas, no para
     jugarlas: tienen que verse seleccionables. */
  const descartable = fase === "descartar" && !!priv?.teToca;

  return `
    <div class="bw-carta ${t.cls}${jugable ? " jugable" : " no-jugable"}${descartable ? " descartable" : ""}"
         data-uid="${esc(c.uid ?? "")}"
         data-tipo="${esc(c.tipo ?? "")}"
         data-coste="${coste}"
         data-efecto="${esc(c.efecto ?? "")}"
         data-titulo="${esc(c.titulo ?? t.label)}"
         data-descripcion="${esc(c.descripcion ?? "")}"
         data-emoji="${t.emoji}"
         data-encaja="${encaja ? "1" : "0"}"
         data-jugable="${jugable ? "1" : "0"}">
      <span class="bw-carta-emoji">${t.emoji}</span>
      <span class="bw-carta-label">${esc(t.label)}</span>
      <span class="bw-carta-coste">${coste}⚡</span>
      <span class="bw-carta-descripcion">${esc(c.descripcion ?? "")}</span>
    </div>
  `;
}

/* Abre la carta en el centro. El modal es la carta: grande, con su coste y
   su descripción, y debajo el botón de usarla. */
function abrirCarta(el) {
  cerrarCarta();
  const d = el.dataset;
  const jugable = d.jugable === "1";
  /* Ciencia con los dos huecos llenos: hay que elegir cuál sale. */
  const reemplazos = d.tipo === "ciencia" && cienciasMesa.length >= SLOTS_CIENCIA ? cienciasMesa : null;
  /* Acciones que la mesa declara para esta carta. Cuando hay más de una (los
     dos edificios de "Laboratorio o armería", o cada monstruo al que subir el
     rango), el modal enseña un botón por opción. */
  const opciones = accionesMesa.filter(a => a.tipo === "mejorar_bunker" && a.cartaId === d.uid);
  const elecciones = !reemplazos && opciones.length > 1 ? opciones : null;
  /* Ciencias que necesitan elegir algo: si no hay ninguna opción, mejor avisar
     que gastar la carta para nada. */
  const CON_OBJETIVO = ["subir_rango", "avanzar_rival_1", "convertir_aliado", "bajar_nivel_enemigo",
    "evolucionar_torreta", "vuelo_seguro", "torreta2_gratis", "monstruo3_gratis", "subir_lab_o_arm"];
  const sinObjetivo = jugable && CON_OBJETIVO.includes(d.efecto) && opciones.length === 0;
  const motivo = jugable
    ? reemplazos
      ? "Tu búnker tiene dos ciencias. Al instalar esta sale una de las dos: elige cuál."
      : elecciones
        ? d.efecto === "subir_lab_o_arm"
          ? "Elige qué sube de nivel: la armería o el laboratorio."
          : "Elige el objetivo de la carta."
        : sinObjetivo
          ? "Ahora mismo no hay ningún objetivo válido para esta carta: guárdala para más adelante."
          : ""
    : d.encaja === "0"
      ? d.tipo === "ciencia_i"
        ? "Ese edificio ya está a su nivel máximo, así que esta carta no subiría nada: guárdala para cuando lo amplíes."
        : "Esta carta no encaja en tu búnker ahora mismo: sube al nivel inmediatamente siguiente y no repitas lo que ya tienes."
      : "Solo se juega en tu fase de acciones: hace falta tu turno, una acción disponible y energía suficiente.";

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-carta";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="${esc(d.titulo)}">
      <div class="bw-carta-grande ${el.className.replace(/bw-carta|jugable|no-jugable/g, "").trim()}">
        <span class="bw-carta-grande-emoji">${d.emoji || "🎴"}</span>
        <span class="bw-carta-grande-titulo">${esc(d.titulo)}</span>
        <span class="bw-carta-grande-desc">${esc(d.descripcion)}</span>
        <span class="bw-carta-grande-coste">${d.coste}⚡</span>
      </div>
      <div class="bw-modal-acciones">
        ${reemplazos
          ? reemplazos.map(c => `<button type="button" class="bw-modal-usar" data-reemplazo="${esc(c.efecto ?? "")}"${jugable ? "" : " disabled"}>Quitar ${esc(NOMBRES_EFECTO[c.efecto] ?? c.titulo ?? c.efecto ?? "?")}</button>`).join("")
          : elecciones
            ? elecciones.map(a => `<button type="button" class="bw-modal-usar" data-accion="${accionesMesa.indexOf(a)}"${jugable ? "" : " disabled"}>${esc(a.edificio ? (a.edificio === "armeria" ? "Subir armería" : "Subir laboratorio") : (a.etiqueta ?? a.texto ?? "Usar carta"))}</button>`).join("")
            : `<button type="button" class="bw-modal-usar"${jugable ? "" : " disabled"}${opciones.length === 1 ? ` data-accion="${accionesMesa.indexOf(opciones[0])}"` : ""}>Usar carta</button>`}
        <button type="button" class="bw-modal-cerrar">Cerrar</button>
      </div>
      ${motivo ? `<p class="bw-modal-nota">${motivo}</p>` : ""}
    </div>
  `;
  document.body.appendChild(fondo);

  fondo.querySelector(".bw-modal-cerrar").addEventListener("click", cerrarCarta);
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

/* Enviar un monstruo del box: solo se ofrecen las jugadas que la mesa declara
   legales para él (lanzadera o un hueco libre de cada sendero). */
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

// Helper para mostrar avisos
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

/* ── CSS del modal de carta ─────────────────────────────────────────────── */

function cssAdicional() {
  return `<style>
    .bw-carta { cursor:pointer; transition:transform .1s, box-shadow .1s; }
    .bw-carta.jugable:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,.18); }
    .bw-carta.no-jugable { opacity:.55; cursor:not-allowed; }
    .bw-carta.descartable { opacity:1; cursor:pointer; border-color:rgba(194,112,90,.55); }
    .bw-carta.descartable:hover { box-shadow:0 0 0 2px rgba(194,112,90,.45); }
    .bw-carta:active { transform:scale(.97); }

    .bw-modal-fondo { position:fixed; inset:0; background:rgba(0,0,0,.72);
      display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
    .bw-modal { display:flex; flex-direction:column; gap:14px; width:min(340px,92vw); }
    /* La carta del modal es papel claro con letra negra: se lee de un vistazo. */
    .bw-carta-grande { display:flex; flex-direction:column; align-items:center;
      gap:10px; padding:26px 22px; border-radius:16px; text-align:center;
      background:#f4ecdd; color:#12100e;
      border:2px solid rgba(18,16,14,.22);
      box-shadow:0 18px 50px rgba(0,0,0,.45); }
    .bw-carta-grande-emoji { font-size:54px; line-height:1; }
    .bw-carta-grande-titulo { font-size:20px; font-weight:800; letter-spacing:.02em; color:#12100e; }
    .bw-carta-grande-desc { font-size:14px; line-height:1.45; color:#3f382b; }
    .bw-carta-grande-coste { font-size:15px; font-weight:800; padding:4px 12px;
      border-radius:999px; background:rgba(18,16,14,.1); color:#12100e; }
    .bw-modal-acciones { display:flex; gap:10px; }
    .bw-modal-acciones button { flex:1; padding:13px 16px; border-radius:var(--radio-chico,5px);
      font-size:15px; font-weight:800; cursor:pointer; border:none; }
    .bw-modal-usar { background:linear-gradient(180deg,var(--plata-claro,#f4f7f9),var(--plata,#c3ccd4)); color:#12161a; }
    .bw-modal-usar:disabled { opacity:.5; cursor:not-allowed; }
    .bw-modal-cerrar { background:#f4ecdd; color:#12100e; }
    .bw-modal-nota { margin:0; padding:9px 12px; border-radius:10px;
      background:rgba(18,16,14,.92); border:1px solid rgba(244,236,221,.12);
      font-size:12.5px; line-height:1.4; text-align:center;
      color:var(--tinta-suave,#b7a992); }

    /* Acciones: botón claro con letra negra, para que se lea cuál se pulsa. */
    .bw-acciones { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .bw-accion { padding:11px 16px; border-radius:var(--radio-chico,5px); font-size:14px;
      font-weight:700; cursor:pointer; border:1px solid rgba(18,22,26,.35);
      background:linear-gradient(180deg,#f4f7f9,#c2cbd3); color:#12161a; }
    .bw-accion:hover { background:linear-gradient(180deg,#ffffff,#d6dee5); }
    .bw-accion:disabled { opacity:.45; cursor:default; }
  </style>`;
}
/* ── Labels ─────────────────────────────────────────────────────────────── */

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

/* ── CSS ────────────────────────────────────────────────────────────────── */

function css() {
  return `<style>
    .bw { font-family: inherit; }

    /* Cabecera */
    .bw-top { display:flex; gap:8px; align-items:center; flex-wrap:wrap;
               margin-bottom:16px; padding-bottom:10px;
               border-bottom:1px solid var(--borde-fuerte,rgba(244,236,221,.16)); }
    .bw-luna { font-weight:700; font-size:15px; }
    .bw-luna.roja { color:var(--peligro,#e74c3c); }
    .bw-fase { font-size:12px; padding:2px 10px; border-radius:99px;
                background:var(--panel-2,#231d18);
                border:1px solid var(--borde-fuerte,rgba(244,236,221,.16)); }
    .bw-rival { font-size:12px; padding:2px 10px; border-radius:99px;
                 background:var(--panel-2,#231d18);
                 border:1px solid var(--borde-fuerte,rgba(244,236,221,.16));
                 display:flex; gap:4px; align-items:center; }
    .bw-rival.peligro { background:rgba(194,112,90,.22); color:#ffb4a2; border-color:rgba(194,112,90,.5); }
    .bw-salir { margin-left:auto; padding:3px 10px; border-radius:99px; cursor:pointer;
                font:inherit; font-size:11.5px; color:#ffb4a2;
                background:transparent; border:1px solid rgba(194,112,90,.45); }
    .bw-salir:hover { background:rgba(194,112,90,.18); }

    /* Stats rápidos */
    .bw-stats { display:flex; gap:8px; margin-bottom:16px; }
    .bw-stat-chip { padding:4px 12px; border-radius:99px; font-size:13px; font-weight:700;
                    background:var(--panel-2,#231d18); color:var(--tinta,#f4ecdd);
                    border:1px solid var(--borde-fuerte,rgba(244,236,221,.16)); }
    .bw-stat-chip.energia { background:rgba(206,214,222,.16); color:var(--plata-claro,#f1f5f8); border-color:rgba(206,214,222,.45); }
    .bw-stat-chip.peligro { background:rgba(194,112,90,.22); color:#ffb4a2; border-color:rgba(194,112,90,.5); }

    /* Carta de Destino del turno, a la vista en la mesa */
    .bw-destino { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                  margin-bottom:12px; padding:10px 12px; border-radius:12px;
                  background:var(--panel,#1b1713);
                  border:1px solid var(--borde-fuerte,rgba(244,236,221,.16));
                  border-left:4px solid rgba(244,236,221,.35); color:var(--tinta,#f4ecdd); }
    .bw-destino.amenaza { border-left-color:#c2705a; background:rgba(194,112,90,.12); }
    .bw-destino.roja    { border-left-color:#e04b3a; background:rgba(224,75,58,.16); }
    .bw-destino-tag { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
                      color:var(--tinta-suave,#b7a992); }
    .bw-destino-txt { font-size:13px; font-weight:600; flex:1; min-width:220px; }
    .bw-destino-mazo { font-size:11px; color:var(--tinta-suave,#b7a992); }

    /* Paneles */
    .bw-panel { border-radius:12px; border:1px solid var(--borde-fuerte,rgba(244,236,221,.16));
                 background:var(--panel,#1b1713);
                 padding:12px; margin-bottom:10px; color:var(--tinta,#f4ecdd); }
    .bw-panel-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
                       color:var(--tinta-suave,#b7a992); margin-bottom:10px; }
    .bw-panel-sub { font-weight:400; text-transform:none; letter-spacing:0; }
    .claro-panel  { border-color:var(--borde-fuerte,rgba(244,236,221,.16)); }
    .bunker-panel { border-color:#2980b9; }
    .mano-panel   { border-color:#6c3483; }

    /* Claro: grid centrado, sin desbordamiento */
    .bw-claro-wrap {
      display:flex;
      justify-content:center;
    }
    .bw-claro { display:flex; flex-direction:column; align-items:center; }
    /* Cabecera: numera los caminos (C) y las lanzaderas (L) */
    .bw-claro-cols {
      display:grid;
      grid-template-columns: repeat(5, 44px);
      column-gap: 20px;
      margin-bottom:5px;
      text-align:center;
      font-size:9px; font-weight:800; letter-spacing:.04em;
      color:var(--tinta-suave,#b7a992);
    }
    .bw-claro-leyenda {
      margin-top:8px; font-size:9px; text-align:center;
      color:var(--tinta-tenue,#8b7e6b);
    }
    .bw-claro-grid {
      display:grid;
      grid-template-columns: repeat(5, 44px);
      grid-template-rows: repeat(5, 44px);
      row-gap: 8px;
      column-gap: 20px;
    }

    /* Celda cuadrada fija */
    .gc {
      width:44px; height:44px;
      border-radius:6px;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700;
      box-sizing:border-box;
    }
    /* sendero */
    .gc.s { border:1.5px dashed rgba(255,255,255,.3); }
    /* casilla numerada del camino */
    .gc.paso { flex-direction:column; gap:0; padding:1px; }
    .gc-num { font-size:7px; line-height:1; font-weight:700; opacity:.8; }
    .gc-fuerza { font-size:12px; font-weight:800; line-height:1.15; }
    .gc.lanz { border:1.5px dashed rgba(255,255,255,.25); color:rgba(255,255,255,.45); font-size:8px; }
    .gc.lanz.lleno { border-style:solid; border-color:var(--musgo,#8fae63); background:rgba(143,174,99,.25); color:#c3d89a; font-size:11px; }
    .gc.s.mon { box-shadow:inset 0 0 0 2px rgba(255,255,255,.12); }
    .gc.s.mon.rival { background:var(--ficha-rival-tinte,rgba(231,76,60,.3)); border-color:var(--ficha-rival,#e74c3c); color:var(--ficha-rival,#e74c3c);
                box-shadow:inset 0 0 0 2px var(--ficha-rival-tinte,rgba(231,76,60,.25)); }
    .gc.s.mon.mio { background:var(--ficha-mia-tinte,rgba(74,144,217,.32)); border-color:var(--ficha-mia,#4a90d9); color:var(--ficha-mia-texto,#8dc0f0);
                box-shadow:inset 0 0 0 2px var(--ficha-mia-tinte,rgba(74,144,217,.35)); }
    /* atacante lanzado por otro jugador: mismo comportamiento, color morado */
    .gc.s.mon.ajeno { background:var(--ficha-ajena-tinte,rgba(155,89,182,.35)); border-color:var(--ficha-ajena,#9b59b6); color:var(--ficha-ajena-texto,#d7bde2);
                box-shadow:inset 0 0 0 2px var(--ficha-ajena-tinte,rgba(155,89,182,.4)); }
    .gc-dir { font-size:8px; margin-left:1px; opacity:.9; }
    /* torreta */
    .gc.tor { border-style:solid; border-color:rgba(255,255,255,.2); }
    .gc.tor.nv1 { border-color:var(--torre-1,#27ae60); background:rgba(39,174,96,.25); color:var(--torre-1,#27ae60); }
    .gc.tor.nv2 { border-color:var(--torre-2,#f39c12); background:rgba(243,156,18,.25); color:var(--torre-2,#f39c12); }
    .gc.tor.nv3 { border-color:var(--torre-3,#e74c3c); background:rgba(231,76,60,.25); color:var(--torre-3,#e74c3c); }
    /* conector/BOX */
    .gc.b { border:1.5px dashed rgba(255,255,255,.12); }
    /* posición de torre del búnker: aquí vive cada torre */
    .gc.torrepos { border:1.5px solid rgba(255,255,255,.2); font-size:9px; color:rgba(255,255,255,.5); }
    .gc.torrepos.off { flex-direction:column; gap:0; opacity:.5; border-style:dashed; }
    /* torres en el panel del búnker */
    .bw-torres { display:flex; gap:4px; flex-wrap:wrap; }
    .bw-torre-chip { display:flex; flex-direction:column; align-items:center; min-width:32px; padding:2px 3px;
      border:1px solid rgba(255,255,255,.18); border-radius:5px; font-size:10px; }
    .bw-torre-chip.nv1 { border-color:var(--torre-1,#27ae60); color:var(--torre-1,#27ae60); }
    .bw-torre-chip.nv2 { border-color:var(--torre-2,#f39c12); color:var(--torre-2,#f39c12); }
    .bw-torre-chip.nv3 { border-color:var(--torre-3,#e74c3c); color:var(--torre-3,#e74c3c); }
    .bw-torre-chip.off { opacity:.45; border-style:dashed; }
    .bw-torre-chip .calle { font-size:8px; opacity:.7; }
    .gc-off { font-size:8px; line-height:1; }
    .gc.box  { border:1.5px solid rgba(255,255,255,.12); font-size:9px; color:rgba(255,255,255,.3); }

    /* 4 slots del búnker */
    .bw-slots { display:flex; flex-wrap:wrap; gap:8px; }
    .bw-slot { flex:1 1 118px; border-radius:10px; border:1px solid var(--borde,#ddd);
                padding:10px 8px; display:flex; flex-direction:column; gap:6px;
                min-width:0; }
    .bw-slot.recursos    { border-color:#3498db; }
    .bw-slot.armeria     { border-color:#e67e22; }
    .bw-slot.laboratorio { border-color:#9b59b6; }
    .bw-slot.ciencia     { border-color:#1abc9c; }
    .bw-slot-label { font-size:11px; font-weight:700; white-space:nowrap;
                      overflow:hidden; text-overflow:ellipsis; }
    .bw-slot-body  { display:flex; flex-direction:column; gap:4px; }
    .bw-slot-sub   { font-size:10px; color:var(--tinta-tenue,#8b7e6b); }

    /* Box: dos cajas de 3 huecos, clicables */
    .bw-cajas { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .bw-caja-label { font-size:10px; font-weight:800; letter-spacing:.06em;
                     text-transform:uppercase; color:var(--tinta-suave,#b7a992);
                     margin-bottom:5px; }
    .bw-box { display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; }
    .bw-box-slot { height:34px; border-radius:8px; display:flex; align-items:center;
                   justify-content:center; font-size:11px; font-weight:800;
                   border:1px dashed var(--borde-fuerte,rgba(244,236,221,.16));
                   color:var(--tinta-tenue,#8b7e6b); }
    /* Los monstruos del box son tuyos: mismo azul que en los caminos, para no
       confundirlos con un atacante rival. */
    .bw-box-slot.lleno { border-style:solid; border-color:#4a90d9;
                         background:rgba(74,144,217,.22); color:#8dc0f0; cursor:pointer; }
    .bw-box-slot.lleno:hover { background:rgba(74,144,217,.38); }

    /* Modal de envío del box */
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

    /* Huecos de recursos: cada carta asignada enseña lo que genera */
    .bw-rec-slots { display:grid; grid-template-columns:repeat(2, 1fr); gap:4px; }
    .bw-rec-slot { display:flex; flex-direction:column; align-items:center; justify-content:center;
                   gap:1px; min-width:0; padding:3px 2px; border-radius:7px;
                   border:1px dashed var(--borde-fuerte,rgba(244,236,221,.16)); }
    .bw-rec-slot.vacio { color:var(--tinta-tenue,#8b7e6b); font-size:12px; min-height:30px; }
    .bw-rec-total { font-size:9.5px; line-height:1.3; color:var(--tinta-suave,#b7a992); }
    .bw-rec-total strong { color:var(--tinta,#f4ecdd); }
    .bw-rec-cifras { white-space:nowrap; }
    .bw-rec-cifras strong { font-size:13px; }
    .bw-rec-slot.lleno { border-style:solid; border-color:#3498db;
                         background:rgba(52,152,219,.18); color:#8ecdf5; }
    .bw-rec-slot.lleno.n3 { border-color:var(--plata,#c3ccd4); background:rgba(206,214,222,.16); color:var(--plata-claro,#f1f5f8); }
    .bw-rec-slot.lleno.n4 { border-color:#8fae63; background:rgba(143,174,99,.2); color:#c3d89a; }
    .bw-rec-nivel { font-size:11px; font-weight:800; line-height:1; }
    .bw-rec-bonus { font-size:8.5px; line-height:1.1; white-space:nowrap; }

    /* Estrellas de nivel */
    .bw-nivel-stars { font-size:16px; letter-spacing:1px; }
    .bw-nivel-none  { font-size:11px; color:var(--tinta-tenue,#8b7e6b); }

    /* Ciencia chips */
    .bw-ciencia-chip { font-size:10px; padding:1px 6px; border-radius:99px;
                        background:#d5f5f0; color:#0e6655; }

    /* Mano */
    .bw-mano { display:flex; gap:6px; flex-wrap:wrap; }
    .bw-vacío { font-size:12px; color:var(--tinta-tenue,#8b7e6b); }
    .bw-carta { display:flex; flex-direction:column; align-items:center; gap:2px;
                 padding:8px 10px; border-radius:10px;
                 border:2px solid var(--borde-fuerte,rgba(244,236,221,.16));
                 background:var(--panel-2,#231d18); color:var(--tinta,#f4ecdd);
                 min-width:60px; cursor:default; }
    .bw-carta.recursos    { border-color:#3498db; }
    .bw-carta.armeria     { border-color:#e67e22; }
    .bw-carta.laboratorio { border-color:#9b59b6; }
    .bw-carta.ciencia     { border-color:#1abc9c; }
    .bw-carta.ciencia_i   { border-color:#95a5a6; }
    .bw-carta-emoji { font-size:20px; }
    .bw-carta-label { font-size:11px; font-weight:700; text-align:center; }
    .bw-carta-coste { font-size:10px; color:var(--tinta-suave,#b7a992); }

  </style>`;
}
