/* El juego de prueba: una carrera de topos por turnos.

   No es un juego de verdad: está aquí para que la plataforma se pueda jugar de
   punta a punta —turno, acción, crónica, final y revancha— antes de que exista
   el juego bueno. Sirve de plantilla: si un módulo de `juego/` cumple esto,
   entra en la plataforma sin tocarla.

   Dos acciones, una por turno:
   · correr  — avanzas 1 a 3 túneles.
   · empujar — mandas a otro dos túneles atrás. No avanzas tú.
   Gana quien llega antes a la meta. Si se acaban las rondas, gana el que más
   lejos está. */

export const META = 15;
export const MAX_RONDAS = 40;

/* Un generador pequeño y determinista: la semilla y el contador van dentro del
   estado, así que una partida guardada sigue tirando igual al reanudarse. */
function tirar(estado) {
  estado.rng = (estado.rng + 0x6d2b79f5) >>> 0;
  let t = estado.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function nombreDe(estado, id) {
  return estado.nombres?.[id] ?? "alguien";
}

const carrera = {
  id: "carrera",
  nombre: "La carrera de topos",
  min: 2,
  max: 8,
  resumen: "Turnos de correr o empujar. El primero que llega a la meta gana.",

  crear({ jugadores, semilla }) {
    return {
      meta: META,
      maxRondas: MAX_RONDAS,
      orden: jugadores.map((j) => j.id),
      nombres: Object.fromEntries(jugadores.map((j) => [j.id, j.nombre])),
      turno: 0,
      ronda: 1,
      rng: (Number(semilla) || 1) >>> 0,
      jugadores: Object.fromEntries(jugadores.map((j) => [j.id, { pos: 0, tiradas: 0 }])),
      final: null,
    };
  },

  turno(estado) {
    if (estado.final) return null;
    return estado.orden[estado.turno] ?? null;
  },

  legales(estado, jugadorId) {
    if (estado.final) return [];
    if (carrera.turno(estado) !== jugadorId) return [];
    const acciones = [{ tipo: "correr", texto: "Correr" }];
    for (const id of estado.orden) {
      if (id === jugadorId) continue;
      acciones.push({
        tipo: "empujar",
        a: id,
        texto: `Empujar a ${nombreDe(estado, id)}`,
      });
    }
    return acciones;
  },

  aplicar(estado, jugadorId, accion) {
    if (!estado.jugadores[jugadorId] || estado.final) return { estado, eventos: [] };
    const eventos = [];
    const yo = estado.jugadores[jugadorId];
    const nombre = nombreDe(estado, jugadorId);

    if (accion?.tipo === "correr") {
      const pasos = 1 + Math.floor(tirar(estado) * 3);
      yo.pos = Math.min(estado.meta, yo.pos + pasos);
      yo.tiradas += 1;
      eventos.push({
        tipo: "correr",
        texto: `${nombre} avanza ${pasos} y va por ${yo.pos}.`,
        a: jugadorId,
      });
      if (yo.pos >= estado.meta) {
        estado.final = { puestos: carrera.puestos(estado) };
        eventos.push({ tipo: "fin", texto: `${nombre} llega a la meta.` });
        return { estado, eventos };
      }
    } else if (accion?.tipo === "empujar") {
      const otro = estado.jugadores[accion.a];
      if (!otro || accion.a === jugadorId) return { estado, eventos };
      otro.pos = Math.max(0, otro.pos - 2);
      eventos.push({
        tipo: "empujar",
        texto: `${nombre} empuja a ${nombreDe(estado, accion.a)}, que retrocede a ${otro.pos}.`,
        a: accion.a,
      });
    } else {
      return { estado, eventos };
    }

    /* El turno pasa; si se cierra la vuelta, sube la ronda. */
    estado.turno += 1;
    if (estado.turno >= estado.orden.length) {
      estado.turno = 0;
      estado.ronda += 1;
      if (estado.ronda > estado.maxRondas) {
        estado.final = { puestos: carrera.puestos(estado) };
        eventos.push({ tipo: "fin", texto: "Se acabaron las rondas: gana quien más lejos llegó." });
      }
    }
    return { estado, eventos };
  },

  /* Opcional, pero importante: la plataforma avisa cuando alguien abandona
     para que el juego quite su ficha. Sin esto, el turno podría quedarse
     apuntando a una silla vacía y la mesa se pararía. */
  quitar(estado, jugadorId) {
    const i = estado.orden.indexOf(jugadorId);
    if (i < 0) return estado;
    estado.orden.splice(i, 1);
    delete estado.jugadores[jugadorId];
    delete estado.nombres[jugadorId];
    if (estado.orden.length === 0) {
      estado.final = { puestos: [] };
      return estado;
    }
    if (estado.turno > i) estado.turno -= 1;
    if (estado.turno >= estado.orden.length) estado.turno = 0;
    if (estado.orden.length === 1) {
      estado.final = { puestos: carrera.puestos(estado) };
    }
    return estado;
  },

  puestos(estado) {
    return [...estado.orden]
      .map((id) => ({ jugadorId: id, puntos: estado.jugadores[id].pos }))
      .sort((a, b) => b.puntos - a.puntos || estado.orden.indexOf(a.jugadorId) - estado.orden.indexOf(b.jugadorId));
  },

  terminada(estado) {
    return estado.final ?? null;
  },

  publica(estado) {
    return {
      meta: estado.meta,
      ronda: estado.ronda,
      maxRondas: estado.maxRondas,
      turno: carrera.turno(estado),
      pistas: estado.orden.map((id) => ({
        id,
        nombre: estado.nombres[id],
        pos: estado.jugadores[id].pos,
        tiradas: estado.jugadores[id].tiradas,
      })),
    };
  },

  vista(estado, jugadorId) {
    const yo = estado.jugadores[jugadorId];
    if (!yo) return {};
    return { pos: yo.pos, tiradas: yo.tiradas, teToca: carrera.turno(estado) === jugadorId };
  },
};

export default carrera;
