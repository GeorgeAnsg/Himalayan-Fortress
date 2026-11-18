/* ================================================================== */
/*  v3 — EL MOTOR                                              */
/*                                                                    */
/*  No sabe cómo se llama nada. Recibe un paquete de tema y juega.     */
/*  Lo único que expone:                                             */
/*                                                                    */
/*    legales(partida, jugador)  → lo que se puede hacer ahora        */
/*    aplicar(partida, jugador, acción) → lo hace, o lo rechaza       */
/*    vista(partida, jugador)    → lo que ese jugador sabe            */
/*    verificar(partida)         → las reglas se siguen cumpliendo    */
/*                                                                    */
/*  Sin fs, sin fetch, sin reloj y sin azar del sistema, sin DOM:     */
/*  corre en Node, en el navegador y en un Worker tal cual.           */
/* ================================================================== */

import {
  COSTE,
  COSTE_BOLSA,
  PA_POR_DIA,
  JORNADAS,
  ACARREO,
  ACARREO_AJENO,
  HUECOS,
  HUECOS_NUEVAS,
  DIA_HABILIDADES,
  DIA_SALAS,
  MENTIRA_CHARLA,
} from "./reglas.js";

/* ------------------------------------------------------------------ */
/*  Azar reproducible                                                  */
/* ------------------------------------------------------------------ */
function rnd(e) {
  e.rng = (Math.imul(e.rng, 1664525) + 1013904223) >>> 0;
  return e.rng / 4294967296;
}
function entero(e, min, max) {
  return min + Math.floor(rnd(e) * (max - min + 1));
}
function elegir(e, xs) {
  return xs[Math.floor(rnd(e) * xs.length)];
}
export function barajar(e, xs) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(e) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/*  REPARTO                                                            */
/* ------------------------------------------------------------------ */
export function crearPartida(tema, opc = {}) {
  const {
    semilla = 1,
    nJugadores = 6,
    dias = JORNADAS,
    pa = PA_POR_DIA,
    huecos = HUECOS,
    mentira = MENTIRA_CHARLA,
    registroTotal = true,
  } = opc;
  const e = {
    v: 1,
    tema,
    semilla,
    mentira,
    registroTotal,
    rng: (Math.imul(semilla >>> 0, 2654435761) >>> 0) || 1,
    dia: 1,
    dias,
    paPorDia: pa,
    salas: {},
    jugadores: {},
    objetos: {},
    reponer: [],      /* habilidades gastadas que vuelven al amanecer */
    sucesos: [],
    puertas: {},
    cerrojadas: new Set(),
    ganador: null,
    fin: null,
    n: 0,
  };

  /* Las salas, con sus huecos: tres a cinco en las que existen desde el
     principio; las que se abren a mitad llegan llenas y tienen siempre cinco,
     el máximo, para que con ocho jugadores no caiga nada al centro. */
  for (const id of Object.keys(tema.salas))
    e.salas[id] = {
      id,
      huecos: tema.salas[id].entra
        ? HUECOS_NUEVAS
        : Array.isArray(huecos)
          ? entero(e, huecos[0], huecos[1])
          : huecos,
      escondidos: [],
      centro: [],
    };

  /* La gente: cada jugador recibe una ficha —el apodo y sus tres rasgos— y un
     nombre oculto. La ficha es pública: el dibujo del personaje ya la enseña. */
  const n = Math.min(nJugadores, tema.apodos.length, tema.nombres.length);
  const fichas = repartirFichas(e, tema.apodos, n);
  const nombres = barajar(e, tema.nombres).slice(0, n);

  /* Puertas cerradas desde el inicio: duran 2 jornadas (igual que una tranca puesta en partida). */
  for (const [id, s] of Object.entries(tema.salas))
    for (const dest of (s.trancada || []))
      e.puertas[clavePuerta(id, dest)] = 2;

  /* Todo el mundo empieza en la puerta: la partida arranca al entrar en la casa. */
  const entrada = Object.keys(tema.salas).find((id) => tema.salas[id].puerta);
  if (!entrada) throw new Error("el tema no tiene una estancia con puerta");

  for (let i = 0; i < n; i++) {
    const id = `j${i}`;
    e.jugadores[id] = {
      id,
      apodo: fichas[i].apodo,
      nombre: nombres[i],
      rasgos: { ...fichas[i].rasgos },
      sala: entrada,
      salaIni: entrada,
      pa,
      mano: null,
      bolsa: null,
      sabe: {},        /* cuaderno: nombre → { rasgo: valor } (verdad comprobada) */
      dichos: [],      /* lo que te han contado: { de, nombre, rasgo, valor, dia } */
      sabeDonde: {},   /* nombre → sala (objetos de situación) */
      sabeDondeDia: {}, /* nombre → jornada en que te lo dijeron: la nota lleva fecha */
      sabeDondeFue: {}, /* nombre → sala que ya no es cierta: la persona se movió */
      intentos: [],    /* { obj, sala } donde no sirvió */
      bien: {},        /* obj → sala donde sí sirve */
      visto: {},       /* sala → { dia, abiertos, ids }: lo que ya sabes de la sala */
      mirada: null,    /* el registro que acabas de pagar: { sala, dia, abiertos, cogidos } */
      oido: null,      /* lo último que oyó con el vaso */
      escucha: null,   /* la copa pegada a una pared: { base, oye, dia } */
      fuera: false,
      gastadoHoy: 0,
      hablado: [],     /* con quién ya habló hoy */
      esperaDesde: 0,  /* desde qué suceso no ha actuado: lo que ha visto esperando */
    };
  }

  /* Cada jugador empieza con una habilidad en la mano: se reparten las 5 tipos
     en orden barajado, ciclando si hay más jugadores que tipos. */
  /* El orden de la mesa: fijo toda la partida. Cada jornada abre uno distinto,
     rotando, para que llegar primero a los huecos no sea siempre del mismo. */
  e.orden = Array.from({ length: n }, (_, i) => `j${i}`);
  e.inicio = entero(e, 0, n - 1);
  e.turno = 0;

  /* Fusionar defaults del catálogo con la config del anfitrión.
     habsConfig: [{clase, veces, enPartida}]; habsInicio: [clase, ...] */
  const habsConfig = opc.habsConfig ?? [];
  const habsDef = tema.habilidades.filter((h) => !h.oculto).map((h) => {
    const override = habsConfig.find((c) => c.clase === h.clase);
    return override ? { ...h, ...override } : h;
  }).filter((h) => h.enPartida !== false);

  /* Reparto inicial: habilidades elegidas en habsInicio, ciclando entre jugadores.
     Fallback al campo `inicial` del tema para compatibilidad con partidas viejas. */
  const inicioClases = opc.habsInicio?.length
    ? barajar(e, opc.habsInicio)
    : habsDef.filter((h) => h.inicial).map((h) => h.clase);
  for (let i = 0; i < n; i++) {
    const p = e.jugadores[`j${i}`];
    if (!inicioClases.length) break;
    const clase = inicioClases[i % inicioClases.length];
    const def = habsDef.find((h) => h.clase === clase);
    if (!def) continue;
    const o = crearObjeto(e, {
      nombre: def.nombre, tipo: "habilidad", clase: def.clase,
      sirveEn: null, sugiere: [], dueño: null, acarreo: 0,
    });
    o.esInicial = true;
    p.mano = o.id;
    o.donde = "mano";
    o.portador = p.id;
  }

  /* Pool de respawn: 1 copia de cada habilidad en partida, en salas abiertas. */
  const esconditesSinUsar = Object.keys(tema.salas).filter((id) => abierta(e, id));
  for (const h of habsDef) {
    const o = crearObjeto(e, {
      nombre: h.nombre, tipo: "habilidad", clase: h.clase,
      sirveEn: null, sugiere: [], dueño: null, acarreo: 0,
    });
    meterEnSala(e, o, elegir(e, esconditesSinUsar));
  }

  /* Pool unificado de 60 objetos (rasgo + situación): se baraja una vez y
     se reparte en franjas — primeros n para rasgo (Jornada 1), siguientes n
     para situación (Jornada 3), el resto queda disponible para Jornada 5. */
  const catalogo = barajar(e, tema.objetos);
  e.catalogoSit   = catalogo.slice(n, n * 2);
  e.catalogoResto = catalogo.slice(n * 2);
  const escondites = Object.keys(tema.salas).filter((id) => abierta(e, id));

  const piezas = [];

  /* Distribuir rasgos de forma que cada rasgo aparezca al menos ⌊n/r⌋ veces.
     Con 6 jugadores y 3 rasgos esto garantiza 2 objetos por rasgo como mínimo,
     evitando semillas en las que un rasgo queda sin ningún objeto que lo revele. */
  const rasgosBase = [];
  while (rasgosBase.length < n) rasgosBase.push(...barajar(e, tema.rasgos));
  const rasgosAsignados = rasgosBase.slice(0, n);

  for (let i = 0; i < n; i++) {
    const p = e.jugadores[`j${i}`];
    const rasgo = rasgosAsignados[i];
    const c = catalogo[i];
    piezas.push(crearObjeto(e, {
      nombre: c.nombre,
      tipo: "rasgo",
      sirveEn: c.sirveEn,
      sugiere: c.sugiere.slice(),
      rasgo,
      valor: p.rasgos[rasgo],
      dueño: p.id,
      acarreo: ACARREO_AJENO, /* presupuesto total; al cogerlo, 2 si es tuyo */
    }));
  }

  const donde = repartirFueraDeSugiere(e, piezas, escondites);
  for (const o of piezas) meterEnSala(e, o, donde.get(o.id));

  return e;
}

/* Qué fichas juegan cuando no caben todas. No se coge un puñado al azar: se
   sortean manos y se queda la que reparte cada rasgo lo más cerca de la mitad,
   que es lo que hace útil cruzarlos —un rasgo deja cuatro candidatos, dos
   dejan dos—. Y se evita la ficha vacía, la que no tiene ningún rasgo: no deja
   rastro y sus dos objetos no la distinguen de ninguna otra, así que su nombre
   no se puede cerrar. Solo entra cuando no hay más remedio, que es con siete
   jugadores o con ocho. Con ocho entran las ocho y no hay nada que elegir. */
function desequilibrio(mano, rasgos) {
  let total = 0;
  for (const r of rasgos) {
    let con = 0;
    for (const f of mano) if (f.rasgos[r]) con++;
    total += Math.abs(con - (mano.length - con));
  }
  return total;
}

function repartirFichas(e, fichas, n) {
  /* Una sola barajada siempre: el loop de optimización consumía RNG de forma
     distinta según n, haciendo que j0..jk con n=6 fueran personajes distintos
     que con n=8, rompiendo la asignación del vestíbulo. */
  return barajar(e, fichas).slice(0, n);
}

/* ------------------------------------------------------------------ */
/*  PIEZAS                                                             */
/* ------------------------------------------------------------------ */
function crearObjeto(e, o) {
  const id = `o${++e.n}`;
  e.objetos[id] = {
    id,
    donde: null,      /* escondido | centro | mano | bolsa | gastado | fuera */
    enSala: null,
    hueco: null,      /* qué mueble de la sala, si está escondido */
    portador: null,
    reclamado: false, /* el dueño ya reclamó este objeto en el acarreo actual */
    ...o,
  };
  return e.objetos[id];
}

/* Sala aleatoria con hueco libre, excluyendo la sala actual del objeto y la
   sala donde acaba de leerse: el dato no se queda al lado de quien lo sacó.
   Si en todas cabe justo, se devuelve una sala abierta y el objeto cae al
   centro: un objeto no puede quedarse sin sitio ni desaparecer de la casa. */
function respawnear(e, o, excluir = null) {
  const abiertas = Object.keys(e.salas).filter(
    (id) => abierta(e, id) && id !== o.enSala && id !== excluir
  );
  const conHueco = abiertas.filter((id) => {
    const s = e.salas[id];
    return s.escondidos.filter(Boolean).length < s.huecos;
  });
  if (conHueco.length) return elegir(e, conHueco);
  const sinExcluir = Object.keys(e.salas).filter((id) => abierta(e, id) && id !== excluir);
  return sinExcluir.length ? elegir(e, sinExcluir) : excluir;
}

/* El hueco es una posición de la lista: el índice se queda quieto aunque se
   vacíe, para que los dos que se miran sigan siendo los mismos dos. */
function meterEnSala(e, o, sala) {
  const s = e.salas[sala];
  o.enSala = sala;
  o.portador = null;
  o.acarreo = 0; /* al soltarlo el contador termina: el siguiente que lo coja empieza de cero */
  o.reclamado = false; /* el acarreo termina: el siguiente portador vuelve a deber la pista */
  let i = s.escondidos.indexOf(null);
  if (i === -1 && s.escondidos.length < s.huecos) i = s.escondidos.length;
  if (i !== -1) {
    s.escondidos[i] = o.id;
    o.donde = "escondido";
    o.hueco = i;
  } else {
    o.donde = "centro";
    o.hueco = null;
    s.centro.push(o.id);
  }
}

/* El aviso de un objeto de situación vale mientras la persona siga donde estaba
   cuando lo usaste. En cuanto se mueve, la nota pasa a `sabeDondeFue`: quien la
   tenía puede tacharla, pero ya no puede deducir con ella. */
function caducarAvisos(e, pid) {
  const movido = e.jugadores[pid];
  if (!movido) return;
  for (const p of Object.values(e.jugadores)) {
    if (p.id === pid) continue;
    if (!p.sabeDonde || !(movido.nombre in p.sabeDonde)) continue;
    p.sabeDondeFue = p.sabeDondeFue || {};
    p.sabeDondeFue[movido.nombre] = p.sabeDonde[movido.nombre];
    delete p.sabeDonde[movido.nombre];
  }
}

export function quitarDeSala(e, o) {
  const s = e.salas[o.enSala];
  if (!s) return;
  s.escondidos = s.escondidos.map((x) => (x === o.id ? null : x));
  s.centro = s.centro.filter((x) => x !== o.id);
  o.enSala = null;
  o.hueco = null;
}

export function jugadores(e) {
  return Object.values(e.jugadores);
}

export function objetosDeSala(e, sala) {
  const s = e.salas[sala];
  return [...s.escondidos.filter(Boolean), ...s.centro];
}

/* Una estancia con `entra` no existe hasta ese día. */
export function abierta(e, id) {
  const s = e.tema.salas[id];
  return !s || !s.entra || e.dia >= s.entra;
}

export function presentes(e, sala) {
  return jugadores(e).filter((p) => !p.fuera && p.sala === sala);
}

export function objetosDe(p) {
  return [p.mano, p.bolsa].filter(Boolean);
}

function clavePuerta(a, b) {
  return [a, b].sort().join("|");
}

function cerrojada(e, a, b) {
  return e.cerrojadas?.has(clavePuerta(a, b)) ?? false;
}

function cerrada(e, a, b) {
  if (cerrojada(e, a, b)) return true;
  /* La tranca dura la jornada en que se pone y la siguiente: una puerta
     cerrada a mediodía no se abre al amanecer, sino al amanecer del día
     siguiente al siguiente. */
  const hasta = e.puertas[clavePuerta(a, b)];
  return typeof hasta === "number" && e.dia <= hasta;
}

function tiene(p, e, clase) {
  return objetosDe(p).some((id) => {
    const o = e.objetos[id];
    return o.tipo === "habilidad" && o.clase === clase;
  });
}

function pagar(e, p, n) {
  if (n > p.pa) throw new Error(`${p.apodo} no tiene ${n} fichas`);
  p.pa -= n;
  p.gastadoHoy += n;
  return n;
}

/* Quién oye un gesto con la copa pegada a la pared: hay que seguir en la sala
   donde se pegó, y el gesto tiene que ocurrir en la que se está escuchando.
   Lo que se oye no se ve, y al que escucha no lo ve nadie. */
function oyentesDe(e, quien, salas) {
  const out = [];
  for (const q of Object.values(e.jugadores)) {
    if (!q || q.fuera || q.id === quien) continue;
    const es = q.escucha;
    if (es && es.base === q.sala && salas.includes(es.oye)) out.push(q.id);
  }
  return out;
}

function ev(e, o) {
  /* Dónde se ve un gesto y quién lo ve. Todo suceso lleva sus salas (`en`) y
     la lista de quienes estaban allí (`ven`): así el que espera su turno sabe
     lo que ha pasado delante de él, y solo eso. Sin esto, la crónica del que
     juega tercero se quedaba vacía y la casa parecía cambiar sola. */
  const en = o.en ?? (o.tipo === "mover" ? [o.de, o.a] : [o.sala ?? o.de]).filter(Boolean);
  const ven = [];
  /* Escuchar con el vaso y quedarse sin jugar no los ve nadie. Salir, en
     cambio, lo ve la casa entera. */
  if (o.tipo !== "vaso" && o.tipo !== "pasar") {
    for (const q of Object.values(e.jugadores)) {
      if (!q || q.fuera || q.id === o.quien) continue;
      if (o.tipo === "salida" || o.tipo === "salas_nuevas" || en.includes(q.sala)) ven.push(q.id);
    }
  }
  /* Los que lo oyen desde el otro lado de la pared. El que está en la sala ya
     lo ve: no se cuenta dos veces. */
  const oyen =
    o.tipo === "vaso" || o.tipo === "pasar"
      ? []
      : oyentesDe(e, o.quien, en).filter((id) => !ven.includes(id));
  e.sucesos.push({ n: e.sucesos.length, dia: e.dia, en, ven, oyen, ...o });
}

function aprender(p, nombre, rasgo, valor) {
  if (!p.sabe[nombre]) p.sabe[nombre] = {};
  p.sabe[nombre][rasgo] = valor;
}

/* Lo que te cuentan va aparte, con quien lo dijo: puede ser mentira y no
   se mezcla con lo que has comprobado. */
function aprenderDicho(p, d) {
  p.dichos.push(d);
}

/* Llevar encima un objeto de esa persona es la única prueba que convierte
   un dicho en dato: entonces no hay mentira y entra en el cuaderno. */
function protegido(e, para, nombre) {
  const q = jugadores(e).find((x) => x.nombre === nombre);
  if (!q) return false;
  return objetosDe(para).some((id) => e.objetos[id].dueño === q.id);
}

/* Los datos que `de` tiene y `para` no, sin delatarse a sí mismo. */
function datosPara(de, para) {
  const opciones = [];
  for (const [nombre, f] of Object.entries(de.sabe)) {
    if (nombre === de.nombre) continue;
    /* Nadie te cuenta nada de ti: ni el que responde por cortesía, ni el que
       te da una pista porque llevas su objeto. Se sabía de sobra. */
    if (nombre === para.nombre) continue;
    for (const [rasgo, valor] of Object.entries(f)) {
      const suyo = para.sabe[nombre] || {};
      if (!(rasgo in suyo)) opciones.push({ nombre, rasgo, valor });
    }
  }
  return opciones;
}

/* Todos los rasgos del juego que para aún no sabe y no son sobre sí mismo.
   Se usa como pool de reclamar: llevar tu objeto da derecho a un rasgo
   aleatorio de cualquier personaje, independientemente de lo que sepa quien
   lo lleva. */
function rasgosDesconocidos(e, para) {
  const opciones = [];
  for (const q of Object.values(e.jugadores)) {
    if (q.nombre === para.nombre) continue; /* nada sobre ti mismo */
    const suyo = para.sabe[q.nombre] || {};
    for (const rasgo of e.tema.rasgos) {
      if (!(rasgo in suyo) && rasgo in q.rasgos)
        opciones.push({ nombre: q.nombre, rasgo, valor: q.rasgos[rasgo] });
    }
  }
  return opciones;
}

function tieneDatoPara(de, para) {
  return datosPara(de, para).length > 0;
}

/* ¿Sabe algo de alguien? Da igual de quién, incluso de ti: lo que se mira para
   ofrecer la charla es que tenga algo que contar. En la primera jornada nadie
   ha usado un objeto todavía, así que el cuaderno está vacío y no hay conversación. */
function sabeAlgo(p) {
  return Object.values(p.sabe || {}).some((f) => Object.keys(f).length > 0);
}

/* Dichos no usados sobre `nombre` de fuentes distintas (para indagar). */
function dichosIndagables(p, nombre) {
  return p.dichos.filter((d) => d.nombre === nombre && !d.usado);
}

/* Dos cotilleos y se acabó: tenidos dos sobre un nombre, ya no se ofrece nunca
   más, estén gastados en indagar o no. Es el tope de su vida; lo demás que se
   sepa de él llega por los objetos, la lupa o la reclamación.
   Y lo mismo con los tres rasgos en el cuaderno: el nombre está resuelto, no
   queda nada que contar de él y seguir preguntando solo daría lo que ya sabes. */
function cotilleoCerrado(p, nombre, rasgos) {
  if (p.dichos.filter((d) => d.nombre === nombre).length >= 2) return true;
  if (!rasgos) return false;
  /* Con los tres rasgos confirmados en el cuaderno no queda nada que revelar. */
  const f = p.sabe[nombre] || {};
  return rasgos.every((r) => r in f);
}

/* Lo que `de` sabe de un nombre, aunque `para` ya lo tuviera confirmado. Nunca
   de sí mismo: nadie se cotillea a sí mismo. */
function sabeDe(de, para, nombre) {
  if (!nombre || nombre === de.nombre) return [];
  return Object.entries(de.sabe[nombre] || {}).map(([rasgo, valor]) => ({ nombre, rasgo, valor }));
}

function anotarDicho(e, de, para, d) {
  if (!d) return null;
  const dicho = { de: de.id, nombre: d.nombre, rasgo: d.rasgo, valor: d.valor, dia: e.dia, cierto: true };
  aprenderDicho(para, dicho);
  return dicho;
}

/* Los cotilleos sueltos que quedan: personas con slot libre (< 2 dichos) y sin
   los 3 rasgos ya confirmados. El cotilleo es un contador puro: el rasgo que
   se guarda en el dicho es decorativo y no bloquea opciones. */
function opcionesFrescas(e, para, { otroQue = null, sin = null } = {}) {
  const opciones = [];
  for (const q of Object.values(e.jugadores)) {
    if (q.fuera || q.nombre === para.nombre) continue;
    if (otroQue && q.nombre === otroQue) continue;
    if (sin && q.id === sin) continue;
    if (cotilleoCerrado(para, q.nombre, e.tema.rasgos)) continue;
    for (const rasgo of e.tema.rasgos) {
      if (rasgo in q.rasgos) {
        opciones.push({ nombre: q.nombre, rasgo, valor: q.rasgos[rasgo] });
        break;
      }
    }
  }
  return opciones;
}

/* El que responde no habla de sí mismo, así que sus propios rasgos no cuentan
   como cotilleo suyo. */
function dichoFresco(e, de, para, { otroQue = null } = {}) {
  /* Primero de los demás. Si no queda nada fresco en la mesa y lo único que aún
     se puede cotillear es la persona que tienes delante, la casa sopla un rasgo
     suyo antes que dejar la charla en «no tiene nada que contarte». */
  let opciones = opcionesFrescas(e, para, { otroQue, sin: de.id });
  if (!opciones.length) opciones = opcionesFrescas(e, para, { otroQue });
  return anotarDicho(e, de, para, opciones.length ? elegir(e, opciones) : null);
}

/* Un dato que `de` sabe y `para` no, sin delatarse a sí mismo.
   `util` = el que comparte elige lo que más ayuda (una mesa que colabora);
   sin él, suelta lo que menos ayuda (el que comparte porque le obligan). */
function darDato(e, de, para, util = true, sobre = null) {
  let opciones = datosPara(de, para);
  /* Si no tiene nada que contar, dar un rasgo al azar del pool del juego. */
  if (!opciones.length) opciones = rasgosDesconocidos(e, para);
  if (sobre) {
    const dirigidas = opciones.filter((d) => d.nombre === sobre);
    if (dirigidas.length) opciones = dirigidas;
  }
  if (!opciones.length) return null;
  const cuanto = (d) => Object.keys(para.sabe[d.nombre] || {}).length;
  const tope = util ? Math.max(...opciones.map(cuanto)) : Math.min(...opciones.map(cuanto));
  const d = elegir(e, opciones.filter((o) => cuanto(o) === tope));
  aprender(para, d.nombre, d.rasgo, d.valor);
  return d;
}

/* Los nombres que este jugador puede cerrar con lo que sabe. No va nombre a
   nombre: los apodos son una biyección, así que lo que cierra uno descarta a
   los demás. El último sale por descarte, como en la mesa. */
export function cerrados(e, p) {
  const otros = jugadores(e).filter((q) => q.id !== p.id);
  const puesto = new Map(); /* nombre → id del apodo */
  let cambio = true;

  while (cambio) {
    cambio = false;
    for (const q of otros) {
      if (puesto.has(q.nombre)) continue;
      const f = p.sabe[q.nombre] || {};
      const usados = new Set(puesto.values());
      const cand = otros.filter(
        (a) => !usados.has(a.id) && e.tema.rasgos.every((r) => !(r in f) || f[r] === a.rasgos[r])
      );
      if (cand.length === 1) {
        puesto.set(q.nombre, cand[0].id);
        cambio = true;
      }
    }
  }

  const out = [];
  for (const [nombre, id] of puesto) {
    const q = e.jugadores[id];
    out.push({ id, apodo: q.apodo, nombre });
  }
  return out;
}

function gastarHabilidad(e, p, clase) {
  for (const slot of ["mano", "bolsa"]) {
    const id = p[slot];
    if (!id) continue;
    const o = e.objetos[id];
    if (o.tipo !== "habilidad" || o.clase !== clase) continue;
    p[slot] = null;
    o.donde = "gastado";
    o.portador = null;
    /* Las iniciales desaparecen al gastarse (no entran en el pool de respawn). */
    if (!o.esInicial) (e.reponer ||= []).push({ nombre: o.nombre, clase: o.clase });
    return o;
  }
  return null;
}

/* Donde este jugador ya ha leído el objeto: allí no vuelve a quedarse.
   Se apoya en lo que el jugador sabe (`bien`), no en `sirveEn`, para que el
   menú no se convierta en un oráculo. Un fallo no cierra la sala: el jugador
   ya sabe que allí no sirve, y esconderlo allí no le da nada a nadie. */
function probadoAqui(p, id, sala) {
  return p.bien[id] === sala;
}

/* ------------------------------------------------------------------ */
/*  EL TURNO                                                           */
/* ------------------------------------------------------------------ */

/* El orden de hoy: el de la mesa girado hasta el que abre. */
export function ordenHoy(e) {
  const base = e.orden ?? Object.keys(e.jugadores);
  const n = base.length;
  if (!n) return base;
  const ini = ((e.inicio ?? 0) % n + n) % n;
  return Array.from({ length: n }, (_, i) => base[(ini + i) % n]);
}

/* A quién le toca ahora mismo. */
export function aQuienLeToca(e) {
  const orden = ordenHoy(e);
  if (!orden.length) return null;
  return orden[(e.turno ?? 0) % orden.length];
}

/* El siguiente con algo que hacer. Si no queda nadie, se queda donde está: el
   que llama mira si la jornada ha terminado y amanece. */
function pasarTurno(e) {
  const orden = ordenHoy(e);
  const n = orden.length;
  for (let k = 1; k <= n; k++) {
    const i = ((e.turno ?? 0) + k) % n;
    const q = e.jugadores[orden[i]];
    if (!q || q.fuera) continue;
    /* Aplicar aturdimiento al tomar el turno, antes de comprobar si tiene PA. */
    if (q.aturdidoHasta === e.dia && q.gastadoHoy === 0) {
      q.pa = Math.max(0, q.pa - (q.penalizacionPA ?? 3));
      q.aturdidoHasta = null;
      q.penalizacionPA = null;
    }
    if (q.pa > 0) { e.turno = i; return; }
  }
}

/* ¿Ha terminado la jornada? Cuando nadie tiene fichas. */
export function jornadaTerminada(e) {
  return jugadores(e).every((p) => p.fuera || p.pa <= 0);
}

/* Lo que este jugador ha visto con los ojos desde su última acción: los gestos
   que ocurrieron en la sala donde estaba. Es lo que la pantalla le cuenta al
   empezar su turno, para que la casa no cambie a sus espaldas sin dejar rastro.
   Solo viajan los campos que se ven desde una sala, y con nombres: lo que el
   gesto pone delante de los demás (el objeto que alguien lleva en la mano) es
   público; lo que no se ve no se manda. */
const CAMPOS_QUE_SE_VEN = {
  mover: ["de", "a"],
  registrar: ["sala"],
  coger: ["sala", "obj", "de", "sitio"],
  usar: ["sala", "obj"],
  esconder: ["sala", "obj", "centro"],
  guardar: ["sala", "obj"],
  cambiar: ["sala", "guarda", "saca"],
  robar: ["sala", "a", "de", "obj"],
  reclamar: ["sala", "a", "obj"],
  interrogar: ["sala", "a"],
  tranca: ["de", "a"],
  golpe: ["quien", "a"],
  brindar: ["sala", "afectados"],
  destrancar: ["de", "a"],
  soltar: ["sala", "obj", "centro"],
  tirar: ["sala", "obj"],
  salas_nuevas: ["salas"],
  indagar: ["sobre"],
  salida: ["aciertos"],
  cepo_puesto:    ["sala"],
  cepo_activado:  ["sala"],
  humo:           ["sala"],
  atar:           ["quien", "a"],
  empujon:        ["quien", "a", "de", "hacia"],
};

/* Lo que se oye, no lo que se ve: menos detalle. De un objeto que alguien usa
   solo llega el ruido, no cuál era; de un robo, que hubo manos y con quién. */
const CAMPOS_QUE_SE_OYEN = {
  mover: ["de", "a"],
  coger: ["sala", "obj", "de", "sitio"],
  esconder: ["sala", "obj", "centro"],
  guardar: ["sala", "obj"],
  cambiar: ["sala", "guarda", "saca"],
  usar: ["sala"],
  robar: ["sala", "a", "de"],
  tranca: ["de", "a"],
  golpe: ["quien", "a"],
  destrancar: ["de", "a"],
  soltar: ["sala", "obj", "centro"],
  tirar: ["sala", "obj"],
  cotillear: ["sala", "con", "sobre"],
};

export function esperaDe(e, pid) {
  const p = e.jugadores[pid];
  if (!p) return [];
  const out = [];
  for (let i = p.esperaDesde ?? 0; i < e.sucesos.length; i++) {
    const s = e.sucesos[i];
    /* Lo que ha pasado delante de ti o al otro lado de la pared que estás
       escuchando. Se cuenta una vez, y con los campos de cada caso. */
    const visto = Array.isArray(s?.ven) && s.ven.includes(pid);
    const oido = !visto && Array.isArray(s?.oyen) && s.oyen.includes(pid);
    if (!visto && !oido) continue;
    const campos = visto ? CAMPOS_QUE_SE_VEN[s.tipo] : CAMPOS_QUE_SE_OYEN[s.tipo];
    if (!campos) continue;
    const nombreSala = (id) => e.tema.salas[id]?.nombre ?? id;
    const item = {
      n: s.n ?? i,
      dia: s.dia,
      tipo: s.tipo,
      quien: s.quien,
      apodo: e.jugadores[s.quien]?.apodo ?? "alguien",
    };
    for (const c of campos) if (s[c] !== undefined) item[c] = s[c];
    /* Los nombres se añaden solo si su campo viaja: de un objeto usado solo
       llega el ruido, y su nombre no puede colarse por la puerta de atrás. */
    if (item.a) item.apodoDe = e.jugadores[item.a]?.apodo ?? null;
    if (item.con) item.apodoCon = e.jugadores[item.con]?.apodo ?? null;
    if (item.sobre) item.apodoSobre = e.jugadores[item.sobre]?.apodo ?? null;
    if (item.obj) item.objNombre = e.objetos[item.obj]?.nombre ?? "algo";
    if (item.guarda) item.guardaNombre = e.objetos[item.guarda]?.nombre ?? "algo";
    if (item.saca) item.sacaNombre = e.objetos[item.saca]?.nombre ?? "algo";
    if (item.sala) item.salaNombre = nombreSala(item.sala);
    if (item.de) item.deNombre = nombreSala(item.de);
    if (item.a) item.aNombre = nombreSala(item.a);
    if (oido) {
      item.oido = true;
      /* El cotilleo oído deja una pista: solo para el que estaba con la copa. */
      const pista = s.oyenPista?.[pid];
      /* Sin `cierto`: lo oído es un dicho, y quien escucha no tiene por qué
         saber si el que hablaba mentía. */
      if (pista)
        item.pista = {
          de: pista.de, nombre: pista.nombre, rasgo: pista.rasgo,
          valor: pista.valor, dia: pista.dia,
        };
    }
    out.push(item);
  }
  return out;
}

/* Girar el que abre al amanecer, saltando a quien ya no está. */
function girarInicio(e) {
  const base = e.orden ?? Object.keys(e.jugadores);
  const n = base.length;
  if (!n) return;
  for (let k = 1; k <= n; k++) {
    const i = ((e.inicio ?? 0) + k) % n;
    const q = e.jugadores[base[i]];
    if (q && !q.fuera) { e.inicio = i; break; }
  }
  e.turno = 0;
  const orden = ordenHoy(e);
  const i = orden.findIndex((id) => { const q = e.jugadores[id]; return q && !q.fuera && q.pa > 0; });
  if (i > 0) e.turno = i;
}

/* ------------------------------------------------------------------ */
/*  LEGALIDAD                                                          */
/* ------------------------------------------------------------------ */
export function legales(e, pid) {
  const p = e.jugadores[pid];
  const out = [];
  if (!p || p.fuera || p.eliminado || e.fin) return out;
  const humoActivo = e.salas[p.sala]?.humoHasta != null && e.dia === e.salas[p.sala].humoHasta;

  /* Coger cuesta 0 fichas: se permite incluso con pa=0 y aunque el turno
     ya haya pasado, para que registrar con la última acción no deje la
     mirada pagada sin poder aprovecharse. */
  {
    const sala = e.salas[p.sala];
    const libres = [];
    if (!p.mano) libres.push("mano");
    if (!p.bolsa) libres.push("bolsa");
    const oCogible = (id) => {
      if (!id) return false;
      const o = e.objetos[id];
      if (!o) return false;
      if (o.dueño === pid && (o.tipo === "rasgo" || o.tipo === "situacion")) return false;
      if (p.bien[id]) return false;
      return true;
    };
    const coste = (sitio) => COSTE.coger + (sitio === "bolsa" ? COSTE_BOLSA : 0);
    const sitios = libres.filter((s) => p.pa >= coste(s));

    /* Objetos del centro: ya son visibles sin registrar, se pueden coger directamente. */
    if (!humoActivo && sitios.length) {
      for (const id of sala.centro) {
        if (!oCogible(id)) continue;
        for (const sitio of sitios)
          out.push({ tipo: "coger", obj: id, de: "centro", sitio, info: ver(e, id) });
      }
    }

    /* Huecos abiertos por registro: requieren mirada activa y límite de 2 cogidos. */
    const m = p.mirada && p.mirada.sala === p.sala ? p.mirada : null;
    const cogidos = m ? (m.cogidos ?? (m.cogido ? 1 : 0)) : 0;
    if (!humoActivo && sitios.length && m && cogidos < 2) {
      const deHueso = m.abiertos.map((i) => sala.escondidos[i]).filter(Boolean);
      for (const id of deHueso) {
        if (!oCogible(id)) continue;
        for (const sitio of sitios)
          out.push({ tipo: "coger", obj: id, de: "hueco", sitio, info: ver(e, id) });
      }
    }
  }

  /* Indagar es gratis: se permite fuera de turno igual que coger a la mano. */
  {
    const nombresDichos = [...new Set(p.dichos.filter((d) => !d.usado).map((d) => d.nombre))];
    for (const nombre of nombresDichos)
      if (
        dichosIndagables(p, nombre).length >= 2 &&
        /* Con los tres rasgos en el cuaderno no hay nada que revelar: el botón
           no se ofrece en vez de quedarse muerto al pulsarlo. */
        e.tema.rasgos.some((r) => !(r in (p.sabe[nombre] || {})))
      )
        out.push({ tipo: "indagar", sobre: nombre });
  }

  /* De uno en uno: si no es tu turno no hay nada más que hacer. */
  if (pid !== aQuienLeToca(e)) return out;

  /* Cotillear cuesta 1 ficha y solo ocurre 1 vez por jornada por jugador.
     Eliges a quién preguntar (con) y sobre quién (sobre). Si el que responde
     no sabe nada de esa persona, da un cotilleo aleatorio. */
  const yaCotilleo = e.sucesos.some(
    (s) => s.tipo === "cotillear" && s.dia === e.dia && s.quien === pid
  );
  if (!yaCotilleo && p.pa >= COSTE.cotillear) {
    /* Se pregunta por un nombre de la mesa, el tuyo no: nadie pregunta por sí
       mismo. Ni se ofrecen los nombres ya cerrados ni los que tienen dos
       cotilleos esperando indagar. */
    const nombres = jugadores(e)
      .filter((s) => s.id !== pid && !s.fuera)
      .map((s) => s.nombre)
      .filter(
        (nombre) =>
          !cotilleoCerrado(p, nombre, e.tema.rasgos) &&
          dichosIndagables(p, nombre).length < 2
      );
    for (const q of jugadores(e)) {
      if (q.id === pid || q.fuera || q.sala !== p.sala) continue;
      /* Solo se ofrece la charla con quien sabe algo de alguien: da igual de
         quién, incluso de ti. Si no sabe nada de nadie —el caso de todos en la
         primera jornada—, no hay conversación que ofrecer. Lo que salga de ahí
         ya lo elige la charla: si sabe del nombre preguntado, ese nombre y una
         propina de otra persona; si no, uno al azar que tú no tengas. */
      if (!sabeAlgo(q)) continue;
      for (const nombre of nombres) out.push({ tipo: "cotillear", con: q.id, sobre: nombre });
    }
  }

  /* Indagar: se añade antes de la guarda de turno (bloque libre arriba). */

  /* Pasar: acabas la jornada sin gastar lo que te queda. Con turnos hace
     falta, o el que no quiere hacer nada tendría que quemar una ficha. */
  if (p.pa > 0) out.push({ tipo: "pasar" });

  const sala = e.salas[p.sala];
  const testigos = presentes(e, p.sala).filter((q) => q.id !== pid);
  const libres = [];
  if (!p.mano) libres.push("mano");
  if (!p.bolsa) libres.push("bolsa");

  if (p.pa < 1) return out;

  /* Moverse: a una contigua, si existe ya y la puerta está abierta. Bloqueado si atado.
     Con capa activa el movimiento es gratis (pa=0 lo gestiona el ejecutar). */
  if (!(p.atadoHasta != null && p.atadoHasta >= e.dia)) {
    if (p.capa || p.pa >= COSTE.mover)
      for (const dest of e.tema.salas[p.sala].salidas)
        if (abierta(e, dest) && !cerrada(e, p.sala, dest)) out.push({ tipo: "mover", a: dest });
  }

  /* Registrar: toda la sala de golpe (registroTotal) o dos huecos por acción. */
  if (!humoActivo && e.registroTotal) {
    out.push({ tipo: "registrar" });
  } else if (!humoActivo) {
    const parejas = [];
    for (let i = 0; i < sala.huecos; i++)
      for (let j = i + 1; j < sala.huecos; j++) parejas.push([i, j]);
    for (const par of parejas) out.push({ tipo: "registrar", ver: par });
  }

  /* Usar lo que llevas encima. Al usarlo con éxito respawnea solo: no hay esconder.
     Bloqueado en sala con humo. */
  if (!humoActivo) {
    for (const id of objetosDe(p)) {
      const o = e.objetos[id];
      if (o.tipo !== "habilidad" && o.dueño !== pid && !p.bien[id])
        out.push({ tipo: "usar", obj: id });
    }
  }

  /* Guardar en la bolsa: de la mano a la bolsa. */
  if (p.mano && !p.bolsa) out.push({ tipo: "guardar" });

  /* Cambiar la mano por la bolsa. Con la bolsa ocupada no hay otra forma de
     mover nada de sitio —«guardar» pide la bolsa vacía—, y quedarse con las
     dos llenas y sin poder hacer el cambio era un callejón sin salida. */
  if (p.bolsa) out.push({ tipo: "cambiar" });

  /* Tirar una habilidad: sale de tus manos y la casa la repone al amanecer,
     igual que si la hubieras gastado. Sirve para hacer sitio cuando la
     herramienta que llevas no te sirve. No cuesta ficha. */
  for (const id of objetosDe(p)) {
    if (e.objetos[id]?.tipo === "habilidad") out.push({ tipo: "tirar", obj: id });
  }

  /* Soltar un objeto de los de siempre: te lo quitas de encima y la casa lo
     vuelve a esconder en otra estancia, así que no queda donde estabas ni se
     puede seguir la pista por el hueco. Cuesta una ficha —esconderlo en la
     sala también— y es lo que saca del callejón de la mano y la bolsa llenas
     sin tener que gastar dos acciones. Las habilidades no se ofrecen aquí:
     ya se tiran gratis. */
  for (const id of objetosDe(p)) {
    if (e.objetos[id]?.tipo !== "habilidad") out.push({ tipo: "soltar", obj: id });
  }

  /* Robar: desde el día 3 y con ganzúa. Bloqueado en sala con humo. */
  if (!humoActivo && e.dia >= DIA_HABILIDADES && tiene(p, e, "ganzua")) {
    for (const q of testigos) {
      if (q.mano) {
        const info = ver(e, q.mano);
        if (!p.mano)
          out.push({ tipo: "robar", a: q.id, de: "mano", obj: q.mano, sitio: "mano", info });
        if (!p.bolsa)
          out.push({ tipo: "robar", a: q.id, de: "mano", obj: q.mano, sitio: "bolsa", info });
      }
      if (!p.mano) out.push({ tipo: "robar", a: q.id, de: "bolsa", sitio: "mano" });
      if (!p.bolsa) out.push({ tipo: "robar", a: q.id, de: "bolsa", sitio: "bolsa" });
    }
  }

  /* Reclamar: bloqueado en sala con humo. Si alguien lleva en la mano un objeto tuyo, te da un rasgo de quien elijas.
     El objeto se queda con ellos. Una acción por cada personaje sobre el que pueden darte info. */
  if (!humoActivo) {
    for (const q of testigos) {
      const o = q.mano ? e.objetos[q.mano] : null;
      if (!o || o.dueño !== pid || o.reclamado) continue;
      out.push({ tipo: "reclamar", a: q.id, obj: o.id, sobre: null });
    }
  }

  /* Interrogar con la lupa. Bloqueado en sala con humo. */
  if (!humoActivo && tiene(p, e, "lupa"))
    for (const q of testigos) {
      const sabeCosas = Object.values(q.sabe).some((f) => Object.keys(f).length > 0);
      if (sabeCosas) out.push({ tipo: "interrogar", a: q.id });
    }

  /* Guantes: turbo gratuito, +2 PA en este turno. */
  if (tiene(p, e, "manos")) out.push({ tipo: "habilidad", cual: "manos" });

  /* Copa: brindar con todos los presentes — ellos pierden 1 PA, tú ganas 1 por cada uno. */
  if (tiene(p, e, "vaso") && presentes(e, p.sala).filter(q => q.id !== pid).length > 0)
    out.push({ tipo: "habilidad", cual: "vaso" });

  /* Antorcha: pasadizo secreto a cualquier sala abierta. */
  if (tiene(p, e, "antorcha")) {
    for (const id of Object.keys(e.tema.salas).filter(id => abierta(e, id) && id !== p.sala))
      out.push({ tipo: "habilidad", cual: "antorcha", hacia: id });
  }

  /* Tranca, vaso y destrancar cerrojo. */
  /* Golpear con la tranca a un jugador presente en la sala. */
  if (tiene(p, e, "tranca")) {
    for (const q of presentes(e, p.sala).filter((q) => q.id !== pid && !(q.aturdidoHasta != null && (q.penalizacionPA ?? 3) >= 3)))
      out.push({ tipo: "habilidad", cual: "tranca", a: q.id });
  }
  for (const dest of e.tema.salas[p.sala].salidas) {
    if (!abierta(e, dest)) continue;
    if (!cerrada(e, p.sala, dest) && tiene(p, e, "tranca"))
      out.push({ tipo: "habilidad", cual: "tranca", hacia: dest });
    if (cerrada(e, p.sala, dest) && tiene(p, e, "ganzua"))
      out.push({ tipo: "destrancar", hacia: dest });
  }

  /* Cepo: solo si estás solo en la sala y no hay ya un cepo puesto. */
  if (tiene(p, e, "cepo") &&
      presentes(e, p.sala).filter((q) => q.id !== pid).length === 0 &&
      !e.salas[p.sala].cepo)
    out.push({ tipo: "habilidad", cual: "cepo" });

  /* Capa: movimiento gratis, si no está ya activa. */
  if (tiene(p, e, "capa") && !p.capa)
    out.push({ tipo: "habilidad", cual: "capa" });

  /* Frasco de humo: siempre que lo tengas. */
  if (tiene(p, e, "humo"))
    out.push({ tipo: "habilidad", cual: "humo" });

  /* Cuerda: un botón por persona presente. */
  if (tiene(p, e, "cuerda"))
    for (const q of presentes(e, p.sala).filter((q) => q.id !== pid))
      out.push({ tipo: "habilidad", cual: "cuerda", a: q.id });

  /* Empujón: una opción por víctima × destino abierto desde la sala. */
  if (tiene(p, e, "empujon")) {
    for (const q of presentes(e, p.sala).filter((q) => q.id !== pid)) {
      for (const dest of e.tema.salas[p.sala].salidas)
        if (abierta(e, dest) && !cerrada(e, p.sala, dest))
          out.push({ tipo: "habilidad", cual: "empujon", a: q.id, hacia: dest });
    }
  }

  if (e.tema.salas[p.sala].puerta && p.bloqueadoSalir !== e.dia) out.push({ tipo: "salir" });

  return out;
}

function mismo(a, b, campo) {
  /* `sobre` distingue preguntar por alguien de una charla general: null no
     es lo mismo que una persona. */
  if (campo === "sobre") return (a[campo] ?? null) === (b[campo] ?? null);
  if (campo === "de") return (a[campo] ?? "mano") === (b[campo] ?? "mano");
  if (!(campo in a)) return true;
  if (campo === "coger") return (a[campo] ?? null) === (b[campo] ?? null);
  if (campo === "ver") {
    const x = a[campo];
    const y = b[campo];
    return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return a[campo] === b[campo];
}

export function esLegal(e, pid, accion) {
  if (!accion || typeof accion !== "object") return false;
  const p = e.jugadores[pid];
  if (!p || p.fuera || e.fin) return false;
  /* Coger a la mano cuesta 0 y se permite aunque no sea tu turno (legales lo
     incluye en el bloque de acciones libres). Para el resto sí se exige turno. */
  const esLibre = (accion.tipo === "coger" && accion.sitio === "mano") || accion.tipo === "indagar";
  if (!esLibre && pid !== aQuienLeToca(e)) return false;

  if (accion.tipo === "salir") {
    /* El fallo de la salida es de verdad, no solo un botón que se esconde:
       quien lo intentó y se equivocó no vuelve a la puerta hasta el amanecer,
       ni con una acción libre ni reenviando la jugada. */
    if (!e.tema.salas[p.sala].puerta || p.pa < 1 || p.bloqueadoSalir === e.dia) return false;
    const n = jugadores(e).length;
    const d = accion.dichos;
    /* Hay que decir todos los nombres, no N−2: los N−1 rivales y, al final,
       el tuyo. El que no se atreva a decir uno, no sale. */
    if (!Array.isArray(d) || d.length !== n) return false;
    const otros = jugadores(e).filter((q) => q.id !== pid);
    const apodos = new Set(otros.map((q) => q.apodo));
    const nombres = new Set(jugadores(e).map((q) => q.nombre));
    const vistos = new Set();
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (!x || !nombres.has(x.nombre)) return false;
      if (i === d.length - 1) {
        if (x.apodo !== p.apodo || x.nombre !== p.nombre) return false;
      } else {
        if (!apodos.has(x.apodo) || vistos.has(x.apodo)) return false;
        vistos.add(x.apodo);
      }
    }
    return vistos.size === n - 1;
  }

  return legales(e, pid).some(
    (a) =>
      a.tipo === accion.tipo &&
      mismo(a, accion, "a") &&
      mismo(a, accion, "obj") &&
      mismo(a, accion, "de") &&
      mismo(a, accion, "con") &&
      mismo(a, accion, "sobre") &&
      mismo(a, accion, "cual") &&
      mismo(a, accion, "hacia") &&
      mismo(a, accion, "ver") &&
      mismo(a, accion, "coger") &&
      mismo(a, accion, "sitio") &&
      mismo(a, accion, "recuperar")
  );
}

/* ------------------------------------------------------------------ */
/*  APLICAR                                                            */
/* ------------------------------------------------------------------ */
export function aplicar(e, pid, accion) {
  if (!esLegal(e, pid, accion))
    throw new Error(`acción ilegal: ${pid} ${JSON.stringify(accion)}`);

  const p = e.jugadores[pid];
  const antes = e.sucesos.length;

  if (accion.tipo !== "mover") p.capa = 0;

  switch (accion.tipo) {
    case "mover": {
      const pa = pagar(e, p, p.capa ? 0 : COSTE.mover);
      const de = p.sala;
      if (p.capa) { p.capa--; if (p.capa === 0) p.capa = false; }
      p.mirada = null;
      p.sala = accion.a;
      p.escucha = null;
      caducarAvisos(e, pid);
      ev(e, { tipo: "mover", quien: pid, de, a: accion.a, pa });
      /* Cepo: quien entra en la sala queda inmovilizado el resto de esta jornada (salvo quien lo puso). */
      const cepo = e.salas[p.sala].cepo;
      if (cepo && cepo.puestoPor !== pid) {
        p.atadoHasta = e.dia;
        delete e.salas[p.sala].cepo;
        ev(e, { tipo: "cepo_activado", quien: pid, sala: p.sala });
      }
      break;
    }

    case "registrar": {
      const sala = e.salas[p.sala];
      const testigos = presentes(e, p.sala).filter((q) => q.id !== pid).map((q) => q.id);
      const pa = pagar(e, p, COSTE.registrar);
      let abiertos, vistos, cajas;
      /* Objetos invisibles al registrar: propios (rasgo o situación) o ya usados con éxito */
      const oculto = (id) => {
        if (!id) return false;
        const o = e.objetos[id];
        if (!o) return false;
        if (o.dueño === pid && (o.tipo === "rasgo" || o.tipo === "situacion")) return true;
        if (p.bien[id]) return true;
        return false;
      };
      if (e.registroTotal || !accion.ver) {
        /* Toda la sala de golpe */
        abiertos = Array.from({ length: sala.huecos }, (_, k) => k);
        vistos = sala.escondidos.filter((id) => id && !oculto(id));
        cajas = abiertos.map((k) => ({ hueco: k, obj: oculto(sala.escondidos[k]) ? null : (sala.escondidos[k] ?? null) }));
      } else {
        /* Dos huecos elegidos */
        const [i, j] = accion.ver;
        vistos = [sala.escondidos[i], sala.escondidos[j]].filter((id) => id && !oculto(id));
        cajas = accion.ver.map((k) => ({ hueco: k, obj: oculto(sala.escondidos[k]) ? null : (sala.escondidos[k] ?? null) }));
        const antes = p.visto[p.sala];
        const mismoDia = !!(antes && antes.dia === e.dia);
        abiertos = mismoDia ? [...new Set([...antes.abiertos, i, j])] : [i, j];
      }
      p.visto[p.sala] = {
        dia: e.dia,
        abiertos,
        ids: [...new Set([...vistos, ...sala.centro])],
      };
      if (!p.huecosVistos) p.huecosVistos = {};
      p.huecosVistos[p.sala] = [...new Set([...(p.huecosVistos[p.sala] || []), ...abiertos])];
      p.mirada = { sala: p.sala, dia: e.dia, abiertos, cogido: false, cogidos: 0, vistos, cajas };
      ev(e, {
        tipo: "registrar",
        quien: pid,
        sala: p.sala,
        ver: abiertos,
        vistos,
        cajas,
        testigos,
        pa,
      });
      break;
    }

    case "coger": {
      const testigos = presentes(e, p.sala).filter((q) => q.id !== pid).map((q) => q.id);
      const extra = accion.sitio === "bolsa" ? COSTE_BOLSA : 0;
      const pa = pagar(e, p, COSTE.coger + extra);
      const o = e.objetos[accion.obj];
      const de = o.donde === "escondido" ? "hueco" : "centro";
      quitarDeSala(e, o);
      p[accion.sitio] = o.id;
      o.donde = accion.sitio;
      o.portador = pid;
      o.reclamado = false; /* acarreo nuevo: el dueño puede volver a reclamarlo */
      if (o.tipo !== "habilidad") o.acarreo = o.dueño === pid ? ACARREO : ACARREO_AJENO;
      /* El registro aguanta dos cogidas de los huecos: la primera y la
         segunda. A la tercera hay que volver a registrar (y pagar). Lo del
         centro no gasta registro. */
      if (de === "hueco" && p.mirada) {
        const cogidos = (p.mirada.cogidos ?? (p.mirada.cogido ? 1 : 0)) + 1;
        p.mirada.cogidos = cogidos;
        p.mirada.cogido = cogidos >= 2;
        if (cogidos >= 2) p.mirada = null;
      }
      ev(e, {
        tipo: "coger",
        quien: pid,
        obj: o.id,
        de,
        sala: p.sala,
        sitio: accion.sitio,
        testigos,
        extra,
        pa,
      });
      break;
    }

    case "usar": {
      const pa = pagar(e, p, COSTE.usar);
      const o = e.objetos[accion.obj];
      const testigos = presentes(e, p.sala).filter((q) => q.id !== pid).map((q) => q.id);
      let resultado = "nada";
      let dado = null;

      if (o.tipo === "rasgo") {
        if (o.sirveEn !== p.sala) {
          p.intentos.push({ obj: o.id, sala: p.sala });
          resultado = "fallo";
        } else if (o.dueño === pid) {
          resultado = "propio";
        } else {
          const dueño = e.jugadores[o.dueño];
          aprender(p, dueño.nombre, o.rasgo, o.valor);
          p.bien[o.id] = p.sala;
          resultado = "bien";
          dado = { nombre: dueño.nombre, rasgo: o.rasgo, valor: o.valor };
          /* Respawn: se suelta donde no puedas volver a leerlo. Nunca queda
             en tu mano ni en la sala donde acabas de sacarle el dato. */
          if (p.mano === o.id) p.mano = null; else p.bolsa = null;
          const destino = respawnear(e, o, p.sala) ?? p.sala;
          meterEnSala(e, o, destino);
        }
      } else if (o.tipo === "situacion") {
        if (o.sirveEn !== p.sala) {
          p.intentos.push({ obj: o.id, sala: p.sala });
          resultado = "fallo";
        } else if (o.dueño === pid) {
          resultado = "propio";
        } else {
          const dueño = e.jugadores[o.dueño];
          p.sabeDonde[dueño.nombre] = dueño.fuera ? null : dueño.sala;
          p.sabeDondeDia[dueño.nombre] = e.dia;
          p.bien[o.id] = p.sala;
          resultado = "bien";
          dado = { nombre: dueño.nombre, sala: dueño.fuera ? null : dueño.sala };
          /* Respawn */
          if (p.mano === o.id) p.mano = null; else p.bolsa = null;
          const destino = respawnear(e, o, p.sala) ?? p.sala;
          meterEnSala(e, o, destino);
        }
      }

      ev(e, { tipo: "usar", quien: pid, obj: o.id, sala: p.sala, resultado, dado, testigos, pa });
      break;
    }

    case "esconder": {
      const pa = pagar(e, p, COSTE.esconder);
      const o = e.objetos[accion.obj];
      const testigos = presentes(e, p.sala).filter((q) => q.id !== pid).map((q) => q.id);
      if (p.mano === o.id) p.mano = null;
      else p.bolsa = null;
      meterEnSala(e, o, p.sala);
      ev(e, {
        tipo: "esconder",
        quien: pid,
        obj: o.id,
        sala: p.sala,
        centro: o.donde === "centro",
        testigos,
        pa,
      });
      break;
    }

    case "soltar": {
      const pa = pagar(e, p, COSTE.soltar);
      const o = e.objetos[accion.obj];
      if (p.mano === o.id) p.mano = null;
      else if (p.bolsa === o.id) p.bolsa = null;
      if (o.enSala && e.salas[o.enSala]) quitarDeSala(e, o);
      const destino = respawnear(e, o, p.sala) ?? p.sala;
      meterEnSala(e, o, destino);
      ev(e, { tipo: "soltar", quien: pid, obj: o.id, sala: p.sala, voluntario: true, pa });
      break;
    }

    case "guardar": {
      const pa = pagar(e, p, COSTE.guardar);
      const o = e.objetos[p.mano];
      p.bolsa = o.id;
      p.mano = null;
      o.donde = "bolsa";
      ev(e, { tipo: "guardar", quien: pid, obj: o.id, pa });
      break;
    }

    case "cambiar": {
      /* Una acción para las dos direcciones: lo que estaba en la mano baja a
         la bolsa y lo que estaba en la bolsa sube a la mano. Quien lo ve, ve
         las dos cosas: por eso el suceso lleva las dos, y no solo una. */
      const pa = pagar(e, p, COSTE.cambiar);
      const testigos = presentes(e, p.sala).filter((q) => q.id !== pid).map((q) => q.id);
      const guarda = p.mano;
      const saca = p.bolsa;
      p.mano = saca;
      p.bolsa = guarda;
      if (saca) { const o = e.objetos[saca]; o.donde = "mano"; o.portador = pid; }
      if (guarda) { const o = e.objetos[guarda]; o.donde = "bolsa"; o.portador = pid; }
      ev(e, { tipo: "cambiar", quien: pid, sala: p.sala, guarda, saca, testigos, pa });
      break;
    }

    case "robar": {
      const pa = pagar(e, p, COSTE.robar);
      const q = e.jugadores[accion.a];
      const de = accion.de ?? "mano";
      /* La mano se roba a sabiendas; la bolsa, a ciegas. Si no hay nada,
         la ganzúa se gasta igual. */
      const id = de === "mano" ? accion.obj : q.bolsa;
      const o = id ? e.objetos[id] : null;
      if (de === "mano") q.mano = null;
      else if (q.bolsa) q.bolsa = null;
      if (o) {
        p[accion.sitio] = o.id;
        o.donde = accion.sitio;
        o.portador = pid;
        o.reclamado = false; /* el ladrón es un portador nuevo: vuelve a deber la pista */
        o.acarreo = o.dueño === pid ? ACARREO : ACARREO_AJENO;
      }
      gastarHabilidad(e, p, "ganzua");
      ev(e, {
        tipo: "robar",
        quien: pid,
        a: q.id,
        obj: o ? o.id : null,
        de,
        sitio: accion.sitio,
        fallo: !o,
        pa,
      });
      break;
    }

    case "reclamar": {
      const pa = pagar(e, p, COSTE.reclamar);
      const q = e.jugadores[accion.a];
      const o = e.objetos[accion.obj];
      o.reclamado = true;
      const pool = rasgosDesconocidos(e, p);
      const rd = pool.length ? elegir(e, pool) : null;
      if (rd) aprender(p, rd.nombre, rd.rasgo, rd.valor);
      ev(e, { tipo: "reclamar", quien: pid, a: q.id, obj: o.id, dado: rd, pa });
      break;
    }

    case "interrogar": {
      const pa = pagar(e, p, COSTE.interrogar);
      const q = e.jugadores[accion.a];
      gastarHabilidad(e, p, "lupa");
      /* La casa da un rasgo al azar que p no tenga: no depende de lo que sepa q. */
      const pool = rasgosDesconocidos(e, p);
      const d = pool.length ? elegir(e, pool) : null;
      if (d) aprender(p, d.nombre, d.rasgo, d.valor);
      const dado = d;
      ev(e, { tipo: "interrogar", quien: pid, a: q.id, dado, pa });
      break;
    }

    case "habilidad": {
      if (accion.cual === "capa") {
        pagar(e, p, COSTE.habilidad);
        p.capa = 4;
        gastarHabilidad(e, p, "capa");
        ev(e, { tipo: "habilidad", cual: "capa", quien: pid, sala: p.sala, pa: COSTE.habilidad });
        break;
      }
      if (accion.cual === "manos") {
        p.pa += 2;
        gastarHabilidad(e, p, "manos");
        ev(e, { tipo: "manos", quien: pid, sala: p.sala });
        break;
      }
      if (accion.cual === "antorcha") {
        const deSala = p.sala;
        p.mirada = null;
        p.escucha = null;
        p.sala = accion.hacia;
        caducarAvisos(e, pid);
        gastarHabilidad(e, p, "antorcha");
        ev(e, { tipo: "pasadizo", quien: pid, de: deSala, a: accion.hacia });
        break;
      }
      const pa = pagar(e, p, COSTE.habilidad);
      if (accion.cual === "tranca" && accion.a) {
        /* Golpear a un jugador presente: pierde 3 PA en su próximo turno. */
        const victima = e.jugadores[accion.a];
        if (victima && !victima.fuera && !(victima.aturdidoHasta != null && (victima.penalizacionPA ?? 3) >= 3)) {
          /* Si ya jugó hoy, se aplica mañana; si aún no jugó, hoy mismo. */
          const ordenHoyArr = ordenHoy(e);
          const iVictima = ordenHoyArr.indexOf(accion.a);
          const iTocando = ordenHoyArr.indexOf(pid);
          const yaJugoHoy = iVictima >= 0 && iVictima <= iTocando;
          victima.aturdidoHasta = yaJugoHoy ? e.dia + 1 : e.dia;
        }
        gastarHabilidad(e, p, "tranca");
        ev(e, { tipo: "golpe", quien: pid, a: accion.a, aApodo: victima.apodo, sala: p.sala, pa });
      } else if (accion.cual === "tranca") {
        /* Cerrada lo que queda de hoy y toda la jornada siguiente. */
        e.puertas[clavePuerta(p.sala, accion.hacia)] = e.dia + 1;
        gastarHabilidad(e, p, "tranca");
        ev(e, { tipo: "tranca", quien: pid, de: p.sala, a: accion.hacia, pa });
      } else if (accion.cual === "vaso") {
        const ordenHoyArr = ordenHoy(e);
        const iTocando = ordenHoyArr.indexOf(pid);
        const afectados = presentes(e, p.sala).filter(q => q.id !== pid);
        for (const q of afectados) {
          const iVictima = ordenHoyArr.indexOf(q.id);
          const yaJugoHoy = iVictima >= 0 && iVictima <= iTocando;
          q.aturdidoHasta = yaJugoHoy ? e.dia + 1 : e.dia;
          q.penalizacionPA = 1;
        }
        p.pa += afectados.length;
        gastarHabilidad(e, p, "vaso");
        ev(e, { tipo: "brindar", quien: pid, sala: p.sala, afectados: afectados.map(q => q.id), pa });
      } else if (accion.cual === "cepo") {
        e.salas[p.sala].cepo = { puestoPor: pid };
        gastarHabilidad(e, p, "cepo");
        ev(e, { tipo: "cepo_puesto", quien: pid, sala: p.sala, pa });
      } else if (accion.cual === "humo") {
        e.salas[p.sala].humoHasta = e.dia + 1;
        gastarHabilidad(e, p, "humo");
        ev(e, { tipo: "humo", quien: pid, sala: p.sala, pa });
      } else if (accion.cual === "cuerda") {
        const victima = e.jugadores[accion.a];
        if (victima && !victima.fuera) {
          const ordenHoyArr = ordenHoy(e);
          const iVictima = ordenHoyArr.indexOf(accion.a);
          const iTocando = ordenHoyArr.indexOf(pid);
          const yaJugoHoy = iVictima >= 0 && iVictima <= iTocando;
          victima.atadoHasta = yaJugoHoy ? e.dia + 1 : e.dia;
        }
        gastarHabilidad(e, p, "cuerda");
        ev(e, { tipo: "atar", quien: pid, a: accion.a, aApodo: victima?.apodo, sala: p.sala, pa });
      } else if (accion.cual === "empujon") {
        const victima = e.jugadores[accion.a];
        if (victima && !victima.fuera && victima.sala === p.sala) {
          victima.sala = accion.hacia;
          victima.mirada = null;
          victima.escucha = null;
          caducarAvisos(e, victima.id);
        }
        gastarHabilidad(e, p, "empujon");
        ev(e, { tipo: "empujon", quien: pid, a: accion.a, aApodo: victima?.apodo, de: p.sala, hacia: accion.hacia, pa });
      }
      break;
    }

    case "destrancar": {
      const pa = pagar(e, p, COSTE.habilidad);
      const claveD = clavePuerta(p.sala, accion.hacia);
      e.cerrojadas.delete(claveD);
      delete e.puertas[claveD];
      gastarHabilidad(e, p, "ganzua");
      ev(e, { tipo: "destrancar", quien: pid, de: p.sala, a: accion.hacia, pa });
      break;
    }

    case "salir": {
      const pa = pagar(e, p, COSTE.salir);
      const aciertos = accion.dichos.every((d) => {
        const q = jugadores(e).find((x) => x.apodo === d.apodo);
        return q && q.nombre === d.nombre;
      });
      ev(e, { tipo: "salida", quien: pid, dichos: accion.dichos, aciertos, pa });
      if (aciertos) {
        p.fuera = true;
        for (const id of objetosDe(p)) {
          const o = e.objetos[id];
          o.donde = "fuera";
          o.portador = null;
        }
        p.mano = null;
        p.bolsa = null;
        e.ganador = pid;
        e.fin = "salida";
      } else {
        /* Fallo: bloquea salir durante esta jornada. El jugador sigue en la
           partida y puede actuar el resto del turno. Al amanecer el bloqueo
           desaparece solo (bloqueadoSalir se borra con pa). */
        p.bloqueadoSalir = e.dia;
      }
      break;
    }

    case "cotillear": {
      const pa = pagar(e, p, COSTE.cotillear);
      const q = e.jugadores[accion.con];
      /* A pregunta a B por un nombre. Si B sabe de ese nombre, el cotilleo va
         sobre él y además suelta otro de alguien distinto; si no sabe, solo hay
         uno al azar. Solo A recibe la charla. */
      const ida = null;
      const pedido = accion.sobre ?? null;
      /* Lo que sabe el que responde solo decide si has acertado o no; el
         cotilleo lo sirve la casa, así que siempre hay uno que no tengas. */
      const conocidas = pedido ? sabeDe(q, p, pedido) : [];
      const acierto = conocidas.length > 0;
      /* Al acertar, la vuelta sale del pool de la casa filtrado al nombre pedido
         (lo que tú aún no tienes de esa persona), no de lo que sabe B. */
      const vuelta = acierto
        ? (() => {
            const frescasDePedido = opcionesFrescas(e, p, { sin: q.id }).filter(d => d.nombre === pedido);
            return frescasDePedido.length
              ? anotarDicho(e, q, p, elegir(e, frescasDePedido))
              : dichoFresco(e, q, p);
          })()
        : dichoFresco(e, q, p, { otroQue: pedido });
      /* El bonus de acertar es de otra persona: nunca repite la que acabas de
         oír. */
      const bonus = acierto && vuelta ? dichoFresco(e, q, p, { otroQue: vuelta.nombre }) : null;
      /* Quien escucha por la pared se lleva una pista suelta de lo dicho, nunca
         una que ya tuviera. Llega como dicho y con el nombre del que la contó:
         también puede ser mentira. */
      const oyenPista = {};
      for (const id of oyentesDe(e, pid, [p.sala])) {
        const t = e.jugadores[id];
        const pista = [ida, vuelta, bonus].find(
          (d) =>
            d &&
            d.nombre !== t.nombre &&
            !(t.sabe[d.nombre] && d.rasgo in t.sabe[d.nombre]) &&
            !t.dichos.some((x) => x.nombre === d.nombre && x.rasgo === d.rasgo)
        );
        if (!pista) continue;
        const copia = { ...pista, dia: e.dia };
        aprenderDicho(t, copia);
        oyenPista[id] = copia;
      }
      ev(e, {
        tipo: "cotillear", quien: pid, sala: p.sala, con: q.id, sobre: accion.sobre ?? null,
        acierto, ida, vuelta, bonus, oyenPista, pa,
      });
      break;
    }

    case "indagar": {
      /* 2 cotilleos de fuentes distintas sobre alguien → revela el primer rasgo
         que aún no tienes confirmado de esa persona. El contenido de los cotilleos
         no importa: son solo el requisito de acceso. */
      const nombre = accion.sobre;
      const candidatos = dichosIndagables(p, nombre);
      if (candidatos.length < 2) break;
      const sujeto = jugadores(e).find((x) => x.nombre === nombre);
      if (!sujeto) break;
      const yaConocidos = p.sabe[nombre] || {};
      const kRasgo = e.tema.rasgos.find((r) => !(r in yaConocidos));
      if (!kRasgo) break; /* ya lo sabe todo: no hay nada que revelar */
      const valorReal = sujeto.rasgos[kRasgo];
      aprender(p, nombre, kRasgo, valorReal);
      let usados = 0;
      for (const d of candidatos) {
        if (usados >= 2) break;
        d.usado = true;
        usados++;
      }
      ev(e, { tipo: "indagar", quien: pid, sobre: nombre, rasgo: kRasgo, valor: valorReal, pa: 0 });
      break;
    }

    case "tirar": {
      const o = e.objetos[accion.obj];
      if (!o || o.portador !== p.id || o.tipo !== "habilidad")
        throw new Error("no llevas esa habilidad");
      const pagado = pagar(e, p, COSTE.tirar);
      for (const slot of ["mano", "bolsa"]) {
        if (p[slot] === o.id) p[slot] = null;
      }
      o.donde = "gastado";
      o.portador = null;
      o.enSala = null;
      o.hueco = null;
      /* Como una habilidad gastada: vuelve al amanecer, no en el acto. */
      (e.reponer ||= []).push({ nombre: o.nombre, clase: o.clase });
      ev(e, { tipo: "tirar", quien: pid, obj: o.id, sala: p.sala, pa: pagado });
      break;
    }

    case "pasar": {
      /* Se acaba la jornada para ti: lo que quede se pierde. Sin esto, el que
         no quiere hacer nada tendría que quemar fichas para dejar el sitio. */
      const pa = p.pa;
      p.pa = 0;
      p.gastadoHoy += pa; /* las fichas perdidas también cuentan como gastadas */
      ev(e, { tipo: "pasar", quien: pid, pa });
      break;
    }

    default:
      throw new Error(`acción desconocida: ${accion.tipo}`);
  }

  /* El turno pasa al siguiente en cuanto el que jugaba se queda sin fichas o
     pasa. Las acciones libres (coger a mano, indagar) no avanzan el turno aunque
     el jugador tenga 0 PA: ya se avanzó cuando terminó su turno real. */
  const esAccionLibre = (accion.tipo === "coger" && accion.sitio === "mano") || accion.tipo === "indagar";
  if (!e.fin && !esAccionLibre && (p.pa <= 0 || accion.tipo === "pasar")) pasarTurno(e);

  /* Lo visto hasta aquí ya está contado: cuando vuelva a jugar, «mientras
     esperabas» empieza donde acaba esta acción. */
  p.esperaDesde = e.sucesos.length;

  /* Los sucesos vuelven sin `oyen` ni `oyenPista`: quién estaba escuchando y
     qué se llevó es cosa del que escucha, no del que hizo el gesto. */
  return e.sucesos.slice(antes).map(({ oyen, oyenPista, ...s }) => s);
}

/* ------------------------------------------------------------------ */
/*  EL RELOJ                                                           */
/* ------------------------------------------------------------------ */
export function amanecer(e) {
  if (e.fin) return;

  e.dia += 1;
  for (const p of jugadores(e)) {
    p.pa = e.paPorDia;
    if (p.aturdidoHasta === e.dia) {
      p.pa = Math.max(0, p.pa - (p.penalizacionPA ?? 3));
      p.aturdidoHasta = null;
      p.penalizacionPA = null;
    }
    if (p.atadoHasta != null && p.atadoHasta < e.dia) p.atadoHasta = null;
    p.gastadoHoy = 0;
    p.hablado = [];
    p.oido = null;
    p.escucha = null;
  }
  for (const s of Object.values(e.salas)) {
    if (s.humoHasta != null && s.humoHasta < e.dia) s.humoHasta = null;
  }
  /* La jornada nueva la abre el siguiente de la mesa: asi ninguno llega
     siempre primero a los huecos. */
  girarInicio(e);

  /* El acarreo: cada jornada que lo llevas gasta una. Los tuyos aguantan dos;
     los ajenos, tres. Las habilidades no se sueltan. */
  for (const o of Object.values(e.objetos)) {
    if (o.donde !== "mano" && o.donde !== "bolsa") continue;
    if (!o.portador || o.tipo === "habilidad") continue;
    o.acarreo -= 1;
    if (o.acarreo <= 0) soltar(e, o);
  }

  if (e.dia === DIA_HABILIDADES) terceraJornada(e);
  if (e.dia === DIA_SALAS) quintaJornada(e);
  retirarHabilidadesOcultas(e);
  reponerHabilidades(e);
  if (e.dia > e.dias) cerrar(e);
}

function soltar(e, o) {
  const p = e.jugadores[o.portador];
  if (p.mano === o.id) p.mano = null;
  if (p.bolsa === o.id) p.bolsa = null;
  const solo = presentes(e, p.sala).length === 1;
  o.portador = null;
  o.acarreo = 0;
  o.reclamado = false; /* se acabó el acarreo: la próxima vez vuelve a deber pista */
  if (solo) {
    meterEnSala(e, o, p.sala);
  } else {
    o.donde = "centro";
    o.enSala = p.sala;
    e.salas[p.sala].centro.push(o.id);
  }
  ev(e, { tipo: "soltar", quien: p.id, obj: o.id, sala: p.sala, centro: o.donde === "centro" });
}

/* Las habilidades gastadas vuelven al amanecer: una igual, en una sala abierta
   al azar. No se acumulan —si no se gastó, no se repone—, así que durante la
   jornada en que se usa hay una herramienta menos en la casa. */
/* Una habilidad que se ha ocultado del catálogo sale también de las partidas
   que ya estaban en marcha: al amanecer se retira de las manos y de las salas.
   Sin esto, ocultar el vaso solo valdría para las partidas nuevas. */
function retirarHabilidadesOcultas(e) {
  const clases = new Set(
    (e.tema?.habilidades ?? []).filter((h) => !h.oculto).map((h) => h.clase)
  );
  if (!clases.size) return;
  /* Una habilidad oculta que ya estaba en la cola de reposición no debe
     reaparecer al amanecer. */
  if (e.reponer?.length) e.reponer = e.reponer.filter((h) => clases.has(h.clase));
  for (const o of Object.values(e.objetos)) {
    if (o.tipo !== "habilidad" || clases.has(o.clase) || o.donde === "gastado") continue;
    if (o.portador) {
      const p = e.jugadores[o.portador];
      if (p) {
        if (p.mano === o.id) p.mano = null;
        if (p.bolsa === o.id) p.bolsa = null;
      }
    }
    if (o.enSala && e.salas[o.enSala]) {
      const s = e.salas[o.enSala];
      s.escondidos = s.escondidos.map((x) => (x === o.id ? null : x));
      s.centro = s.centro.filter((x) => x !== o.id);
    }
    o.donde = "gastado";
    o.portador = null;
    o.enSala = null;
    o.hueco = null;
  }
}

function reponerHabilidades(e) {
  if (!e.reponer || !e.reponer.length) return;
  const abiertas = Object.keys(e.tema.salas).filter((id) => abierta(e, id));
  for (const h of e.reponer) {
    const o = crearObjeto(e, {
      nombre: h.nombre,
      tipo: "habilidad",
      clase: h.clase,
      sirveEn: null,
      sugiere: [],
      dueño: null,
      acarreo: 0,
    });
    meterEnSala(e, o, elegir(e, abiertas));
  }
  e.reponer = [];
}

/* Reparte piezas entre salas sin poner ninguna en la sala donde sirve: la
   respuesta no se esconde en el mismo sitio donde se pregunta. Si caben una
   por sala, nunca se apilan dos; si hay más piezas que salas (ocho jugadores),
   la sala se repite y la casa usa el centro. */
function repartirFueraDeSuSala(e, piezas, salas) {
  const libres = barajar(e, salas.slice());
  const donde = new Map();
  const usadas = new Set();
  const unaPorSala = piezas.length <= libres.length;

  const colocar = (i) => {
    if (i === piezas.length) return true;
    const o = piezas[i];
    for (const sala of libres) {
      if (sala === o.sirveEn) continue;
      if (unaPorSala && usadas.has(sala)) continue;
      donde.set(o.id, sala);
      usadas.add(sala);
      if (colocar(i + 1)) return true;
      usadas.delete(sala);
      donde.delete(o.id);
    }
    return false;
  };

  if (unaPorSala && colocar(0)) return donde;

  /* Sin encaje perfecto: se permite repetir sala, nunca la de servir, y se
     elige siempre la que lleva menos para no apilar todo en una. */
  donde.clear();
  const carga = new Map(libres.map((s) => [s, 0]));
  for (const o of piezas) {
    const opciones = libres.filter((s) => s !== o.sirveEn);
    const sala = (opciones.length ? opciones : libres).reduce((a, b) =>
      carga.get(a) <= carga.get(b) ? a : b
    );
    carga.set(sala, carga.get(sala) + 1);
    donde.set(o.id, sala);
  }
  return donde;
}

function terceraJornada(e) {
  const sitios = Object.keys(e.tema.salas).filter((id) => abierta(e, id));
  /* catalogoSit: franja reservada en crearPartida del pool unificado.
     Fallback a tema.situacion para partidas guardadas antes de este cambio. */
  const sit = e.catalogoSit ?? barajar(e, e.tema.situacion ?? []);
  const piezas = [];
  let i = 0;
  for (const p of jugadores(e)) {
    const c = sit[i % sit.length];
    piezas.push(crearObjeto(e, {
      nombre: c.nombre,
      tipo: "situacion",
      sirveEn: c.sirveEn,
      sugiere: c.sugiere.slice(),
      dueño: p.id,
      acarreo: ACARREO_AJENO,
    }));
    i++;
  }

  const donde = repartirFueraDeSugiere(e, piezas, sitios);
  for (const o of piezas) meterEnSala(e, o, donde.get(o.id));
  /* Las habilidades ya se repartieron al inicio: cada jugador empieza con una. */
}

/* El día 5 la casa crece: se abren las estancias que no existían y llegan con
   lo que faltaba dentro. Cada concursante deja allí una cosa suya —la que
   enseña el rasgo que aún no tenía a la vista—, así que nadie entra en la
   segunda fase con menos objetos que los demás. Cada cosa sirve en una de las
   dos salas y se esconde en la otra, nunca en la suya: con seis jugadores,
   tres sirven en cada una y las tres de enfrente se colocan aquí. */
function repartirFueraDeSugiere(e, piezas, salas) {
  const libres = barajar(e, salas.slice());
  const donde = new Map();
  const usadas = new Set();
  const unaPorSala = piezas.length <= libres.length;

  const colocar = (i) => {
    if (i === piezas.length) return true;
    const o = piezas[i];
    for (const sala of libres) {
      if ((o.sugiere || []).includes(sala)) continue;
      if (unaPorSala && usadas.has(sala)) continue;
      donde.set(o.id, sala);
      usadas.add(sala);
      if (colocar(i + 1)) return true;
      usadas.delete(sala);
      donde.delete(o.id);
    }
    return false;
  };

  if (unaPorSala && colocar(0)) return donde;

  donde.clear();
  const carga = new Map(libres.map((s) => [s, 0]));
  for (const o of piezas) {
    const opciones = libres.filter((s) => !(o.sugiere || []).includes(s));
    const sala = (opciones.length ? opciones : libres).reduce((a, b) =>
      carga.get(a) <= carga.get(b) ? a : b
    );
    carga.set(sala, carga.get(sala) + 1);
    donde.set(o.id, sala);
  }
  return donde;
}

function quintaJornada(e) {
  const nuevas = Object.keys(e.tema.salas).filter((id) => e.tema.salas[id].entra === e.dia);
  if (!nuevas.length) return;
  const gente = barajar(e, jugadores(e));
  const piezas = [];

  /* Asignar los rasgos del día 5 de forma equilibrada. */
  const asignados = new Map(); /* pid → rasgo */
  const conteo = Object.fromEntries(e.tema.rasgos.map((r) => [r, 0]));
  for (const p of gente) {
    const yaEstan = Object.values(e.objetos)
      .filter((o) => o.tipo === "rasgo" && o.dueño === p.id)
      .map((o) => o.rasgo);
    const opciones = barajar(e, e.tema.rasgos.filter((r) => !yaEstan.includes(r)));
    if (!opciones.length) continue;
    const mejor = opciones.reduce((a, b) => (conteo[a] <= conteo[b] ? a : b));
    asignados.set(p.id, mejor);
    conteo[mejor]++;
  }

  /* Pool de objetos para el día 5: ~40% de slots garantizados de salas nuevas
     (ceil(n*0.4) repartidos entre torre/capilla), el resto del pool libre.
     Los garantizados van primero para que no queden fuera al cortar. */
  const nGarantizados = Math.ceil(gente.length * 0.4);
  const porSalaNueva = Math.ceil(nGarantizados / nuevas.length);
  const catalogoGarantizado = [];
  for (const sala of nuevas) {
    const lista = barajar(e, e.tema.quinta?.[sala] ?? []);
    catalogoGarantizado.push(...lista.slice(0, porSalaNueva));
  }
  const resto = barajar(e, e.catalogoResto ?? []);
  /* Garantizados primero, luego libre — sin mezclar, para que el corte en n respete el mínimo */
  const catalogoQ = [...catalogoGarantizado, ...resto];

  let qi = 0;
  for (const p of gente) {
    const rasgo = asignados.get(p.id);
    if (!rasgo) continue;
    const c = catalogoQ[qi++ % catalogoQ.length];
    piezas.push(crearObjeto(e, {
      nombre: c.nombre,
      tipo: "rasgo",
      sirveEn: c.sirveEn,
      sugiere: c.sugiere.slice(),
      rasgo,
      valor: p.rasgos[rasgo],
      dueño: p.id,
      acarreo: ACARREO_AJENO,
    }));
  }

  /* El objeto aparece en una sala que no es ninguna de las que sugiere:
     si las pistas apuntan a torre y cripta, buscarlo ahí sería demasiado fácil. */
  const todasAbiertas = barajar(e, Object.keys(e.tema.salas).filter((id) => abierta(e, id)));
  const donde = repartirFueraDeSugiere(e, piezas, todasAbiertas);
  for (const o of piezas) meterEnSala(e, o, donde.get(o.id));
  ev(e, { tipo: "salas_nuevas", salas: nuevas });
}

/* El rasgo de alguien que todavía no tiene ningún objeto que lo cuente. */
function rasgoSinObjeto(e, p) {
  const yaEstan = Object.values(e.objetos)
    .filter((o) => o.tipo === "rasgo" && o.dueño === p.id)
    .map((o) => o.rasgo);
  return e.tema.rasgos.find((r) => !yaEstan.includes(r)) ?? null;
}

function cerrar(e) {
  const mejor = jugadores(e)
    .map((p) => ({ id: p.id, n: cerrados(e, p).length }))
    .sort((a, b) => b.n - a.n)[0];
  e.fin = "jornadas";
  e.ganador = mejor && mejor.n > 0 ? mejor.id : null;
}

/* ------------------------------------------------------------------ */
/*  LA VISTA: lo que sabe un jugador                                   */
/* ------------------------------------------------------------------ */
/* El orden de `sugiere` no puede ser una pista. Si la primera sala de la lista
   fuese casi siempre la buena, quien se fije aprende el atajo y deja de deducir.
   Se baraja por objeto con un azar que sale de la semilla y del id: no gasta
   azar del reparto, y el mismo objeto mantiene el mismo orden toda la partida. */
function sugiereBarajado(e, o) {
  const xs = o.sugiere.slice();
  if (xs.length < 2) return xs;
  /* Un entero de 32 bits bien removido a partir de la semilla y del id. Con un
     generador flojo los dos elementos de la lista se quedaban siempre en el
     mismo orden para media casa (48,6 % en vez de 50 %): aquí se remueve cada
     tirada con el mezclador de splitmix32 y se toma del medio, no del bit bajo. */
  let h = ((e.semilla >>> 0) ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < o.id.length; i++) h = (Math.imul(h ^ o.id.charCodeAt(i), 2654435761) + 0x7f4a7c15) >>> 0;
  const tirada = () => {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor((tirada() / 4294967296) * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export function ver(e, id) {
  const o = e.objetos[id];
  const dueño = o.dueño ? e.jugadores[o.dueño] : null;
  return {
    id: o.id,
    nombre: o.nombre,
    tipo: o.tipo,
    clase: o.clase ?? null,
    dueño: o.dueño,
    dueñoNombre: dueño ? dueño.nombre : null,
    sugiere: sugiereBarajado(e, o),
    /* `sirveEn` no sale de aquí: esa es la verdad y no la sabe nadie. */
  };
}

export function vista(e, pid) {
  /* Una partida que venía de antes puede llevar una habilidad que hoy ya no
     está en el catálogo: se retira al pedir la vista para que desaparezca en
     cuanto se recarga, no al amanecer siguiente. */
  retirarHabilidadesOcultas(e);
  const p = e.jugadores[pid];
  const todos = jugadores(e);
  const otros = todos.filter((q) => q.id !== pid);

  const mapa = {};
  for (const [id, s] of Object.entries(e.tema.salas)) {
    mapa[id] = {
      nombre: s.nombre,
      salidas: s.salidas,
      puerta: !!s.puerta,
      abierta: abierta(e, id),
      entra: s.entra ?? 1,
      /* Cuántos huecos tiene la sala: eso se ve al estar dentro, no antes. */
      huecos: id === p.sala ? e.salas[id].huecos : null,
      humo: id === p.sala && e.salas[id]?.humoHasta != null && e.dia === e.salas[id].humoHasta,
      cepo: id === p.sala && !!e.salas[id]?.cepo,
      cerradas: s.salidas.filter((d) => cerrada(e, id, d) && !cerrojada(e, id, d)),
      cerrojadas: s.salidas.filter((d) => cerrojada(e, id, d)),
    };
  }

  const mios = cerrados(e, p);

  /* Tus objetos: los que hablan de ti. Se conocen por el nombre desde que
     existen —el que aún no ha entrado en la casa no está en la lista—, pero
     no dónde están: eso se averigua buscando. */
  const tuyos = Object.values(e.objetos)
    .filter((o) => o.dueño === pid)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .map((o) => ({ id: o.id, nombre: o.nombre, tipo: o.tipo }));

  return {
    dia: e.dia,
    dias: e.dias,
    sala: p.sala,
    pa: p.pa,
    paMax: e.paPorDia,
    mapa,
    mano: p.mano ? { ...ver(e, p.mano), acarreo: e.objetos[p.mano].acarreo } : null,
    bolsa: p.bolsa ? { ...ver(e, p.bolsa), acarreo: e.objetos[p.bolsa].acarreo } : null,
    centro: e.salas[p.sala].centro.filter((id) => !p.bien[id]).map((id) => ver(e, id)),
    gente: [
      { id: p.id, apodo: p.apodo, rasgos: p.rasgos, mano: p.mano ? ver(e, p.mano) : null, esYo: true, cepo: p.atadoHasta != null && p.atadoHasta >= e.dia },
      ...otros.filter((q) => !q.fuera && q.sala === p.sala).map((q) => ({
        id: q.id,
        apodo: q.apodo,
        rasgos: q.rasgos,
        mano: q.mano ? ver(e, q.mano) : null,
        cepo: q.atadoHasta != null && q.atadoHasta >= e.dia,
      })),
    ],
    todos: otros.map((q) => ({
      id: q.id,
      apodo: q.apodo,
      rasgos: q.rasgos,
      /* Solo sabes dónde está si lo tienes delante. Lo demás, a averiguarlo
         con un objeto de situación, con el vaso o preguntando. */
      sala: !q.fuera && q.sala === p.sala ? q.sala : null,
      fuera: q.fuera,
      eliminado: q.eliminado ?? false,
    })),
    yo: {
      id: p.id, apodo: p.apodo, nombre: p.nombre, rasgos: p.rasgos, sala: p.sala, pa: p.pa, capa: p.capa || 0,
      /* Falló la salida en esta jornada: la puerta no está entre sus acciones y
         la pantalla tiene que poder decir por qué, no dejarla desaparecer. */
      bloqueadoSalir: p.bloqueadoSalir === e.dia,
    },
    /* Los nombres repartidos en esta mesa, sin decir de quién es cada uno: el
       cuaderno los necesita para ofrecer sospechas. Con seis jugadores el mazo
       tiene ocho y dos se quedan sin repartir; enseñar los ocho mandaba a
       buscar nombres que no son de nadie. Van desordenados a propósito: el
       orden de la mesa no dice nada. */
    nombres: jugadores(e).map((q) => q.nombre).sort((a, b) => a.localeCompare(b, "es")),
    /* De quién es el turno: la pantalla lo dice y, si no es el tuyo, no hay
       nada que pulsar. */
    turno: (() => {
      const id = aQuienLeToca(e);
      const q = e.jugadores[id];
      const orden = ordenHoy(e);
      return { id, apodo: q?.apodo ?? "alguien", esMio: id === pid, n: orden.indexOf(id) + 1, mio: orden.indexOf(pid) + 1, de: orden.length };
    })(),
    mirada: (() => { const m = p.mirada && p.mirada.sala === p.sala ? p.mirada : null; if (!m) return null; const vistos = (m.vistos || []).filter(id => !p.bien[id]); const cajas = (m.cajas || []).map(c => ({ ...c, obj: c.obj && p.bien[c.obj] ? null : c.obj })); return { abiertos: m.abiertos, vistos, cajas, cogido: m.cogido, cogidos: m.cogidos ?? (m.cogido ? 1 : 0), nombres: Object.fromEntries(vistos.map(id => [id, e.objetos[id]?.nombre ?? id])) }; })(),
    mios: tuyos,
    sabe: p.sabe,
    dichos: p.dichos.map(({ de, nombre, rasgo, valor, dia, usado }) => ({ de, nombre, rasgo, valor, dia, usado: !!usado })),
    sabeDonde: p.sabeDonde,
    sabeDondeDia: p.sabeDondeDia ?? {},
    sabeDondeFue: p.sabeDondeFue ?? {},
    intentos: p.intentos,
    bien: p.bien,
    bienUsados: Object.entries(p.bien).map(([id, sala]) => ({ id, nombre: e.objetos[id]?.nombre ?? id, sala: e.tema.salas[sala]?.nombre ?? sala })),
    visto: p.visto,
    huecosVistos: p.huecosVistos ?? {},
    oido: p.oido,
    /* La copa pegada a la pared: a qué sala y hasta cuándo. Se apaga sola al
       moverse, así que aquí solo llega lo que sigue vivo. */
    escucha: (() => {
      const es = p.escucha;
      if (!es || es.base !== p.sala) return null;
      return { sala: es.oye, nombre: e.tema.salas[es.oye]?.nombre ?? es.oye, dia: es.dia };
    })(),
    /* Lo que ha pasado delante de ti desde tu última acción: se enseña al
       empezar el turno. Si no es tu turno también llega, para que la crónica
       tenga lo que otros hacen mientras miras. */
    espera: esperaDe(e, pid),
    cerrados: mios,
    barra: mios.length,
    faltan: Math.max(0, todos.length - 1 - mios.length),
    puedenSalir: todos.length - 1,
    /* El final viaja con la vista. Antes la partida se cerraba en el servidor
       y el cliente no se enteraba: seguía enseñando la casa y, al recargar,
       la sala ya no existía. Con `fin` la pantalla puede enseñar el acta, y
       con `revelacion` los nombres que se estaban apostando. Los nombres solo
       salen cuando la partida ha terminado. */
    objetosEnJuego: [...new Set(Object.values(e.objetos).filter(o => o.tipo === "rasgo" || o.tipo === "situacion" || o.tipo === "quinta").map(o => o.nombre))],
    clasesHabsEnJuego: [...new Set(Object.values(e.objetos).filter(o => o.tipo === "habilidad").map(o => o.clase))],
    fin: e.fin ?? null,
    ganador: e.fin ? e.ganador : null,
    revelacion: e.fin
      ? todos.map((q) => ({
          apodo: q.apodo,
          nombre: q.nombre,
          yo: q.id === pid,
          ganador: q.id === e.ganador,
          eliminado: !!q.eliminado,
          fuera: !!q.fuera,
        }))
      : null,
  };
}

/* ------------------------------------------------------------------ */
/*  EL VERIFICADOR                                                     */
/* ------------------------------------------------------------------ */
export function verificar(e, completo = false) {
  const fallos = [];
  const js = jugadores(e);
  const ids = Object.keys(e.objetos);

  /* Cada objeto en un sitio y solo uno. */
  const vistos = new Set();
  for (const sala of Object.values(e.salas)) {
    for (const id of [...sala.escondidos.filter(Boolean), ...sala.centro]) {
      if (vistos.has(id)) fallos.push(`objeto repetido en listas: ${id}`);
      vistos.add(id);
      if (!e.objetos[id]) fallos.push(`objeto fantasma en ${sala.id}: ${id}`);
      else if (e.objetos[id].enSala !== sala.id)
        fallos.push(`objeto ${id} dice estar en ${e.objetos[id].enSala} y está en ${sala.id}`);
    }
    /* El índice del hueco no se mueve: es lo que se elige al registrar. */
    for (const [i, id] of sala.escondidos.entries()) {
      if (!id) continue;
      if (e.objetos[id] && e.objetos[id].hueco !== i)
        fallos.push(`objeto ${id} está en el hueco ${i} y dice ${e.objetos[id].hueco}`);
    }
    if (sala.escondidos.length > sala.huecos)
      fallos.push(`${sala.id} tiene ${sala.escondidos.length} huecos ocupados y ${sala.huecos} huecos`);
    if (!abierta(e, sala.id) && (sala.escondidos.some(Boolean) || sala.centro.length))
      fallos.push(`hay objetos en ${sala.id}, que todavía no está abierta`);
  }

  for (const [id, o] of Object.entries(e.objetos)) {
    if (o.donde === "escondido" || o.donde === "centro") {
      if (!vistos.has(id)) fallos.push(`objeto ${id} no está en ninguna sala y dice ${o.donde}`);
    } else if (o.donde === "mano" || o.donde === "bolsa") {
      const p = e.jugadores[o.portador];
      if (!p) fallos.push(`objeto ${id} en manos de nadie`);
      else if (p[o.donde] !== id) fallos.push(`objeto ${id} dice ${o.donde} de ${p.apodo} y no está`);
    } else if (o.donde === "gastado" || o.donde === "fuera") {
      if (vistos.has(id)) fallos.push(`objeto ${id} está ${o.donde} y en una sala`);
    } else {
      fallos.push(`objeto ${id} sin sitio: ${o.donde}`);
    }
  }

  for (const p of js) {
    if (!abierta(e, p.sala)) fallos.push(`${p.apodo} está en ${p.sala}, que todavía no está abierta`);
    if (p.pa < 0 || p.pa > e.paPorDia) fallos.push(`${p.apodo} con ${p.pa} fichas`);
    if (p.pa !== e.paPorDia - p.gastadoHoy)
      fallos.push(`${p.apodo} gastó ${p.gastadoHoy} y le quedan ${p.pa}`);
    for (const slot of ["mano", "bolsa"]) {
      const id = p[slot];
      if (!id) continue;
      const o = e.objetos[id];
      if (!o) fallos.push(`${p.apodo} lleva un objeto que no existe: ${id}`);
      else if (o.portador !== p.id || o.donde !== slot)
        fallos.push(`${p.apodo} lleva ${id} en ${slot} y el objeto dice otra cosa`);
    }
    if (p.mano && p.mano === p.bolsa) fallos.push(`${p.apodo} lleva el mismo objeto dos veces`);
    for (const d of p.dichos) {
      if (!d || !e.jugadores[d.de]) fallos.push(`${p.apodo} guarda un dicho de nadie: ${d && d.de}`);
      if (d && !js.some((x) => x.nombre === d.nombre))
        fallos.push(`${p.apodo} guarda un dicho de alguien que no existe: ${d.nombre}`);
      if (d && !e.tema.rasgos.includes(d.rasgo))
        fallos.push(`${p.apodo} guarda un dicho de un rasgo que no existe: ${d.rasgo}`);
      if (d && typeof d.valor !== "boolean")
        fallos.push(`${p.apodo} guarda un dicho sin valor: ${d.rasgo}`);
    }
  }

  if (completo) {
    /* Lo apuntado es verdad; lo que te han dicho vive en `dichos` y puede
       ser mentira. */
    for (const p of js)
      for (const [nombre, f] of Object.entries(p.sabe)) {
        const q = js.find((x) => x.nombre === nombre);
        if (!q) { fallos.push(`${p.apodo} sabe de alguien que no existe: ${nombre}`); continue; }
        for (const [r, v] of Object.entries(f))
          if (q.rasgos[r] !== v) fallos.push(`${p.apodo} cree que ${nombre} ${r}=${v} y es ${q.rasgos[r]}`);
      }

    /* Un nombre cerrado está bien cerrado. */
    for (const p of js)
      for (const c of cerrados(e, p)) {
        const q = js.find((x) => x.apodo === c.apodo);
        if (!q || q.nombre !== c.nombre) fallos.push(`${p.apodo} cierra mal ${c.apodo}`);
      }

    /* Si alguien salió, dijo los nombres bien. */
    if (e.fin === "salida") {
      const ult = [...e.sucesos].reverse().find((s) => s.tipo === "salida");
      if (!ult || !ult.aciertos) fallos.push("hay ganador sin una salida correcta");
    }
  }

  return fallos;
}
