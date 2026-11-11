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
  vestibulo: 2 * 60 * 60 * 1000,
  final: 2 * 60 * 60 * 1000,
  jugando: 7 * 24 * 60 * 60 * 1000,
};

const ESPERA_ANFITRION = 20 * 1000;
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; /* sin I ni O: no se confunden al dictar */
const MAX_LOG = 160;

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
          final: guardado.final,
        },
        log: Array.isArray(guardado.log) ? guardado.log : [],
        actualizado: fila.actualizado ?? ahora,
        vivo: new Map(), /* usuarioId → { sockets:Set, conectado } */
      });
    }
    if (this.salas.size) console.log(`[mesas] ${this.salas.size} mesa(s) recuperadas`);
  }

  guardar(sala) {
    sala.actualizado = Date.now();
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
    this.anotar(sala, `${jugador?.nombre ?? "alguien"} sale de la madriguera.`);

    if (sala.datos.jugadores.length === 0) {
      this.borrar(sala.codigo);
      return sala;
    }
    if (sala.anfitrion === usuarioId) this.heredar(sala);
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

    sala.semilla = Math.floor(Math.random() * 1_000_000_000);
    sala.datos.estado = juego.crear({
      jugadores: jugadores.map(({ id, nombre, avatar }) => ({ id, nombre, avatar })),
      semilla: sala.semilla,
    });
    sala.fase = "jugando";
    this.anotar(sala, "Empieza la partida.");
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
      salida = juego.aplicar(estado, usuarioId, { ...legal });
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
    if (!fin && juego.bot) {
      let sigBot = juego.turno(sala.datos.estado);
      let guard = 0;
      while (sigBot && sala.datos.jugadores.find(j => j.id === sigBot)?.esBot && guard++ < 50) {
        const accionBot = juego.bot(sala.datos.estado, sigBot);
        if (!accionBot) break;
        const salidaBot = juego.aplicar(sala.datos.estado, sigBot, accionBot);
        sala.datos.estado = salidaBot.estado ?? sala.datos.estado;
        for (const ev of salidaBot.eventos ?? []) this.anotar(sala, ev.texto, ev.tipo);
        const finBot = juego.terminada(sala.datos.estado);
        if (finBot) {
          sala.fase = "final";
          sala.datos.final = { puestos: finBot.puestos, cuando: Date.now() };
          this.anotar(sala, "Se acabó la partida.", "fin");
          this.guardar(sala);
          this.difundir(sala);
          return { sala };
        }
        sigBot = juego.turno(sala.datos.estado);
      }
      this.guardar(sala);
      this.difundir(sala);
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

  revancha(usuarioId) {
    const sala = this.deUsuario(usuarioId);
    if (!sala) return { error: "No estás en ninguna madriguera." };
    if (sala.fase !== "final") return { error: "La partida no ha terminado." };
    if (sala.anfitrion !== usuarioId) return { error: "Solo el anfitrión puede pedir revancha." };

    sala.fase = "vestibulo";
    sala.datos.estado = null;
    delete sala.datos.final;
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
    sala.log.push({ t: Date.now(), tipo, texto });
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
      const edad = ahora - sala.actualizado;
      if (edad > (TTL[sala.fase] ?? TTL.vestibulo)) {
        console.log(`[mesas] ${sala.codigo} caducada (${sala.fase})`);
        this.borrar(sala.codigo);
      }
    }
  }
}
