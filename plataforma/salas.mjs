/* Las mesas: vestíbulo, asientos, turnos y final.

   Aquí no se sabe a qué se juega. Se sabe quién está sentado, a quién le toca,
   qué acciones acepta el juego y cuándo ha terminado. El juego es un módulo
   que cumple `juego/contrato.md`.

   Lo que sí es de la plataforma, y es donde *Say My Name* se quedaba corto:

   · El vestíbulo también se guarda. Un reinicio del contenedor con la gente
     esperando no borra la mesa.
   · El anfitrión se hereda: si el que creó la sala se cae, a los 20 segundos el
     mando pasa al siguiente conectado. (Los 20 segundos son para que un
     refresco de página no cambie de anfitrión.)
   · Los asientos se recuerdan por cuenta, no por nombre: volver a entrar es
     pedir tu sitio, no ocupar el de otro.
   · Caducidad: vestíbulo y final, 2 horas sin actividad; partida en curso, 7
     días. Se purga en memoria y en disco. */

import * as almacen from "./almacen.mjs";
import { juego as buscarJuego } from "../juego/registro.mjs";

export const TTL = {
  vestibulo: 24 * 60 * 60 * 1000,   /* 24h: tiempo para que todos entren al vestíbulo */
  final: 24 * 60 * 60 * 1000,       /* 24h: hasta que todos salgan de la pantalla final */
  jugando: 7 * 24 * 60 * 60 * 1000, /* 7 días: nunca cae una partida activa */
};

const ESPERA_ANFITRION = 20 * 1000;
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; /* sin I ni O: no se confunden al dictar */
const MAX_LOG = 160;

/* El registro antiguo no guardaba a qué jornada pertenecía cada línea. Se
   rellena en orden al cargar: las que ya la traen mandan, las demás se quedan
   en la última conocida, y delante de cada cambio de jornada se pone su
   cabecera. Así la crónica sale cortada por días aunque la mesa venga de antes
   del arreglo. */
function diaDelRegistro(log) {
  const fuera = [];
  let dia = 1;
  let puesto = 0;
  for (const linea of log) {
    if (linea.dia) dia = linea.dia;
    if (linea.tipo === "dia") continue;
    const deJuego = linea.tipo && linea.tipo !== "nota" && linea.tipo !== "sala";
    if (deJuego && puesto !== dia) {
      fuera.push({ t: linea.t, tipo: "dia", texto: `Jornada ${dia}.`, dia });
      puesto = dia;
    }
    fuera.push({ ...linea, dia: linea.dia ?? dia });
  }
  return fuera;
}

function codigoNuevo(ocupados) {
  for (let intento = 0; intento < 50; intento++) {
    let c = "";
    for (let i = 0; i < 5; i++) c += LETRAS[Math.floor(Math.random() * LETRAS.length)];
    if (!ocupados.has(c)) return c;
  }
  throw new Error("no hay códigos libres");
}

/* La acción que pidió el cliente, emparejada campo a campo con las que el
   juego declara legales en este momento. Buscar solo por tipo no vale: hay
   varias cartas que se juegan con el mismo `mejorar_bunker` y varios niveles
   con el mismo `crear_monstruo`. */
export function emparejarLegal(legales, pedida) {
  const p = pedida ?? {};
  return legales.find((l) => {
    if (l.tipo !== p.tipo) return false;
    /* Hay jugadas que el motor valida con su propio payload (por ejemplo,
       enviar a un aliado): se marcan como libres y no se comparan campo a
       campo; el motor comprueba cantidades, destino y jaulas. */
    if (l.libre) return true;
    if ((l.a ?? null) !== (p.a ?? null)) return false;
    return Object.entries(p).every(
      ([k, v]) => k === "texto" || JSON.stringify(l[k]) === JSON.stringify(v)
    );
  });
}

export function limpiarCodigo(x) {
  return String(x ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
}

/* ── Personalización: todos contra todos o por equipos ─────────────────── */

const MODOS = new Set(["todos", "equipos"]);

function opcionesNuevas() {
  return { modo: "todos", equipos: {} };
}

function opcionesDe(sala) {
  if (!sala.datos.opciones || typeof sala.datos.opciones !== "object") {
    sala.datos.opciones = opcionesNuevas();
  }
  const o = sala.datos.opciones;
  if (!MODOS.has(o.modo)) o.modo = "todos";
  if (!o.equipos || typeof o.equipos !== "object") o.equipos = {};
  return o;
}

function equipoValido(v) {
  return v === 0 || v === 1;
}

function limpiarEquipos(sala) {
  const o = opcionesDe(sala);
  for (const id of Object.keys(o.equipos)) {
    if (!sala.datos.jugadores.some((j) => j.id === id)) delete o.equipos[id];
  }
}

/* Reparte equipos alternos a quien no tenga uno; el anfitrión puede cambiarlos
   después jugador a jugador. */
function repartirEquipos(sala) {
  const o = opcionesDe(sala);
  limpiarEquipos(sala);
  if (o.modo !== "equipos") {
    o.equipos = {};
    return;
  }
  sala.datos.jugadores.forEach((j, i) => {
    if (!equipoValido(o.equipos[j.id])) o.equipos[j.id] = i % 2;
  });
}

function reiniciarEquipos(sala) {
  const o = opcionesDe(sala);
  o.equipos = {};
  if (o.modo === "equipos") {
    sala.datos.jugadores.forEach((j, i) => { o.equipos[j.id] = i % 2; });
  }
}

/* ── Tamaño de la mesa: los huecos que no llenan personas los ocupan bots ── */

/* Lo que elige el anfitrión cuenta humanos y bots. Si aún no ha elegido, la
   mesa es la que hay: los que están sentados. Se puede pedir «solo humanos»
   aunque no lleguen al mínimo: entonces no hay bots y la mesa espera gente.
   Que falten jugadores para empezar lo sigue mirando `empezar`. */
function objetivoJugadores(sala, juego, pedido) {
  const humanos = sala.datos.jugadores.filter((j) => !j.esBot).length;
  const max = juego?.max ?? 8;
  const n = Math.round(Number(pedido));
  const quiere = Number.isFinite(n) ? n : humanos;
  return Math.min(max, Math.max(1, humanos, quiere));
}

/* Deja la mesa con `objetivo` asientos: las personas que hay y bots en el
   resto. Solo tiene sentido en juegos con `bot`; en los demás no hace nada. */
function ajustarBots(sala, juego, objetivo) {
  if (!juego?.bot) return 0;
  const humanos = sala.datos.jugadores.filter((j) => !j.esBot).length;
  const max = juego.max ?? 8;
  const cuantos = Math.max(0, Math.min(max, objetivo) - humanos);
  const bots = sala.datos.jugadores.filter((j) => j.esBot);

  /* Los que sobran salen por el final: son los que entraron últimos. */
  while (bots.length > cuantos) {
    const fuera = bots.pop();
    sala.datos.jugadores = sala.datos.jugadores.filter((j) => j.id !== fuera.id);
    sala.vivo.delete(fuera.id);
    delete opcionesDe(sala).equipos[fuera.id];
  }

  /* Los que faltan entran al final y ya listos: un bot no hace esperar. */
  while (bots.length < cuantos) {
    let n = bots.length + 1;
    let id = `bot-${sala.codigo}-${n}`;
    while (sala.datos.jugadores.some((j) => j.id === id)) id = `bot-${sala.codigo}-${++n}`;
    const bot = { id, nombre: `Bot ${n}`, avatar: "robot", listo: true, esBot: true };
    sala.datos.jugadores.push(bot);
    bots.push(bot);
    asignarEquipo(sala, bot.id);
  }
  return bots.length;
}

function asignarEquipo(sala, jugadorId) {
  const o = opcionesDe(sala);
  if (o.modo !== "equipos") {
    delete o.equipos[jugadorId];
    return;
  }
  if (equipoValido(o.equipos[jugadorId])) return;
  const cuentas = [0, 0];
  for (const j of sala.datos.jugadores) {
    if (j.id === jugadorId) continue;
    if (equipoValido(o.equipos[j.id])) cuentas[o.equipos[j.id]]++;
  }
  o.equipos[jugadorId] = cuentas[0] <= cuentas[1] ? 0 : 1;
}

export class Mesas {
  /* `difundir(sala)` la pone el servidor: pinta la mesa a cada socket.
     `avisar(usuarioId, aviso)` manda push a quien esté desconectado. */
  constructor({ difundir, avisar, version }) {
    this.salas = new Map();
    this.difundir = difundir ?? (() => {});
    this.avisar = avisar ?? (() => {});
    this.version = version;
    this.timersAnfitrion = new Map();
    this.cargar();
  }

  /* ── Arranque ────────────────────────────────────────────────────────── */

  cargar() {
    const ahora = Date.now();
    for (const fila of almacen.cargarSalas()) {
      const fase = fila.fase ?? "vestibulo";
      const edad = ahora - (fila.actualizado ?? 0);
      if (edad > (TTL[fase] ?? TTL.vestibulo)) {
        almacen.borrarSala(fila.codigo);
        continue;
      }
      const guardado = fila.datos ?? {};
      this.salas.set(fila.codigo, {
        codigo: fila.codigo,
        juego: fila.juego,
        fase,
        anfitrion: fila.anfitrion,
        semilla: guardado.semilla ?? null,
        datos: {
          jugadores: Array.isArray(guardado.jugadores) ? guardado.jugadores : [],
          estado: guardado.estado ?? null,
          opciones: guardado.opciones ?? opcionesNuevas(),
          final: guardado.final,
        },
        log: diaDelRegistro(Array.isArray(guardado.log) ? guardado.log : []),
        actualizado: fila.actualizado ?? ahora,
        vivo: new Map(), /* usuarioId → { sockets:Set, conectado } */
      });
    }
    /* El estado guardado vuelve de JSON: cada juego revive lo que JSON no
       puede guardar (los `Set` del motor, por ejemplo). Sin esto una mesa a
       medias se quedaba sin vista tras reiniciar el servidor. */
    for (const sala of this.salas.values()) {
      this.juegoDe(sala)?.revivir?.(sala.datos.estado);
    }
    if (this.salas.size) console.log(`[mesas] ${this.salas.size} mesa(s) recuperadas`);
  }

  guardar(sala) {
    sala.actualizado = Date.now();
    /* Antes de guardar, cada juego deja su estado en algo que JSON entienda. */
    this.juegoDe(sala)?.serializar?.(sala.datos.estado);
    almacen.guardarSala({
      codigo: sala.codigo,
      juego: sala.juego,
      fase: sala.fase,
      anfitrion: sala.anfitrion,
      datos: { ...sala.datos, semilla: sala.semilla, log: sala.log },
    });
  }

  /* ── Consultas ───────────────────────────────────────────────────────── */

  deUsuario(usuarioId) {
    for (const sala of this.salas.values()) {
      if (sala.datos?.jugadores?.some((j) => j.id === usuarioId)) return sala;
    }
    return null;
  }

  porCodigo(codigo) {
    return this.salas.get(limpiarCodigo(codigo)) ?? null;
  }

  conectados(sala) {
    return [...sala.datos.jugadores].filter((j) => this.vivoDe(sala, j.id).conectado);
  }

  vivoDe(sala, usuarioId) {
    let v = sala.vivo.get(usuarioId);
    if (!v) {
      v = { sockets: new Set(), conectado: false };
      sala.vivo.set(usuarioId, v);
    }
    return v;
  }

  juegoDe(sala) {
    return buscarJuego(sala.juego);
  }

  /* ── Entrar y salir ──────────────────────────────────────────────────── */

  crear(usuario, juegoId) {
    const juego = buscarJuego(juegoId);
    if (!juego) return { error: "Ese juego no está instalado." };

    const previa = this.deUsuario(usuario.id);
    if (previa?.fase === "jugando") {
      return { error: "Estás en una partida en curso. Termínala o abandónala antes de abrir otra." };
    }
    if (previa) this.sacar(usuario.id);

    let codigo;
    try {
      codigo = codigoNuevo(this.salas);
    } catch {
      return { error: "No hay códigos libres ahora mismo. Prueba en un momento." };
    }

    const sala = {
      codigo,
      juego: juego.id,
      fase: "vestibulo",
      anfitrion: usuario.id,
      semilla: null,
      datos: {
        jugadores: [{ id: usuario.id, nombre: usuario.nombre, avatar: usuario.avatar, listo: false }],
        estado: null,
        opciones: opcionesNuevas(),
      },
      log: [{ t: Date.now(), tipo: "sala", texto: `${usuario.nombre} abre la madriguera.` }],
      actualizado: Date.now(),
      vivo: new Map(),
    };
    this.salas.set(codigo, sala);
    this.vivoDe(sala, usuario.id);
    this.guardar(sala);
    return { sala };
  }

  añadirBot(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "vestibulo") return { error: "La partida ya empezó." };
    if (sala.anfitrion !== usuarioId) return { error: "Solo el anfitrión puede añadir un bot." };
    const juego = this.juegoDe(sala);
    if (!juego?.bot) return { error: "Este juego no tiene bot." };
    if (sala.datos.jugadores.length >= juego.max) return { error: "La mesa está llena." };
    const n = sala.datos.jugadores.filter(j => j.esBot).length + 1;
    const bot = { id: `bot-${sala.codigo}-${n}`, nombre: `Bot ${n}`, avatar: "robot", listo: true, esBot: true };
    sala.datos.jugadores.push(bot);
    asignarEquipo(sala, bot.id);
    this.anotar(sala, `Bot ${n} entra en la madriguera.`);
    this.guardar(sala);
    this.difundir(sala);
    return { sala };
  }

  unirse(usuario, codigo) {
    const sala = this.porCodigo(codigo);
    if (!sala) return { error: "No hay ninguna madriguera con ese código." };

    if (sala.datos.jugadores.some((j) => j.id === usuario.id)) {
      this.guardar(sala);
      return { sala };
    }

    /* Ya estaba en otra: si es un vestíbulo o un final, se levanta y se sienta
       aquí. Si está jugando, no: primero termina o abandona. */
    const previa = this.deUsuario(usuario.id);
    if (previa && previa.codigo !== sala.codigo) {
      if (previa.fase === "jugando") {
        return { error: "Estás en una partida en curso. Termínala antes de entrar en otra." };
      }
      this.sacar(usuario.id);
    }

    if (sala.fase !== "vestibulo") {
      return { error: sala.fase === "jugando" ? "Esa partida ya ha empezado." : "Esa partida ya ha terminado." };
    }

    const juego = this.juegoDe(sala);
    if (!juego) return { error: "Ese juego ya no está instalado." };
    if (sala.datos.jugadores.length >= juego.max) return { error: "La mesa está llena." };

    sala.datos.jugadores.push({ id: usuario.id, nombre: usuario.nombre, avatar: usuario.avatar, listo: false });
    asignarEquipo(sala, usuario.id);
    /* Si la mesa tenía un tamaño elegido, la persona ocupa el sitio de un bot:
       los humanos siempre van antes que los bots. */
    const tamanio = opcionesDe(sala).nJugadores;
    if (Number.isFinite(tamanio)) {
      opcionesDe(sala).nJugadores = objetivoJugadores(sala, juego, tamanio);
      ajustarBots(sala, juego, opcionesDe(sala).nJugadores);
    }
    this.vivoDe(sala, usuario.id);
    this.anotar(sala, `${usuario.nombre} entra en la madriguera.`);
    this.guardar(sala);
    this.difundir(sala);
    return { sala };
  }

  /* Quita a alguien de una mesa que no está jugando. Devuelve si la mesa se
     quedó vacía (y por tanto se borra). */
  sacar(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return null;
    if (sala.fase === "jugando") return null; /* en partida, salir es desconectarse */

    const jugador = sala.datos.jugadores.find((j) => j.id === usuarioId);
    sala.datos.jugadores = sala.datos.jugadores.filter((j) => j.id !== usuarioId);
    sala.vivo.delete(usuarioId);
    delete opcionesDe(sala).equipos[usuarioId];
    limpiarEquipos(sala);
    this.anotar(sala, `${jugador?.nombre ?? "alguien"} sale de la madriguera.`);

    if (sala.datos.jugadores.length === 0) {
      this.borrar(sala.codigo);
      return sala;
    }
    if (sala.anfitrion === usuarioId) this.heredar(sala);
    /* Con una persona menos la mesa vuelve a su tamaño: entra un bot. */
    const tamanio = opcionesDe(sala).nJugadores;
    const juego = this.juegoDe(sala);
    if (Number.isFinite(tamanio) && juego?.bot) {
      opcionesDe(sala).nJugadores = objetivoJugadores(sala, juego, tamanio);
      ajustarBots(sala, juego, opcionesDe(sala).nJugadores);
    }
    this.guardar(sala);
    this.difundir(sala);
    return sala;
  }

  heredar(sala) {
    const siguiente = this.conectados(sala)[0] ?? sala.datos.jugadores[0];
    if (!siguiente) return;
    sala.anfitrion = siguiente.id;
    this.anotar(sala, `${siguiente.nombre} toma el mando de la madriguera.`);
  }

  listo(usuarioId, valor) {
    const sala = this.deUsuario(usuarioId);
    if (!sala || sala.fase !== "vestibulo") return { error: "No estás en un vestíbulo." };
    const jugador = sala.datos.jugadores.find((j) => j.id === usuarioId);
    if (!jugador) return { error: "No estás sentado." };
    jugador.listo = !!valor;
    this.guardar(sala);
    this.difundir(sala);
    return { sala };
  }

  /* Solo el anfitrión cambia el modo y los equipos, y solo en el vestíbulo. */
  personalizar(usuarioId, datos = {}) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "vestibulo") return { error: "La partida ya empezó." };

    /* Cualquier jugador puede elegir su personaje (si el juego lo soporta). */
    if ("personaje" in datos) {
      const o = opcionesDe(sala);
      if (!o.personajes) o.personajes = {};
      if (datos.personaje === null) {
        delete o.personajes[usuarioId];
      } else {
        const apodo = String(datos.personaje);
        const tomado = Object.entries(o.personajes).find(([pid, a]) => pid !== usuarioId && a === apodo);
        if (tomado) return { error: "Ese personaje ya lo lleva otra persona." };
        o.personajes[usuarioId] = apodo;
      }
      this.guardar(sala);
      this.difundir(sala);
      return { sala };
    }

    if (sala.anfitrion !== usuarioId) return { error: "Solo el anfitrión puede personalizar la partida." };

    const o = opcionesDe(sala);
    const juego = this.juegoDe(sala);

    /* Cuántos juegan: el anfitrión elige el tamaño y los huecos que no llenan
       personas los ocupan bots. Va con el resto de ajustes de la hoja, así
       que no se corta aquí: sigue con el modo, los equipos y las habilidades. */
    if ("nJugadores" in datos && juego?.bot) {
      o.nJugadores = objetivoJugadores(sala, juego, datos.nJugadores);
      ajustarBots(sala, juego, o.nJugadores);
      this.anotar(sala, `La mesa queda en ${o.nJugadores} jugadores.`);
    }

    /* Opciones de juego específicas (registroTotal, habsConfig, habsInicio). */
    if ("registroTotal" in datos) o.registroTotal = Boolean(datos.registroTotal);
    if ("habsConfig" in datos && Array.isArray(datos.habsConfig)) o.habsConfig = datos.habsConfig;
    if ("habsInicio" in datos && Array.isArray(datos.habsInicio)) o.habsInicio = datos.habsInicio;

    const modo = datos.modo === undefined ? o.modo : String(datos.modo);
    if (!MODOS.has(modo)) return { error: "Ese modo de juego no existe." };

    if (modo !== o.modo) {
      o.modo = modo;
      reiniciarEquipos(sala);
      this.anotar(sala, modo === "equipos" ? "Personalización: por equipos." : "Personalización: todos contra todos.");
    }

    if (o.modo === "equipos" && datos.equipos && typeof datos.equipos === "object") {
      for (const j of sala.datos.jugadores) {
        const v = Number(datos.equipos[j.id]);
        if (equipoValido(v)) o.equipos[j.id] = v;
      }
      repartirEquipos(sala);
    }
    if (o.modo === "todos") o.equipos = {};

    this.guardar(sala);
    this.difundir(sala);
    return { sala };
  }

  /* ── Empezar y jugar ─────────────────────────────────────────────────── */

  empezar(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "vestibulo") return { error: "La partida ya ha empezado." };
    if (sala.anfitrion !== usuarioId) return { error: "Solo el anfitrión puede empezar." };

    const juego = this.juegoDe(sala);
    if (!juego) return { error: "Ese juego ya no está instalado." };

    const jugadores = sala.datos.jugadores;
    if (jugadores.length < juego.min) return { error: `Hacen falta al menos ${juego.min} jugadores.` };
    if (!jugadores.every((j) => j.listo)) return { error: "Falta alguien por decir que está listo." };

    const opciones = opcionesDe(sala);
    repartirEquipos(sala);
    if (opciones.modo === "equipos") {
      const equipos = new Set(Object.values(opciones.equipos));
      if (equipos.size < 2) return { error: "Hacen falta al menos dos equipos con jugadores." };
    }

    sala.semilla = Math.floor(Math.random() * 1_000_000_000);
    /* Cada partida empieza con el cuaderno en blanco: el ranking no arrastra
       los definitivos de la anterior. */
    delete sala.datos.cuadernos;
    sala.datos.estado = juego.crear({
      jugadores: jugadores.map(({ id, nombre, avatar }) => ({ id, nombre, avatar })),
      semilla: sala.semilla,
      opciones: { modo: opciones.modo, equipos: { ...opciones.equipos }, personajes: { ...(opciones.personajes ?? {}) }, registroTotal: opciones.registroTotal, habsConfig: opciones.habsConfig, habsInicio: opciones.habsInicio },
    });
    sala.fase = "jugando";
    this.anotar(sala, "Empieza la partida.");
    /* Si abre un bot, juega ya: nadie puede pulsar por él y la mesa se
       quedaría esperando un turno que no va a llegar. */
    this.jugarBots(sala, juego);
    this.guardar(sala);
    this.difundir(sala);
    this.avisarDesconectados(sala, {
      titulo: "Empieza la partida",
      cuerpo: `${sala.datos.jugadores.length} en la madriguera ${sala.codigo}.`,
      etiqueta: `empieza-${sala.codigo}`,
    });
    return { sala };
  }

  accion(usuarioId, accion) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "jugando") return { error: "La partida no está en marcha." };

    const juego = this.juegoDe(sala);
    if (!juego) return { error: "Ese juego ya no está instalado." };

    const estado = sala.datos.estado;
    const toca = juego.turno(estado);
    if (toca !== null && toca !== usuarioId) return { error: "No es tu turno." };

    const legales = juego.legales(estado, usuarioId);
    const pedida = accion ?? {};
    /* La acción se reenvía al motor tal como la declaró el propio juego: si
       solo se copiaran tipo y a, se perderían cartaId, sendero, nivel… y las
       jugadas se ignorarían en silencio. Además hay que emparejarla campo a
       campo: buscar solo por tipo hacía que jugar una carta acabara jugando
       la primera de la mano, o que crear un monstruo nivel 5 creara el 1. */
    const legal = emparejarLegal(legales, pedida);
    if (!legal) return { error: "Esa jugada no está permitida." };

    let salida;
    try {
      const accionAplicar = legal.libre ? { ...pedida, tipo: legal.tipo } : { ...legal };
      salida = juego.aplicar(estado, usuarioId, accionAplicar);
    } catch (err) {
      console.log(`[mesa ${sala.codigo}] el motor falló: ${err?.message ?? err}`);
      return { error: "El juego rechazó la jugada." };
    }

    sala.datos.estado = salida.estado ?? estado;
    for (const ev of salida.eventos ?? []) this.anotar(sala, ev.texto, ev.tipo);

    const fin = juego.terminada(sala.datos.estado);
    if (fin) {
      sala.fase = "final";
      sala.datos.final = {
        puestos: fin.puestos,
        cuando: Date.now(),
      };
      this.anotar(sala, "Se acabó la partida.", "fin");
    }

    this.guardar(sala);
    this.difundir(sala);

    /* Si el siguiente es un bot, juega automáticamente hasta que toque a un humano. */
    if (!fin) {
      const bots = this.jugarBots(sala, juego);
      if (bots.fin) { this.guardar(sala); this.difundir(sala); return { sala }; }
      /* Ya se ha difundido el estado humano antes de los bots. Si ningún bot
         ha jugado, no se repite la misma vista: el segundo pintado cortaba la
         animación de las fichas y las colocaba de golpe en su destino. */
      if (bots.jugó) {
        this.guardar(sala);
        this.difundir(sala);
      }
    }

    /* El aviso que de verdad desatasca la mesa: si el turno pasa a alguien que
       no está mirando, se le empuja. */
    const siguiente = fin ? null : juego.turno(sala.datos.estado);
    if (siguiente && !this.vivoDe(sala, siguiente).conectado) {
      const nombre = sala.datos.jugadores.find((j) => j.id === siguiente)?.nombre ?? "";
      this.avisar(siguiente, {
        titulo: "Te toca",
        cuerpo: `${nombre ? nombre + ", " : ""}la mesa ${sala.codigo} te espera.`,
        etiqueta: `turno-${sala.codigo}`,
        url: `./?sala=${sala.codigo}`,
      });
    }
    if (fin) {
      this.avisarDesconectados(sala, {
        titulo: "Partida terminada",
        cuerpo: `Ya hay resultados en la mesa ${sala.codigo}.`,
        etiqueta: `fin-${sala.codigo}`,
      });
    }
    return { sala };
  }

  /* Juega los turnos seguidos de bots hasta que le toque a una persona o
     acabe la partida. Devuelve si alguno jugó y si se acabó. */
  jugarBots(sala, juego) {
    const res = { jugó: false, fin: false };
    if (!juego?.bot || sala.fase !== "jugando") return res;
    let sigBot = juego.turno(sala.datos.estado);
    let guard = 0;
    while (sigBot && sala.datos.jugadores.find((j) => j.id === sigBot)?.esBot && guard++ < 50) {
      const accionBot = juego.bot(sala.datos.estado, sigBot);
      if (!accionBot) break;
      res.jugó = true;
      const salidaBot = juego.aplicar(sala.datos.estado, sigBot, accionBot);
      sala.datos.estado = salidaBot.estado ?? sala.datos.estado;
      for (const ev of salidaBot.eventos ?? []) this.anotar(sala, ev.texto, ev.tipo);
      const finBot = juego.terminada(sala.datos.estado);
      if (finBot) {
        sala.fase = "final";
        sala.datos.final = { puestos: finBot.puestos, cuando: Date.now() };
        this.anotar(sala, "Se acabó la partida.", "fin");
        res.fin = true;
        break;
      }
      sigBot = juego.turno(sala.datos.estado);
    }
    return res;
  }

  revancha(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "final") return { error: "La partida no ha terminado." };
    if (sala.anfitrion !== usuarioId) return { error: "Solo el anfitrión puede pedir revancha." };

    sala.fase = "vestibulo";
    sala.datos.estado = null;
    delete sala.datos.final;
    delete sala.datos.cuadernos;
    for (const j of sala.datos.jugadores) j.listo = false;
    sala.log = [];
    this.anotar(sala, "Vuelta a la madriguera: otra partida.");
    this.guardar(sala);
    this.difundir(sala);
    return { sala };
  }

  abandonar(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase === "jugando") {
      /* Abandonar de verdad: se suelta el asiento y la partida sigue sin él.
         El juego tiene que saber vivir con un jugador menos. */
      const juego = this.juegoDe(sala);
      const jugador = sala.datos.jugadores.find((j) => j.id === usuarioId);
      sala.datos.jugadores = sala.datos.jugadores.filter((j) => j.id !== usuarioId);
      sala.vivo.delete(usuarioId);
      this.anotar(sala, `${jugador?.nombre ?? "alguien"} abandona la partida.`);
      if (sala.datos.jugadores.length === 0) {
        this.borrar(sala.codigo);
        return { sala };
      }
      if (sala.anfitrion === usuarioId) this.heredar(sala);
      try {
        if (juego?.quitar) sala.datos.estado = juego.quitar(sala.datos.estado, usuarioId);
      } catch { /* opcional */ }

      /* Si al irse se acaba la partida (por ejemplo, queda uno), la mesa pasa
         a resultados como si hubiera terminado jugando. */
      const fin = sala.datos.estado ? juego?.terminada?.(sala.datos.estado) : null;
      if (fin && sala.fase === "jugando") {
        sala.fase = "final";
        sala.datos.final = { puestos: fin.puestos, cuando: Date.now() };
        this.anotar(sala, "Se acabó la partida.", "fin");
      }

      this.guardar(sala);
      this.difundir(sala);
      return { sala };
    }
    this.sacar(usuarioId);
    return { sala };
  }

  /* ── Conexión ────────────────────────────────────────────────────────── */

  conectar(usuarioId, socketId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return null;
    const vivo = this.vivoDe(sala, usuarioId);
    vivo.sockets.add(socketId);
    vivo.conectado = true;
    clearTimeout(this.timersAnfitrion.get(sala.codigo));
    this.timersAnfitrion.delete(sala.codigo);
    this.difundir(sala);
    return sala;
  }

  desconectar(usuarioId, socketId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return null;
    const vivo = this.vivoDe(sala, usuarioId);
    vivo.sockets.delete(socketId);
    if (vivo.sockets.size > 0) return sala;
    vivo.conectado = false;
    this.difundir(sala);

    /* Anfitrión heredable, con 20 s de gracia: un refresco de página no cambia
       el mando de la mesa. */
    if (sala.anfitrion === usuarioId && (sala.fase === "vestibulo" || sala.fase === "final")) {
      const t = setTimeout(() => {
        const v = this.vivoDe(sala, usuarioId);
        if (v.conectado) return;
        if (this.conectados(sala).length === 0) return; /* mesa vacía: espera */
        this.heredar(sala);
        this.guardar(sala);
        this.difundir(sala);
      }, ESPERA_ANFITRION);
      t.unref?.();
      this.timersAnfitrion.set(sala.codigo, t);
    }
    return sala;
  }

  /* ── Avisos ──────────────────────────────────────────────────────────── */

  avisarDesconectados(sala, aviso) {
    for (const j of sala.datos.jugadores) {
      if (this.vivoDe(sala, j.id).conectado) continue;
      this.avisar(j.id, { ...aviso, url: `./?sala=${sala.codigo}` });
    }
  }

  /* ── Crónica ─────────────────────────────────────────────────────────── */

  anotar(sala, texto, tipo = "nota") {
    if (!texto) return;
    /* Con la jornada a la que pertenece: la crónica del juego se agrupa por
       día y antes el registro del servidor no la llevaba. */
    const dia = sala.datos?.estado?.dia ?? 1;
    /* Y una línea que abre cada jornada. El registro antiguo no la llevaba,
       así que la crónica no tenía dónde cortar; con esto cada día empieza por
       su «Jornada N» y las líneas que vienen detrás ya saben a cuál van. */
    if (tipo !== "nota" && tipo !== "sala" && tipo !== "dia") {
      const ultima = [...sala.log].reverse().find((l) => l.dia);
      if (!ultima || ultima.dia !== dia) {
        sala.log.push({ t: Date.now(), tipo: "dia", texto: `Jornada ${dia}.`, dia });
      }
    }
    sala.log.push({ t: Date.now(), tipo, texto, dia });
    if (sala.log.length > MAX_LOG) sala.log.splice(0, sala.log.length - MAX_LOG);
  }

  /* ── Purga ───────────────────────────────────────────────────────────── */

  borrar(codigo) {
    this.salas.delete(codigo);
    almacen.borrarSala(codigo);
    const t = this.timersAnfitrion.get(codigo);
    if (t) clearTimeout(t);
    this.timersAnfitrion.delete(codigo);
  }

  purgar(ahora = Date.now()) {
    for (const sala of [...this.salas.values()]) {
      /* Nunca borrar una sala con alguien conectado en este momento */
      if (this.conectados(sala).length > 0) continue;
      const edad = ahora - sala.actualizado;
      if (edad > (TTL[sala.fase] ?? TTL.vestibulo)) {
        console.log(`[mesas] ${sala.codigo} caducada (${sala.fase})`);
        this.borrar(sala.codigo);
      }
    }
  }
}
