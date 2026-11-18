/* Say My Name — adaptador para la plataforma madrigueras.
   El motor viene de corvus/motor/ sin modificar. */

import {
  crearPartida, legales, aplicar, amanecer,
  vista, aQuienLeToca, jornadaTerminada, jugadores,
} from "./say-my-name/motor.js";
import { tema } from "./say-my-name/contenido.js";
import { elegir } from "./say-my-name/bot.js";

/* Mapas de identidad: madrigueras usa sus propios IDs (ej. "j_abc"); el motor
   usa j0, j1… Los guardamos en el estado para no perderlos entre llamadas. */
function midACorvus(estado, mid) {
  return estado._idMap?.[mid] ?? mid;
}
function corvusAMid(estado, cid) {
  return estado._idMapInv?.[cid] ?? cid;
}

/* Traduce todos los IDs corvus que aparecen en la vista devuelta. */
function traducirIds(obj, estado) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((x) => traducirIds(x, estado));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if ((k === "id" || k === "quien" || k === "ganador") && typeof v === "string") {
      out[k] = corvusAMid(estado, v);
    } else {
      out[k] = traducirIds(v, estado);
    }
  }
  return out;
}

/* El motor guarda las puertas cerradas en un `Set`. Al pasar el estado por
   JSON (la plataforma lo guarda en SQLite) un Set se convierte en `{}` y al
   recuperar la mesa `e.cerrojadas.has` revienta: la partida se queda sin
   vista. Se guarda como lista y se revive al entrar. */
function revivir(estado) {
  if (!estado) return estado;
  if (!(estado.cerrojadas instanceof Set)) {
    const cerradas = estado.cerrojadas;
    estado.cerrojadas = new Set(
      Array.isArray(cerradas) ? cerradas : Object.keys(cerradas ?? {})
    );
  }
  return estado;
}

function serializar(estado) {
  if (estado && estado.cerrojadas instanceof Set) {
    estado.cerrojadas = [...estado.cerrojadas];
  }
  return estado;
}

export default {
  id: "say-my-name",
  nombre: "Say My Name",
  min: 5,
  max: 8,
  resumen: "Averigua quién se esconde detrás de cada apodo y sal de la casa antes que nadie.",
  sinPersonalizacion: true,

  revivir,
  serializar,

  crear({ jugadores: js, semilla, opciones }) {
    const estado = crearPartida(tema, {
      semilla: semilla ?? 1,
      nJugadores: js.length,
      registroTotal: opciones?.registroTotal ?? true,
      habsConfig:    opciones?.habsConfig ?? [],
      habsInicio:    opciones?.habsInicio ?? [],
    });

    estado._idMap = {};
    estado._idMapInv = {};

    const asignados = opciones?.personajes && Object.keys(opciones.personajes).length > 0;
    if (asignados) {
      /* Respetar la selección de personaje de cada jugador. */
      const apodoACid = {};
      for (const [cid, p] of Object.entries(estado.jugadores)) apodoACid[p.apodo] = cid;

      const cidsPendientes = new Set(Object.keys(estado.jugadores));
      for (const j of js) {
        const apodo = opciones.personajes[j.id];
        const cid = apodo ? apodoACid[apodo] : null;
        if (cid && cidsPendientes.has(cid)) {
          estado._idMap[j.id] = cid;
          estado._idMapInv[cid] = j.id;
          cidsPendientes.delete(cid);
        }
      }
      /* Jugadores sin selección van a los cids restantes en orden. */
      const resto = [...cidsPendientes];
      let r = 0;
      for (const j of js) {
        if (!estado._idMap[j.id]) {
          const cid = resto[r++];
          estado._idMap[j.id] = cid;
          estado._idMapInv[cid] = j.id;
        }
      }
    } else {
      js.forEach((j, i) => {
        const cid = `j${i}`;
        estado._idMap[j.id] = cid;
        estado._idMapInv[cid] = j.id;
      });
    }

    /* El nombre que se juega es el de la cuenta, no uno de la lista al azar:
       lo que hay que averiguar es qué apodo esconde a cada persona sentada. Los
       bots se quedan con el nombre con el que se sientan («Bot 1»). Se
       desempata por orden para que dos asientos nunca compartan nombre: el
       motor usa el nombre como clave del cuaderno. */
    const usados = new Set();
    for (const j of js) {
      const p = estado.jugadores[estado._idMap[j.id]];
      if (!p) continue;
      const base = String(j.nombre ?? "").trim() || p.nombre;
      let nombre = base;
      let n = 2;
      while (usados.has(nombre)) nombre = `${base} ${n++}`;
      usados.add(nombre);
      p.nombre = nombre;
    }

    return estado;
  },

  legales(estado, jugadorId) {
    revivir(estado);
    const cid = midACorvus(estado, jugadorId);
    return legales(estado, cid);
  },

  aplicar(estado, jugadorId, accion) {
    revivir(estado);
    const cid = midACorvus(estado, jugadorId);
    const antes = estado.sucesos.length;

    aplicar(estado, cid, accion);

    /* Amanecer automático cuando nadie tiene PA. */
    if (!estado.fin && jornadaTerminada(estado)) amanecer(estado);

    /* Extraer los nuevos sucesos como eventos para la crónica. */
    const nuevos = estado.sucesos.slice(antes);
    const eventos = nuevos
      .filter((s) => s.tipo !== "vaso" && s.tipo !== "pasar")
      .map((s) => ({
        tipo: s.tipo,
        texto: textoSuceso(s, estado),
        /* `a` apunta al jugador al que va el turno, si es relevante. */
        ...(s.tipo === "salida" && s.quien
          ? { a: corvusAMid(estado, s.quien) }
          : {}),
      }));

    return { estado, eventos };
  },

  publica(estado) {
    revivir(estado);
    return {
      dia: estado.dia,
      dias: estado.dias,
      fin: estado.fin ?? null,
      ganador: estado.fin && estado.ganador
        ? corvusAMid(estado, estado.ganador)
        : null,
      /* El cliente necesita el mapa inverso para saber su corvus ID a partir
         de su madrigueras ID. */
      idMap: estado._idMap ?? {},
    };
  },

  vista(estado, jugadorId) {
    revivir(estado);
    const cid = midACorvus(estado, jugadorId);
    const v = vista(estado, cid);
    /* Traducir todos los IDs corvus a IDs madrigueras en la vista. */
    return traducirIds(v, estado);
  },

  turno(estado) {
    revivir(estado);
    const cid = aQuienLeToca(estado);
    if (!cid) return null;
    return corvusAMid(estado, cid);
  },

  /* Un bot juega una sola acción: elige entre las legales con la misma
     política que el motor original usa para sus bots (juego/say-my-name/
     bot.js), que solo mira lo que vería una persona sentada en ese sitio.
     La plataforma le pide una acción por turno y aplica la siguiente. */
  bot(estado, jugadorId) {
    revivir(estado);
    const cid = midACorvus(estado, jugadorId);
    if (!cid || !estado.jugadores?.[cid]) return null;
    try {
      return elegir(estado, cid) ?? null;
    } catch {
      return null;
    }
  },

  terminada(estado) {
    if (!estado.fin) return null;
    const js = jugadores(estado);
    const ganadorCid = estado.ganador;
    return {
      puestos: [
        ...js
          .filter((p) => p.id === ganadorCid)
          .map((p) => ({ jugadorId: corvusAMid(estado, p.id), puntos: 100 })),
        ...js
          .filter((p) => p.id !== ganadorCid)
          .map((p) => ({ jugadorId: corvusAMid(estado, p.id), puntos: 0 })),
      ],
    };
  },
};

/* Texto legible del suceso para la crónica pública. */
function textoSuceso(s, estado) {
  const apodo = (cid) => {
    const p = estado.jugadores[cid];
    return p?.apodo ?? cid;
  };
  switch (s.tipo) {
    case "mover":    return `${apodo(s.quien)} se mueve.`;
    case "coger":    return `${apodo(s.quien)} coge algo.`;
    case "dejar":    return `${apodo(s.quien)} deja algo.`;
    case "registrar": return `${apodo(s.quien)} registra la sala.`;
    case "usar":     return `${apodo(s.quien)} usa un objeto.`;
    case "hablar":   return `${apodo(s.quien)} habla.`;
    case "salida":   return s.aciertos
      ? `${apodo(s.quien)} sale de la casa.`
      : `${apodo(s.quien)} intenta salir… y falla.`;
    case "amanecer": return `Jornada ${s.dia}.`;
    default:         return `${apodo(s.quien ?? "alguien")} actúa.`;
  }
}
