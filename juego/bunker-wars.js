/* Bunker Wars — módulo de juego
   Competitivo, 2-6 jugadores. Cada uno tiene su propio búnker.
   Monstruos atacantes llegan por cartas de Destino o lanzados por rivales.
   Gana el último búnker en pie (o quien menos puntos acumule en 25 lunas). */

// ── RNG determinista ──────────────────────────────────────────────────────
function tirar(e) {
  e.rng = (e.rng + 0x6d2b79f5) >>> 0;
  let t = e.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function barajar(arr, e) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(tirar(e) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let _seq = 0;
function uid(p) { return `${p}${++_seq}`; }

// ── Niveles válidos ───────────────────────────────────────────────────────
const NIVELES = [1, 2, 3, 5, 7];
const COSTE_MONSTRUO = { 1: 0, 2: 1, 3: 2, 5: 3, 7: 3 };
/* Cartas de Destino que meten monstruos en los caminos. */
const AMENAZAS = new Set(["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival"]);
/* La luna blanca se vuelve roja al empezar esta ronda: cuatro rondas de robo
   con los búnkeres aún flojos. No es una carta, así que a nadie le quita la
   carta de Destino de su turno. */
const LUNA_ROJA = 5;

// ── Cartas de Destino ─────────────────────────────────────────────────────
const PLANTILLAS_DESTINO = [
  // Amenaza simple (1 monstruo)
  { id:"d01", tipo:"amenaza",        nivel:1, prio:[1,2,3] },
  { id:"d02", tipo:"amenaza",        nivel:1, prio:[2,1,3] },
  { id:"d03", tipo:"amenaza",        nivel:1, prio:[3,2,1] },
  { id:"d05", tipo:"amenaza",        nivel:2, prio:[1,2,3] },
  { id:"d06", tipo:"amenaza",        nivel:2, prio:[2,1,3] },
  { id:"d07", tipo:"amenaza",        nivel:2, prio:[3,2,1] },
  { id:"d09", tipo:"amenaza",        nivel:3, prio:[1,2,3] },
  { id:"d10", tipo:"amenaza",        nivel:3, prio:[2,1,3] },
  { id:"d11", tipo:"amenaza",        nivel:3, prio:[3,2,1] },
  { id:"d13", tipo:"amenaza",        nivel:5, prio:[1,2,3] },
  { id:"d14", tipo:"amenaza",        nivel:5, prio:[2,1,3] },
  { id:"d15", tipo:"amenaza",        nivel:5, prio:[3,2,1] },
  { id:"d17", tipo:"amenaza",        nivel:7, prio:[1,2,3] },
  { id:"d18", tipo:"amenaza",        nivel:7, prio:[2,1,3] },
  { id:"d19", tipo:"amenaza",        nivel:7, prio:[3,2,1] },
  // Amenaza múltiple
  { id:"d04", tipo:"amenaza_triple", nivel:1 },
  { id:"d08", tipo:"amenaza_triple", nivel:2 },
  { id:"d12", tipo:"amenaza_triple", nivel:3 },
  { id:"d16", tipo:"amenaza_doble",  nivel:2, prio:[2,1,3] },
  { id:"d25", tipo:"amenaza_rival",  nivel:2, prio:[2,3,1] },
  // Eventos beneficiosos
  { id:"d21", tipo:"calma" },
  { id:"d31", tipo:"colocar_monstruos",    nivel:3, cantidad:3 },
  { id:"d32", tipo:"colocar_monstruos",    nivel:2, cantidad:3 },
  // Eventos de limpieza
  { id:"d20", tipo:"aniquilar_entrada" },
  { id:"d23", tipo:"aniquilar_nivel",  nivelMax:3 },
  { id:"d24", tipo:"matar_mayor" },
  // Eventos de movimiento
  { id:"d27", tipo:"avanzar_extra" },
  { id:"d28", tipo:"miedo" },
  // Eventos de transformación
  { id:"d26", tipo:"convertir_aliado" },
  { id:"d29", tipo:"subir_monstruos",      nivelMax:5 },
  { id:"d30", tipo:"bajar_monstruos",      nivelMin:2 },
];

// Distribución en ~60 cartas
const DIST_DESTINO = {
  d01:3, d02:3, d03:3, d04:2,
  d05:2, d06:2, d07:2, d08:2,
  d09:2, d10:2, d11:2, d12:1,
  d13:1, d14:1, d15:1, d16:2,
  d17:1, d18:1, d19:1,
  d20:2, d21:3, d23:1,
  d24:1, d25:2, d26:1, d27:2,
  d28:1, d29:1, d30:1, d31:1, d32:1,
};

function crearMazoDestino(nJugadores, e) {
  const cartas = [];
  for (const p of PLANTILLAS_DESTINO) {
    const n = DIST_DESTINO[p.id] ?? 1;
    for (let i = 0; i < n; i++) cartas.push({ ...p, uid: uid("dc") });
  }
  return barajar(cartas, e);
}

// ── Cartas de búnker ──────────────────────────────────────────────────────
const PLANTILLAS_BUNKER = [
  { tipo:"recursos",    nivel:1, coste:1, titulo: "RECURSOS 1", descripcion: "Te permite generar 1 moneda extra al comienzo de cada turno" },
  { tipo:"recursos",    nivel:2, coste:2, titulo: "RECURSOS 2", descripcion: "Generas 2 monedas y 1 acción extra cada turno." },
  { tipo:"recursos",    nivel:3, coste:3, titulo: "RECURSOS 3", descripcion: "Generas 3 monedas y 1 acción extra cada turno." },
  { tipo:"recursos",    nivel:4, coste:4, titulo: "RECURSOS 4", descripcion: "Generas 4 monedas y 2 decretos extra cada turno." },
  { tipo:"armeria",     nivel:2, coste:2, titulo: "ARMERÍA 2", descripcion: "Puedes armar torretas de ataque 1 en un espacio habilitado." },
  { tipo:"armeria",     nivel:3, coste:2, titulo: "ARMERÍA 3", descripcion: "Puedes armar torretas de ataque 2 en un espacio habilitado." },
  { tipo:"laboratorio", nivel:2, coste:2, titulo: "CRIADERO 2", descripcion: "Te permite criar rastreadores y carroñeros en el box." },
  { tipo:"laboratorio", nivel:3, coste:2, titulo: "CRIADERO 3", descripcion: "Te permite criar rastreadores, carroñeros y yetis en el box." },
  { tipo:"laboratorio", nivel:4, coste:2, titulo: "CRIADERO 4", descripcion: "Te permite criar rastreadores, carroñeros, yetis y colosos de hielo en el box." },
  /* Textos copiados de las cartas físicas: no inventar efectos ni redacciones. */
  { tipo:"ciencia",     efecto:"torreta_barata",    coste:8, titulo: "Disparar barato",  descripcion: "Disparar torretas cuesta una moneda menos." },
  { tipo:"ciencia",     efecto:"monstruo_barato",   coste:8, titulo: "Monstruos baratos", descripcion: "Crear monstruos cuesta una moneda menos del valor del monstruo." },
  { tipo:"ciencia",     efecto:"torreta_universal", coste:8, titulo: "Torres universales", descripcion: "Tus torres hacen el daño correspondiente a su nivel en cualquier escalera." },
  { tipo:"ciencia_i",   efecto:"purga",             coste:8, titulo: "Purga", descripcion: "Aniquila todos los monstruos de los peldaños 3 y 4 de tus escaleras, tanto los tuyos como los atacantes." },
  { tipo:"ciencia_i",   efecto:"avanzar_rival_1",   coste:2, titulo: "Avanza al rival", descripcion: "Avanza 1 peldaño a un monstruo de nivel 3 o inferior que esté atacando a un rival. Permite entrada en búnker. Vale un **yeti** (3), un **carroñero** (2) o un **rastreador** (1)." },
  { tipo:"ciencia_i",   efecto:"subir_rango",       coste:2, titulo: "Subir rango", descripcion: "Sube un rango el nivel de un monstruo hasta nivel 5 como máximo que esté defendiendo tu búnker o atacando a un rival: **coloso de hielo** (5), **yeti** (3), **carroñero** (2) o **rastreador** (1)." },
  { tipo:"ciencia_i",   efecto:"convertir_aliado",  coste:2, titulo: "Convertir aliado", descripcion: "Convierte en aliado un monstruo que ataque tu búnker, de nivel 5 como máximo." },
  { tipo:"ciencia_i",   efecto:"bajar_nivel_enemigo",coste:2, titulo: "Bajar rango", descripcion: "Baja un rango el nivel de un monstruo enemigo que esté atacando tu búnker." },
  { tipo:"ciencia_i",   efecto:"evolucionar_torreta",coste:2, titulo: "Evolucionar torre", descripcion: "Evoluciona una torre al siguiente nivel." },
  { tipo:"ciencia_i",   efecto:"vuelo_seguro",       coste:2, titulo: "Vuelo seguro", descripcion: "Manda un monstruo de nivel 3 o inferior (**yeti**, **carroñero** o **rastreador**) a la entrada de una escalera rival." },
  { tipo:"ciencia_i",   efecto:"torreta2_gratis",    coste:3, titulo: "Torre de nivel 2", descripcion: "Construye una torre de nivel 2 en tu búnker sin necesidad de tener ARMERÍA 3." },
  { tipo:"ciencia_i",   efecto:"monstruo3_gratis",   coste:3, titulo: "Monstruo de nivel 3", descripcion: "Crea un monstruo de nivel 3 (**yeti**) en un box sin necesidad de tener CRIADERO 3." },
  /* Estas cuatro suben el nivel al momento: no se busca ninguna carta en el
     mazo ni se baraja, el sobreprecio respecto a la carta de búnker es el
     atajo. */
  { tipo:"ciencia_i",   efecto:"subir_armeria",      coste:3, titulo: "Subir armería", descripcion: "Aumenta un nivel la armería." },
  { tipo:"ciencia_i",   efecto:"subir_laboratorio",  coste:3, titulo: "Subir criadero", descripcion: "Aumenta un nivel el criadero." },
  { tipo:"ciencia_i",   efecto:"subir_recursos",     coste:4, titulo: "Subir recursos", descripcion: "Suma 1 moneda y 1 monje por turno a tu búnker." },
  { tipo:"ciencia_i",   efecto:"subir_lab_o_arm",    coste:4, titulo: "Criadero o armería", descripcion: "Aumenta un nivel el criadero o la armería." },
];

/* Topes de los edificios del búnker. Los recursos no son un nivel único:
   son hasta 4 cartas, cada una con el suyo. */
const TOPE_ARMERIA = 3;
const TOPE_LABORATORIO = 4;
const TOPE_RECURSOS = 4;

// Una copia de cada carta — mazo sin duplicados
const COPIAS_BUNKER = {
  recursos: 1, armeria: 1, laboratorio: 1, ciencia: 1, ciencia_i: 1,
};

/* Cartas que todavía le sirven al jugador: recursos mientras quede hueco en el
   búnker y armería/laboratorio por encima del nivel que ya tiene. */
function cartasUtiles(j) {
  const cartas = [];
  for (const p of PLANTILLAS_BUNKER) {
    const n = COPIAS_BUNKER[p.tipo] ?? 1;
    if (!n) continue;
    if (p.tipo === "recursos" && (j.bunker.recursos?.length ?? 0) >= 4) continue;
    if (p.tipo === "armeria" && p.nivel <= (j.bunker.armeria ?? 0)) continue;
    if (p.tipo === "laboratorio" && p.nivel <= (j.bunker.laboratorio ?? 0)) continue;
    if (p.tipo === "ciencia" && tieneCiencia(j, p.efecto)) continue;
    for (let i = 0; i < n; i++) cartas.push({ ...p, uid: uid("cb") });
  }
  return cartas;
}

function crearMazoBunker(e, j) {
  return barajar(cartasUtiles(j), e);
}

/* El mazo de búnker es infinito: cuando se acaban el mazo y el descarte se
   vuelve a montar con las cartas que aún sirven. Sin esto el mazo se agotaba
   hacia la luna 6-7 y la mano se quedaba a medias al usar una carta. */
function reponerMazoBunker(j, e) {
  if (!j.mazoBunker.length && j.descarteBunker.length) {
    j.mazoBunker = barajar(j.descarteBunker, e);
    j.descarteBunker = [];
  }
  if (j.mazoBunker.length) return;
  j.mazoBunker = barajar(cartasUtiles(j), e);
}

/* Las ciencias llegaron después: en una mesa antigua su mazo y su descarte no
   tienen ninguna, así que nunca saldrían. Si no queda ni una en juego, entra
   una copia de cada una al mazo (una sola vez: luego ya existen). */
function reponerCiencias(j, e) {
  const todas = [...(j.mano ?? []), ...(j.mazoBunker ?? []), ...(j.descarteBunker ?? []), ...(j.bunker?.ciencia ?? [])];
  const faltan = PLANTILLAS_BUNKER.filter(p => (p.tipo === "ciencia" || p.tipo === "ciencia_i")
    && !todas.some(c => c.efecto === p.efecto));
  if (!faltan.length) return;
  j.mazoBunker = barajar([...(j.mazoBunker ?? []), ...faltan.map(p => ({ ...p, uid: uid("cb") }))], e);
}

function robarBunker(j, e) {
  reponerMazoBunker(j, e);
  reponerCiencias(j, e);
  return j.mazoBunker.length ? j.mazoBunker.shift() : null;
}

// ── Helpers de búnker ─────────────────────────────────────────────────────
function energiaTotal(j) {
  return 3 + (j.bunker.extra?.monedas ?? 0) + j.bunker.recursos.reduce((s, c) => {
    return s + (c.nivel >= 4 ? 4 : c.nivel >= 3 ? 3 : c.nivel >= 2 ? 2 : 1);
  }, 0);
}

function accionesTotal(j) {
  return 2 + (j.bunker.extra?.monjes ?? 0) + j.bunker.recursos.reduce((s, c) => {
    return s + (c.nivel >= 4 ? 2 : c.nivel >= 2 ? 1 : 0);
  }, 0);
}

/* Nivel máximo de monstruo que permite crear el criadero:
   criadero 1 → 1 · 2 → 2 · 3 → 3 · 4 (y siguientes) → 5.
   El nivel 5 es el techo del criadero aunque llegue a nivel 7 de edificio:
   el Devorador de cumbres (nivel 7) nunca se crea, solo llega por el mazo de
   Destino o por subidas de rango. Cada nivel pide además sus monedas al
   crearlo (0, 1, 2 y 3), así que con pocas monedas solo sale el de nivel 1. */
const NIVEL_MAX_CRIADERO = 5;

function nivelMaxLab(j) {
  const nivLab = j.bunker.laboratorio ?? 1;
  if (nivLab >= 4) return NIVEL_MAX_CRIADERO;
  return Math.max(1, nivLab);
}

/* Ciencia permanente: dos huecos. Para una tercera hay que pagarla y elegir
   cuál de las dos que tienes se descarta. */
const SLOTS_CIENCIA = 2;

function tieneCiencia(j, efecto) {
  return j.bunker.ciencia.some(c => c.efecto === efecto);
}

function cienciaLlena(j) {
  return j.bunker.ciencia.length >= SLOTS_CIENCIA;
}

function costeMonstruoJ(nivel, j) {
  let c = COSTE_MONSTRUO[nivel] ?? nivel;
  if (tieneCiencia(j, "monstruo_barato")) c = Math.max(0, c - 1);
  return c;
}

/* El box son dos cajas de 3 huecos: la caja 1 toca los caminos 1 y 2; la
   caja 2, los caminos 2 y 3. Desde una caja solo se puede soltar en esos
   caminos, y solo en su casilla de inicio. */
const BOX_TAM = 3;
const caminosDeBox = (b) => (b === 0 ? [1, 2] : [2, 3]);
const boxDeIndice = (i) => (i < BOX_TAM ? 0 : 1);
/* Casilla a la que sale un monstruo del box: la 4 (posición 3), la que está
   pegada al búnker y de cara a los atacantes que bajan hacia él. */
const POS_DESPLIEGUE = 3;

/* Cada búnker tiene 3 posiciones de torre, una por calle: la torre de la
   posición N es "de" el camino N. Desde ahí dispara a cualquier camino,
   pero fuera de su calle hace 1 menos de daño. Su daño máximo es su nivel.
   Una torre queda inhabilitada mientras haya un atacante en la casilla 4 de
   SU camino; se recalcula en cada acción, así que vuelve sola al liberarse. */
const TORRE_POS = [1, 2, 3];

/* Dos lanzaderas, una por box: el box 1 alimenta la lanzadera 1 y el box 2 la
   lanzadera 2. Las partidas viejas guardaban una sola, así que se migra. */
const LANZADERAS = 2;
function normalizarLanzaderas(j) {
  if (!Array.isArray(j.lanzaderas)) {
    j.lanzaderas = [j.lanzadera ?? null, null];
    delete j.lanzadera;
  }
  while (j.lanzaderas.length < LANZADERAS) j.lanzaderas.push(null);
  j.lanzaderas.length = LANZADERAS;
}

/* Lanzadera que toca a cada camino: el 1 tiene al lado la 1, el 3 la 2, y el
   camino 2 toca las dos, así que usa la que esté libre. */
function lanzaderaDeSendero(j, senderoId) {
  const libres = j.lanzaderas.map((m, i) => (m ? -1 : i)).filter(i => i >= 0);
  if (senderoId === 1) return libres.includes(0) ? 0 : null;
  if (senderoId === 3) return libres.includes(1) ? 1 : null;
  return libres[0] ?? null;
}

/* Compatibilidad: las partidas viejas guardaban la torreta en el camino. */
function normalizarTorres(j) {
  if (!j.bunker) return;
  if (!Array.isArray(j.bunker.torres)) {
    j.bunker.torres = [null, null, null];
    for (const s of j.senderos ?? []) {
      if (s.torreta) j.bunker.torres[s.id - 1] = { ...s.torreta, sendero: s.id };
    }
  }
  for (const s of j.senderos ?? []) delete s.torreta;
  j.bunker.torres.forEach((t, i) => { if (t) t.sendero = i + 1; });
}

/* El título y la descripción se guardan dentro de la partida, así que una
   carta repartida antes de corregir un texto sigue enseñando el viejo. Se
   refrescan desde la plantilla (mismo tipo, nivel y efecto). */
const TEXTO_CARTA = new Map(
  PLANTILLAS_BUNKER.map(p => [`${p.tipo}|${p.nivel ?? ""}|${p.efecto ?? ""}`, p]),
);

function sincronizarTextosCartas(e) {
  const ver = (c) => {
    if (!c?.tipo) return;
    const p = TEXTO_CARTA.get(`${c.tipo}|${c.nivel ?? ""}|${c.efecto ?? ""}`);
    if (!p) return;
    c.titulo = p.titulo;
    c.descripcion = p.descripcion;
  };
  for (const j of Object.values(e.jugadores ?? {})) {
    const listas = [j.mano, j.mazoBunker, j.descarteBunker, j.bunker?.recursos, j.bunker?.ciencia];
    for (const lista of listas) for (const c of lista ?? []) ver(c);
  }
}

/* Los monstruos se llamaban "lab" en las partidas ya guardadas (y sus cartas
   de Destino "subir_labs" y compañía), que se confundía con el laboratorio.
   Se traducen al cargar para no romper mesas empezadas. */
const RENOMBRES_DESTINO = {
  subir_labs: "subir_monstruos",
  bajar_labs: "bajar_monstruos",
  colocar_labs: "colocar_monstruos",
};

function migrarNombres(e) {
  const tipo = (t) => (t === "lab" ? "monstruo" : RENOMBRES_DESTINO[t] ?? t);
  for (const j of Object.values(e.jugadores ?? {})) {
    for (const s of j.senderos ?? []) {
      for (const f of s.posiciones ?? []) if (f) f.tipo = tipo(f.tipo);
    }
    for (const m of j.box ?? []) if (m) m.tipo = tipo(m.tipo);
    for (const m of [...(j.lanzaderas ?? []), j.lanzadera]) if (m) m.tipo = tipo(m.tipo);
  }
  for (const lista of [e.mazoDestino, e.descarteDestino]) {
    for (const c of lista ?? []) c.tipo = tipo(c.tipo);
  }
  if (e.ultimoDestino) e.ultimoDestino.tipo = tipo(e.ultimoDestino.tipo);
}

/* Cada ficha lleva su dueño, aunque no siempre se use: los monstruos son de
   quien manda en ese tablero, y los atacantes lanzados por un jugador guardan
   quién los mandó. Los de carta de Destino no llevan dueño: son del juego. Un
   monstruo es defensor en su tablero y atacante en cuanto sale a otro. */
function normalizarDuenos(e) {
  for (const [id, j] of Object.entries(e.jugadores ?? {})) {
    for (const s of j.senderos ?? []) {
      for (const f of s.posiciones ?? []) if (f?.tipo === "monstruo" && !f.dueno) f.dueno = id;
    }
    for (const m of j.box ?? []) if (m && !m.dueno) m.dueno = id;
    for (const m of j.lanzaderas ?? []) if (m && !m.dueno) m.dueno = id;
  }
}

function sincronizarTorres(e) {
  migrarNombres(e);
  sincronizarTextosCartas(e);
  normalizarDuenos(e);
  for (const j of Object.values(e.jugadores ?? {})) {
    normalizarTorres(j);
    normalizarLanzaderas(j);
    for (const t of j.bunker.torres) {
      if (!t) continue;
      const s = j.senderos?.find(s => s.id === t.sendero);
      t.inhabilitada = s?.posiciones?.[3]?.tipo === "atacante";
    }
  }
}

/* Daño máximo que puede hacer una torre contra un camino concreto. */
function dañoMaxTorre(torre, senderoId, j) {
  if (!torre || torre.inhabilitada) return 0;
  if (torre.sendero === senderoId || tieneCiencia(j, "torreta_universal")) return torre.nivel;
  return Math.max(0, torre.nivel - 1);
}

/* Daño total disponible de todas las torres del búnker contra ese camino. */
function dañoTorres(j, senderoId) {
  return (j.bunker.torres ?? []).reduce((s, t) => s + dañoMaxTorre(t, senderoId, j), 0);
}

/* Coste en monedas de hacer `daño` puntos contra ese camino, o -1 si las
   torres no llegan. El coste es igual al daño ocasionado. */
function costeDisparo(j, senderoId, daño) {
  if (daño <= 0 || dañoTorres(j, senderoId) < daño) return -1;
  const descuento = tieneCiencia(j, "torreta_barata") ? 1 : 0;
  return Math.max(0, daño - descuento);
}

// ── Inicialización de jugador ─────────────────────────────────────────────
function jugadorInicial(info, e) {
  const bunker = { armeria: 1, laboratorio: 1, recursos: [], ciencia: [], torres: [null, null, null],
    extra: { monedas: 0, monjes: 0 } };
  const mazo = crearMazoBunker(e, { bunker });
  const mano = mazo.splice(0, 4);
  return {
    id: info.id,
    nombre: info.nombre,
    avatar: info.avatar,
    puntosMonsters: 0,
    vivo: true,
    bunker,
    energia: 0,
    accionesRestantes: 0,
    senderos: [1, 2, 3].map(id => ({
      id,      posiciones: [null, null, null, null], // 0=entrada, 3=junto al búnker
    })),
    box: Array(6).fill(null),
    lanzaderas: [null, null],
    mano,
    mazoBunker: mazo,
    descarteBunker: [],
    cartasJugadasEsteTurno: 0,
  };
}

// ── Contrato ──────────────────────────────────────────────────────────────
const bunkerWars = {
  id: "bunker-wars",
  nombre: "Himalayan Fortress",
  min: 2,
  max: 8,
  resumen: "Defiende tu búnker 25 rondas. Manda monstruos a tus rivales. El último en pie gana.",

  crear({ jugadores, semilla }) {
    const e = {
      luna: 1,
      fase: "avance",
      orden: jugadores.map(j => j.id),
      turnoIdx: 0,
      rng: (Number(semilla) || 1) >>> 0,
      mazoDestino: [],
      descarteDestino: [],
      nivelEnemigo: 1,
      jugadores: {},
      final: null,
    };
    for (const j of jugadores) e.jugadores[j.id] = jugadorInicial(j, e);
    e.mazoDestino = crearMazoDestino(jugadores.length, e);
    /* El primer turno arranca ya en la fase de decretos (avance, lanzar y
       carta de Destino se resuelven solos), con las monedas y los decretos
       base a la vista. */
    resolverAutomaticas(e, []);
    const primero = e.jugadores[e.orden[0]];
    primero.energia = energiaTotal(primero);
    primero.accionesRestantes = accionesTotal(primero);
    return e;
  },

  turno(e) {
    if (e.final) return null;
    return e.orden[e.turnoIdx];
  },

  legales(e, jugadorId) {
    if (e.final) return [];
    if (e.orden[e.turnoIdx] !== jugadorId) return [];
    const j = e.jugadores[jugadorId];
    if (!j?.vivo) return [];
    sincronizarTorres(e);

    switch (e.fase) {
      case "avance":
      case "carta":
      case "energia":
        return [{ tipo: "confirmar", texto: "Continuar" }];
      case "lanzar":
        return legalesLanzar(e, jugadorId);
      case "acciones":
        return legalesAcciones(e, jugadorId);
      case "descartar":
        return legalesDescartar(e, jugadorId);
      default:
        return [];
    }
  },

  aplicar(e, jugadorId, accion) {
    e = JSON.parse(JSON.stringify(e));
    sincronizarTorres(e);
    const evs = [];
    let r;
    switch (e.fase) {
      case "avance":   r = faseAvance(e, jugadorId, evs); break;
      case "lanzar":   r = faseLanzar(e, jugadorId, accion, evs); break;
      case "carta":    r = faseCarta(e, jugadorId, evs); break;
      case "energia":  r = faseEnergia(e, jugadorId, evs); break;
      case "acciones": r = faseAcciones(e, jugadorId, accion, evs); break;
      case "descartar":r = faseDescartar(e, jugadorId, accion, evs); break;
      default:         r = { estado: e, eventos: evs };
    }
    /* Tras cualquier acción, las fases automáticas siguen solas hasta que haya
       algo que decidir (lanzar o los decretos del turno). */
    resolverAutomaticas(r.estado, evs);
    sincronizarTorres(r.estado);
    return r;
  },

  publica(e) {
    sincronizarTorres(e); // también migra partidas guardadas con la torreta en el camino
    return {
      luna: e.luna,
      fase: e.fase,
      turnoActual: e.orden[e.turnoIdx],
      nivelEnemigo: e.nivelEnemigo,
      jugadores: Object.fromEntries(
        Object.entries(e.jugadores).map(([id, j]) => [id, {
          nombre: j.nombre,
          avatar: j.avatar,
          vivo: j.vivo,
          puntosMonsters: j.puntosMonsters,
          bunker: j.bunker,
          senderos: j.senderos,
          lanzaderas: j.lanzaderas.map(m => (m ? { nivel: m.nivel } : null)),
          boxOcupados: j.box.filter(Boolean).length,
        }])
      ),
    };
  },

  vista(e, jugadorId) {
    sincronizarTorres(e);
    const j = e.jugadores[jugadorId];
    if (!j) return {};
    return {
      energia: j.energia,
      accionesRestantes: j.accionesRestantes,
      mano: j.mano,
      box: j.box,
      lanzaderas: j.lanzaderas,
      cartaDestino: e.ultimoDestino ?? null,
      mazoDestino: e.mazoDestino.length,
      teToca: e.orden[e.turnoIdx] === jugadorId,
    };
  },

  terminada(e) {
    return e.final ?? null;
  },

  bot(e, jugadorId) {
    const acciones = bunkerWars.legales(e, jugadorId);
    // Pasa siempre: confirmar > descartar > primera opción disponible
    return acciones.find(a => a.tipo === "confirmar")
      ?? acciones.find(a => a.tipo === "descartar")
      ?? acciones[0]
      ?? null;
  },

  quitar(e, jugadorId) {
    e = JSON.parse(JSON.stringify(e));
    const j = e.jugadores[jugadorId];
    if (!j) return e;
    j.vivo = false;
    for (const s of j.senderos) s.posiciones = [null, null, null, null];
    j.lanzaderas = [null, null];
    if (e.orden[e.turnoIdx] === jugadorId) avanzarTurno(e);
    comprobarFin(e);
    return e;
  },
};

// ── Fase AVANCE ───────────────────────────────────────────────────────────
function faseAvance(e, jugadorId, evs) {
  const j = e.jugadores[jugadorId];

  // Monstruos en pos 3 entran al búnker
  for (const s of j.senderos) {
    const f = s.posiciones[3];
    if (f?.tipo === "atacante") {
      j.puntosMonsters += f.nivel;
      s.posiciones[3] = null;
      evs.push({ tipo: "entrada", texto: `¡Monstruo ${f.nivel} entra en el búnker de ${j.nombre}! (+${f.nivel} pts)` });
      if (j.puntosMonsters > 20) {
        j.vivo = false;
        evs.push({ tipo: "derrota", texto: `El búnker de ${j.nombre} ha sido destruido.`, a: jugadorId });
      }
    }
  }

  /* Avanzar atacantes: de pos 2→3, 1→2, 0→1. Si en la casilla de delante hay
     un monstruo tuyo que le defiende, el atacante ataca con las mismas reglas
     de combate: el que llega ataca y gana los empates. Antes se quedaba quieto
     al lado del defensor y parecía que la mesa se había olvidado del choque. */
  for (const s of j.senderos) {
    for (let pos = 3; pos > 0; pos--) {
      const f = s.posiciones[pos - 1];
      if (f?.tipo !== "atacante") continue;
      const defensor = s.posiciones[pos];
      if (!defensor) {
        s.posiciones[pos] = f;
        s.posiciones[pos - 1] = null;
        continue;
      }
      if (defensor.tipo !== "monstruo") continue;
      if (f.nivel >= defensor.nivel) {
        s.posiciones[pos] = f;
        s.posiciones[pos - 1] = null;
        evs.push({ tipo: "combate", texto: `El atacante ${f.nivel} destruye al monstruo ${defensor.nivel} de ${j.nombre} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
      } else {
        s.posiciones[pos - 1] = null;
        evs.push({ tipo: "combate", texto: `El monstruo ${defensor.nivel} de ${j.nombre} destruye al atacante ${f.nivel} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
      }
    }
  }

  e.fase = "lanzar";
  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase LANZAR ───────────────────────────────────────────────────────────
function faseLanzar(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];

  if (accion.tipo === "lanzar") {
    const i = accion.lanzadera === 1 ? 1 : 0;
    const mon = j.lanzaderas[i];
    const rival = e.jugadores[accion.rivalId];
    const s = rival?.senderos.find(s => s.id === accion.sendero);
    if (mon && s && !s.posiciones[0] && rival.vivo) {
      s.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel: mon.nivel, dueno: jugadorId };
      evs.push({ tipo: "lanzamiento", texto: `${j.nombre} lanza monstruo ${mon.nivel} (lanzadera ${i + 1}) a la escalera ${accion.sendero} de ${rival.nombre}.`, a: accion.rivalId });
      j.lanzaderas[i] = null;
    }
    /* Con dos lanzaderas la fase sigue abierta mientras quede otra ficha y
       algún camino rival libre: cada lanzadera se manda por separado. */
    if (hayLanzamientos(e, jugadorId)) return { estado: e, eventos: evs };
  }

  avanzarMonstruosPropios(j, evs);

  e.fase = "carta";
  return { estado: e, eventos: evs };
}

/* ¿Queda alguna lanzadera con monstruo y algún hueco donde mandarlo? */
function hayLanzamientos(e, jugadorId) {
  return legalesLanzar(e, jugadorId).some(a => a.tipo === "lanzar");
}

/* Tus monstruos de los caminos avanzan una casilla hacia la lanzadera en cada
   turno. Si la casilla de delante tiene un atacante, el monstruo ataca con las
   mismas reglas que al moverlo a mano; si tiene otro monstruo tuyo, espera su
   turno sin pelearse con él. Antes se quedaba parado en silencio, que parecía
   que la mesa se había olvidado de él. */
function avanzarMonstruosPropios(j, evs) {
  for (const s of j.senderos) {
    for (let pos = 0; pos < 3; pos++) {
      const f = s.posiciones[pos + 1];
      if (f?.tipo !== "monstruo") continue;
      const delante = s.posiciones[pos];
      if (!delante) {
        s.posiciones[pos] = f;
        s.posiciones[pos + 1] = null;
        continue;
      }
      if (delante.tipo !== "atacante") continue;
      if (!resolverCombate(f, delante).monstruoSobrevive) {
        s.posiciones[pos + 1] = null;
        evs.push({ tipo: "combate", texto: `${j.nombre}: su monstruo ${f.nivel} muere al atacar al atacante ${delante.nivel} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
        continue;
      }
      s.posiciones[pos + 1] = null;
      s.posiciones[pos] = f;
      evs.push({ tipo: "combate", texto: `${j.nombre}: su monstruo ${f.nivel} destruye al atacante ${delante.nivel} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
    }
    // Al llegar a la casilla 1 pasa a la lanzadera que tiene al lado
    if (s.posiciones[0]?.tipo === "monstruo") {
      const i = lanzaderaDeSendero(j, s.id);
      if (i !== null) {
        j.lanzaderas[i] = s.posiciones[0];
        s.posiciones[0] = null;
        evs.push({ tipo: "a_lanzadera", texto: `Un monstruo de ${j.nombre} alcanza la lanzadera ${i + 1}.` });
      }
    }
  }
}

/* Fases sin decisión (avance, lanzar sin monstruo en la lanzadera, carta de
   Destino y monedas) se resuelven solas. Solo se para en "lanzar" cuando hay
   un monstruo esperando y hay que elegir a quién se le manda. */
const AVISO_LUNA_ROJA = "La luna blanca se ha vuelto roja: desde ahora los monstruos llegan con su nivel real.";

function resolverAutomaticas(e, evs) {
  let guardia = 0;
  while (!e.final && guardia++ < 30) {
    const id = e.orden[e.turnoIdx];
    /* Un jugador puede morir en el avance de su propio turno. Si no se salta,
       la mesa se queda esperando jugadas de un muerto y no hay forma de
       seguir: nadie tiene jugadas legales. */
    if (!e.jugadores[id]?.vivo) {
      if (avanzarTurno(e)) evs.push({ tipo: "carta_roja", texto: AVISO_LUNA_ROJA });
      e.fase = "avance";
      continue;
    }
    if (e.fase === "avance") { faseAvance(e, id, evs); continue; }
    if (e.fase === "lanzar") {
      /* Solo hay decisión si hay una lanzadera con monstruo y algún camino
         rival libre donde soltarlo. Si no, las lanzaderas se pasan de largo. */
      if (hayLanzamientos(e, id)) break;
      faseLanzar(e, id, { tipo: "no_lanzar" }, evs);
      continue;
    }
    if (e.fase === "carta")   { faseCarta(e, id, evs); continue; }
    if (e.fase === "energia") { faseEnergia(e, id, evs); continue; }
    break;
  }
}

// ── Fase CARTA ────────────────────────────────────────────────────────────
function faseCarta(e, jugadorId, evs) {
  const robar = () => {
    if (e.mazoDestino.length === 0) {
      e.mazoDestino = barajar(e.descarteDestino, e);
      e.descarteDestino = [];
    }
    return e.mazoDestino.shift() ?? null;
  };
  let carta = robar();
  /* Mesas antiguas: la carta roja venía dentro del mazo y se comía el turno de
     quien la sacaba. Si aún queda una en un mazo viejo, se resuelve y se roba
     también la carta que toca, como en las partidas nuevas. */
  while (carta?.tipo === "carta_roja") {
    e.descarteDestino.push(carta);
    e.nivelEnemigo = 2;
    evs.push({ tipo: "carta_roja", texto: "¡La luna se ha vuelto roja! Los monstruos llegan con su nivel real." });
    carta = robar();
  }
  if (carta) {
    e.descarteDestino.push(carta);
    /* La carta queda a la vista en la mesa durante todo el turno. */
    e.ultimoDestino = {
      tipo: carta.tipo,
      nivel: carta.nivel ?? null,
      /* Lo que de verdad entra en la mesa: antes de la carta roja todo
         monstruo es de nivel 1, diga la carta lo que diga. La mesa no debe
         anunciar un nivel que luego no aparece. */
      nivelReal: AMENAZAS.has(carta.tipo) ? nivelRealEnemigo(e, carta.nivel) : null,
      prio: carta.prio ?? null,
      cantidad: carta.cantidad ?? null,
      jugadorId,
      luna: e.luna,
    };
    evs.push(...resolverDestino(e, jugadorId, carta));
  }
  e.fase = "energia";
  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase MONEDAS (interna: energia) ───────────────────────────────────────
function faseEnergia(e, jugadorId, evs) {
  const j = e.jugadores[jugadorId];
  j.energia = energiaTotal(j);
  j.accionesRestantes = accionesTotal(j);
  j.cartasJugadasEsteTurno = 0;
  evs.push({ tipo: "energia", texto: `${j.nombre}: ${j.energia} monedas, ${j.accionesRestantes} decretos.`, a: jugadorId });
  e.fase = "acciones";
  return { estado: e, eventos: evs };
}

// ── Fase DECRETOS (interna: acciones) ─────────────────────────────────────
function faseAcciones(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];

  if (accion.tipo === "pasar") {
    e.fase = "descartar";
    return { estado: e, eventos: evs };
  }
  if (j.accionesRestantes <= 0) return { estado: e, eventos: evs };

  switch (accion.tipo) {

    case "mejorar_bunker": {
      const carta = j.mano.find(c => c.uid === accion.cartaId);
      if (!carta || j.energia < carta.coste || !puedeJugarCarta(j, carta)) break;
      /* Ciencia con los dos huecos llenos: hay que decir cuál sale. */
      if (carta.tipo === "ciencia" && cienciaLlena(j)
          && !j.bunker.ciencia.some(c => c.efecto === accion.reemplazo)) break;
      /* "Laboratorio o armería" tiene que decir a cuál sube, y ese edificio no
         puede estar ya al tope. */
      if (carta.efecto === "subir_lab_o_arm") {
        const cual = accion.edificio === "armeria" ? "armeria" : accion.edificio === "laboratorio" ? "laboratorio" : null;
        const tope = cual === "armeria" ? TOPE_ARMERIA : TOPE_LABORATORIO;
        if (!cual || (j.bunker[cual] ?? 0) >= tope) break;
      }
      /* Las ciencias que eligen objetivo no se cobran si la elección no vale:
         antes se gastaban las monedas y la carta desaparecía sin efecto. */
      if (carta.tipo === "ciencia_i" && !objetivoDe(e, j, carta.efecto, accion)) break;
      j.energia -= carta.coste;
      j.accionesRestantes--;
      j.mano = j.mano.filter(c => c.uid !== accion.cartaId);
      j.cartasJugadasEsteTurno++;
      aplicarMejoraBunker(j, carta, e, evs, accion.reemplazo, accion);
      /* Las inmediatas ya cuentan lo que han hecho (subir tal o cual nivel),
         así que no se duplica el aviso. */
      if (carta.tipo !== "ciencia_i") {
        evs.push({ tipo: "mejora", texto: `${j.nombre} mejora búnker: ${nombreCarta(carta)}.`, a: jugadorId });
      }
      break;
    }

    case "crear_monstruo": {
      const { nivel } = accion;
      /* El box se elige; si el cliente no lo manda (partidas o bots viejos),
         se usa el primer hueco libre como antes. */
      const boxPedido = accion.boxIdx === 0 || accion.boxIdx === 1 ? accion.boxIdx : null;
      const boxIdx = boxPedido === null
        ? j.box.findIndex(s => s === null)
        : Array.from({ length: BOX_TAM }, (_, k) => boxPedido * BOX_TAM + k).find((i) => !j.box[i]) ?? -1;
      if (boxIdx < 0 || !NIVELES.includes(nivel) || nivel > nivelMaxLab(j)) break;
      const coste = costeMonstruoJ(nivel, j);
      if (j.energia < coste) break;
      j.energia -= coste;
      j.accionesRestantes--;
      j.box[boxIdx] = { id: uid("m"), tipo: "monstruo", nivel, dueno: j.id };
      evs.push({ tipo: "crear", texto: `${j.nombre} crea monstruo ${nivel} en box ${boxDeIndice(boxIdx) + 1} (1 decreto + ${coste} ${coste === 1 ? "moneda" : "monedas"}).`, a: jugadorId });
      break;
    }

    case "construir_torreta": {
      const pos = accion.posicion ?? accion.sendero;
      if (!TORRE_POS.includes(pos)) break;
      normalizarTorres(j);
      if (j.bunker.torres[pos - 1] || j.energia < 1) break;
      j.energia--;
      j.accionesRestantes--;
      j.bunker.torres[pos - 1] = { id: uid("t"), nivel: 1, sendero: pos, inhabilitada: false };
      evs.push({ tipo: "torre", texto: `${j.nombre} construye torre nivel 1 en la posición ${pos} del búnker (escalera ${pos}).`, a: jugadorId });
      break;
    }

    case "evolucionar_torreta": {
      const pos = accion.posicion ?? accion.sendero;
      if (!TORRE_POS.includes(pos)) break;
      normalizarTorres(j);
      const t = j.bunker.torres[pos - 1];
      if (!t || t.nivel >= 3) break;
      if (t.nivel + 1 > j.bunker.armeria) break;
      const diff = 1; // coste del nivel nuevo (nivel+1) menos el actual (nivel)
      if (j.energia < diff) break;
      j.energia -= diff;
      j.accionesRestantes--;
      t.nivel++;
      evs.push({ tipo: "torre", texto: `${j.nombre} evoluciona la torre ${pos} a nivel ${t.nivel}.`, a: jugadorId });
      break;
    }

    case "mover_a_lanzadera": {
      /* Cada box solo alimenta su lanzadera: el box 1 la 1, el box 2 la 2. */
      const boxIdx = j.box.findIndex(m => m?.id === accion.monstruoId);
      if (boxIdx < 0) break;
      const i = boxDeIndice(boxIdx);
      if (j.lanzaderas[i]) break;
      const mon = j.box[boxIdx];
      j.box[boxIdx] = null;
      j.lanzaderas[i] = mon;
      j.accionesRestantes--;
      evs.push({ tipo: "lanzadera", texto: `${j.nombre} mueve monstruo ${mon.nivel} del box ${i + 1} a la lanzadera ${i + 1}.`, a: jugadorId });
      break;
    }

    case "mover_a_sendero": {
      const boxIdx = j.box.findIndex(m => m?.id === accion.monstruoId);
      const m = j.box[boxIdx];
      if (!m || m.nivel === 7 || j.energia < 1) break;
      // Sale del box a la casilla 4 del camino, pegado al búnker y de cara a
      // los atacantes que bajan desde la casilla 1.
      if (accion.posicion !== POS_DESPLIEGUE) break;
      // solo los caminos que tocan la caja donde está el monstruo
      if (!caminosDeBox(boxDeIndice(boxIdx)).includes(accion.sendero)) break;
      const s = j.senderos.find(s => s.id === accion.sendero);
      if (!s) break;
      const ocupante = s.posiciones[POS_DESPLIEGUE];
      // Solo se puede caer sobre la casilla 4 si está libre o si hay un
      // atacante: en ese caso sale directo a atacarle.
      if (ocupante && ocupante.tipo !== "atacante") break;
      j.energia--;
      j.accionesRestantes--;
      j.box[boxIdx] = null;
      if (!ocupante) {
        s.posiciones[POS_DESPLIEGUE] = { ...m };
        evs.push({ tipo: "mover_monstruo", texto: `${j.nombre} lanza monstruo ${m.nivel} al peldaño 4 de la escalera ${accion.sendero}.`, a: jugadorId });
      } else {
        const { enemigoMuere, monstruoSobrevive } = resolverCombate(m, ocupante);
        s.posiciones[POS_DESPLIEGUE] = monstruoSobrevive ? { ...m } : ocupante;
        evs.push(enemigoMuere
          ? { tipo: "combate", texto: `${j.nombre}: monstruo ${m.nivel} lanzado a la escalera ${accion.sendero} destruye al atacante ${ocupante.nivel}.`, a: jugadorId }
          : { tipo: "combate", texto: `${j.nombre}: monstruo ${m.nivel} lanzado a la escalera ${accion.sendero} muere contra el atacante ${ocupante.nivel}.`, a: jugadorId });
      }
      break;
    }

    case "avanzar_monstruo": {
      // Mover monstruo en sendero propio hacia pos 0 (salida), atacar si hay enemigo
      const s = j.senderos.find(s => s.id === accion.sendero);
      if (!s || j.energia < 1) break;
      const posOrigen = s.posiciones.findIndex(f => f?.id === accion.monstruoId);
      if (posOrigen <= 0) break; // ya está en pos 0 o no existe
      const posDest = accion.posicion;
      if (posDest >= posOrigen || posDest < 0) break;
      const mMon = s.posiciones[posOrigen];
      const ocupante = s.posiciones[posDest];
      if (ocupante && ocupante.tipo === "atacante") {
        // El monstruo se mueve encima del atacante: ataca él, por categorías
        const { enemigoMuere, monstruoSobrevive } = resolverCombate(mMon, ocupante);
        j.energia--;
        j.accionesRestantes--;
        s.posiciones[posOrigen] = null;
        s.posiciones[posDest] = monstruoSobrevive ? { ...mMon } : null;
        evs.push(enemigoMuere
          ? { tipo: "combate", texto: `${j.nombre}: monstruo ${mMon.nivel} destruye atacante ${ocupante.nivel} en la escalera ${accion.sendero}.`, a: jugadorId }
          : { tipo: "combate", texto: `${j.nombre}: monstruo ${mMon.nivel} muere al atacar al atacante ${ocupante.nivel} en la escalera ${accion.sendero}.`, a: jugadorId });
        // Si el monstruo llega a pos 0, pasa a la lanzadera de al lado
        if (posDest === 0 && monstruoSobrevive) {
          const i = lanzaderaDeSendero(j, s.id);
          if (i !== null) {
            j.lanzaderas[i] = s.posiciones[0];
            s.posiciones[0] = null;
            evs.push({ tipo: "a_lanzadera", texto: `Un monstruo de ${j.nombre} alcanza la lanzadera ${i + 1}.` });
          }
        }
      } else if (!ocupante) {
        j.energia--;
        j.accionesRestantes--;
        s.posiciones[posDest] = { ...mMon };
        s.posiciones[posOrigen] = null;
        evs.push({ tipo: "avance_monstruo", texto: `${j.nombre} avanza el monstruo ${mMon.nivel} en la escalera ${accion.sendero}.`, a: jugadorId });
        if (posDest === 0) {
          const i = lanzaderaDeSendero(j, s.id);
          if (i !== null) {
            j.lanzaderas[i] = s.posiciones[0];
            s.posiciones[0] = null;
            evs.push({ tipo: "a_lanzadera", texto: `Un monstruo de ${j.nombre} alcanza la lanzadera ${i + 1}.` });
          }
        }
      }
      break;
    }

    case "atacar_monstruo": {
      // Destruir atacante usando sólo torretas (sin mover monstruo)
      const s = j.senderos.find(s => s.id === accion.sendero);
      if (!s) break;
      const f = s.posiciones[accion.posicion];
      if (!f || f.tipo !== "atacante") break;
      // Para destruirlo hay que hacer su nivel en daño; se paga ese daño.
      const costeTorr = costeDisparo(j, accion.sendero, f.nivel);
      if (costeTorr < 0 || j.energia < costeTorr) break;
      j.energia -= costeTorr;
      j.accionesRestantes--;
      s.posiciones[accion.posicion] = null;
      evs.push({ tipo: "destruir", texto: `${j.nombre} destruye atacante ${f.nivel} con torretas en la escalera ${accion.sendero}.`, a: jugadorId });
      break;
    }
  }

  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase DESCARTAR ────────────────────────────────────────────────────────
function faseDescartar(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];
  /* Descartar es opcional: hasta 2 cartas por turno, o ninguna. */
  const ids = (accion.cartaIds ?? []).slice(0, 2);

  for (const uid of ids) {
    const idx = j.mano.findIndex(c => c.uid === uid);
    if (idx >= 0) j.descarteBunker.push(j.mano.splice(idx, 1)[0]);
  }

  // Robar hasta 4
  while (j.mano.length < 4) {
    const carta = robarBunker(j, e);
    if (!carta) break;
    j.mano.push(carta);
  }

  const lunaRoja = avanzarTurno(e);
  comprobarFin(e);

  if (!e.final) {
    e.fase = "avance";
    const sigJugador = e.jugadores[e.orden[e.turnoIdx]];
    if (lunaRoja) {
      evs.push({ tipo: "carta_roja", texto: AVISO_LUNA_ROJA });
    }
    evs.push({ tipo: "nuevo_turno", texto: `Luna ${e.luna} — turno de ${sigJugador?.nombre}.` });
  }

  return { estado: e, eventos: evs };
}

// ── legales helpers ───────────────────────────────────────────────────────
function legalesLanzar(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const cargadas = j.lanzaderas.map((m, i) => ({ m, i })).filter(x => x.m);
  if (!cargadas.length) return [{ tipo: "no_lanzar", texto: "Continuar (sin lanzadera)" }];
  const acc = [];
  for (const rivalId of e.orden) {
    if (rivalId === jugadorId) continue;
    const rival = e.jugadores[rivalId];
    if (!rival.vivo) continue;
    for (const s of rival.senderos) {
      if (s.posiciones[0]) continue;
      for (const { m, i } of cargadas) {
        acc.push({
          tipo: "lanzar", lanzadera: i, rivalId, sendero: s.id,
          texto: `Lanzar monstruo ${m.nivel} (L${i + 1}) a la escalera ${s.id} de ${rival.nombre}`,
        });
      }
    }
  }
  acc.push({ tipo: "no_lanzar", texto: "No lanzar" });
  return acc;
}

function legalesAcciones(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const acc = [{ tipo: "pasar", texto: "Terminar decretos" }];
  if (!j.accionesRestantes) return acc;

  for (const carta of j.mano) {
    if (j.energia < carta.coste || !puedeJugarCarta(j, carta)) continue;
    const nombre = nombreCarta(carta);
    if (carta.tipo === "ciencia" && cienciaLlena(j)) {
      /* Dos ciencias puestas: una acción por cada una que se puede quitar. */
      for (const fuera of j.bunker.ciencia) {
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid, reemplazo: fuera.efecto,
          texto: `Instalar ${nombre} · quitar ${fuera.titulo ?? fuera.efecto}`,
        });
      }
    } else if (carta.efecto === "subir_rango") {
      /* Una opción por monstruo que se pueda subir: los que defienden tus
         caminos y los que lanzaste a un rival. */
      for (const t of monstruosSubibles(e, jugadorId)) {
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid,
          objetivo: { jugadorId: t.jugadorId, sendero: t.sendero, posicion: t.posicion },
          etiqueta: `M${t.nivel}→${t.nuevo} en E${t.sendero} peldaño ${t.posicion + 1}`,
          texto: `Subir rango: monstruo ${t.nivel} → ${t.nuevo} en E${t.sendero} peldaño ${t.posicion + 1} (${t.donde})`,
        });
      }
    } else if (carta.efecto === "bajar_nivel_enemigo") {
      for (const s of j.senderos) {
        s.posiciones.forEach((f, posicion) => {
          if (f?.tipo !== "atacante") return;
          const nuevo = rangoAnterior(f.nivel);
          if (!nuevo) return;
          acc.push({
            tipo: "mejorar_bunker", cartaId: carta.uid,
            objetivo: { sendero: s.id, posicion },
            etiqueta: `M${f.nivel}→${nuevo} en E${s.id} peldaño ${posicion + 1}`,
            texto: `Bajar rango: atacante ${f.nivel} → ${nuevo} en E${s.id} peldaño ${posicion + 1}`,
          });
        });
      }
    } else if (carta.efecto === "convertir_aliado") {
      for (const s of j.senderos) {
        s.posiciones.forEach((f, posicion) => {
          if (f?.tipo !== "atacante" || f.nivel > 5) return;
          acc.push({
            tipo: "mejorar_bunker", cartaId: carta.uid,
            objetivo: { sendero: s.id, posicion },
            etiqueta: `Convertir M${f.nivel} en E${s.id} peldaño ${posicion + 1}`,
            texto: `Convertir aliado: atacante ${f.nivel} en E${s.id} peldaño ${posicion + 1}`,
          });
        });
      }
    } else if (carta.efecto === "avanzar_rival_1") {
      for (const otro of Object.values(e.jugadores)) {
        if (otro.id === jugadorId || !otro.vivo) continue;
        for (const s of otro.senderos) {
          s.posiciones.forEach((f, posicion) => {
            if (f?.tipo !== "atacante" || f.dueno !== jugadorId || f.nivel > 3) return;
            if (posicion < 3) {
              const destino = s.posiciones[posicion + 1];
              if (destino && destino.tipo !== "monstruo") return; // tapado por otro atacante
            }
            const objetivo = { jugadorId: otro.id, sendero: s.id, posicion };
            acc.push({
              tipo: "mejorar_bunker", cartaId: carta.uid, objetivo,
              etiqueta: posicion === 3
                ? `Entrar en búnker de ${otro.nombre} (C${s.id})`
                : `M${f.nivel} avanza en E${s.id} de ${otro.nombre}`,
              texto: posicion === 3
                ? `Avanza al rival: monstruo ${f.nivel} entra en el búnker de ${otro.nombre}`
                : `Avanza al rival: monstruo ${f.nivel} → peldaño ${posicion + 2} de C${s.id} (${otro.nombre})`,
            });
          });
        }
      }
    } else if (carta.efecto === "evolucionar_torreta") {
      normalizarTorres(j);
      j.bunker.torres.forEach((t, i) => {
        if (!t || t.nivel >= 3) return;
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid,
          objetivo: { posicion: i + 1 }, etiqueta: `Torre ${i + 1}: ${t.nivel}→${t.nivel + 1}`,
          texto: `Evolucionar torre ${i + 1} a nivel ${t.nivel + 1}`,
        });
      });
    } else if (carta.efecto === "torreta2_gratis") {
      normalizarTorres(j);
      j.bunker.torres.forEach((t, i) => {
        if (t && t.nivel >= 2) return;
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid,
          objetivo: { posicion: i + 1 },
          etiqueta: t ? `Torre ${i + 1}: ${t.nivel}→2` : `Torre 2 nueva en posición ${i + 1}`,
          texto: t ? `Torre de nivel 2: subir la torre ${i + 1} a 2` : `Torre de nivel 2 en la posición ${i + 1}`,
        });
      });
    } else if (carta.efecto === "vuelo_seguro") {
      for (let i = 0; i < j.box.length; i++) {
        const m = j.box[i];
        if (!m || m.nivel > 3) continue;
        for (const otro of Object.values(e.jugadores)) {
          if (otro.id === jugadorId || !otro.vivo) continue;
          for (const s of otro.senderos) {
            if (s.posiciones[0]) continue; // entrada ocupada
            acc.push({
              tipo: "mejorar_bunker", cartaId: carta.uid,
              monstruoId: m.id, rivalId: otro.id, sendero: s.id,
              etiqueta: `M${m.nivel} (box ${boxDeIndice(i) + 1}) → C${s.id} de ${otro.nombre}`,
              texto: `Vuelo seguro: monstruo ${m.nivel} a la entrada de la escalera ${s.id} de ${otro.nombre}`,
            });
          }
        }
      }
    } else if (carta.efecto === "monstruo3_gratis") {
      for (let b = 0; b < Math.ceil(j.box.length / BOX_TAM); b++) {
        if (!Array.from({ length: BOX_TAM }, (_, k) => b * BOX_TAM + k).some((i) => !j.box[i])) continue;
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid, boxIdx: b,
          etiqueta: `Monstruo 3 en box ${b + 1}`,
          texto: `Monstruo de nivel 3 en el box ${b + 1}`,
        });
      }
    } else if (carta.efecto === "subir_lab_o_arm") {
      /* Esta sí obliga a decidir: una opción por cada edificio que no esté al
         tope. */
      if ((j.bunker.laboratorio ?? 0) < TOPE_LABORATORIO) {
        acc.push({ tipo: "mejorar_bunker", cartaId: carta.uid, edificio: "laboratorio",
                   texto: `Jugar ${nombre} · criadero a nivel ${(j.bunker.laboratorio ?? 0) + 1}` });
      }
      if ((j.bunker.armeria ?? 0) < TOPE_ARMERIA) {
        acc.push({ tipo: "mejorar_bunker", cartaId: carta.uid, edificio: "armeria",
                   texto: `Jugar ${nombre} · armería a nivel ${(j.bunker.armeria ?? 0) + 1}` });
      }
    } else {
      acc.push({ tipo: "mejorar_bunker", cartaId: carta.uid, texto: `Jugar ${nombre}` });
    }
  }
  /* Una acción por box, no por nivel a secas: el box 1 llega a los caminos 1
     y 2, y el box 2 a los 2 y 3, así que dónde nace el monstruo importa y el
     jugador tiene que poder elegirlo aunque el box 1 tenga huecos. */
  const huecosDeBox = (b) =>
    Array.from({ length: BOX_TAM }, (_, k) => b * BOX_TAM + k).filter((i) => !j.box[i]);
  for (let boxIdx = 0; boxIdx < Math.ceil(j.box.length / BOX_TAM); boxIdx++) {
    if (huecosDeBox(boxIdx).length === 0) continue;
    for (const nv of NIVELES) {
      if (nv > nivelMaxLab(j)) break;
      const coste = costeMonstruoJ(nv, j);
      if (j.energia >= coste) {
        acc.push({ tipo: "crear_monstruo", nivel: nv, boxIdx,
                   /* Criar gasta 1 decreto y, además, las monedas del nivel. */
                   texto: `Crear monstruo ${nv} en box ${boxIdx + 1} · 1 decreto + ${coste} ${coste === 1 ? "moneda" : "monedas"}` });
      }
    }
  }
  normalizarTorres(j);
  j.bunker.torres.forEach((t, i) => {
    const pos = i + 1;
    if (!t && j.energia >= 1) {
      acc.push({ tipo: "construir_torreta", posicion: pos, texto: `Torre en posición ${pos} (escalera ${pos})` });
    }
    if (t && t.nivel < 3 && t.nivel + 1 <= j.bunker.armeria && j.energia >= 1) {
      acc.push({ tipo: "evolucionar_torreta", posicion: pos, texto: `Evolucionar torre ${pos} a nivel ${t.nivel + 1}` });
    }
  });
  /* Disparar: las torres del búnker pueden parar a un atacante de cualquier
     camino si suman su nivel en daño. Cuesta en monedas el daño hecho. */
  for (const s of j.senderos) {
    s.posiciones.forEach((f, i) => {
      if (f?.tipo !== "atacante") return;
      const coste = costeDisparo(j, s.id, f.nivel);
      if (coste >= 0 && j.energia >= coste) {
        acc.push({ tipo: "atacar_monstruo", sendero: s.id, posicion: i, texto: `Disparar a atacante ${f.nivel} (escalera ${s.id}, peldaño ${i + 1}) · ${coste}e` });
      }
    });
  }
  /* Cada monstruo del box va a la lanzadera de SU box, si está libre. */
  j.box.forEach((m, i) => {
    if (!m) return;
    const lanz = boxDeIndice(i);
    if (j.lanzaderas[lanz]) return;
    acc.push({ tipo: "mover_a_lanzadera", monstruoId: m.id, texto: `Monstruo ${m.nivel} → lanzadera ${lanz + 1}` });
  });
  if (j.energia >= 1) {
    /* Se lanza a la casilla 4 del camino (la que toca al búnker, de cara a los
       atacantes) y solo a los dos caminos adyacentes a la caja del monstruo. */
    for (let i = 0; i < j.box.length; i++) {
      const m = j.box[i];
      if (!m || m.nivel === 7) continue;
      for (const idCamino of caminosDeBox(boxDeIndice(i))) {
        const s = j.senderos.find(s => s.id === idCamino);
        if (!s) continue;
        const f = s.posiciones[POS_DESPLIEGUE];
        if (!f) {
          acc.push({ tipo: "mover_a_sendero", monstruoId: m.id, sendero: s.id, posicion: POS_DESPLIEGUE,
                     texto: `Monstruo ${m.nivel} → C${s.id} casilla 4 (1 moneda)` });
        } else if (f.tipo === "atacante") {
          acc.push({ tipo: "mover_a_sendero", monstruoId: m.id, sendero: s.id, posicion: POS_DESPLIEGUE,
                     texto: `Monstruo ${m.nivel} → C${s.id} casilla 4 · atacar atacante ${f.nivel} (1 moneda)` });
        }
      }
    }
  }
  /* Monstruos que ya están en un camino: avanzan hacia la casilla 1, de
     cara a los atacantes. Si el destino tiene un atacante, la acción es un
     ataque y se resuelve por categorías (el que se mueve ataca). */
  if (j.energia >= 1) {
    for (const s of j.senderos) {
      s.posiciones.forEach((m, origen) => {
        if (m?.tipo !== "monstruo" || origen === 0) return;
        // "Mover un monstruo las posiciones que desees": cualquier casilla por
        // delante suya. Si está ocupada por un atacante, la acción es un ataque.
        for (let destino = 0; destino < origen; destino++) {
          const f = s.posiciones[destino];
          if (f && f.tipo !== "atacante") continue;
          acc.push({
            tipo: "avanzar_monstruo", monstruoId: m.id, sendero: s.id, posicion: destino,
            texto: f
              ? `Monstruo ${m.nivel} ataca atacante ${f.nivel} en E${s.id} peldaño ${destino + 1} (1 moneda)`
              : `Monstruo ${m.nivel} avanza a C${s.id} peldaño ${destino + 1} (1 moneda)`,
          });
        }
      });
    }
  }
  return acc;
}

/* Nombre legible de una carta, para que cada botón diga qué descarta
   exactamente: con dos cartas iguales o tres "Descartar 2 cartas" idénticos
   el jugador no puede saber qué está eligiendo. */
function nombreCarta(c) {
  return c.titulo ?? (`${c.tipo ?? "carta"} ${c.nivel ?? c.efecto ?? ""}`).trim();
}

function legalesDescartar(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const max = 2;
  /* Si hay cartas repetidas, se numeran, para que dos botones iguales no
     lleven a descartar la que no era. */
  const repes = new Map();
  for (const c of j.mano) repes.set(nombreCarta(c), (repes.get(nombreCarta(c)) ?? 0) + 1);
  const etiqueta = (c) => {
    const n = nombreCarta(c);
    const total = repes.get(n) ?? 0;
    if (total < 2) return n;
    const orden = j.mano.filter(x => nombreCarta(x) === n).findIndex(x => x.uid === c.uid) + 1;
    return `${n} (${orden} de ${total})`;
  };

  const acc = j.mano.map(c => ({ tipo: "descartar", cartaIds: [c.uid], texto: `Descartar ${etiqueta(c)}` }));
  if (max === 2 && j.mano.length >= 2) {
    // Pares, uno por combinación, cada uno con sus dos cartas en el texto
    for (let i = 0; i < j.mano.length - 1; i++) {
      for (let k = i + 1; k < j.mano.length; k++) {
        acc.push({
          tipo: "descartar",
          cartaIds: [j.mano[i].uid, j.mano[k].uid],
          texto: `Descartar 2: ${etiqueta(j.mano[i])} + ${etiqueta(j.mano[k])}`,
        });
      }
    }
  }
  acc.push({ tipo: "descartar", cartaIds: [], texto: "No descartar" });
  return acc;
}

// ── Helpers de lógica ─────────────────────────────────────────────────────
function puedeJugarCarta(j, carta) {
  if (carta.tipo === "armeria") {
    return carta.nivel === j.bunker.armeria + 1;
  }
  if (carta.tipo === "laboratorio") {
    return carta.nivel === j.bunker.laboratorio + 1;
  }
  if (carta.tipo === "recursos") {
    return j.bunker.recursos.length < 4;
  }
  if (carta.tipo === "ciencia") {
    /* Con los dos huecos ocupados sigue siendo jugable: al instalarla se elige
       cuál de las dos sale (lo comprueba faseAcciones). */
    return !tieneCiencia(j, carta.efecto);
  }
  if (carta.tipo === "ciencia_i") {
    /* Las subidas de nivel no se pueden jugar si ya están al tope: gastar 3 o
       4 monedas para nada sería un botón trampa. */
    if (carta.efecto === "subir_armeria") {
      return (j.bunker.armeria ?? 0) < TOPE_ARMERIA;
    }
    if (carta.efecto === "subir_laboratorio") {
      return (j.bunker.laboratorio ?? 0) < TOPE_LABORATORIO;
    }
    /* Subir recursos siempre vale: suma una moneda y un monje, sin tope. */
    if (carta.efecto === "subir_recursos") {
      return true;
    }
    if (carta.efecto === "subir_lab_o_arm") {
      return (j.bunker.laboratorio ?? 0) < TOPE_LABORATORIO
          || (j.bunker.armeria ?? 0) < TOPE_ARMERIA;
    }
  }
  return true; // resto de ciencia_i siempre jugable si puede pagar
}

/* Purga: aniquila lo que esté en las casillas 3 y 4 de TODOS los caminos del
   que la juega, tanto sus propios monstruos como los atacantes que ya casi
   llegan al búnker. No toca las casillas 1 y 2, la lanzadera ni el box. */
const CASILLAS_PURGA = [2, 3]; // índices: casilla 3 y casilla 4

function aplicarPurga(j, evs) {
  let n = 0;
  for (const s of j.senderos) {
    for (const p of CASILLAS_PURGA) {
      if (s.posiciones[p]) { s.posiciones[p] = null; n++; }
    }
  }
  evs.push({ tipo: "aniquilar", texto: `Purga: ${n} monstruo(s) aniquilados en los peldaños 3 y 4 de las escaleras de ${j.nombre}.` });
}

/* Escalera de rangos: 1 → 2 → 3 → 5 → 7. Subir y bajar rango saltan de 3 a 5,
   nunca a 4. */
function siguienteRango(nivel) {
  const i = NIVELES.indexOf(nivel);
  return i >= 0 && i < NIVELES.length - 1 ? NIVELES[i + 1] : null;
}
function rangoAnterior(nivel) {
  const i = NIVELES.indexOf(nivel);
  return i > 0 ? NIVELES[i - 1] : null;
}

/* Ficha de un camino concreto: { jugadorId, sendero, posicion }. */
function fichaEn(e, jugadorId, sendero, posicion) {
  const j = e.jugadores[jugadorId];
  const s = j?.senderos.find(s => s.id === sendero);
  return s?.posiciones?.[posicion] ?? null;
}

/* Monstruos que puede subir de rango "Subir rango": los tuyos que defienden tus
   caminos y los que lanzaste a un rival (el atacante guarda quién lo mandó).
   Nunca por encima de nivel 5. */
function monstruosSubibles(e, jugadorId) {
  const yo = e.jugadores[jugadorId];
  const out = [];
  const anota = (jugadorIdFicha, sendero, posicion, f, donde) => {
    const nuevo = siguienteRango(f.nivel);
    if (!nuevo || nuevo > 5) return; // hasta nivel 5
    out.push({ jugadorId: jugadorIdFicha, sendero, posicion, nivel: f.nivel, nuevo, donde });
  };
  for (const s of yo?.senderos ?? []) {
    s.posiciones.forEach((f, posicion) => {
      if (f?.tipo === "monstruo") anota(jugadorId, s.id, posicion, f, "tu búnker");
    });
  }
  for (const otro of Object.values(e.jugadores)) {
    if (otro.id === jugadorId || !otro.vivo) continue;
    for (const s of otro.senderos) {
      s.posiciones.forEach((f, posicion) => {
        if (f?.tipo === "atacante" && f.dueno === jugadorId) {
          anota(otro.id, s.id, posicion, f, `el búnker de ${otro.nombre}`);
        }
      });
    }
  }
  return out;
}

/* Efectos que necesitan elegir algo (un monstruo, una torre, una calle…). */
const CIENCIAS_CON_OBJETIVO = new Set([
  "subir_rango", "avanzar_rival_1", "convertir_aliado", "bajar_nivel_enemigo",
  "evolucionar_torreta", "vuelo_seguro", "torreta2_gratis", "monstruo3_gratis",
]);

/* Resuelve el objetivo de una ciencia instantánea: devuelve lo necesario para
   aplicarla, o null si la elección no vale. Se usa para no cobrar la carta
   cuando el objetivo no existe (antes se perdían las monedas y la carta). */
function objetivoDe(e, j, efecto, accion) {
  const o = accion?.objetivo ?? accion ?? {};
  switch (efecto) {
    case "subir_rango": {
      const f = fichaEn(e, o.jugadorId, o.sendero, o.posicion);
      if (!f) return null;
      const mio = o.jugadorId === j.id
        ? f.tipo === "monstruo"
        : f.tipo === "atacante" && f.dueno === j.id;
      const nuevo = mio && siguienteRango(f.nivel);
      return nuevo && nuevo <= 5 ? { ficha: f, nuevo } : null;
    }
    case "bajar_nivel_enemigo": {
      const f = fichaEn(e, j.id, o.sendero, o.posicion);
      const nuevo = f?.tipo === "atacante" ? rangoAnterior(f.nivel) : null;
      return nuevo ? { ficha: f, nuevo } : null;
    }
    case "convertir_aliado": {
      const f = fichaEn(e, j.id, o.sendero, o.posicion);
      return f?.tipo === "atacante" && f.nivel <= 5 ? { ficha: f } : null;
    }
    case "avanzar_rival_1": {
      const rival = e.jugadores[o.jugadorId];
      const s = rival?.senderos.find(s => s.id === o.sendero);
      const f = s?.posiciones?.[o.posicion];
      if (!rival?.vivo || !f || f.tipo !== "atacante" || f.dueno !== j.id || f.nivel > 3) return null;
      if (o.posicion === 3) return { rival, sendero: s, ficha: f, posicion: 3, entra: true };
      const destino = s.posiciones[o.posicion + 1];
      if (destino && destino.tipo !== "monstruo") return null; // atacante en medio
      return { rival, sendero: s, ficha: f, posicion: o.posicion, entra: false, destino };
    }
    case "evolucionar_torreta": {
      const t = j.bunker.torres?.[(o.posicion ?? 0) - 1];
      return t && t.nivel < 3 ? { torre: t, pos: o.posicion } : null;
    }
    case "torreta2_gratis": {
      const pos = o.posicion;
      if (!TORRE_POS.includes(pos)) return null;
      const t = j.bunker.torres?.[pos - 1];
      if (t && t.nivel >= 2) return null;
      return { torre: t ?? null, pos };
    }
    case "vuelo_seguro": {
      const i = j.box.findIndex(m => m && m.id === accion?.monstruoId);
      const m = j.box[i];
      if (!m || m.nivel > 3) return null;
      const rival = e.jugadores[accion?.rivalId];
      const s = rival?.senderos.find(s => s.id === accion?.sendero);
      if (!rival?.vivo || !s || s.posiciones[0]) return null;
      return { boxIdx: i, monstruo: m, rival, sendero: s };
    }
    case "monstruo3_gratis": {
      const b = accion?.boxIdx;
      if (b !== 0 && b !== 1) return null;
      const libre = Array.from({ length: BOX_TAM }, (_, k) => b * BOX_TAM + k).find((i) => !j.box[i]);
      return libre === undefined ? null : { boxIdx: b, hueco: libre };
    }
    default: return {}; // efectos sin objetivo
  }
}

/* Sube un nivel la armería o el laboratorio, sin buscar nada en el mazo. */
function subirEdificio(j, cual, evs) {
  const tope = cual === "armeria" ? TOPE_ARMERIA : TOPE_LABORATORIO;
  const nivel = j.bunker[cual] ?? 0;
  if (nivel >= tope) return false;
  j.bunker[cual] = nivel + 1;
  evs.push({ tipo: "mejora", texto: `${j.nombre} sube ${cual === "armeria" ? "la armería" : "el criadero"} a nivel ${nivel + 1}.` });
  return true;
}

/* Recursos: cada carta del búnker es una mejora con su nivel. Se sube la más
   floja, que es la que más gana, y nunca por encima de RECURSOS 4. */
/* Subir recursos: +1 moneda y +1 monje por turno. No toca las cuatro cartas de
   recursos ni ocupa hueco: la prima va aparte, en `bunker.extra`. */
function subirRecursos(j, evs) {
  j.bunker.extra = { monedas: 0, monjes: 0, ...(j.bunker.extra ?? {}) };
  j.bunker.extra.monedas += 1;
  j.bunker.extra.monjes  += 1;
  evs.push({ tipo: "mejora", texto: `${j.nombre} sube unos recursos: +1 moneda y +1 monje por turno.` });
  return true;
}

/* Efectos de las ciencias instantáneas. `edificio` lo usa "Laboratorio o
   armería"; `objetivo` lo usa "Subir rango". Devuelve true si hizo algo. */
function aplicarCienciaInmediata(j, carta, evs, accion, e) {
  switch (carta.efecto) {
    case "purga":             aplicarPurga(j, evs); return true;
    case "subir_armeria":     return subirEdificio(j, "armeria", evs);
    case "subir_laboratorio": return subirEdificio(j, "laboratorio", evs);
    case "subir_recursos":    return subirRecursos(j, evs);
    case "subir_lab_o_arm":
      return subirEdificio(j, accion?.edificio === "armeria" ? "armeria" : "laboratorio", evs);
    default: break;
  }
  /* Ciencias que eligen objetivo: lo resuelve `objetivoDe` para que la mesa no
     cobre nada si la elección no vale. */
  if (!CIENCIAS_CON_OBJETIVO.has(carta.efecto)) return false;
  const o = objetivoDe(e, j, carta.efecto, accion);
  if (!o) return false;
  switch (carta.efecto) {
    case "subir_rango": {
      const antes = o.ficha.nivel;
      o.ficha.nivel = o.nuevo;
      evs.push({ tipo: "mejora", texto: `${j.nombre} sube el rango de un monstruo: ${antes} → ${o.nuevo}.` });
      return true;
    }
    case "bajar_nivel_enemigo": {
      const antes = o.ficha.nivel;
      o.ficha.nivel = o.nuevo;
      evs.push({ tipo: "mejora", texto: `${j.nombre} baja el rango de un atacante: ${antes} → ${o.nuevo}.` });
      return true;
    }
    case "convertir_aliado": {
      const nivel = o.ficha.nivel;
      o.ficha.tipo = "monstruo";
      /* Gira la ficha: pasa a ser un monstruo del jugador que la convierte. */
      o.ficha.dueno = j.id;
      evs.push({ tipo: "convertir", texto: `Un atacante ${nivel} de ${j.nombre} se convierte en aliado.` });
      return true;
    }
    case "avanzar_rival_1": {
      const { rival, sendero, ficha, posicion } = o;
      if (o.entra) {
        sendero.posiciones[posicion] = null;
        rival.puntosMonsters += ficha.nivel;
        evs.push({ tipo: "entrada", texto: `¡Monstruo ${ficha.nivel} de ${j.nombre} entra en el búnker de ${rival.nombre}! (+${ficha.nivel} pts)` });
        if (rival.puntosMonsters > 20) {
          rival.vivo = false;
          evs.push({ tipo: "derrota", texto: `El búnker de ${rival.nombre} ha sido destruido.`, a: rival.id });
        }
      } else if (o.destino) {
        const gana = resolverCombate(ficha, o.destino).monstruoSobrevive;
        evs.push(gana
          ? { tipo: "combate", texto: `El monstruo ${ficha.nivel} de ${j.nombre} destruye al monstruo ${o.destino.nivel} de ${rival.nombre}.` }
          : { tipo: "combate", texto: `El monstruo ${ficha.nivel} de ${j.nombre} muere al atacar al monstruo ${o.destino.nivel} de ${rival.nombre}.` });
        sendero.posiciones[posicion] = null;
        if (gana) sendero.posiciones[posicion + 1] = ficha;
      } else {
        sendero.posiciones[posicion] = null;
        sendero.posiciones[posicion + 1] = ficha;
      }
      comprobarFin(e);
      return true;
    }
    case "evolucionar_torreta": {
      o.torre.nivel += 1;
      evs.push({ tipo: "torre", texto: `${j.nombre} evoluciona la torre de la posición ${o.pos} a nivel ${o.torre.nivel}.` });
      return true;
    }
    case "torreta2_gratis": {
      normalizarTorres(j);
      if (o.torre) {
        o.torre.nivel = 2;
      } else {
        j.bunker.torres[o.pos - 1] = { id: uid("t"), nivel: 2, sendero: o.pos, inhabilitada: false };
      }
      evs.push({ tipo: "torre", texto: `${j.nombre} pone una torre de nivel 2 en la posición ${o.pos}.` });
      return true;
    }
    case "vuelo_seguro": {
      o.sendero.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel: o.monstruo.nivel, dueno: j.id };
      j.box[o.boxIdx] = null;
      evs.push({ tipo: "lanzamiento", texto: `${j.nombre} manda en vuelo seguro un monstruo ${o.monstruo.nivel} a la entrada de la escalera ${o.sendero.id} de ${o.rival.nombre}.` });
      return true;
    }
    case "monstruo3_gratis": {
      j.box[o.hueco] = { id: uid("m"), tipo: "monstruo", nivel: 3, dueno: j.id };
      evs.push({ tipo: "crear", texto: `${j.nombre} crea un monstruo 3 en el box ${o.boxIdx + 1}.` });
      return true;
    }
    default: return false;
  }
}

/* `reemplazo` es el efecto de la ciencia que se descarta al instalar una nueva
   cuando ya hay dos huecos ocupados. `edificio` es la elección de
   "Laboratorio o armería". */
function aplicarMejoraBunker(j, carta, e, evs, reemplazo, accion) {
  if (carta.tipo === "recursos")    { j.bunker.recursos.push(carta); return; }
  if (carta.tipo === "armeria")     { j.bunker.armeria     = carta.nivel; return; }
  if (carta.tipo === "laboratorio") { j.bunker.laboratorio = carta.nivel; return; }
  if (carta.tipo === "ciencia") {
    if (cienciaLlena(j)) {
      const fuera = j.bunker.ciencia.find(c => c.efecto === reemplazo);
      if (!fuera) return; // sin elección válida no se instala nada
      j.bunker.ciencia = j.bunker.ciencia.filter(c => c !== fuera);
      j.descarteBunker.push(fuera);
      evs.push({ tipo: "ciencia", texto: `${j.nombre} descarta la ciencia ${fuera.titulo ?? fuera.efecto}.` });
    }
    j.bunker.ciencia.push(carta);
    return;
  }
  if (carta.tipo === "ciencia_i") {
    /* Inmediata: hace su efecto y va al descarte, sin tocar el mazo. */
    if (aplicarCienciaInmediata(j, carta, evs, accion, e)) j.descarteBunker.push(carta);
    return;
  }
}

/* Combate entre monstruos, por categorías y sin desgaste: el que se mueve a la
   casilla del otro ataca primero y gana los empates. Atacar con nivel igual o
   mayor destruye al defensor y el atacante sobrevive; atacar con nivel menor
   supone morir y el defensor se queda donde está. Las torres no intervienen.
   Devuelve { enemigoMuere, monstruoSobrevive }. */
function resolverCombate(atacante, defensor) {
  const gana = atacante.nivel >= defensor.nivel;
  return { enemigoMuere: gana, monstruoSobrevive: gana };
}

function avanzarTurno(e) {
  const n = e.orden.length;
  let sig = (e.turnoIdx + 1) % n;
  let vueltas = 0;
  while (!e.jugadores[e.orden[sig]]?.vivo && vueltas < n) {
    sig = (sig + 1) % n;
    vueltas++;
  }
  let lunaRoja = false;
  if (sig <= e.turnoIdx) {
    e.luna++;
    /* El cambio de luna no lo decide el mazo: llega solo al empezar la ronda 5,
       así el primer turno rojo ya roba su carta de Destino normal. */
    if (e.luna >= LUNA_ROJA && e.nivelEnemigo === 1) {
      e.nivelEnemigo = 2;
      lunaRoja = true;
    }
  }
  e.turnoIdx = sig;
  /* Cada jugador arranca su turno con las monedas y los decretos que le tocan. */
  const j = e.jugadores[e.orden[sig]];
  if (j) {
    j.energia = energiaTotal(j);
    j.accionesRestantes = accionesTotal(j);
    j.cartasJugadasEsteTurno = 0;
  }
  return lunaRoja;
}

function comprobarFin(e) {
  if (e.final) return;
  const vivos = e.orden.filter(id => e.jugadores[id]?.vivo);
  if (vivos.length <= 1 || e.luna > 25) {
    const puestos = [...e.orden]
      .map(id => ({ jugadorId: id, puntos: e.jugadores[id].puntosMonsters }))
      .sort((a, b) => a.puntos - b.puntos);
    e.final = { puestos };
  }
}

// ── Resolución de cartas de Destino ───────────────────────────────────────
function nivelRealEnemigo(e, nivel) {
  return e.nivelEnemigo === 1 ? Math.min(1, nivel) : nivel;
}

function priorizarSendero(senderos, prio) {
  for (const id of prio) {
    const s = senderos.find(s => s.id === id);
    if (s && !s.posiciones[0]) return id;
  }
  return null;
}

function colocarAtacante(senderos, senderoId, nivel) {
  const s = senderos.find(s => s.id === senderoId);
  if (s && !s.posiciones[0]) {
    s.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel };
    return true;
  }
  return false;
}

function resolverDestino(e, jugadorId, carta) {
  const j = e.jugadores[jugadorId];
  const evs = [];

  switch (carta.tipo) {
    case "amenaza": {
      const nv = nivelRealEnemigo(e, carta.nivel);
      const sid = priorizarSendero(j.senderos, carta.prio);
      if (sid !== null) {
        colocarAtacante(j.senderos, sid, nv);
        evs.push({ tipo: "amenaza", texto: `Destino: monstruo ${nv} en la escalera ${sid} de ${j.nombre}.` });
      }
      break;
    }
    case "amenaza_triple": {
      const nv = nivelRealEnemigo(e, carta.nivel);
      for (const s of j.senderos) {
        if (!s.posiciones[0]) {
          s.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel: nv };
        }
      }
      evs.push({ tipo: "amenaza", texto: `Destino: 3 monstruos ${nv} en las escaleras de ${j.nombre}.` });
      break;
    }
    case "amenaza_doble": {
      const nv = nivelRealEnemigo(e, carta.nivel);
      let n = 0;
      for (const id of carta.prio) {
        if (n >= 2) break;
        if (colocarAtacante(j.senderos, id, nv)) n++;
      }
      evs.push({ tipo: "amenaza", texto: `Destino: 2 monstruos ${nv} en las escaleras de ${j.nombre}.` });
      break;
    }
    case "amenaza_rival": {
      const nv = nivelRealEnemigo(e, carta.nivel);
      for (const rivalId of e.orden) {
        if (rivalId === jugadorId) continue;
        const rival = e.jugadores[rivalId];
        if (!rival.vivo) continue;
        const sid = priorizarSendero(rival.senderos, carta.prio);
        if (sid !== null) {
          colocarAtacante(rival.senderos, sid, nv);
          evs.push({ tipo: "amenaza", texto: `Destino: monstruo ${nv} en la escalera ${sid} de ${rival.nombre}.`, a: rivalId });
        }
      }
      break;
    }
    case "calma":
      evs.push({ tipo: "calma", texto: "Calma... no hay monstruos nuevos." });
      break;
    case "buscar_bunker":
      { const carta = robarBunker(j, e); if (carta) j.mano.push(carta); }
      evs.push({ tipo: "buscar_bunker", texto: `${j.nombre} encuentra una carta de búnker.`, a: jugadorId });
      break;
    case "aniquilar_entrada":
      for (const s of j.senderos) {
        if (s.posiciones[0]) {
          evs.push({ tipo: "aniquilar", texto: `Aniquilado monstruo en la entrada de la escalera ${s.id} de ${j.nombre}.` });
          s.posiciones[0] = null;
        }
      }
      break;
    case "aniquilar_nivel":
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          const f = s.posiciones[p];
          if (f?.tipo === "atacante" && f.nivel <= carta.nivelMax) {
            evs.push({ tipo: "aniquilar", texto: `Aniquilado monstruo ${f.nivel} en la escalera ${s.id} de ${j.nombre}.` });
            s.posiciones[p] = null;
          }
        }
      }
      break;
    case "matar_mayor": {
      let mayor = null, sm = null, pm = null;
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          if (s.posiciones[p]?.tipo === "atacante" && (!mayor || s.posiciones[p].nivel > mayor)) {
            mayor = s.posiciones[p].nivel; sm = s; pm = p;
          }
        }
      }
      if (sm) {
        sm.posiciones[pm] = null;
        evs.push({ tipo: "aniquilar", texto: `El monstruo más poderoso (${mayor}) de ${j.nombre} muere.` });
      }
      break;
    }
    case "avanzar_extra":
      for (const s of j.senderos) {
        for (let pos = 3; pos > 0; pos--) {
          const f = s.posiciones[pos - 1];
          if (f?.tipo === "atacante" && !s.posiciones[pos]) {
            s.posiciones[pos] = f;
            s.posiciones[pos - 1] = null;
          }
        }
      }
      evs.push({ tipo: "avanzar_extra", texto: `¡Los atacantes de ${j.nombre} avanzan un paso más!` });
      break;
    case "miedo": {
      /* Miedo: todos los atacantes de la mesa retroceden una casilla, aunque ya
         hayan avanzado en esta ronda. Sustituye a "Parar movimiento", que
         llegaba tarde (el avance ya había pasado) y solo servía para meter
         reglas de turnos parados. Los de la entrada no tienen casilla detrás:
         se quedan donde están. */
      let vivos = 0, movidos = 0;
      for (const otro of Object.values(e.jugadores)) {
        if (!otro.vivo) continue;
        for (const s of otro.senderos) vivos += s.posiciones.filter(f => f?.tipo === "atacante").length;
      }
      for (const otro of Object.values(e.jugadores)) {
        if (!otro.vivo) continue;
        for (const s of otro.senderos) {
          /* De delante hacia atrás para que la fila retroceda entera. */
          for (let p = 1; p < 4; p++) {
            const f = s.posiciones[p];
            if (f?.tipo !== "atacante") continue;
            const detras = s.posiciones[p - 1];
            if (!detras) {
              s.posiciones[p - 1] = f;
              s.posiciones[p] = null;
              movidos++;
              continue;
            }
            /* Si detrás hay un defensor, el atacante no puede recular: pelea.
               Mismas reglas que en el avance, gana los empates el atacante. */
            if (detras.tipo !== "monstruo") continue;
            if (f.nivel >= detras.nivel) {
              s.posiciones[p - 1] = f;
              s.posiciones[p] = null;
              movidos++;
              evs.push({ tipo: "combate", texto: `¡Miedo! El atacante ${f.nivel} destruye al monstruo ${detras.nivel} de ${otro.nombre} en la escalera ${s.id}.` });
            } else {
              s.posiciones[p] = null;
              evs.push({ tipo: "combate", texto: `¡Miedo! El monstruo ${detras.nivel} de ${otro.nombre} destruye al atacante ${f.nivel} en la escalera ${s.id}.` });
            }
          }
        }
      }
      evs.push({ tipo: "miedo", texto: !vivos
        ? "¡Miedo! No hay atacantes en la mesa a los que hacer recular."
        : movidos
          ? `¡Miedo! Retroceden ${movidos} de los ${vivos} atacantes de la mesa.`
          : `¡Miedo! Ninguno de los ${vivos} atacantes puede retroceder.` });
      break;
    }
    case "convertir_aliado":
      for (const s of j.senderos) {
        const f = s.posiciones[0];
        if (f?.tipo === "atacante" && f.nivel <= 5) {
          f.tipo = "monstruo";
          f.dueno = j.id;
          evs.push({ tipo: "convertir", texto: `Atacante ${f.nivel} en la escalera ${s.id} de ${j.nombre} se convierte en aliado.` });
          break;
        }
      }
      break;
    case "subir_monstruos":
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          const f = s.posiciones[p];
          if (f?.tipo === "monstruo" && f.nivel <= carta.nivelMax) {
            const idx = NIVELES.indexOf(f.nivel);
            if (idx < NIVELES.length - 1) f.nivel = NIVELES[idx + 1];
          }
        }
      }
      evs.push({ tipo: "subir_monstruos", texto: `Monstruos de ${j.nombre} nivel ≤${carta.nivelMax} suben de rango.` });
      break;
    case "bajar_monstruos":
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          const f = s.posiciones[p];
          if (f?.tipo === "monstruo" && f.nivel >= carta.nivelMin) {
            const idx = NIVELES.indexOf(f.nivel);
            if (idx > 0) f.nivel = NIVELES[idx - 1];
          }
        }
      }
      evs.push({ tipo: "bajar_monstruos", texto: `Monstruos de ${j.nombre} nivel ≥${carta.nivelMin} bajan de rango.` });
      break;
    case "colocar_monstruos": {
      let colocados = 0;
      /* Es un regalo del mazo de Destino, no una cría del criadero: el nivel de
         la carta no depende del nivel del edificio. Antes se comprobaba
         `carta.nivel <= nivelMaxLab(j)` y con el criadero a nivel 1 una carta
         de yetis (nivel 3) no creaba ninguno. */
      for (let i = 0; i < j.box.length && colocados < carta.cantidad; i++) {
        if (!j.box[i]) {
          j.box[i] = { id: uid("m"), tipo: "monstruo", nivel: carta.nivel, dueno: j.id };
          colocados++;
        }
      }
      evs.push({ tipo: "monstruos_gratis", texto: `${j.nombre} recibe ${colocados} monstruo(s) nivel ${carta.nivel} en el box.`, a: jugadorId });
      break;
    }
  }

  return evs;
}

export default bunkerWars;
