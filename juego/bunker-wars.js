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

/* Los ids viajan dentro de la partida guardada. El contador vuelve a cero cada
   vez que arranca el servidor, así que dos fichas distintas podían acabar con
   el mismo id ("e2" en dos calle s): el cliente animaba una encima de la otra y
   parecía que un monstruo cruzaba de calle. La marca de arranque lo evita. */
let _seq = 0;
const ARRANQUE = Math.random().toString(36).slice(2, 7);
function uid(p) { return `${p}${ARRANQUE}${++_seq}`; }

// ── Niveles válidos ───────────────────────────────────────────────────────
const NIVELES = [1, 2, 3, 5, 7];
const COSTE_MONSTRUO = { 1: 0, 2: 1, 3: 2, 5: 3, 7: 3 };
const COSTE_MONSTRUO_VOLADOR = 1;
/* Cartas de Destino que meten monstruos en los caminos. */
const AMENAZAS = new Set(["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival", "amenaza_mixta"]);
/* Estas cartas actúan sobre la mesa entera: con un Destino compartido se
   resuelven una vez por ciclo, no una vez por cada jugador. */
const DESTINO_GLOBAL = new Set(["miedo", "amenaza_rival"]);
/* La luna blanca se vuelve roja al empezar esta ronda: cuatro rondas de robo
   con los búnkeres aún flojos. No es una carta, así que a nadie le quita la
   carta de Destino de su turno. */
const LUNA_ROJA = 5;

// ── Cartas de Destino ─────────────────────────────────────────────────────
/* Mazo nuevo: solo Avistamientos. Cada carta lleva su tramo (1 = lunas 1-4,
   2 = lunas 5-8, 3 = desde la luna 9) y su cantidad de monstruos. Las cartas
   de eventos del mazo anterior quedan fuera hasta que las recuperemos. */
const PLANTILLAS_DESTINO = [
  // Tramo I — lunas 1-4 (solo tramo 1: no aparecen en tramos superiores)
  { id:"a01", tipo:"amenaza", nivel:1, cantidad:1, prio:[1,2,3], tramo:1, tramoMax:1,
    titulo:"Se ha avistado un rastreador",
    descripcion:"Un rastreador se arrastra desde la nieve." },
  { id:"a01v", tipo:"amenaza", nivel:"volador", cantidad:1, prio:[3,2,1], tramo:1, tramoMax:1,
    titulo:"Aves de bruma avistadas",
    descripcion:"Unas aves de bruma surcan el cielo por el camino de la derecha." },
  { id:"a02", tipo:"amenaza", nivel:1, cantidad:1, prio:[3,2,1], tramo:1, tramoMax:1,
    titulo:"Un rastreador",
    descripcion:"Un rastreador aparece al otro lado de la fortaleza." },
  /* Avistamiento mixto de la apertura: el carroñero entra por la central y un
     rastreador por cada lado. Es la única carta con niveles distintos a la vez,
     así que guarda el nivel de cada escalera en `niveles` (izquierda, central,
     derecha). `nivelPropio` la salta la rebaja de la luna blanca: si no, el
     carroñero entraría como rastreador. */
  { id:"a03", tipo:"amenaza_mixta", tramo:1, tramoMax:1, nivel:2,
    niveles:[1, 2, "volador"], nivelPropio:true,
    titulo:"Sombras en la niebla",
    descripcion:"Algo se mueve en los tres caminos. Un rastreador acecha por la izquierda, un carroñero avanza por el centro y aves de bruma surcan la derecha." },
  { id:"a03b", tipo:"amenaza", nivel:1, cantidad:2, prio:[2,1,3], tramo:1, tramoMax:1,
    titulo:"2 rastreadores avistados",
    descripcion:"Dos rastreadores aparecen en el comienzo de tus escaleras." },
  { id:"a04", tipo:"amenaza", nivel:1, cantidad:3, prio:[1,2,3], tramo:1, tramoMax:1,
    titulo:"Tres rastreadores",
    descripcion:"Tres rastreadores emergen de la nieve." },
  // Tramo II — lunas 5-8 (solo tramo 2: nivel 2 no aparece en tramo 3)
  { id:"a05", tipo:"amenaza", nivel:2, cantidad:1, prio:[1,2,3], tramo:2, tramoMax:2,
    titulo:"Un carroñero",
    descripcion:"Un carroñero husmea entre las rocas." },
  { id:"a06", tipo:"amenaza", nivel:2, cantidad:2, prio:[2,1,3], tramo:2, tramoMax:2,
    titulo:"Dos carroñeros",
    descripcion:"Dos carroñeros avanzan hacia la fortaleza." },
  { id:"a07", tipo:"amenaza", nivel:3, cantidad:3, prio:[2,3,1], tramo:2,
    titulo:"Tres yetis",
    descripcion:"Tres yetis descienden rugiendo de la montaña." },
  { id:"a08", tipo:"amenaza", nivel:5, cantidad:1, prio:[2,1,3], tramo:2,
    titulo:"Un coloso de hielo",
    descripcion:"Un coloso de hielo se alza sobre la nieve." },
  { id:"a09", tipo:"amenaza", nivel:5, cantidad:2, prio:[1,2,3], tramo:2,
    titulo:"Dos colosos de hielo",
    descripcion:"Dos colosos de hielo emergen del hielo." },
  // Tramo final — desde la luna 9
  { id:"a10", tipo:"amenaza", nivel:5, cantidad:2, prio:[1,2,3], tramo:3,
    titulo:"Dos colosos de hielo",
    descripcion:"Dos colosos de hielo aparecen entre la nieve." },
  { id:"a11", tipo:"amenaza", nivel:7, cantidad:1, prio:[2,3,1], tramo:3,
    titulo:"Un devorador de cumbres",
    descripcion:"Un devorador de cumbres se recorta contra el cielo." },
  { id:"a12", tipo:"amenaza", nivel:5, cantidad:2, prio:[3,2,1], tramo:3,
    titulo:"Dos colosos de hielo",
    descripcion:"Dos colosos de hielo surgen de la ventisca." },
  { id:"a13", tipo:"amenaza", nivel:7, cantidad:3, prio:[2,1,3], tramo:3,
    titulo:"Tres devoradores de cumbres",
    descripcion:"Tres devoradores de cumbres descienden de las cumbres." },
  /* Eventos — una sola copia de cada carta. El `tramo` es la luna desde la
     que la carta tiene sentido: en las primeras no salen las que piden una
     mesa montada (los monstruos más fuertes, los que suben o bajan rangos,
     los que dependen de tener jaulas llenas). Con el tramo puesto, en las
     lunas 1-4 solo caen avistamientos de rastreadores y eventos suaves. */
  { id:"d21", tipo:"calma", tramo:1 },
  { id:"d20", tipo:"aniquilar_entrada", tramo:1 },
  { id:"d28", tipo:"miedo", tramo:1 },
  { id:"d27", tipo:"avanzar_extra", tramo:2 },
  { id:"d30", tipo:"bajar_monstruos", nivelMin:2, tramo:2 },
  { id:"d23", tipo:"aniquilar_nivel", nivelMax:3, tramo:2 },
  { id:"d24", tipo:"matar_mayor", tramo:3 },
  { id:"d33", tipo:"desercion", tramo:3 },
  { id:"d31", tipo:"colocar_monstruos", nivel:3, cantidad:2, tramo:3 },
  /* Estas dos castigan la defensa del que roba la carta: le tocan sus propias
     torres. La Protección ancestral las anula. */
  { id:"d34", tipo:"ventisca", tramo:2, titulo:"Ventisca",
    descripcion:"Una ventisca ciega a los tuyos desde las almenas: todas tus torres bajan un nivel, y las de nivel 1 se derrumban." },
  { id:"d35", tipo:"desprendimiento", tramo:3, titulo:"Desprendimiento",
    descripcion:"Un bloque de hielo se desprende de la cornisa y aplasta tu torre más alta, sea cual sea su nivel." },
];

/* Tramo de cada carta por su id: sirve para ponerle el tramo a las cartas que
   se repartieron antes de que los eventos lo tuvieran. */
const TRAMO_DESTINO = new Map(PLANTILLAS_DESTINO.map(p => [p.id, p.tramo ?? null]));

/* Apertura fija de las cuatro primeras lunas: rastreador, carroñero con dos
   rastreadores por los lados, calma y dos rastreadores. El arranque es el
   momento más frágil de la partida y una carta fea en la luna 1 la decidía;
   así todas las mesas empiezan igual, y la segunda luna sube de nivel para
   que el comienzo no sea una cuesta plana.
   Estas copias no salen del mazo ni van al descarte: desde la luna 5 el ciclo
   sigue exactamente como estaba. */
const APERTURA_DESTINO = { 1: "a01", 2: "a03", 3: "d21", 4: "a03b" };

function crearMazoDestino(nJugadores, e) {
  return barajar(PLANTILLAS_DESTINO.map(p => ({ ...p, uid: uid("dc") })), e);
}

// ── Cartas de búnker ──────────────────────────────────────────────────────
const PLANTILLAS_BUNKER = [
  { tipo:"recursos",    nivel:1, coste:1, titulo: "RECURSOS 1", descripcion: "Genera 1 moneda extra al comienzo de cada turno." },
  { tipo:"recursos",    nivel:1, coste:1, titulo: "RECURSOS 1", descripcion: "Genera 1 moneda extra al comienzo de cada turno." },
  { tipo:"recursos",    nivel:1, coste:1, titulo: "RECURSOS 1", descripcion: "Genera 1 moneda extra al comienzo de cada turno." },
  { tipo:"recursos",    nivel:1, coste:1, titulo: "RECURSOS 1", descripcion: "Genera 1 moneda extra al comienzo de cada turno." },
  { tipo:"recursos",    nivel:2, coste:2, titulo: "RECURSOS 2", descripcion: "Genera 2 monedas extra al comienzo de cada turno." },
  { tipo:"recursos",    nivel:2, coste:2, titulo: "RECURSOS 2", descripcion: "Genera 2 monedas extra al comienzo de cada turno." },
  { tipo:"decreto",     nivel:1, coste:2, titulo: "DECRETO 1",  descripcion: "Genera 1 decreto extra al comienzo de cada turno." },
  { tipo:"decreto",     nivel:1, coste:2, titulo: "DECRETO 1",  descripcion: "Genera 1 decreto extra al comienzo de cada turno." },
  { tipo:"recursos_mix", nivel:2, coste:3, titulo: "RECURSOS 2", descripcion: "Genera 1 moneda y 1 decreto extra al comienzo de cada turno." },
  { tipo:"recursos_mix", nivel:2, coste:3, titulo: "RECURSOS 2", descripcion: "Genera 1 moneda y 1 decreto extra al comienzo de cada turno." },
  /* Monedas al momento: pagas su coste y devuelven el doble, o sea 2 o 3
     monedas de ganancia. No se instalan: la carta se gasta al jugarla. */
  { tipo:"recursos_i", efecto:"monedas4", coste:2, ganancia:4, titulo: "Monedas 4", descripcion: "Paga 2 monedas y 1 decreto: recibes 4 monedas al momento (ganas 2)." },
  { tipo:"recursos_i", efecto:"monedas4", coste:2, ganancia:4, titulo: "Monedas 4", descripcion: "Paga 2 monedas y 1 decreto: recibes 4 monedas al momento (ganas 2)." },
  { tipo:"recursos_i", efecto:"monedas6", coste:3, ganancia:6, titulo: "Monedas 6", descripcion: "Paga 3 monedas y 1 decreto: recibes 6 monedas al momento (ganas 3)." },
  { tipo:"recursos_i", efecto:"monedas6", coste:3, ganancia:6, titulo: "Monedas 6", descripcion: "Paga 3 monedas y 1 decreto: recibes 6 monedas al momento (ganas 3)." },
  /* La armería y el criadero arrancan en nivel 1. Las cartas +1 suben un nivel
     cada una, pero con techo: armería hasta 2 y criadero hasta 3. Para el
     nivel 3 de armería y el 4 de criadero están las cartas de salto, que
     ponen el nivel de golpe. */
  { tipo:"armeria_up",   nivel:2, coste:2, titulo: "Armería +1", descripcion: "Sube un nivel la armería, hasta el nivel 2. Para el nivel 3 está la carta ARMERÍA 3." },
  { tipo:"armeria",     nivel:3, coste:2, titulo: "ARMERÍA 3", descripcion: "Puedes armar torretas de ataque 2 en un espacio habilitado." },
  { tipo:"laboratorio_up", nivel:3, coste:2, titulo: "Criadero +1", descripcion: "Sube un nivel el criadero, hasta el nivel 3. Para el nivel 4 está la carta CRIADERO 4." },
  { tipo:"laboratorio", nivel:4, coste:2, titulo: "CRIADERO 4", descripcion: "Te permite criar rastreadores, carroñeros, yetis y colosos de hielo en la jaula." },
  /* Textos copiados de las cartas físicas: no inventar efectos ni redacciones. */
  { tipo:"ciencia",     efecto:"torreta_barata",    coste:8, titulo: "Disparar barato",  descripcion: "Disparar torretas cuesta una moneda menos." },
  { tipo:"ciencia",     efecto:"monstruo_barato",   coste:8, titulo: "Monstruos baratos", descripcion: "Crear monstruos cuesta una moneda menos del valor del monstruo." },
  { tipo:"ciencia",     efecto:"torreta_universal", coste:8, titulo: "Torres universales", descripcion: "Tus torres hacen el daño correspondiente a su nivel en cualquier escalera." },
  { tipo:"ciencia",     efecto:"proteccion_torres", coste:8, titulo: "Protección ancestral", descripcion: "Ninguna carta de Destino ni ningún rival puede bajar el nivel de tus torres." },
  { tipo:"ciencia_i",   efecto:"purga",             coste:12, titulo: "Purga", descripcion: "Aniquila todos los monstruos de los 2 peldaños más cercanos a tu fortaleza, tanto los tuyos como los atacantes." },
  { tipo:"ciencia_i",   efecto:"subir_rango",       coste:2, titulo: "Subir rango", descripcion: "Sube un rango el nivel de un monstruo hasta nivel 5 como máximo." },
  { tipo:"ciencia_i",   efecto:"bajar_nivel_enemigo",coste:2, titulo: "Bajar rango", descripcion: "Baja un rango el nivel de un monstruo enemigo que esté atacando tu búnker." },
  { tipo:"ciencia_i",   efecto:"evolucionar_torreta",coste:2, titulo: "Evolucionar torre", descripcion: "Evoluciona una torre al siguiente nivel." },
  { tipo:"ciencia_i",   efecto:"torreta2_gratis",    coste:3, titulo: "Torre de nivel 2", descripcion: "Construye una torre de nivel 2 en tu búnker sin necesidad de tener ARMERÍA 2." },
  { tipo:"ciencia_i",   efecto:"monstruo3_gratis",   coste:3, titulo: "Monstruo de nivel 3", descripcion: "Crea un monstruo de nivel 3 (**yeti**) en un box sin necesidad de tener CRIADERO 3." },
  /* Estas cuatro suben el nivel al momento: no se busca ninguna carta en el
     mazo ni se baraja, el sobreprecio respecto a la carta de búnker es el
     atajo. */
  { tipo:"ciencia_i",   efecto:"subir_armeria",      coste:3, titulo: "Subir armería", descripcion: "Aumenta un nivel la armería." },
  { tipo:"ciencia_i",   efecto:"subir_laboratorio",  coste:3, titulo: "Subir criadero", descripcion: "Aumenta un nivel el criadero." },
  { tipo:"ciencia_i",   efecto:"bombardear",         coste:3, titulo: "Bombardear", descripcion: "Baja un nivel a una torre enemiga. Si es de nivel 1, la destruye." },
  { tipo:"ciencia_i",   efecto:"subir_lab_o_arm",    coste:4, titulo: "Criadero o armería", descripcion: "Aumenta un nivel el criadero o la armería." },
  /* Dichos: cartas de relleno, sin efecto ninguno. No se pueden jugar, solo
     descartar. Cada una lleva su propio `efecto` porque la clave con la que se
     refrescan los textos guardados no distingue dos cartas iguales. */
  { tipo:"dicho", efecto:"dicho_yak",      coste:0, titulo: "El yak prudente",   descripcion: "No cruces el puente antes de saber cuánto pesa el yak." },
  { tipo:"dicho", efecto:"dicho_te",       coste:0, titulo: "100 carroñeros",    descripcion: "Más vale 10 carroñeros en mano que 100 volando." },
  { tipo:"dicho", efecto:"dicho_montana",  coste:0, titulo: "La montaña",        descripcion: "La montaña no sube a verte. Ni piensa hacerlo." },
  { tipo:"dicho", efecto:"dicho_escalera", coste:0, titulo: "Barrer dos veces",  descripcion: "Quien barre 2 veces la misma escalera está barriendo la del otro." },
  { tipo:"dicho", efecto:"dicho_cuerda",   coste:0, titulo: "La cuerda del yeti", descripcion: "Nunca preguntes al yeti si la cuerda aguanta: él ya lo sabe." },
];

/* Topes de los edificios del búnker. Los recursos no son un nivel único:
   son hasta 4 cartas, cada una con el suyo. */
const TOPE_ARMERIA = 3;
const TOPE_LABORATORIO = 4;
const TOPE_RECURSOS = 4;

// Una copia de cada carta — mazo sin duplicados
const COPIAS_BUNKER = {
  recursos: 1, decreto: 1, recursos_mix: 1, recursos_i: 1,
  armeria_up: 2, laboratorio_up: 3,
  armeria: 1, laboratorio: 1, ciencia: 1, ciencia_i: 1, dicho: 1,
};

/* Cartas que el jugador ya ha gastado: no vuelven al mazo nunca. La carta
   guarda el índice de su plantilla (`plantilla`) para poder reconocerla aunque
   haya varias copias del mismo tipo. El mazo sigue siendo infinito con lo que
   queda sin usar; lo que se juega desaparece. */
function cartasUsadas(j) {
  if (!Array.isArray(j.usadas)) j.usadas = [];
  return j.usadas;
}

/* Mesas empezadas antes de esta cuenta: lo que ya está instalado en el búnker
   se marca como usado una sola vez, para que no se reponga. */
function sembrarUsadas(j) {
  if (j.usadasSembradas) return;
  j.usadasSembradas = true;
  const usadas = cartasUsadas(j);
  const ya = new Set(usadas);
  const instaladas = [
    ...(j.bunker?.recursos ?? []),
    ...(j.bunker?.decretos ?? []),
    ...(j.bunker?.recursos_mix ?? []),
    ...(j.bunker?.ciencia ?? []),
  ];
  for (const c of instaladas) {
    const i = PLANTILLAS_BUNKER.findIndex((p, idx) => !ya.has(idx)
      && p.tipo === c.tipo
      && (p.nivel ?? null) === (c.nivel ?? null)
      && (p.efecto ?? "") === (c.efecto ?? ""));
    if (i < 0) continue;
    ya.add(i);
    usadas.push(i);
  }
}

/* Cartas que todavía le sirven al jugador: las que no se han gastado, más
   armería/laboratorio por encima del nivel que ya tiene. */
function cartasUtiles(j) {
  sembrarUsadas(j);
  const ya = new Set(cartasUsadas(j));
  const cartas = [];
  PLANTILLAS_BUNKER.forEach((p, i) => {
    if (ya.has(i)) return;
    const n = COPIAS_BUNKER[p.tipo] ?? 1;
    if (!n) return;
    if (p.tipo === "armeria" && p.nivel <= (j.bunker.armeria ?? 0)) return;
    if (p.tipo === "laboratorio" && p.nivel <= (j.bunker.laboratorio ?? 0)) return;
    /* Las +1 desaparecen del mazo cuando su edificio ya está en el techo. */
    if (p.tipo === "armeria_up"     && (j.bunker.armeria ?? 1) >= 2) return;
    if (p.tipo === "laboratorio_up" && (j.bunker.laboratorio ?? 1) >= 3) return;
    if (p.tipo === "ciencia" && tieneCiencia(j, p.efecto)) return;
    for (let k = 0; k < n; k++) cartas.push({ ...p, plantilla: i, uid: uid("cb") });
  });
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
  const ya = new Set(cartasUsadas(j));
  const faltan = [];
  PLANTILLAS_BUNKER.forEach((p, i) => {
    if (p.tipo !== "ciencia" && p.tipo !== "ciencia_i") return;
    /* Una ciencia jugada no se repone: ya está gastada. */
    if (ya.has(i)) return;
    if (todas.some(c => c.tipo === p.tipo && c.efecto === p.efecto)) return;
    faltan.push({ ...p, plantilla: i, uid: uid("cb") });
  });
  if (!faltan.length) return;
  j.mazoBunker = barajar([...(j.mazoBunker ?? []), ...faltan], e);
}

/* Los dichos llegaron después: una mesa empezada no los tiene en el mazo. Si
   no queda ninguno en juego, entran los cinco (una sola vez: luego ya están). */
function reponerDichos(j, e) {
  const todas = [...(j.mano ?? []), ...(j.mazoBunker ?? []), ...(j.descarteBunker ?? [])];
  if (todas.some(c => c.tipo === "dicho")) return;
  const dichos = PLANTILLAS_BUNKER.filter(p => p.tipo === "dicho")
    .map(p => ({ ...p, uid: uid("cb") }));
  j.mazoBunker = barajar([...(j.mazoBunker ?? []), ...dichos], e);
}

function robarBunker(j, e) {
  reponerMazoBunker(j, e);
  reponerDichos(j, e);
  reponerCiencias(j, e);
  return j.mazoBunker.length ? j.mazoBunker.shift() : null;
}

// ── Helpers de búnker ─────────────────────────────────────────────────────
function energiaTotal(j) {
  return 3 + (j.bunker.extra?.monedas ?? 0)
    + j.bunker.recursos.reduce((s, c) => s + (c.nivel >= 2 ? 2 : 1), 0)
    + (j.bunker.recursos_mix?.length ?? 0);
}

function accionesTotal(j) {
  return 2 + (j.bunker.extra?.monjes ?? 0)
    + (j.bunker.decretos?.length ?? 0)
    + (j.bunker.recursos_mix?.length ?? 0);
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

/* El box son dos cajas de 2 huecos (4 en total): la caja 1 toca los caminos 1
   y 2; la caja 2, los caminos 2 y 3. Desde una caja solo se puede soltar en
   esos caminos, y solo en su casilla de inicio. */
const BOX_TAM = 2;
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
  if (!Array.isArray(j.colaLanzaderas)) j.colaLanzaderas = [];
  if (j.colaLanzaderas.length > 2) j.colaLanzaderas.length = 2;
}

/* Mueve el monstruo de pos 0 de un sendero a la lanzadera libre; si no hay,
   lo pone en la cola (hasta 2 monstruos en espera). */
function aLanzaderaOCola(j, s, evs) {
  const mon = s.posiciones[0];
  if (!mon) return;
  const i = lanzaderaDeSendero(j, s.id);
  if (i !== null) {
    j.lanzaderas[i] = mon;
    s.posiciones[0] = null;
    evs.push({ tipo: "a_lanzadera", texto: `Un monstruo de ${j.nombre} alcanza la lanzadera ${i + 1}.` });
  } else if (j.colaLanzaderas.length < 2) {
    j.colaLanzaderas.push(mon);
    s.posiciones[0] = null;
    evs.push({ tipo: "a_lanzadera", texto: `Un monstruo de ${j.nombre} queda en espera de lanzadera.` });
  }
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
    for (const c of lista ?? []) {
      c.tipo = tipo(c.tipo);
      /* Los eventos se repartieron antes de tener tramo: se les pone el de su
         plantilla para que una mesa empezada también respete los ciclos. */
      if (c.id && !c.tramo && TRAMO_DESTINO.get(c.id)) c.tramo = TRAMO_DESTINO.get(c.id);
    }
  }
  if (e.ultimoDestino) e.ultimoDestino.tipo = tipo(e.ultimoDestino.tipo);
}

/* Cada ficha lleva su dueño, aunque no siempre se use: los monstruos son de
   quien manda en ese tablero, y los atacantes lanzados por un jugador guardan
   quién los mandó. Los de carta de Destino no llevan dueño: son del juego. Un
   monstruo es defensor en su tablero y atacante en cuanto sale a otro. */
/* Dos huecos por box, cuatro en total. Las partidas guardadas con el box de
   tres huecos se recortan aquí: los monstruos se compactan al principio y los
   que ya no caben se pierden (solo pasa en partidas viejas). */
function normalizarBox(e) {
  const total = BOX_TAM * 2;
  for (const j of Object.values(e.jugadores ?? {})) {
    const box = j.box ?? [];
    if (box.length === total) continue;
    const monos = box.filter(Boolean).slice(0, total);
    j.box = Array.from({ length: total }, (_, i) => monos[i] ?? null);
  }
}

function normalizarDuenos(e) {
  for (const [id, j] of Object.entries(e.jugadores ?? {})) {
    for (const s of j.senderos ?? []) {
      for (const f of s.posiciones ?? []) if (f?.tipo === "monstruo" && !f.dueno) f.dueno = id;
    }
    for (const m of j.box ?? []) if (m && !m.dueno) m.dueno = id;
    for (const m of j.lanzaderas ?? []) if (m && !m.dueno) m.dueno = id;
  }
}

/* Repara partidas guardadas con ids repetidos (de cuando el contador volvía a
   cero): se queda el primero y los demás se renombran. */
function normalizarIds(e) {
  const vistos = new Set();
  /* El nombre nuevo es siempre el mismo para el mismo id repetido (-2, -3…):
     así el cliente ve el id estable y la ficha no parpadea en cada repintado. */
  const unico = (f) => {
    if (!f || typeof f !== "object" || typeof f.id !== "string") return;
    if (!vistos.has(f.id)) { vistos.add(f.id); return; }
    let n = 2;
    let nuevo = `${f.id}-${n}`;
    while (vistos.has(nuevo)) nuevo = `${f.id}-${++n}`;
    f.id = nuevo;
    vistos.add(nuevo);
  };
  for (const j of Object.values(e.jugadores ?? {})) {
    for (const m of j.box ?? []) unico(m);
    for (const m of j.lanzaderas ?? []) unico(m);
    for (const s of j.senderos ?? []) for (const f of s.posiciones ?? []) unico(f);
  }
}

/* Cartas que se han retirado del juego (la de Vuelo seguro, que era muy
   difícil de manejar). Se limpian de las mesas empezadas: si se quedan en la
   mano no se pueden jugar y atascan el descarte. */
const CARTAS_RETIRADAS = new Set(["vuelo_seguro", "avanzar_rival_1"]);

function retirarCartasViejas(e) {
  /* De Destino salieron Subir rango y Convertir aliado: se quitan también de
     las mesas empezadas, que si no seguirían robándolas de su mazo. */
  const fueraDestino = new Set(["d26", "d29"]);
  for (const clave of ["mazoDestino", "descarteDestino"]) {
    if (Array.isArray(e[clave])) e[clave] = e[clave].filter(c => !fueraDestino.has(c?.id));
  }
  for (const j of Object.values(e.jugadores ?? {})) {
    const listas = [j.mano, j.mazoBunker, j.descarteBunker, j.bunker?.recursos, j.bunker?.ciencia];
    for (const lista of listas) {
      if (!Array.isArray(lista)) continue;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (CARTAS_RETIRADAS.has(lista[i]?.efecto)) lista.splice(i, 1);
      }
    }
  }
}

/* Partidas viejas: el búnker se guardó antes de que existieran algunas cartas,
   así que le faltan arrays enteros (`recursos_mix` nació después). Sin ellos,
   instalar una de esas cartas reventaba al hacer push y no se guardaba nada:
   ni las monedas, ni el decreto, ni la carta fuera de la mano. */
/* Fichas que han muerto sin pelear (una torre que dispara, Purga, una carta
   de Destino): el cliente les deja el humo en su propia casilla en vez de
   inventarles un choque con el monstruo que tengan delante. Se guardan los
   últimos ids porque la foto de fichas del cliente va un repintado por detrás. */
const MAX_MUERTES_SIN_LUCHA = 12;
function marcarMuerteSinLucha(j, ficha) {
  if (!j || !ficha?.id) return;
  const lista = (j.muertesSinLucha ??= []);
  lista.push(ficha.id);
  if (lista.length > MAX_MUERTES_SIN_LUCHA) lista.splice(0, lista.length - MAX_MUERTES_SIN_LUCHA);
}

/* Torres que te han tocado desde tu último turno: el cliente las enseña en el
   aviso de «Es tu turno», en la misma caja roja que los ataques. */
function avisosTorre(j) {
  if (!Array.isArray(j.avisosTorre)) j.avisosTorre = [];
  return j.avisosTorre;
}

function normalizarBunker(j) {
  if (!j) return;
  const b = j.bunker ?? (j.bunker = {});
  b.recursos     ??= [];
  b.decretos     ??= [];
  b.recursos_mix ??= [];
  b.ciencia      ??= [];
  b.torres       ??= [null, null, null];
  b.extra        ??= { monedas: 0, monjes: 0 };
  if (b.armeria == null) b.armeria = 1;
  if (b.laboratorio == null) b.laboratorio = 1;
}

function sincronizarTorres(e) {
  migrarNombres(e);
  retirarCartasViejas(e);
  sincronizarTextosCartas(e);
  normalizarIds(e);
  normalizarDuenos(e);
  normalizarBox(e);
  for (const j of Object.values(e.jugadores ?? {})) {
    normalizarBunker(j);
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
  const bunker = { armeria: 1, laboratorio: 1, recursos: [], decretos: [], recursos_mix: [], ciencia: [], torres: [null, null, null],
    extra: { monedas: 0, monjes: 0 } };
  const mazo = crearMazoBunker(e, { bunker });
  const mano = mazo.splice(0, 4);
  return {
    id: info.id,
    nombre: info.nombre,
    avatar: info.avatar,
    esBot: !!info.esBot,
    equipo: e.modo === "equipos" ? (Number(info.equipo) === 1 ? 1 : 0) : null,
    puntosMonsters: 0,
    vivo: true,
    regalos: [],
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
  nombre: "PYMALS",
  min: 2,
  max: 8,
  resumen: "Defiende tu búnker 25 rondas. Manda monstruos a tus rivales. El último en pie gana.",

  crear({ jugadores, semilla, opciones }) {
    const modo = opciones?.modo === "equipos" ? "equipos" : "todos";
    const equipos = opciones?.equipos ?? {};
    const e = {
      luna: 1,
      modo,
      fase: "lanzar",
      orden: jugadores.map(j => j.id),
      turnoIdx: 0,
      rng: (Number(semilla) || 1) >>> 0,
      mazoDestino: [],
      descarteDestino: [],
      /* Carta fijada para el ciclo actual: la primera que se roba en la
         jornada es la que verán todos los jugadores. */
      destinoCiclo: null,
      /* Última carta de Destino repartida: sirve para no encadenar dos eventos
         y para que la primera carta de la partida sea un avistamiento. */
      destinoPrevio: null,
      nivelEnemigo: 1,
      jugadores: {},
      regalos: [],
      peticiones: [],
      final: null,
      /* Quién ha caído y en qué luna, en orden. El primero de la lista es el
         último de la mesa; sirve para el puesto de cada uno en el final y para
         la pantalla de «has caído» de quien cae a media partida. */
      eliminados: [],
    };
    for (const [i, j] of jugadores.entries()) {
      const equipo = modo === "equipos"
        ? (Number(equipos[j.id]) === 1 ? 1 : Number(equipos[j.id]) === 0 ? 0 : i % 2)
        : null;
      e.jugadores[j.id] = jugadorInicial({ ...j, equipo }, e);
    }
    e.mazoDestino = crearMazoDestino(jugadores.length, e);
    /* La jornada empieza por la lanzadera. Si no hay nada que lanzar, el
       motor la pasa sola y deja el turno en el avance de atacantes. */
    resolverAutomaticas(e, []);
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
      /* En todas las fases se ofrece además el pase directo: el jugador puede
         abandonar el turno aunque le queden cartas, monedas o decretos. */
      case "avance":
      case "defensores":
      case "carta":
      case "carta_ver":
      case "carta_efecto":
      case "energia":
        return [{ tipo: "confirmar", texto: "Continuar" }, { tipo: "saltar_turno", texto: "Pasar turno" }];
      case "lanzar":
        return [...legalesLanzar(e, jugadorId), { tipo: "saltar_turno", texto: "Pasar turno" }];
      case "acciones":
        return [...legalesAcciones(e, jugadorId), { tipo: "saltar_turno", texto: "Pasar turno" }];
      case "descartar":
        return [...legalesDescartar(e, jugadorId), { tipo: "saltar_turno", texto: "Pasar turno" }];
      case "fin_turno":
        return [{ tipo: "pasar_turno", texto: "Pasar turno" }, { tipo: "saltar_turno", texto: "Pasar turno" }];
      default:
        return [];
    }
  },

  aplicar(e, jugadorId, accion) {
    e = JSON.parse(JSON.stringify(e));
    sincronizarTorres(e);
    const evs = [];
    let r;
    /* El pase directo no depende de la fase: cierra el turno en el momento en
       que el jugador lo pide, aunque le queden acciones o cartas.
       Excepción: desde "acciones" o "lanzar" hay que pasar por "descartar"
       para que el jugador pueda elegir qué carta quitar de la mano. */
    if (accion?.tipo === "saltar_turno") {
      if (e.fase === "acciones" || e.fase === "lanzar") {
        e.fase = "descartar";
        r = { estado: e, eventos: evs };
      } else {
        r = cerrarTurnoYAvanzar(e, jugadorId, evs);
      }
    } else switch (e.fase) {
      case "lanzar":    r = faseLanzar(e, jugadorId, accion, evs); break;
      case "avance":    r = faseAvance(e, jugadorId, evs); break;
      case "defensores":r = faseDefensores(e, jugadorId, evs); break;
      case "carta":     r = faseCarta(e, jugadorId, evs); break;
      case "carta_ver": r = faseVerCarta(e, jugadorId, evs); break;
      case "carta_efecto": r = faseCartaEfecto(e, jugadorId, evs); break;
      case "energia":   r = faseEnergia(e, jugadorId, evs); break;
      case "acciones":  r = faseAcciones(e, jugadorId, accion, evs); break;
      case "descartar": r = faseDescartar(e, jugadorId, accion, evs); break;
      case "fin_turno": r = faseFinTurno(e, jugadorId, accion, evs); break;
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
      modo: e.modo ?? "todos",
      fase: e.fase,
      turnoActual: e.orden[e.turnoIdx],
      nivelEnemigo: e.nivelEnemigo,
      jugadores: Object.fromEntries(
        Object.entries(e.jugadores).map(([id, j]) => [id, {
          nombre: j.nombre,
          avatar: j.avatar,
          esBot: !!j.esBot,
          equipo: j.equipo ?? null,
          vivo: j.vivo,
          puntosMonsters: j.puntosMonsters,
          bunker: j.bunker,
          muertesSinLucha: j.muertesSinLucha ?? [],
          /* Monstruos que han entrado en el búnker: el cliente los anima en la
             puerta y resta la vida ahí. Se mandan desde el motor porque
             deducirlo comparando repintados fallaba a veces. */
          entradas: (j.entradasBunker ?? []).slice(-8),
          senderos: j.senderos,
          lanzaderas: j.lanzaderas.map(m => (m ? { nivel: m.nivel, tipo: m.tipo ?? "defensor", ...(m.vuela ? { vuela: true } : {}) } : null)),
          colaLanzaderas: (j.colaLanzaderas ?? []).map(m => ({ nivel: m.nivel, tipo: m.tipo ?? "defensor", ...(m.vuela ? { vuela: true } : {}) })),
          box: j.box.map(m => (m ? { nivel: m.nivel, tipo: m.tipo ?? "defensor", id: m.id, ...(m.vuela ? { vuela: true } : {}) } : null)),
        }])
      ),
      /* Caídos en orden: el cliente saca de aquí el puesto de cada uno. */
      eliminados: (e.eliminados ?? []).map((x) => ({ ...x })),
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
      colaLanzaderas: j.colaLanzaderas ?? [],
      regalos: j.regalos ?? [],
      peticiones: (e.peticiones ?? []).filter((p) =>
        e.jugadores[p.de]?.vivo
        && (p.de === jugadorId || esAliado(e, jugadorId, p.de))),
      enviosPendientes: (e.regalos ?? []).filter((g) => g.para === jugadorId),
      avisosTorre: j.avisosTorre ?? [],
      vistasAliados: Object.fromEntries(
        Object.entries(e.jugadores)
          .filter(([id, o]) => id !== jugadorId && o.vivo && esAliado(e, jugadorId, id))
          .map(([id, o]) => [id, { box: o.box, lanzaderas: o.lanzaderas, colaLanzaderas: o.colaLanzaderas ?? [] }])
      ),
      /* Aviso de un solo uso: la fase de lanzaderas se pasó sola porque no
         quedaba hueco en ningún camino enemigo. */
      avisoLanzar: e.avisoLanzar?.de === jugadorId
        ? { clave: e.avisoLanzar.clave, texto: e.avisoLanzar.texto }
        : null,
      cartaDestino: e.ultimoDestino ?? null,
      mazoDestino: e.mazoDestino.length,
      teToca: e.orden[e.turnoIdx] === jugadorId,
      /* Lo que enseña la barra fija de la app: el ciclo (luna) en el que va la
         partida y los recursos que te quedan ahora mismo, para no perderlos de
         vista cuando el tablero está scrolleado. `ciclos` solo va en las
         partidas con final por rondas (contrarreloj). */
      cabecera: {
        ciclo: e.luna,
        ciclos: e.maxRondas ?? null,
        recursos: [
          { clave: "monedas",  icono: "monedas",     etiqueta: "Monedas",  valor: j.energia },
          { clave: "decretos", icono: "pergaminos",  etiqueta: "Decretos", valor: j.accionesRestantes },
        ],
      },
    };
  },

  terminada(e) {
    return e.final ?? null;
  },

  bot(e, jugadorId) {
    const acciones = bunkerWars.legales(e, jugadorId);
    if (!acciones.length) return null;
    const j = e.jugadores[jugadorId];

    if (e.fase === "acciones") return botElegirAccion(e, j, acciones);
    if (e.fase === "lanzar") return botElegirLanzamiento(e, j, acciones);
    if (e.fase === "descartar") return botElegirDescarte(e, j, acciones);

    // Fases automáticas: avanzar, robar carta, resolver efectos, etc.
    return acciones.find(a => a.tipo === "confirmar")
      ?? acciones.find(a => a.tipo === "pasar_turno")
      ?? acciones.find(a => a.tipo === "no_lanzar")
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

/* Procesa los atacantes en pos 3: entran al búnker. */
function entrarAlBunker(j, e, evs) {
  for (const s of j.senderos) {
    const f = s.posiciones[3];
    if (f?.tipo !== "atacante") continue;
    j.puntosMonsters += f.nivel;
    s.posiciones[3] = null;
    j.entradasBunker = [...(j.entradasBunker ?? []),
      { id: uid("b"), calle: s.id, nivel: f.nivel, ...(f.vuela ? { vuela: true } : {}) }].slice(-8);
    evs.push({ tipo: "entrada", texto: `¡${f.vuela ? "Aves de bruma" : `Monstruo ${f.nivel}`} entra en el búnker de ${j.nombre}! (+${f.nivel} pts)` });
    if (j.puntosMonsters > 20) {
      j.vivo = false;
      marcarEliminado(e, j.id);
      evs.push({ tipo: "derrota", texto: `El búnker de ${j.nombre} ha sido destruido.`, a: j.id });
    }
  }
}

/* Un paso de avance para todos los atacantes (o solo los voladores si soloVuela).
   Los voladores buscan el primer hueco libre hacia adelante, destruyendo defensores
   de nivel ≤ suyo, sobrevolando los de nivel mayor. Si no hay hueco, entran al búnker. */
function avanzarAtacantes(j, e, evs, soloVuela = false) {
  for (const s of j.senderos) {
    /* pos=4 cubre el índice 3 (última casilla antes del búnker), solo para voladores. */
    for (let pos = 4; pos > 0; pos--) {
      const f = s.posiciones[pos - 1];
      if (f?.tipo !== "atacante") continue;
      if (soloVuela && !f.vuela) continue;
      /* pos=4 (índice 3) solo aplica a voladores; el resto lo recoge entrarAlBunker. */
      if (pos === 4 && !f.vuela) continue;
      if (f.vuela) {
        /* dest=4 significa entrada al búnker. */
        for (let dest = pos; dest <= 4; dest++) {
          if (dest > 3) {
            s.posiciones[pos - 1] = null;
            j.puntosMonsters += f.nivel;
            j.entradasBunker = [...(j.entradasBunker ?? []),
              { id: uid("b"), calle: s.id, nivel: f.nivel, vuela: true }].slice(-8);
            evs.push({ tipo: "entrada", texto: `¡Aves de bruma entran en el búnker de ${j.nombre}! (+${f.nivel} pts)` });
            if (j.puntosMonsters > 20) {
              j.vivo = false;
              marcarEliminado(e, j.id);
              evs.push({ tipo: "derrota", texto: `El búnker de ${j.nombre} ha sido destruido.`, a: j.id });
            }
            break;
          }
          const ocupante = s.posiciones[dest];
          if (!ocupante) {
            s.posiciones[dest] = f;
            s.posiciones[pos - 1] = null;
            break;
          }
          if (ocupante.tipo === "monstruo" && f.nivel >= ocupante.nivel) {
            s.posiciones[dest] = f;
            s.posiciones[pos - 1] = null;
            evs.push({ tipo: "combate", texto: `Las aves de bruma destruyen al monstruo ${ocupante.nivel} de ${j.nombre} en el peldaño ${dest + 1} de la escalera ${s.id}.` });
            break;
          }
          /* Defensor más fuerte o atacante: sobrevuela y sigue buscando. */
        }
        continue;
      }
      /* Atacante normal: avanza 1 casilla, combate si hay defensor. */
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
        evs.push({ tipo: "combate", texto: `El atacante ${f.nivel} destruye al monstruo ${defensor.nivel} de ${j.nombre} en el peldaño ${pos + 1} de la escalera ${s.id}.` });
      } else {
        s.posiciones[pos - 1] = null;
        evs.push({ tipo: "combate", texto: `El monstruo ${defensor.nivel} de ${j.nombre} destruye al atacante ${f.nivel} en el peldaño ${pos + 1} de la escalera ${s.id}.` });
      }
    }
  }
}

function faseAvance(e, jugadorId, evs) {
  const j = e.jugadores[jugadorId];

  /* Paso 1: atacantes en pos 3 (de antes) entran al búnker. */
  entrarAlBunker(j, e, evs);
  /* Paso 2: todos avanzan 1 acción (voladores pueden entrar al búnker directamente). */
  avanzarAtacantes(j, e, evs);
  /* Paso 3: voladores reciben su segunda acción. No hay entrarAlBunker intermedio
     para que el volador que llegó a pos 3 tenga su segunda acción disponible. */
  avanzarAtacantes(j, e, evs, true);
  /* Paso 4: recoge los atacantes normales en pos 3 y los voladores que entraron. */
  entrarAlBunker(j, e, evs);

  e.fase = "defensores";
  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase DEFENSORES ──────────────────────────────────────────────────────
/* Los monstruos de laboratorio avanzan después de los atacantes y después de
   las lanzaderas. Así las lanzaderas ya se han vaciado y el que llega a la
   entrada no puede lanzarse en el mismo turno. */
function faseDefensores(e, jugadorId, evs) {
  const j = e.jugadores[jugadorId];
  if (j?.vivo) avanzarMonstruosPropios(j, evs);
  e.fase = "carta";
  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase LANZAR ───────────────────────────────────────────────────────────
/* Clave del turno de lanzamiento: la lanzadera que se rellena con la reserva
   queda cerrada hasta el turno siguiente, para no encadenar dos lanzamientos
   con el mismo hueco. */
const claveLanzar = (e) => `${e.luna}:${e.orden[e.turnoIdx]}`;
const SIN_HUECO_LANZAR = "No hay huecos disponibles para lanzar a nadie: todos los caminos enemigos están ocupados.";

function faseLanzar(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];

  if (accion.tipo === "lanzar") {
    const i = accion.lanzadera === 1 ? 1 : 0;
    const mon = j.lanzaderas[i];
    const rival = e.jugadores[accion.rivalId];
    const s = rival?.senderos.find(s => s.id === accion.sendero);
    if (mon && mon.bloqueadaEn !== claveLanzar(e) && s && !s.posiciones[0] && rival.vivo) {
      s.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel: mon.nivel, dueno: jugadorId, ...(mon.vuela ? { vuela: true } : {}) };
      evs.push({ tipo: "lanzamiento", texto: `${j.nombre} lanza monstruo ${mon.nivel} (lanzadera ${i + 1}) a la escalera ${accion.sendero} de ${rival.nombre}.`, a: accion.rivalId });
      /* La reserva entra en el hueco que ha quedado libre, pero no cuenta como
         lanzadera cargada hasta el turno siguiente. */
      const siguiente = j.colaLanzaderas.length > 0 ? j.colaLanzaderas.shift() : null;
      if (siguiente) siguiente.bloqueadaEn = claveLanzar(e);
      j.lanzaderas[i] = siguiente;
      console.log(`[lanzar] ${j.nombre} → ${rival.nombre} · escalera ${accion.sendero} · nv ${mon.nivel} · luna ${e.luna}`);
    }
    /* Con dos lanzaderas la fase sigue abierta mientras quede otra ficha y
       algún camino rival libre: cada lanzadera se manda por separado. */
    if (hayLanzamientos(e, jugadorId)) return { estado: e, eventos: evs };
  }

  /* Los defensores ya no se mueven aquí: esta fase solo lanza. El avance de
     los monstruos propios va después de los atacantes, en faseDefensores. */
  e.fase = "avance";
  return { estado: e, eventos: evs };
}

/* ¿Queda alguna lanzadera con monstruo y algún hueco donde mandarlo? */
function hayLanzamientos(e, jugadorId) {
  return legalesLanzar(e, jugadorId).some(a => a.tipo === "lanzar");
}

/* Lanzaderas con monstruo que se pueden lanzar en este turno (la que acaba de
   entrar de la cola sigue cerrada hasta el siguiente). */
function lanzaderasCargadas(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const turno = claveLanzar(e);
  return (j?.lanzaderas ?? []).filter(m => m && m.bloqueadaEn !== turno);
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
      if (f.vuela) {
        /* Volador propio: avanza 2 peldaños hacia la lanzadera, salta atacantes. */
        const dest2 = pos - 1;
        const dest1 = pos;
        if (dest2 >= 0 && !s.posiciones[dest2]) {
          s.posiciones[dest2] = f;
          s.posiciones[pos + 1] = null;
        } else if (!s.posiciones[dest1]) {
          s.posiciones[dest1] = f;
          s.posiciones[pos + 1] = null;
        }
        continue;
      }
      const delante = s.posiciones[pos];
      if (!delante) {
        s.posiciones[pos] = f;
        s.posiciones[pos + 1] = null;
        continue;
      }
      if (delante.tipo !== "atacante") continue;
      if (delante.vuela) continue; // los voladores no combaten con defensores
      if (!resolverCombate(f, delante).monstruoSobrevive) {
        s.posiciones[pos + 1] = null;
        evs.push({ tipo: "combate", texto: `${j.nombre}: su monstruo ${f.nivel} muere al atacar al atacante ${delante.nivel} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
        continue;
      }
      s.posiciones[pos + 1] = null;
      s.posiciones[pos] = f;
      evs.push({ tipo: "combate", texto: `${j.nombre}: su monstruo ${f.nivel} destruye al atacante ${delante.nivel} en la peldaño ${pos + 1} de la escalera ${s.id}.` });
    }
    // Al llegar a la casilla 1 pasa a la lanzadera que tiene al lado (o a la cola)
    if (s.posiciones[0]?.tipo === "monstruo") aLanzaderaOCola(j, s, evs);
  }
}

/* La lanzadera sin nada que lanzar se pasa sola. El avance de atacantes, el de
   defensores y la carta se paran para que el cliente pueda enseñar cada paso
   con su animación. */
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
      e.fase = "lanzar";
      continue;
    }
    if (e.fase === "lanzar") {
      /* Solo hay decisión si hay una lanzadera con monstruo y algún camino
         rival libre donde soltarlo. Si no, las lanzaderas se pasan de largo. */
      if (hayLanzamientos(e, id)) break;
      /* Si tenía monstruos esperando, que sepa por qué se pasa de largo: sin
         un hueco libre en ningún camino enemigo no hay dónde soltarlos. */
      if (lanzaderasCargadas(e, id).length) {
        e.avisoLanzar = { de: id, clave: claveLanzar(e), texto: SIN_HUECO_LANZAR };
      }
      faseLanzar(e, id, { tipo: "no_lanzar" }, evs);
      continue;
    }
    /* Estas fases se paran para que el cliente las enseñe: avance de
       atacantes, avance de defensores, carta y efecto de la carta. */
    if (e.fase === "avance" || e.fase === "defensores" || e.fase === "carta" || e.fase === "carta_ver" || e.fase === "carta_efecto") break;
    if (e.fase === "energia") { faseEnergia(e, id, evs); continue; }
    /* El descarte cierra la jornada. Antes la mesa se quedaba en «fin de
       turno» esperando un botón que el jugador ni veía: no hay nada que
       decidir después de descartar, así que el turno pasa solo. */
    if (e.fase === "fin_turno") { cerrarTurnoYAvanzar(e, id, evs); continue; }
    break;
  }
}

// ── Fase CARTA ────────────────────────────────────────────────────────────
/* Una sola carta por ciclo: se roba la primera vez que un jugador llega a su
   fase de Destino y se reutiliza para todos los demás. Solo se descarta una
   vez, cuando se fija para el ciclo. El mazo nuevo separa los Avistamientos
   en tres tramos y solo deja robar los del tramo de la luna actual. */
function tramoDestino(luna) {
  if (luna <= 4) return 1;
  if (luna <= 8) return 2;
  return 3;
}

/* Una carta vale desde su tramo en adelante: en la luna 6 sigue valiendo un
   avistamiento de rastreadores (es el suelo del mazo) pero nunca al revés:
   un coloso no aparece en la luna 1. */
function cartaDeTramo(carta, tramo) {
  if (carta?.tramo && carta.tramo > tramo) return false;
  if (carta?.tramoMax && carta.tramoMax < tramo) return false;
  return true;
}

function cartaDestinoDelCiclo(e, evs) {
  if (e.destinoCiclo?.luna === e.luna) return e.destinoCiclo.carta ?? null;

  /* Las cuatro primeras lunas van escritas (ver APERTURA_DESTINO). Si una
     mesa vieja ya tiene su carta fijada para esa luna, manda la de arriba. */
  const forzada = APERTURA_DESTINO[e.luna];
  if (forzada) {
    const plantilla = PLANTILLAS_DESTINO.find(p => p.id === forzada);
    if (plantilla) {
      const carta = { ...plantilla, uid: uid("dc") };
      e.destinoPrevio = { tipo: carta.tipo, luna: e.luna };
      e.destinoCiclo = { luna: e.luna, carta, globalResuelto: false };
      return carta;
    }
  }

  const tramo = tramoDestino(e.luna);
  const sacar = (filtro = null) => {
    const i = e.mazoDestino.findIndex(c => cartaDeTramo(c, tramo) && (!filtro || filtro(c)));
    return i >= 0 ? e.mazoDestino.splice(i, 1)[0] : null;
  };
  const recargar = () => {
    const reciclables = e.descarteDestino.filter(c => cartaDeTramo(c, tramo));
    if (!reciclables.length) return false;
    e.descarteDestino = e.descarteDestino.filter(c => !cartaDeTramo(c, tramo));
    e.mazoDestino = barajar([...e.mazoDestino, ...reciclables], e);
    return true;
  };
  const robar = (filtro = null) => {
    let carta = sacar(filtro);
    if (!carta && recargar()) carta = sacar(filtro);
    return carta;
  };
  /* La partida abre con un avistamiento y, después de un evento, la siguiente
     carta vuelve a traer monstruos: no hay dos ni tres cartas seguidas de las
     que mueven fichas sin que llegue nada. */
  const trasEvento = !e.destinoPrevio || !AMENAZAS.has(e.destinoPrevio.tipo);
  let carta = (trasEvento ? robar(c => AMENAZAS.has(c.tipo)) : null) ?? robar();
  /* Mesas antiguas: la carta roja venía dentro del mazo y se comía el turno de
     quien la sacaba. Si aún queda una en un mazo viejo, se resuelve y se roba
     también la carta que toca, como en las partidas nuevas. */
  while (carta?.tipo === "carta_roja") {
    e.descarteDestino.push(carta);
    e.nivelEnemigo = 2;
    evs.push({ tipo: "carta_roja", texto: "¡La luna se ha vuelto roja! Los monstruos llegan con su nivel real." });
    carta = robar();
  }
  if (carta) e.descarteDestino.push(carta);
  if (carta) e.destinoPrevio = { tipo: carta.tipo, luna: e.luna };
  e.destinoCiclo = { luna: e.luna, carta, globalResuelto: false };
  return carta;
}

function faseCarta(e, jugadorId, evs) {
  const carta = cartaDestinoDelCiclo(e, evs);
  console.log(`[carta] luna ${e.luna} · ${carta?.id ?? "-"} ${carta?.tipo ?? "-"}${carta?.nivel ? " nv" + carta.nivel : ""} · para ${e.jugadores[jugadorId]?.nombre}`);
  if (carta) {
    /* La carta queda a la vista en la mesa durante todo el turno. */
    /* La descripción se calcula con las escaleras que hay libres ahora mismo
       en el tablero de este jugador. Así no anuncia la central si está
       ocupada y el monstruo va a entrar por la siguiente de la prioridad. */
    const senderos = e.jugadores[jugadorId]?.senderos ?? [];
    const puestosMixta = carta.tipo === "amenaza_mixta" ? planificarMixta(senderos, carta) : [];
    const senderosDestino = carta.tipo === "amenaza"
      ? planificarAmenaza(senderos, carta)
      : puestosMixta.map((p) => p.sendero);
    const descripcion = carta.tipo === "amenaza"
      ? describirAmenaza(carta, senderosDestino)
      : carta.tipo === "amenaza_mixta"
        ? describirMixta(puestosMixta)
        : carta.descripcion ?? null;
    e.ultimoDestino = {
      tipo: carta.tipo,
      nivel: carta.nivel ?? null,
      /* Lo que de verdad entra en la mesa: antes de la carta roja todo
         monstruo es de nivel 1, diga la carta lo que diga. La mesa no debe
         anunciar un nivel que luego no aparece. El avistamiento mixto lleva
         el suyo por escalera, así que no se rebaja. */
      nivelReal: AMENAZAS.has(carta.tipo) && carta.tipo !== "amenaza_mixta"
        ? nivelRealEnemigo(e, carta.nivel) : null,
      prio: carta.prio ?? null,
      cantidad: carta.cantidad ?? null,
      puestos: puestosMixta,
      tramo: carta.tramo ?? null,
      titulo: carta.titulo ?? null,
      descripcion,
      senderosDestino,
      jugadorId,
      luna: e.luna,
    };
  }
  /* El efecto no se aplica todavía: se guarda para cuando el jugador cierre
     la carta. Así no entran monstruos ni se mueven fichas por detrás del
     modal. */
  e.cartaPendiente = carta ?? null;
  e.fase = "carta_ver";
  comprobarFin(e);
  return { estado: e, eventos: evs };
}

function faseVerCarta(e, jugadorId, evs) {
  const carta = e.cartaPendiente ?? null;
  e.cartaPendiente = null;
  if (carta) {
    const global = DESTINO_GLOBAL.has(carta.tipo);
    if (!global || !e.destinoCiclo?.globalResuelto) {
      evs.push(...resolverDestino(e, jugadorId, carta));
      if (global && e.destinoCiclo) e.destinoCiclo.globalResuelto = true;
    }
  }
  comprobarFin(e);
  /* El cliente tiene que ver el resultado de la carta antes de seguir. */
  e.fase = "carta_efecto";
  return { estado: e, eventos: evs };
}

function faseCartaEfecto(e, jugadorId, evs) {
  if (!e.final) e.fase = "energia";
  return { estado: e, eventos: evs };
}

// ── Fase MONEDAS (interna: energia) ───────────────────────────────────────
function faseEnergia(e, jugadorId, evs) {
  const j = e.jugadores[jugadorId];
  j.energia = energiaTotal(j);
  j.accionesRestantes = accionesTotal(j);
  j.cartasJugadasEsteTurno = 0;
  /* Los regalos llegan justo después del reparto del turno y antes de los
     decretos: así las monedas y los decretos enviados no los borra el reset. */
  entregarRegalos(e, jugadorId, evs);
  evs.push({ tipo: "energia", texto: `${j.nombre}: ${j.energia} monedas, ${j.accionesRestantes} decretos.`, a: jugadorId });
  e.fase = "acciones";
  return { estado: e, eventos: evs };
}

/* Primer hueco libre de los caminos propios, empezando por la casilla pegada
   al búnker y siguiendo hacia la entrada. */
function huecoEnCaminos(j) {
  for (let pos = 3; pos >= 0; pos--) {
    for (const s of j.senderos ?? []) {
      if (!s.posiciones?.[pos]) return { posiciones: s.posiciones, pos, sendero: s.id };
    }
  }
  return null;
}

/* Entrega los envíos pendientes al jugador que empieza su fase de decretos.
   Las monedas y los decretos ya están repartidos; los monstruos ocupan huecos
   libres de las cuatro jaulas visibles y, si no hay, se quedan defendiendo en
   el primer hueco libre de sus caminos (del búnker hacia la entrada). */
function entregarRegalos(e, jugadorId, evs) {
  if (!e.regalos?.length) return;
  const j = e.jugadores[jugadorId];
  if (!j?.vivo) return;
  const pendientes = e.regalos.filter((g) => g.para === jugadorId);
  if (!pendientes.length) return;
  e.regalos = e.regalos.filter((g) => g.para !== jugadorId);
  for (const g of pendientes) {
    j.energia += g.monedas ?? 0;
    j.accionesRestantes += g.decretos ?? 0;
    const recibidos = [];
    const calles = [];
    const sobran = [];
    for (const m of g.monstruos ?? []) {
      const i = j.box.findIndex((x, idx) => idx < 4 && !x);
      if (i >= 0) {
        j.box[i] = { ...m, dueno: jugadorId };
        recibidos.push({ ...m, dueno: jugadorId });
        continue;
      }
      /* Sin jaula libre no se queda esperando: entra a defender en el hueco
         libre más cercano al búnker y, si no, hacia la entrada. */
      const hueco = huecoEnCaminos(j);
      if (hueco) {
        hueco.posiciones[hueco.pos] = { id: uid("r"), nivel: m.nivel, dueno: jugadorId };
        calles.push(m.nivel);
        continue;
      }
      sobran.push(m);
    }
    /* Un monstruo que no cabe no se pierde: la caja se queda esperando en la
       mesa y se vuelve a intentar en el siguiente turno del destinatario. */
    if (sobran.length) {
      e.regalos.push({ ...g, monedas: 0, decretos: 0, monstruos: sobran, esperando: true });
    }
    /* Se avisa cuando entra algo y la primera vez que la caja se queda sin
       sitio; después no se repite el aviso en cada turno. */
    const entraAlgo = recibidos.length > 0 || calles.length > 0
      || (g.monedas ?? 0) > 0 || (g.decretos ?? 0) > 0;
    if (entraAlgo || !g.esperando) {
      j.regalos = [...(j.regalos ?? []), {
        id: uid("g"),
        de: g.deNombre ?? "Un aliado",
        monedas: g.monedas ?? 0,
        decretos: g.decretos ?? 0,
        monstruos: recibidos.map((m) => m.nivel),
        calles,
        sobran: sobran.map((m) => m.nivel),
      }];
      console.log(`[regalo] ${j.nombre} recibe de ${g.deNombre ?? g.de}: ${recibidos.length} en jaulas, ${calles.length} en calles, ${sobran.length} sin hueco`);
      evs.push({
        tipo: "regalo",
        texto: `${g.deNombre ?? "Un aliado"} envía a ${j.nombre}: ${g.monedas ?? 0} monedas, ${g.decretos ?? 0} decretos y ${recibidos.length + calles.length} monstruo(s).`
          + (calles.length ? ` ${calles.length} a los caminos.` : "")
          + (sobran.length ? ` ${sobran.length} esperan hueco.` : ""),
        a: jugadorId,
      });
    }
  }
}

// ── Fase DECRETOS (interna: acciones) ─────────────────────────────────────
function faseAcciones(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];

  /* Petición a los aliados: es gratis, no gasta monedas, decretos ni acciones.
     Se guarda una por jugador y ronda: si vuelve a pedir, sustituye la anterior. */
  if (accion.tipo === "pedir_aliado") {
    const pide = {
      monedas: accion.monedas === true,
      decretos: accion.decretos === true,
      monstruos: accion.monstruos === true,
    };
    if (!pide.monedas && !pide.decretos && !pide.monstruos) {
      return { estado: e, eventos: evs };
    }
    const hayAliados = Object.values(e.jugadores)
      .some((o) => o.vivo && o.id !== jugadorId && esAliado(e, jugadorId, o.id));
    if (!hayAliados) return { estado: e, eventos: evs };

    /* Una petición por jugador: sigue abierta entre rondas hasta que alguien
       la cubra o el propio jugador la cancele. */
    e.peticiones = (e.peticiones ?? []).filter((p) => p.de !== jugadorId);
    e.peticiones.push({
      id: uid("p"), de: jugadorId, deNombre: j.nombre,
      ...pide, luna: e.luna,
    });
    const cosas = [
      pide.monedas ? "monedas" : "",
      pide.decretos ? "decretos" : "",
      pide.monstruos ? "monstruos" : "",
    ].filter(Boolean);
    evs.push({ tipo: "peticion", texto: `${j.nombre} pide a sus aliados: ${cosas.join(", ")}.` });
    return { estado: e, eventos: evs };
  }

  /* Envío a un aliado: no es una jugada de las cartas, sino un traspaso que
     se queda esperando al siguiente turno del destinatario. */
  if (accion.tipo === "enviar_aliado") {
    const para = e.jugadores[accion.para];
    const monedas = Math.max(0, Math.floor(Number(accion.monedas) || 0));
    const decretos = Math.max(0, Math.floor(Number(accion.decretos) || 0));
    const ids = [...new Set((Array.isArray(accion.monstruos) ? accion.monstruos : [])
      .filter((x) => typeof x === "string"))];
    if (!para || !para.vivo || !esAliado(e, jugadorId, para.id)) {
      evs.push({ tipo: "envio", texto: "No puedes enviar nada a ese jugador." });
      return { estado: e, eventos: evs };
    }
    if (monedas > j.energia || decretos > j.accionesRestantes) return { estado: e, eventos: evs };
    const monstruos = ids.map((id) => j.box.find((m) => m?.id === id)).filter(Boolean);
    if (monstruos.length !== ids.length) return { estado: e, eventos: evs };
    const huecos = Array.from({ length: 4 }, (_, i) => para.box?.[i]).filter((m) => !m).length;
    if (monstruos.length > huecos) return { estado: e, eventos: evs };
    if (!monedas && !decretos && !monstruos.length) return { estado: e, eventos: evs };

    /* Un envío por jugador y ronda: el bot no debe vaciar su economía
       mandando monedas en cada vuelta del bucle de acciones. */
    j.ultimoEnvioLuna = e.luna;
    j.energia -= monedas;
    j.accionesRestantes -= decretos;
    for (const m of monstruos) {
      const i = j.box.findIndex((x) => x?.id === m.id);
      if (i >= 0) j.box[i] = null;
    }
    e.regalos = e.regalos ?? [];
    e.regalos.push({
      id: uid("g"), de: j.id, deNombre: j.nombre, para: para.id,
      monedas, decretos, monstruos: monstruos.map((m) => ({ ...m, dueno: para.id })), luna: e.luna,
    });
    /* El envío ya cubre la petición de quien lo recibe: se retira de la mesa. */
    e.peticiones = (e.peticiones ?? []).filter((p) => p.de !== para.id);
    evs.push({ tipo: "envio", texto: `${j.nombre} envía a ${para.nombre}: ${monedas} monedas, ${decretos} decretos y ${monstruos.length} monstruo(s).`, a: para.id });
    if (j.accionesRestantes <= 0 || legalesAcciones(e, jugadorId).length <= 1) e.fase = "descartar";
    return { estado: e, eventos: evs };
  }

  /* Cancelar la propia petición también es gratis. */
  if (accion.tipo === "cancelar_peticion") {
    const tenia = (e.peticiones ?? []).some((p) => p.de === jugadorId);
    e.peticiones = (e.peticiones ?? []).filter((p) => p.de !== jugadorId);
    if (tenia) evs.push({ tipo: "peticion", texto: `${j.nombre} cancela su petición.` });
    return { estado: e, eventos: evs };
  }

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
      /* Carta gastada: se apunta la plantilla para que no vuelva al mazo. */
      if (Number.isInteger(carta.plantilla)) cartasUsadas(j).push(carta.plantilla);
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
      /* Primero el hueco de DELANTE de la jaula (el de abajo, el más cercano al
         jugador) y después el del fondo: el monstruo nuevo tiene que salir a la
         vista, no escondido detrás del que ya estaba. */
      const orden = boxPedido === null
        ? [1, 0, 3, 2]
        : boxPedido === 0 ? [1, 0] : [3, 2];
      const boxIdx = orden.find((i) => !j.box[i]) ?? -1;
      if (boxIdx < 0 || !NIVELES.includes(nivel) || nivel > nivelMaxLab(j)) break;
      const coste = costeMonstruoJ(nivel, j);
      if (j.energia < coste) break;
      j.energia -= coste;
      j.accionesRestantes--;
      j.box[boxIdx] = { id: uid("m"), tipo: "monstruo", nivel, dueno: j.id };
      evs.push({ tipo: "crear", texto: `${j.nombre} crea monstruo ${nivel} en la jaula ${boxDeIndice(boxIdx) + 1} (1 decreto + ${coste} ${coste === 1 ? "moneda" : "monedas"}).`, a: jugadorId });
      break;
    }

    case "crear_volador": {
      const boxPedido = accion.boxIdx === 0 || accion.boxIdx === 1 ? accion.boxIdx : null;
      const orden = boxPedido === null
        ? [1, 0, 3, 2]
        : boxPedido === 0 ? [1, 0] : [3, 2];
      const boxIdx = orden.find((i) => !j.box[i]) ?? -1;
      if (boxIdx < 0 || j.energia < COSTE_MONSTRUO_VOLADOR) break;
      j.energia -= COSTE_MONSTRUO_VOLADOR;
      j.accionesRestantes--;
      j.box[boxIdx] = { id: uid("m"), tipo: "monstruo", nivel: 1, vuela: true, dueno: j.id };
      evs.push({ tipo: "crear", texto: `${j.nombre} crea aves de bruma en la jaula ${boxDeIndice(boxIdx) + 1} (${COSTE_MONSTRUO_VOLADOR} moneda).`, a: jugadorId });
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
      /* Construir cuesta 1 moneda; cada subida de nivel (II y III), 2. */
      const diff = 2;
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
      evs.push({ tipo: "lanzadera", texto: `${j.nombre} mueve monstruo ${mon.nivel} de la jaula ${i + 1} a la lanzadera ${i + 1}.`, a: jugadorId });
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
        /* Si el que se mueve pierde, el atacante se queda donde estaba: antes
           se borraban los dos y parecía que un nivel 1 mataba a un nivel 7. */
        s.posiciones[posDest] = monstruoSobrevive ? { ...mMon } : ocupante;
        evs.push(enemigoMuere
          ? { tipo: "combate", texto: `${j.nombre}: monstruo ${mMon.nivel} destruye atacante ${ocupante.nivel} en la escalera ${accion.sendero}.`, a: jugadorId }
          : { tipo: "combate", texto: `${j.nombre}: monstruo ${mMon.nivel} muere al atacar al atacante ${ocupante.nivel} en la escalera ${accion.sendero}.`, a: jugadorId });
        // Si el monstruo llega a pos 0, pasa a la lanzadera (o cola)
        if (posDest === 0 && monstruoSobrevive) aLanzaderaOCola(j, s, evs);
      } else if (!ocupante) {
        j.energia--;
        j.accionesRestantes--;
        s.posiciones[posDest] = { ...mMon };
        s.posiciones[posOrigen] = null;
        evs.push({ tipo: "avance_monstruo", texto: `${j.nombre} avanza el monstruo ${mMon.nivel} en la escalera ${accion.sendero}.`, a: jugadorId });
        if (posDest === 0) aLanzaderaOCola(j, s, evs);
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
      marcarMuerteSinLucha(j, f);
      s.posiciones[accion.posicion] = null;
      evs.push({ tipo: "destruir", texto: `${j.nombre} destruye atacante ${f.nivel} con torretas en la escalera ${accion.sendero}.`, a: jugadorId });
      break;
    }
  }

  /* Sin decretos (o sin ninguna jugada legal) la fase termina sola: ya no hay
     pestaña de acciones ni botón de pasar, así que el turno sigue al descarte. */
  if (j.accionesRestantes <= 0 || legalesAcciones(e, jugadorId).length <= 1) {
    e.fase = "descartar";
  }

  comprobarFin(e);
  return { estado: e, eventos: evs };
}

// ── Fase DESCARTAR ────────────────────────────────────────────────────────
function faseDescartar(e, jugadorId, accion, evs) {
  const j = e.jugadores[jugadorId];
  const ids = (accion.cartaIds ?? []).slice(0, 2);

  /* Sin cartas jugadas, descartar una es obligatorio (si hay mano). Con cartas
     jugadas, se pueden descartar hasta dos o ninguna. */
  if ((j.cartasJugadasEsteTurno ?? 0) === 0 && j.mano.length > 0 && ids.length === 0) {
    return { estado: e, eventos: evs };
  }

  for (const uid of ids) {
    const idx = j.mano.findIndex(c => c.uid === uid);
    if (idx >= 0) {
      /* La carta descartada va al final del mazo en el acto: así el mazo no se
         queda vacío a mitad de ronda y vuelve a salir cuando le toca, sin
         esperar a que se baraje el descarte. */
      j.mazoBunker.push(j.mano.splice(idx, 1)[0]);
    }
  }

  // Robar hasta 4 antes de cerrar la jornada.
  while (j.mano.length < 4) {
    const carta = robarBunker(j, e);
    if (!carta) break;
    j.mano.push(carta);
  }

  comprobarFin(e);
  if (!e.final) e.fase = "fin_turno";
  return { estado: e, eventos: evs };
}

// ── Fase FIN DE TURNO ─────────────────────────────────────────────────────
function faseFinTurno(e, jugadorId, accion, evs) {
  if (accion?.tipo !== "pasar_turno") return { estado: e, eventos: evs };
  return cerrarTurnoYAvanzar(e, jugadorId, evs);
}

/* Cierra la jornada actual y deja el turno en el siguiente jugador vivo. Se
   usa al final del turno y también cuando el jugador pulsa «pasar turno» en
   cualquier otra fase. */
function cerrarTurnoYAvanzar(e, jugadorId, evs) {
  /* Los avisos de torres dañadas se gastan al cerrar tu turno: ya se han visto
     en el aviso de «Es tu turno» y a partir de aquí cuentan los nuevos. */
  const quienCierra = e.jugadores[jugadorId];
  if (quienCierra) quienCierra.avisosTorre = [];
  const lunaRoja = avanzarTurno(e);
  e.fase = "lanzar";
  comprobarFin(e);
  if (!e.final) {
    const sigJugador = e.jugadores[e.orden[e.turnoIdx]];
    if (lunaRoja) evs.push({ tipo: "carta_roja", texto: AVISO_LUNA_ROJA });
    evs.push({ tipo: "nuevo_turno", texto: `Luna ${e.luna} — turno de ${sigJugador?.nombre}.` });
  }
  return { estado: e, eventos: evs };
}

// ── legales helpers ───────────────────────────────────────────────────────
function legalesLanzar(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const turno = claveLanzar(e);
  const cargadas = j.lanzaderas.map((m, i) => ({ m, i }))
    .filter(x => x.m && x.m.bloqueadaEn !== turno);
  if (!cargadas.length) return [{ tipo: "no_lanzar", texto: "Continuar (sin lanzadera)" }];
  const acc = [];
  for (const rivalId of e.orden) {
    if (!esRival(e, jugadorId, rivalId)) continue;
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
  /* Con lanzaderas cargadas se lanza siempre: los monstruos no se pueden
     quedar ahí, así que no hay «No lanzar». Solo aparece cuando de verdad no
     queda un hueco libre en ningún camino enemigo. */
  if (!acc.length) acc.push({ tipo: "no_lanzar", texto: SIN_HUECO_LANZAR });
  return acc;
}

function legalesAcciones(e, jugadorId) {
  const j = e.jugadores[jugadorId];
  const acc = [{ tipo: "pasar", texto: "Terminar decretos" }];
  const aliadosVivos = Object.values(e.jugadores)
    .filter((o) => o.vivo && esAliado(e, jugadorId, o.id));
  if (aliadosVivos.length) {
    acc.push({ tipo: "enviar_aliado", libre: true, texto: "Enviar a un aliado" });
    /* Pedir es gratis: sigue disponible aunque no queden decretos. */
    acc.push({ tipo: "pedir_aliado", libre: true, texto: "Pedir a los aliados" });
  }
  if ((e.peticiones ?? []).some((p) => p.de === jugadorId)) {
    acc.push({ tipo: "cancelar_peticion", libre: true, texto: "Cancelar petición" });
  }
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
    } else if (carta.efecto === "monstruo3_gratis") {
      for (let b = 0; b < Math.ceil(j.box.length / BOX_TAM); b++) {
        if (!Array.from({ length: BOX_TAM }, (_, k) => b * BOX_TAM + k).some((i) => !j.box[i])) continue;
        acc.push({
          tipo: "mejorar_bunker", cartaId: carta.uid, boxIdx: b,
          etiqueta: `Monstruo 3 en la jaula ${b + 1}`,
          texto: `Monstruo de nivel 3 en la jaula ${b + 1}`,
        });
      }
    } else if (carta.efecto === "bombardear") {
      Object.values(e.jugadores).forEach(enemigo => {
        if (enemigo.id === j.id) return;
        /* Protección ancestral: sus torres no se pueden bajar ni destruir. El
           objetivo se sigue enseñando, pero bloqueado y con el motivo, para
           que se vea que existe y por qué no se puede tocar. */
        const protegido = tieneCiencia(enemigo, "proteccion_torres");
        normalizarTorres(enemigo);
        enemigo.bunker.torres.forEach((t, i) => {
          if (!t) return;
          acc.push({
            tipo: "mejorar_bunker", cartaId: carta.uid,
            objetivo: { enemigoId: enemigo.id, posicion: i + 1 },
            bloqueada: protegido || undefined,
            motivo: protegido ? `${enemigo.nombre} tiene Protección ancestral` : undefined,
            etiqueta: protegido
              ? `Torre ${i + 1} de ${enemigo.nombre} (nv ${t.nivel}) · Protección ancestral`
              : `Bombardear torre ${i + 1} de ${enemigo.nombre} (nv ${t.nivel})`,
            texto: protegido
              ? `Bombardear: la torre ${i + 1} de ${enemigo.nombre} está protegida`
              : `Bombardear: bajar torre ${i + 1} de ${enemigo.nombre} a nivel ${t.nivel - 1 || "destruida"}`,
          });
        });
      });
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
    } else if (carta.tipo === "armeria_up") {
      acc.push({ tipo: "mejorar_bunker", cartaId: carta.uid,
                 texto: `Jugar ${nombre} · armería a nivel ${Math.min(2, (j.bunker.armeria ?? 1) + 1)}` });
    } else if (carta.tipo === "laboratorio_up") {
      acc.push({ tipo: "mejorar_bunker", cartaId: carta.uid,
                 texto: `Jugar ${nombre} · criadero a nivel ${Math.min(3, (j.bunker.laboratorio ?? 1) + 1)}` });
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
                   texto: `Crear monstruo ${nv} en la jaula ${boxIdx + 1} · 1 decreto + ${coste} ${coste === 1 ? "moneda" : "monedas"}` });
      }
    }
    if (j.energia >= COSTE_MONSTRUO_VOLADOR) {
      acc.push({ tipo: "crear_volador", boxIdx,
                 texto: `Crear aves de bruma en la jaula ${boxIdx + 1} · ${COSTE_MONSTRUO_VOLADOR} moneda` });
    }
  }
  normalizarTorres(j);
  j.bunker.torres.forEach((t, i) => {
    const pos = i + 1;
    if (!t && j.energia >= 1) {
      acc.push({ tipo: "construir_torreta", posicion: pos, texto: `Torre en posición ${pos} (escalera ${pos}) · 1 moneda` });
    }
    if (t && t.nivel < 3 && t.nivel + 1 <= j.bunker.armeria && j.energia >= 2) {
      acc.push({ tipo: "evolucionar_torreta", posicion: pos, texto: `Evolucionar torre ${pos} a nivel ${t.nivel + 1} · 2 monedas` });
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

// ── Estrategia de los bots ────────────────────────────────────────────────
/* Los bots no juegan al azar: primero montan economía y defensas, luego
   atacan lo que se acerca, mandan parte de sus recursos a un aliado y, con
   lo que sobra, crían y lanzan monstruos. Cada turno devuelven una sola
   acción; el servidor vuelve a llamarlos hasta que pasan. */
function botAtacantesPropios(j) {
  return j.senderos.reduce((s, sendero) =>
    s + sendero.posiciones.filter((f) => f?.tipo === "atacante").length, 0);
}

function botAliado(e, jugadorId) {
  /* En equipos, el humano primero: así el bot aliado manda sus recursos a la
     persona y no se los queda otro bot de la misma mesa. */
  return Object.values(e.jugadores)
    .filter((o) => o.vivo && o.id !== jugadorId && esAliado(e, jugadorId, o.id))
    .sort((a, b) => (a.esBot ? 1 : 0) - (b.esBot ? 1 : 0))[0] ?? null;
}

/* Petición abierta de un aliado. El bot la mira antes que nada: si alguien de
   su equipo ha pedido algo, le responde a él y no al goteo de siempre. */
function botPeticionAbierta(e, j) {
  return (e.peticiones ?? []).find((p) =>
    p.de !== j.id && e.jugadores[p.de]?.vivo && esAliado(e, j.id, p.de)) ?? null;
}

function botAccionEnvio(e, j, aliado) {
  if (j.ultimoEnvioLuna === e.luna) return null;
  const peticion = botPeticionAbierta(e, j);
  const para = peticion?.de ?? aliado?.id ?? null;
  if (!para) return null;
  const destino = e.jugadores[para];

  /* Con petición se manda lo que pide, dentro de lo que el bot puede soltar:
     deja una moneda para poder jugar y un decreto para seguir el turno. Sin
     petición, el goteo de siempre. */
  const monedas = peticion
    ? (peticion.monedas ? Math.min(2, Math.max(0, j.energia - 1)) : 0)
    : (j.energia >= 2 ? (j.energia >= 7 ? 2 : 1) : 0);
  const decretos = peticion
    ? (peticion.decretos ? Math.min(1, Math.max(0, j.accionesRestantes - 1)) : 0)
    : (j.accionesRestantes >= 3 ? 1 : 0);

  /* Monstruos: los más flojos de sus jaulas, y solo los que quepan en las del
     destinatario (los envíos van a los cuatro huecos visibles). */
  const monstruos = [];
  if (peticion?.monstruos) {
    const huecos = Array.from({ length: 4 }, (_, i) => destino?.box?.[i]).filter((m) => !m).length;
    const flojos = j.box.filter(Boolean).sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0));
    for (const m of flojos) {
      if (monstruos.length >= Math.min(2, huecos)) break;
      monstruos.push(m.id);
    }
  }

  if (!monedas && !decretos && !monstruos.length) return null;
  return {
    tipo: "enviar_aliado", para, monedas, decretos,
    ...(monstruos.length ? { monstruos } : {}),
  };
}

function botValorCarta(c) {
  if (!c) return 0;
  /* Un dicho no vale nada: es la primera carta que el bot tira al descartar. */
  if (c.tipo === "dicho") return 0;
  if (c.tipo === "recursos") return 100;
  if (c.tipo === "recursos_i") return 88;
  if (c.tipo === "armeria") return 96;
  if (c.tipo === "armeria_up") return 94;
  if (c.tipo === "laboratorio") return 72;
  if (c.tipo === "laboratorio_up") return 74;
  if (c.efecto === "subir_recursos") return 98;
  if (c.efecto === "subir_armeria") return 95;
  if (c.efecto === "subir_lab_o_arm") return 92;
  if (c.efecto === "torreta2_gratis") return 90;
  if (c.efecto === "evolucionar_torreta") return 88;
  if (c.efecto === "subir_laboratorio") return 70;
  if (c.efecto === "purga") return 86;
  if (c.efecto === "proteccion_torres") return 84;
  if (c.efecto === "convertir_aliado") return 84;
  if (c.efecto === "bajar_nivel_enemigo") return 82;
  if (c.efecto === "subir_rango") return 80;
  if (c.efecto === "monstruo3_gratis") return 74;
  if (c.tipo === "ciencia") return 68;
  return 60;
}

function botPuntuarMejora(e, j, a) {
  /* Un objetivo bloqueado (Protección ancestral) no se elige nunca: si el bot
     lo intentara, el motor lo rechazaría y volvería a elegirlo en bucle. */
  if (a.bloqueada) return 0;
  const carta = j.mano.find((c) => c.uid === a.cartaId);
  if (!carta) return 0;
  let puntos = botValorCarta(carta) * 10;

  if (carta.efecto === "subir_lab_o_arm") {
    /* La armería abre torres; el criadero solo cuando ya hay defensa. */
    puntos += a.edificio === "armeria" ? 8 : -10;
  }
  if (carta.efecto === "purga" && !botAtacantesPropios(j)) puntos -= 500;
  if ((carta.efecto === "convertir_aliado" || carta.efecto === "bajar_nivel_enemigo")
      && !botAtacantesPropios(j)) puntos -= 450;
  return puntos;
}

function botPuntuarAccion(e, j, a) {
  switch (a.tipo) {
    case "mejorar_bunker":
      return botPuntuarMejora(e, j, a);

    case "construir_torreta": {
      const pos = Number(a.posicion ?? a.sendero) || 0;
      const amenaza = j.senderos[pos - 1]?.posiciones
        .filter((f) => f?.tipo === "atacante").length ?? 0;
      return 910 + amenaza * 20;
    }

    case "atacar_monstruo":
      /* Cuanto más cerca está de entrar, más urgente es dispararle. */
      return 760 + Math.max(0, Number(a.posicion) || 0) * 70;

    case "evolucionar_torreta": {
      const pos = Number(a.posicion) || 0;
      const amenaza = j.senderos[pos - 1]?.posiciones
        .filter((f) => f?.tipo === "atacante").length ?? 0;
      return 875 + amenaza * 20;
    }

    case "crear_monstruo":
      return 600 + (Number(a.nivel) || 1) * 20;

    case "crear_volador":
      return 580; // un poco menos que un monstruo nv1 normal

    case "mover_a_lanzadera":
      return 640;

    case "mover_a_sendero":
      return botAtacantesPropios(j) ? 855 : 540;

    case "avanzar_monstruo": {
      const sendero = j.senderos.find((s) => s.id === a.sendero);
      const destino = sendero?.posiciones?.[a.posicion];
      return destino?.tipo === "atacante" ? 810 : 520;
    }

    case "enviar_aliado":
      return 850;

    case "pasar":
      return -1;

    default:
      return 400;
  }
}

function botElegirAccion(e, j, acciones) {
  const aliado = botAliado(e, j.id);
  const envio = botAccionEnvio(e, j, aliado);
  /* Cubrir una petición va por delante de sus otras jugadas del turno: así el
     aviso de la caja llega en la ronda en la que se pide. */
  const peticion = botPeticionAbierta(e, j);
  const opciones = [];

  for (const a of acciones) {
    if (a.tipo === "enviar_aliado" || a.tipo === "pedir_aliado"
        || a.tipo === "cancelar_peticion" || a.tipo === "pasar") continue;
    const puntos = botPuntuarAccion(e, j, a);
    if (puntos > 0) opciones.push({ accion: a, puntos });
  }
  if (envio) opciones.push({ accion: envio, puntos: peticion ? 940 : 850 });

  opciones.sort((a, b) => b.puntos - a.puntos);
  if (opciones.length) return opciones[0].accion;
  return acciones.find((a) => a.tipo === "pasar") ?? acciones[0] ?? null;
}

function botElegirLanzamiento(e, j, acciones) {
  const lanzamientos = acciones.filter((a) => a.tipo === "lanzar");
  if (!lanzamientos.length) {
    return acciones.find((a) => a.tipo === "no_lanzar") ?? acciones[0] ?? null;
  }
  const puntos = (a) => {
    const rival = e.jugadores[a.rivalId];
    const monstruo = j.lanzaderas[a.lanzadera]?.nivel ?? 0;
    const torre = rival?.bunker?.torres?.[a.sendero - 1]?.nivel ?? 0;
    return monstruo * 10 + (20 - (rival?.puntosMonsters ?? 0)) + (3 - torre) * 2;
  };
  return lanzamientos.sort((a, b) => puntos(b) - puntos(a))[0];
}

function botElegirDescarte(e, j, acciones) {
  const descartes = acciones.filter((a) => a.tipo === "descartar");
  const obligatorio = (j.cartasJugadasEsteTurno ?? 0) === 0 && j.mano.length > 0;
  if (!obligatorio) {
    const noDescartar = descartes.find((a) => !(a.cartaIds?.length));
    if (noDescartar) return noDescartar;
  }
  const una = descartes.filter((a) => a.cartaIds?.length === 1);
  if (!una.length) return descartes.find((a) => !(a.cartaIds?.length)) ?? descartes[0] ?? null;
  const valor = (a) => {
    const carta = j.mano.find((c) => c.uid === a.cartaIds[0]);
    return botValorCarta(carta);
  };
  return una.sort((a, b) => valor(a) - valor(b))[0];
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
  const obligatorio = (j.cartasJugadasEsteTurno ?? 0) === 0 && j.mano.length > 0;
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
  if (!obligatorio) acc.push({ tipo: "descartar", cartaIds: [], texto: "No descartar" });
  else if (!j.mano.length) acc.push({ tipo: "descartar", cartaIds: [], texto: "Continuar" });
  return acc;
}

// ── Helpers de lógica ─────────────────────────────────────────────────────
function puedeJugarCarta(j, carta) {
  /* Los dichos no se juegan nunca: solo sirven para descartarlos. */
  if (carta.tipo === "dicho") return false;
  if (carta.tipo === "armeria") {
    return carta.nivel === j.bunker.armeria + 1;
  }
  if (carta.tipo === "laboratorio") {
    return carta.nivel === j.bunker.laboratorio + 1;
  }
  if (carta.tipo === "armeria_up")     return (j.bunker.armeria ?? 1) < 2;
  if (carta.tipo === "laboratorio_up") return (j.bunker.laboratorio ?? 1) < 3;
  if (carta.tipo === "recursos")     { return true; }
  if (carta.tipo === "decreto")      { return true; }
  if (carta.tipo === "recursos_mix") { return true; }
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
      if (s.posiciones[p]) { marcarMuerteSinLucha(j, s.posiciones[p]); s.posiciones[p] = null; n++; }
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
  "subir_rango", "convertir_aliado", "bajar_nivel_enemigo",
  "evolucionar_torreta", "torreta2_gratis", "monstruo3_gratis",
  "bombardear",
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
      return f?.tipo === "atacante" && f.nivel <= 5 ? { ficha: f, sendero: o.sendero, posicion: o.posicion } : null;
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
    case "bombardear": {
      const enemigo = Object.values(e.jugadores).find(p => p.id === o.enemigoId);
      if (!enemigo) return null;
      if (tieneCiencia(enemigo, "proteccion_torres")) return null;
      const pos = o.posicion;
      const t = enemigo.bunker.torres?.[(pos ?? 0) - 1];
      return t ? { enemigo, torre: t, pos } : null;
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
  evs.push({ tipo: "mejora", texto: `${j.nombre} sube unos recursos: +1 moneda y +1 decreto por turno.` });
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
      o.ficha.dueno = j.id;
      evs.push({ tipo: "convertir", texto: `Un atacante ${nivel} de ${j.nombre} se convierte en aliado.` });
      if (o.posicion === 0) {
        const s = j.senderos.find(s => s.id === o.sendero);
        const i = lanzaderaDeSendero(j, o.sendero);
        if (s && i !== null && !j.lanzaderas[i]) {
          j.lanzaderas[i] = s.posiciones[0];
          s.posiciones[0] = null;
          evs.push({ tipo: "a_lanzadera", texto: `El monstruo convertido alcanza la lanzadera ${i + 1} de ${j.nombre}.` });
        }
      }
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
    case "monstruo3_gratis": {
      j.box[o.hueco] = { id: uid("m"), tipo: "monstruo", nivel: 3, dueno: j.id };
      evs.push({ tipo: "crear", texto: `${j.nombre} crea un monstruo 3 en la jaula ${o.boxIdx + 1}.` });
      return true;
    }
    case "bombardear": {
      if (tieneCiencia(o.enemigo, "proteccion_torres")) {
        evs.push({ tipo: "torre", texto: `La protección ancestral de ${o.enemigo.nombre} aguanta el bombardeo.` });
        return false;
      }
      if (o.torre.nivel <= 1) {
        o.enemigo.bunker.torres[o.pos - 1] = null;
        avisosTorre(o.enemigo).push({ de: j.nombre, pos: o.pos, antes: o.torre.nivel, despues: 0 });
        evs.push({ tipo: "torre", texto: `${j.nombre} bombardea y destruye la torre ${o.pos} de ${o.enemigo.nombre}.` });
      } else {
        o.torre.nivel -= 1;
        avisosTorre(o.enemigo).push({ de: j.nombre, pos: o.pos, antes: o.torre.nivel + 1, despues: o.torre.nivel });
        evs.push({ tipo: "torre", texto: `${j.nombre} bombardea la torre ${o.pos} de ${o.enemigo.nombre}: baja a nivel ${o.torre.nivel}.` });
      }
      return true;
    }
    default: return false;
  }
}

/* `reemplazo` es el efecto de la ciencia que se descarta al instalar una nueva
   cuando ya hay dos huecos ocupados. `edificio` es la elección de
   "Laboratorio o armería". */
function aplicarMejoraBunker(j, carta, e, evs, reemplazo, accion) {
  if (carta.tipo === "recursos")     { j.bunker.recursos.push(carta); return; }
  if (carta.tipo === "decreto")      { j.bunker.decretos.push(carta); return; }
  if (carta.tipo === "recursos_mix") { j.bunker.recursos_mix.push(carta); return; }
  if (carta.tipo === "recursos_i") {
    /* Monedas al momento: el coste ya se ha pagado al jugarla, así que aquí
       solo entra la ganancia. */
    j.energia += carta.ganancia ?? 0;
    evs.push({
      tipo: "recursos", a: j.id,
      texto: `${j.nombre} cambia ${carta.coste} moneda${carta.coste === 1 ? "" : "s"} por ${carta.ganancia}.`,
    });
    return;
  }
  if (carta.tipo === "armeria")     { j.bunker.armeria     = carta.nivel; return; }
  if (carta.tipo === "laboratorio") { j.bunker.laboratorio = carta.nivel; return; }
  if (carta.tipo === "armeria_up") {
    j.bunker.armeria = Math.min(2, (j.bunker.armeria ?? 1) + 1);
    return;
  }
  if (carta.tipo === "laboratorio_up") {
    j.bunker.laboratorio = Math.min(3, (j.bunker.laboratorio ?? 1) + 1);
    return;
  }
  if (carta.tipo === "ciencia") {
    if (cienciaLlena(j)) {
      const fuera = j.bunker.ciencia.find(c => c.efecto === reemplazo);
      if (!fuera) return; // sin elección válida no se instala nada
      j.bunker.ciencia = j.bunker.ciencia.filter(c => c !== fuera);
      evs.push({ tipo: "ciencia", texto: `${j.nombre} retira la ciencia ${fuera.titulo ?? fuera.efecto}.` });
    }
    j.bunker.ciencia.push(carta);
    return;
  }
  if (carta.tipo === "ciencia_i") {
    /* Inmediata: hace su efecto y desaparece. No va al descarte, así que no
       puede volver en un barajado. */
    aplicarCienciaInmediata(j, carta, evs, accion, e);
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

function esAliado(e, a, b) {
  return !!a && !!b && a !== b && (e.modo ?? "todos") === "equipos"
    && e.jugadores[a]?.equipo === e.jugadores[b]?.equipo;
}

function esRival(e, a, b) {
  return !!a && !!b && a !== b
    && ((e.modo ?? "todos") !== "equipos" || e.jugadores[a]?.equipo !== e.jugadores[b]?.equipo);
}

/* Un jugador que cae deja su sitio en la clasificación: el primero que cae es
   el último de la mesa y el siguiente, el penúltimo. Se apunta una sola vez. */
function marcarEliminado(e, jugadorId) {
  if (!Array.isArray(e.eliminados)) e.eliminados = [];
  if (e.eliminados.some((x) => x.jugadorId === jugadorId)) return;
  e.eliminados.push({
    jugadorId,
    luna: e.luna,
    puntos: e.jugadores[jugadorId]?.puntosMonsters ?? 0,
  });
}

function avanzarTurno(e) {
  /* El aviso de «sin huecos» es del turno que acaba: no tiene que reaparecer
     al recargar la app con el turno ya pasado. */
  delete e.avisoLanzar;
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
  if (e.modo === "equipos") {
    const equiposVivos = new Set(vivos.map(id => e.jugadores[id].equipo));
    if (equiposVivos.size > 1 && e.luna <= 25) return;
    const totales = new Map();
    for (const id of e.orden) {
      const equipo = e.jugadores[id].equipo;
      totales.set(equipo, (totales.get(equipo) ?? 0) + e.jugadores[id].puntosMonsters);
    }
    const vivosSet = new Set(vivos);
    const puestos = [...e.orden]
      .map(id => ({ jugadorId: id, puntos: e.jugadores[id].puntosMonsters, equipo: e.jugadores[id].equipo }))
      .sort((a, b) => {
        const aVivo = vivosSet.has(a.jugadorId) ? 0 : 1;
        const bVivo = vivosSet.has(b.jugadorId) ? 0 : 1;
        if (aVivo !== bVivo) return aVivo - bVivo;
        const ta = totales.get(a.equipo) ?? 0;
        const tb = totales.get(b.equipo) ?? 0;
        return ta - tb || a.puntos - b.puntos || e.orden.indexOf(a.jugadorId) - e.orden.indexOf(b.jugadorId);
      });
    e.final = { puestos };
    return;
  }
  if (vivos.length <= 1 || e.luna > 25) {
    const puestos = [...e.orden]
      .map(id => ({ jugadorId: id, puntos: e.jugadores[id].puntosMonsters }))
      .sort((a, b) => a.puntos - b.puntos);
    e.final = { puestos };
  }
}

// ── Resolución de cartas de Destino ───────────────────────────────────────
function nivelRealEnemigo(e, nivel) {
  if (nivel === "volador") return "volador";
  return e.nivelEnemigo === 1 ? Math.min(1, nivel) : nivel;
}

function priorizarSendero(senderos, prio) {
  for (const id of prio) {
    const s = senderos.find(s => s.id === id);
    if (s && !s.posiciones[0]) return id;
  }
  return null;
}

/* Las cartas de Avistamiento traen una prioridad, pero la escalera que se
   anuncia en la carta tiene que ser la que de verdad queda libre. Si la
   central está ocupada, se usa la siguiente de la prioridad. */
const NOMBRE_ESCALERA = { 1: "izquierda", 2: "central", 3: "derecha" };
const ESCALERA_LARGA = { 1: "de la izquierda", 2: "central", 3: "de la derecha" };

function planificarAmenaza(senderos, carta) {
  const cantidad = Math.min(3, Math.max(1, Number(carta.cantidad) || 1));
  const libres = new Set(
    (senderos ?? []).filter(s => !s.posiciones[0]).map(s => s.id),
  );
  const ids = [];
  for (const id of (carta.prio ?? [1, 2, 3])) {
    if (ids.length >= cantidad) break;
    if (libres.has(id)) {
      ids.push(id);
      libres.delete(id);
    }
  }
  return ids;
}

function fraseEscaleras(ids) {
  if (ids.length === 1) return `por la escalera ${ESCALERA_LARGA[ids[0]] ?? "central"}`;
  if (ids.length === 2) {
    return `por las escaleras ${NOMBRE_ESCALERA[ids[0]] ?? "central"} y ${NOMBRE_ESCALERA[ids[1]] ?? "central"}`;
  }
  return "por las tres escaleras";
}

function describirAmenaza(carta, ids) {
  const base = String(carta.descripcion ?? "").trim();
  const cantidad = Math.min(3, Math.max(1, Number(carta.cantidad) || 1));
  if (!ids.length) {
    return `${base} ${cantidad === 1 ? "No encuentra" : "No encuentran"} hueco libre en las escaleras.`.trim();
  }
  const verbo = ids.length === 1 ? "Sube" : "Suben";
  return `${base} ${verbo} ${fraseEscaleras(ids)}.`.trim();
}

/* El avistamiento mixto: el carroñero por la central y un rastreador por cada
   lado. Si una escalera está ocupada, el de ese lado no entra; los demás
   mantienen su sitio. */
function planificarMixta(senderos, carta) {
  const niveles = Array.isArray(carta.niveles) ? carta.niveles : [1, 1, 1];
  const libres = new Set((senderos ?? []).filter(s => !s.posiciones[0]).map(s => s.id));
  const puestos = [];
  for (const id of [2, 1, 3]) {
    if (!libres.has(id)) continue;
    puestos.push({ sendero: id, nivel: niveles[id - 1] ?? 1 });
  }
  return puestos;
}

const NOMBRE_NIVEL = { 1: "rastreador", 2: "carroñero", 3: "yeti", 5: "coloso de hielo", 7: "devorador de cumbres", volador: "aves de bruma" };

function describirMixta(puestos) {
  if (!puestos.length) return "Un carroñero y dos rastreadores buscan hueco en las escaleras, pero no lo encuentran.";
  const trozos = puestos.map(p =>
    `un ${NOMBRE_NIVEL[p.nivel] ?? `monstruo de nivel ${p.nivel}`} por la escalera ${ESCALERA_LARGA[p.sendero] ?? "central"}`);
  const lista = trozos.length === 1 ? trozos[0] : `${trozos.slice(0, -1).join(", ")} y ${trozos[trozos.length - 1]}`;
  return `Se ha avistado ${lista}.`;
}

function colocarAtacante(senderos, senderoId, nivel) {
  const s = senderos.find(s => s.id === senderoId);
  if (s && !s.posiciones[0]) {
    const vuela = nivel === "volador";
    s.posiciones[0] = { id: uid("e"), tipo: "atacante", nivel: vuela ? 1 : nivel, ...(vuela ? { vuela: true } : {}) };
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
      const ids = planificarAmenaza(j.senderos, carta);
      for (const id of ids) colocarAtacante(j.senderos, id, nv);
      if (ids.length) {
        evs.push({ tipo: "amenaza", texto: `Destino: ${ids.length} monstruo(s) ${nv} en las escaleras de ${j.nombre}.` });
      }
      break;
    }
    case "amenaza_mixta": {
      const puestos = planificarMixta(j.senderos, carta);
      for (const p of puestos) {
        const nv = carta.nivelPropio ? p.nivel : nivelRealEnemigo(e, p.nivel);
        colocarAtacante(j.senderos, p.sendero, nv);
      }
      if (puestos.length) {
        evs.push({ tipo: "amenaza", texto: `Destino: ${puestos.map(p => `${NOMBRE_NIVEL[p.nivel] ?? "monstruo"} nv${p.nivel} por la escalera ${p.sendero}`).join(", ")} de ${j.nombre}.` });
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
        if (!esRival(e, jugadorId, rivalId)) continue;
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
      /* Solo los atacantes que están entrando en tus caminos. */
      for (const s of j.senderos) {
        const f = s.posiciones[0];
        if (f?.tipo === "atacante") {
          evs.push({ tipo: "aniquilar", texto: `Aniquilado monstruo en la entrada de la escalera ${s.id} de ${j.nombre}.` });
          marcarMuerteSinLucha(j, f);
          s.posiciones[0] = null;
        }
      }
      break;
    case "aniquilar_nivel":
      /* Todos los monstruos de los caminos, propios o ajenos, pero nunca
         lanzaderas, jaulas ni cajas. */
      for (const otro of Object.values(e.jugadores)) {
        if (!otro.vivo) continue;
        for (const s of otro.senderos) {
          for (let p = 0; p < 4; p++) {
            const f = s.posiciones[p];
            if ((f?.tipo === "atacante" || f?.tipo === "monstruo") && f.nivel <= carta.nivelMax) {
              evs.push({ tipo: "aniquilar", texto: `Aniquilado monstruo ${f.nivel} en la escalera ${s.id} de ${otro.nombre}.` });
              marcarMuerteSinLucha(otro, f);
              s.posiciones[p] = null;
            }
          }
        }
      }
      break;
    case "matar_mayor": {
      let mayor = -1;
      const objetivos = [];
      for (const otro of Object.values(e.jugadores)) {
        if (!otro.vivo) continue;
        for (const s of otro.senderos) {
          for (let p = 0; p < 4; p++) {
            const f = s.posiciones[p];
            if ((f?.tipo !== "atacante" && f?.tipo !== "monstruo")) continue;
            if (f.nivel > mayor) {
              mayor = f.nivel;
              objetivos.length = 0;
              objetivos.push({ s, p, f, otro });
            } else if (f.nivel === mayor) {
              objetivos.push({ s, p, f, otro });
            }
          }
        }
      }
      for (const o of objetivos) { marcarMuerteSinLucha(o.otro, o.f); o.s.posiciones[o.p] = null; }
      if (objetivos.length) {
        evs.push({ tipo: "aniquilar", texto: `Caen los monstruos más fuertes (${mayor}) de los caminos: ${objetivos.length}.` });
      }
      break;
    }
    case "avanzar_extra":
      /* Un peldaño más para todos. Los que ya estaban en la casilla de la
         puerta, junto a las torres, no tienen casilla delante: entran en el
         búnker y le quitan vida, igual que en el avance de cada turno. Antes
         el empujón solo movía la fila de atrás y los de la puerta se quedaban
         esperando otra vuelta con la fortaleza intacta. */
      for (const s of j.senderos) {
        const enLaPuerta = s.posiciones[3];
        if (enLaPuerta?.tipo !== "atacante") continue;
        j.puntosMonsters += enLaPuerta.nivel;
        s.posiciones[3] = null;
        evs.push({ tipo: "entrada", texto: `¡Monstruo ${enLaPuerta.nivel} entra en el búnker de ${j.nombre}! (+${enLaPuerta.nivel} pts)` });
        if (j.puntosMonsters > 20) {
          j.vivo = false;
          marcarEliminado(e, jugadorId);
          evs.push({ tipo: "derrota", texto: `El búnker de ${j.nombre} ha sido destruido.`, a: jugadorId });
        }
      }
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
    case "convertir_aliado": {
      const candidatos = [];
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          const f = s.posiciones[p];
          if (f?.tipo === "atacante" && f.nivel <= 5) candidatos.push({ s, p, f });
        }
      }
      if (candidatos.length) {
        const o = candidatos[Math.floor(tirar(e) * candidatos.length)];
        o.f.tipo = "monstruo";
        o.f.dueno = j.id;
        evs.push({ tipo: "convertir", texto: `Atacante ${o.f.nivel} en la escalera ${o.s.id} de ${j.nombre} se convierte en aliado.` });
      }
      break;
    }
    case "desercion": {
      const candidatos = [];
      for (const s of j.senderos) {
        for (let p = 0; p < 4; p++) {
          const f = s.posiciones[p];
          if (f?.tipo === "monstruo") candidatos.push({ s, p, f });
        }
      }
      if (candidatos.length) {
        const o = candidatos[Math.floor(tirar(e) * candidatos.length)];
        o.f.tipo = "atacante";
        o.f.dueno = j.id;
        evs.push({ tipo: "convertir", texto: `Un monstruo ${o.f.nivel} de ${j.nombre} deserta en la escalera ${o.s.id}.` });
      }
      break;
    }
    case "ventisca": {
      /* Cae sobre quien roba la carta: sus torres, no las del resto. */
      normalizarTorres(j);
      if (tieneCiencia(j, "proteccion_torres")) {
        evs.push({ tipo: "torre", a: jugadorId,
          texto: `La protección ancestral de ${j.nombre} aguanta la ventisca.` });
        break;
      }
      let danadas = 0, caidas = 0;
      j.bunker.torres.forEach((t, i) => {
        if (!t) return;
        const antes = t.nivel;
        if (antes > 1) { t.nivel = antes - 1; danadas++; }
        else { j.bunker.torres[i] = null; caidas++; }
        avisosTorre(j).push({ carta: "Ventisca", pos: i + 1, antes, despues: antes > 1 ? antes - 1 : 0 });
      });
      if (danadas || caidas) {
        evs.push({ tipo: "torre", a: jugadorId,
          texto: `Ventisca: las torres de ${j.nombre} bajan un nivel (${danadas} dañadas y ${caidas} derribadas).` });
      } else {
        evs.push({ tipo: "torre", texto: `La ventisca no encuentra torres en el búnker de ${j.nombre}.` });
      }
      break;
    }
    case "desprendimiento": {
      normalizarTorres(j);
      if (tieneCiencia(j, "proteccion_torres")) {
        evs.push({ tipo: "torre", a: jugadorId,
          texto: `La protección ancestral de ${j.nombre} aguanta el desprendimiento.` });
        break;
      }
      let alto = -1, nivel = 0;
      j.bunker.torres.forEach((t, i) => {
        if (t && t.nivel > nivel) { alto = i; nivel = t.nivel; }
      });
      if (alto >= 0) {
        j.bunker.torres[alto] = null;
        avisosTorre(j).push({ carta: "Desprendimiento", pos: alto + 1, antes: nivel, despues: 0 });
        evs.push({ tipo: "torre", a: jugadorId,
          texto: `Desprendimiento: la torre ${alto + 1} de ${j.nombre} (nivel ${nivel}) queda aplastada.` });
      } else {
        evs.push({ tipo: "torre", texto: `El desprendimiento no encuentra torres en el búnker de ${j.nombre}.` });
      }
      break;
    }
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
      evs.push({ tipo: "monstruos_gratis", texto: `${j.nombre} recibe ${colocados} monstruo(s) nivel ${carta.nivel} en la jaula.`, a: jugadorId });
      break;
    }
  }

  return evs;
}

export default bunkerWars;
