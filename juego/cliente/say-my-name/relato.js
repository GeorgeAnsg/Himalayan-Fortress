/* Los sucesos del motor, contados en una línea. Solo se cuenta lo que el
   jugador ve: su sala y lo que le pasa a él. */

export function nombreSala(v, id) {
  return (v.mapa[id] && v.mapa[id].nombre) || id;
}

function al(nombre) {
  if (nombre.startsWith("el ")) return "al " + nombre.slice(3);
  if (nombre.startsWith("la ")) return "a la " + nombre.slice(3);
  return "a " + nombre;
}

function en(nombre) {
  if (nombre.startsWith("el ")) return "en el " + nombre.slice(3);
  if (nombre.startsWith("la ")) return "en la " + nombre.slice(3);
  return "en " + nombre;
}

function dato(d) {
  if (!d) return null;
  return `${d.nombre} ${d.rasgo} ${d.valor ? "sí" : "no"}`;
}

const vistos = (lista) => (lista.length ? lista.join(" y ") : "nada");

export function contar(ev, v, yo, apodoDe, nombreObj = () => "algo") {
  const mio = ev.quien === yo;
  const quien = mio ? "Tú" : apodoDe(ev.quien);
  const enMiSala = (sala) => sala && sala === v.sala;

  switch (ev.tipo) {
    case "mover":
      if (mio) return { clase: "yo", texto: `Vas ${al(nombreSala(v, ev.a))}.` };
      if (ev.a === v.sala) return { clase: "gesto", texto: `${quien} entra.` };
      if (ev.de === v.sala) return { clase: "gesto", texto: `${quien} sale ${al(nombreSala(v, ev.a))}.` };
      return null;

    case "registrar": {
      if (!mio && !enMiSala(ev.sala)) return null;
      const huecos = ev.ver.map((i) => i + 1).join(" y ");
      const suyos = (ev.vistos || []).map((id) => nombreObj(id));
      if (mio) {
        const visto = suyos.length ? suyos.join(" y ") : "nada";
        return { clase: "yo", texto: `Registras los huecos ${huecos}: ${visto}.` };
      }
      return { clase: "gesto", texto: `${quien} registra los huecos ${huecos}.` };
    }

    case "coger": {
      if (!mio && !enMiSala(ev.sala)) return null;
      const donde = ev.de === "centro" ? " de lo que estaba a la vista" : "";
      if (mio) return { clase: "yo", texto: `Coges ${nombreObj(ev.obj)}${donde}, a la ${ev.sitio}.` };
      return { clase: "gesto", texto: `${quien} coge ${nombreObj(ev.obj)}.` };
    }

    case "usar": {
      if (!mio && !enMiSala(ev.sala)) return null;
      if (mio) {
        /* `resultado` es una palabra («bien», «fallo»), no un booleano: darlo
           por cierto contaba como éxito cualquier uso, y con `dado: null`
           salía «funciona: null». */
        const cual = ev.obj ? nombreObj(ev.obj) : "el objeto";
        if (ev.resultado !== "bien") {
          return { clase: "yo", texto: `Usas ${cual} aquí y no sirve: no pasa nada.` };
        }
        const d = ev.dado;
        const que = d?.rasgo
          ? `${d.nombre} · ${d.rasgo}: ${d.valor ? "sí" : "no"}`
          : d
            ? `${d.nombre} está en ${nombreSala(v, d.sala)}`
            : "";
        return { clase: "yo", texto: `Usas ${cual} aquí y funciona.${que ? ` ${que}.` : ""}` };
      }
      return { clase: "gesto", texto: `${quien} usa un objeto.` };
    }

    case "esconder":
      if (!mio) return enMiSala(ev.sala) ? { clase: "gesto", texto: `${quien} esconde algo.` } : null;
      return {
        clase: "yo",
        texto: ev.centro
          ? `Escondes ${nombreObj(ev.obj)}, pero no cabe: queda a la vista.`
          : `Escondes ${nombreObj(ev.obj)}.`,
      };

    case "guardar":
      return mio ? { clase: "yo", texto: `Guardas ${nombreObj(ev.obj)} en la bolsa.` } : null;

    case "tirar":
      /* Solo lo lee quien lo hace; los demás lo ven si estaban delante, por
         el suceso de espera. */
      return mio ? { clase: "yo", texto: `Tiras ${nombreObj(ev.obj)}: vuelve al amanecer.` } : null;

    case "cambiar": {
      const entra = ev.guarda ? `guardas ${nombreObj(ev.guarda)}` : null;
      const sale = ev.saca ? `sacas ${nombreObj(ev.saca)} a la mano` : null;
      const dicho = [entra, sale].filter(Boolean).join(" y ");
      if (!dicho) return null;
      if (mio) return { clase: "yo", texto: `Cambias lo que llevas: ${dicho}.` };
      return enMiSala(ev.sala) ? { clase: "gesto", texto: `${quien} cambia lo que lleva: ${dicho}.` } : null;
    }

    case "pasar":
      return mio ? { clase: "gesto", texto: "Pasas el resto de la jornada." } : null;

    case "robar": {
      if (ev.a === yo) {
        return {
          clase: "malo",
          texto: ev.obj ? `${quien} te roba algo de la ${ev.de}.` : `${quien} te registra la bolsa y no encuentra nada.`,
        };
      }
      if (mio) {
        return {
          clase: "yo",
          texto: ev.obj
            ? `Le robas algo de la ${ev.de} a ${apodoDe(ev.a)}.`
            : `Registras la bolsa de ${apodoDe(ev.a)} a ciegas: está vacía.`,
        };
      }
      return null;
    }

    case "reclamar": {
      const d = dato(ev.dado);
      if (mio) {
        return { clase: "yo", texto: `Reclamas tu objeto a ${apodoDe(ev.a)}.${d ? ` Te da: ${d}.` : " No sabe nada nuevo."}` };
      }
      if (ev.a === yo) return { clase: "malo", texto: `${quien} te reclama su objeto.${d ? ` Le das: ${d}.` : ""}` };
      return null;
    }

    case "interrogar": {
      const d = dato(ev.dado);
      if (mio) return { clase: "yo", texto: `Interrogas a ${apodoDe(ev.a)} con la lupa.${d ? ` Te da: ${d}.` : " No sabe nada nuevo."}` };
      if (ev.a === yo) return { clase: "malo", texto: `${quien} te interroga con la lupa.${d ? ` Le das: ${d}.` : ""}` };
      return null;
    }

    case "manos":
      return mio
        ? { clase: "yo", texto: "Te pones los guantes de terciopelo. Tienes 2 acciones más." }
        : null;

    case "pasadizo":
      return mio
        ? { clase: "yo", texto: `Usas la antorcha y apareces en ${nombreSala(v, ev.a)}.` }
        : enMiSala(ev.de)
          ? { clase: "gesto", texto: `${quien} desaparece por un pasadizo.` }
          : enMiSala(ev.a)
            ? { clase: "gesto", texto: `${quien} aparece de repente desde un pasadizo.` }
            : null;

    case "brindar":
      if (mio) return { clase: "yo", texto: `Brindas con la copa. ${ev.afectados?.length ?? 0} ${ev.afectados?.length === 1 ? "persona pierde" : "personas pierden"} 1 acción y tú ganas ${ev.afectados?.length ?? 0}.` };
      return ev.afectados?.includes(yo)
        ? { clase: "malo", texto: `${quien} brinda con una copa de estaño. Pierdes 1 acción en tu próximo turno.` }
        : null;

    case "golpe":
      if (mio) return { clase: "yo", texto: `Golpeas a ${ev.aApodo ?? "alguien"} con la tranca.` };
      if (ev.a === yo) return { clase: "malo", texto: `${quien} te golpea con la tranca. Pierdes 3 acciones en tu próximo turno.` };
      return enMiSala(ev.sala ?? ev.de)
        ? { clase: "malo", texto: `${quien} golpea a ${ev.aApodo ?? "alguien"} con la tranca.` }
        : null;

    case "cepo_puesto":
      return mio
        ? { clase: "yo", texto: `Colocas el cepo de hierro en ${nombreSala(v, ev.sala)}.` }
        : null;

    case "cepo_activado":
      if (mio) return { clase: "malo", texto: `Caes en un cepo. No podrás moverte el resto de esta jornada.` };
      return enMiSala(ev.sala)
        ? { clase: "malo", texto: `${quien} cae en un cepo.` }
        : null;

    case "humo":
      if (mio) return { clase: "yo", texto: `Lanzas el frasco de humo. La jornada siguiente la sala quedará en penumbra.` };
      return enMiSala(ev.sala)
        ? { clase: "malo", texto: `${quien} lanza un frasco de humo. La jornada siguiente la sala quedará en penumbra.` }
        : null;

    case "habilidad":
      if (ev.cual === "capa") {
        if (mio) return { clase: "yo", texto: `Te pones la capa.` };
        return enMiSala(ev.sala)
          ? { clase: "neutro", texto: `${quien} se pone una capa y desaparece entre las sombras.` }
          : null;
      }
      return null;

    case "atar":
      if (mio) return { clase: "yo", texto: `Atas a ${ev.aApodo ?? "alguien"} con la cuerda. No podrá moverse en su próxima jornada.` };
      if (ev.a === yo) return { clase: "malo", texto: `${quien} te ata con una cuerda. No podrás moverte en tu próxima jornada.` };
      return enMiSala(ev.sala)
        ? { clase: "malo", texto: `${quien} ata a ${ev.aApodo ?? "alguien"} con una cuerda.` }
        : null;

    case "empujon":
      if (mio) return { clase: "yo", texto: `Empujas a ${ev.aApodo ?? "alguien"} hacia ${nombreSala(v, ev.hacia)}.` };
      if (ev.a === yo) return { clase: "malo", texto: `${quien} te empuja hacia ${nombreSala(v, ev.hacia)}.` };
      return enMiSala(ev.de)
        ? { clase: "malo", texto: `${quien} empuja a ${ev.aApodo ?? "alguien"} hacia ${nombreSala(v, ev.hacia)}.` }
        : null;

    case "tranca":
      return mio
        ? { clase: "yo", texto: `Trancas la puerta ${al(nombreSala(v, ev.a))}.` }
        : enMiSala(ev.de)
          ? { clase: "malo", texto: `${quien} tranca la puerta ${al(nombreSala(v, ev.a))}.` }
          : null;

    case "vaso":
      if (!mio) return null;
      return {
        clase: "yo",
        texto: ev.n
          ? `Pegas el vaso ${en(nombreSala(v, ev.a))}: hay ${ev.n} ${ev.n === 1 ? "persona" : "personas"}.`
          : `Pegas el vaso ${en(nombreSala(v, ev.a))}: no hay nadie.`,
      };

    case "cotillear": {
      /* Se pregunta por un nombre, y la respuesta es siempre de ese nombre: no
         hay forma de saber si el que habla sabía o se lo inventó. El contenido
         tampoco se escribe: puede ser mentira y no sirve para deducir. */
      const sobre = ev.sobre ? ` sobre ${ev.sobre}` : "";
      if (mio) {
        const acierto = ev.acierto === true;
        const cuenta = !ev.vuelta
          ? " No tiene nada que contarte."
          : acierto
            ? ` Aciertas: cotilleo sobre ${ev.sobre}${ev.bonus ? ` y sobre ${ev.bonus.nombre}` : ""}.`
            : ` Fallas: cotilleo sobre ${ev.vuelta.nombre}.`;
        return { clase: "yo", texto: `Cotilleas con ${apodoDe(ev.con)}${sobre}.${cuenta}` };
      }
      if (ev.con !== yo) return null;
      return { clase: "gesto", texto: `${quien} te cotillea${sobre}.` };
    }

    case "soltar":
      /* Dos formas de soltar: la que se elige (el objeto se va a otra estancia)
         y la que llega sola al acabarse el acarreo. */
      if (mio)
        return ev.voluntario
          ? { clase: "yo", texto: `Sueltas ${nombreObj(ev.obj)}: la casa lo esconde en otra estancia.` }
          : { clase: "malo", texto: "Se te acaba el acarreo: sueltas lo que llevabas." };
      return enMiSala(ev.sala) ? { clase: "gesto", texto: `${quien} suelta lo que llevaba.` } : null;

    case "salida": {
      if (mio) return {
        clase: ev.aciertos ? "yo" : "malo",
        texto: ev.aciertos
          ? "Dices todos los nombres y la puerta se abre."
          : "Te equivocas. La puerta no se abre y quedas eliminado.",
      };
      return {
        clase: ev.aciertos ? "gesto" : "malo",
        texto: ev.aciertos
          ? `${quien} sale por la puerta.`
          : `${quien} falla la salida y queda eliminado.`,
      };
    }

    case "cerrar":
      return { clase: "malo", texto: "La casa se cierra." };

    case "salas_nuevas":
      return { clase: "gesto", texto: "Se abren estancias nuevas en la casa." };

    default:
      return null;
  }
}

export function textoVistos(lista) {
  return vistos(lista || []);
}

/* Lo que ha pasado delante de ti mientras no era tu turno. Los sucesos ya
   vienen filtrados por el motor —solo los que viste desde donde estabas— y con
   los nombres puestos, así que aquí no hay nada que adivinar ni que ocultar.
   Se cuenta el gesto, no lo que solo sabía el que lo hacía. */
/* Lo que llega por la pared se cuenta igual que lo que ves: la lista de lo que
   ha pasado mientras esperabas, solo que de dos salas. Como no estabas allí,
   cada línea dice en cuál fue; de un objeto usado no llega cuál era. */
function contarOido(ev, v) {
  const quien = ev.apodo ?? "Alguien";
  const donde = (n) => (n ? n.charAt(0).toLowerCase() + n.slice(1) : "otra estancia");
  /* Dónde fue, delante: la línea empieza por la sala para que no se confunda
     con lo que pasaba delante de ti. */
  const alli = ev.salaNombre ? `En ${donde(ev.salaNombre)}, ` : "";
  switch (ev.tipo) {
    case "mover":
      return ev.deNombre && ev.aNombre
        ? { clase: "oido", texto: `${quien} pasa de ${donde(ev.deNombre)} a ${donde(ev.aNombre)}.` }
        : null;
    case "coger":
      return {
        clase: "oido",
        texto: `${alli}${quien} coge ${ev.objNombre ?? "algo"}${ev.de === "centro" ? ", de lo que estaba a la vista" : ""}.`,
      };
    case "usar":
      return { clase: "oido", texto: `${alli}${quien} usa algo.` };
    case "esconder":
      return {
        clase: "oido",
        texto: ev.centro
          ? `${alli}${quien} suelta ${ev.objNombre ?? "algo"}: no le cabía y queda a la vista.`
          : `${alli}${quien} esconde ${ev.objNombre ?? "algo"} en un hueco.`,
      };
    case "guardar":
      return { clase: "oido", texto: `${alli}${quien} guarda ${ev.objNombre ?? "algo"} en la bolsa.` };
    case "cambiar": {
      const entra = ev.guardaNombre ? `guarda ${ev.guardaNombre}` : null;
      const sale = ev.sacaNombre ? `saca ${ev.sacaNombre} a la mano` : null;
      const dicho = [entra, sale].filter(Boolean).join(" y ");
      return dicho ? { clase: "oido", texto: `${alli}${quien} cambia lo que lleva: ${dicho}.` } : null;
    }
    case "robar":
      return { clase: "oido", texto: `${alli}${quien} le roba algo ${al(ev.apodoDe ?? "alguien")}.` };
    case "golpe":
      return { clase: "oido", texto: `${alli}${quien} golpea a ${ev.aApodo ?? "alguien"} con la tranca.` };
    case "tranca":
      return { clase: "oido", texto: `${quien} tranca la puerta a ${donde(ev.aNombre)}.` };
    case "destrancar":
      return { clase: "oido", texto: `${quien} abre el cerrojo a ${donde(ev.aNombre)}.` };
    case "soltar":
      return { clase: "oido", texto: `${alli}${quien} suelta lo que llevaba.` };
    case "cotillear": {
      const sobre = ev.apodoSobre ? ` sobre ${ev.apodoSobre}` : "";
      /* Tampoco aquí el contenido: puede ser mentira y solo sirve para el
         contador. El que escucha sí se queda el cotilleo, pero no lo lee. */
      const pista = ev.pista ? ` Te llevas un cotilleo sobre ${ev.pista.nombre}.` : "";
      return { clase: "oido", texto: `${alli}${quien} cotillea con ${ev.apodoCon ?? "alguien"}${sobre}.${pista}` };
    }
    default:
      return null;
  }
}

export function contarEspera(ev, v) {
  if (ev.oido) return contarOido(ev, v);
  const quien = ev.apodo ?? "Alguien";
  const donde = (n) => (n ? n.charAt(0).toLowerCase() + n.slice(1) : "otra estancia");
  /* Los movimientos se cuentan desde tu sala: lo que importa no es por dónde
     pasa, es quién entra y quién se va. Si la sala del suceso no es la tuya
     (un aviso de la casa entera, la salida por la puerta), se cuenta el viaje. */
  const sala = v?.sala;

  switch (ev.tipo) {
    case "mover":
      if (sala && ev.a === sala) return { clase: "gesto", texto: `${quien} entra desde ${donde(ev.deNombre)}.` };
      if (sala && ev.de === sala) return { clase: "gesto", texto: `${quien} se va hacia ${donde(ev.aNombre)}.` };
      return { clase: "gesto", texto: `${quien} pasa de ${donde(ev.deNombre)} a ${donde(ev.aNombre)}.` };
    case "registrar":
      return { clase: "gesto", texto: `${quien} mira dentro de dos huecos.` };
    case "coger":
      return {
        clase: "gesto",
        texto:
          `${quien} coge ${ev.objNombre ?? "algo"}` +
          (ev.de === "centro" ? ", de lo que estaba a la vista." : "."),
      };
    case "usar":
      return { clase: "gesto", texto: `${quien} usa ${ev.objNombre ?? "un objeto"}.` };
    case "esconder":
      return {
        clase: "gesto",
        texto: ev.centro
          ? `${quien} suelta ${ev.objNombre ?? "algo"}: no cabe y queda a la vista.`
          : `${quien} esconde ${ev.objNombre ?? "algo"} en un hueco.`,
      };
    case "guardar":
      return { clase: "gesto", texto: `${quien} guarda ${ev.objNombre ?? "algo"} en la bolsa.` };
    case "tirar":
      return { clase: "gesto", texto: `${quien} se deshace de ${ev.objNombre ?? "algo"}.` };
    case "cambiar": {
      const entra = ev.guardaNombre ? `guarda ${ev.guardaNombre}` : null;
      const sale = ev.sacaNombre ? `saca ${ev.sacaNombre} a la mano` : null;
      const dicho = [entra, sale].filter(Boolean).join(" y ");
      return dicho ? { clase: "gesto", texto: `${quien} cambia lo que lleva: ${dicho}.` } : null;
    }
    case "robar":
      return {
        clase: "gesto",
        texto: ev.obj
          ? `${quien} le roba ${ev.objNombre ?? "algo"} de la ${ev.de} a ${ev.apodoDe ?? "alguien"}.`
          : `${quien} registra la bolsa de ${ev.apodoDe ?? "alguien"} a ciegas: está vacía.`,
      };
    case "reclamar":
      return { clase: "gesto", texto: `${quien} le reclama su objeto a ${ev.apodoDe ?? "alguien"}.` };
    case "interrogar":
      return { clase: "gesto", texto: `${quien} interroga a ${ev.apodoDe ?? "alguien"} con la lupa.` };
    case "brindar":
      return { clase: "malo", texto: `${quien} brinda con una copa de estaño. Pierdes 1 acción en tu próximo turno.` };
    case "golpe":
      return { clase: "malo", texto: `${quien} golpea a ${ev.apodoDe ?? ev.aApodo ?? "alguien"} con la tranca.` };
    case "tranca":
      return { clase: "malo", texto: `${quien} tranca la puerta a ${donde(ev.aNombre)}.` };
    case "destrancar":
      return { clase: "gesto", texto: `${quien} abre la puerta a ${donde(ev.aNombre)}.` };
    case "soltar":
      return { clase: "gesto", texto: `${quien} suelta lo que llevaba.` };
    case "cotillear":
      return { clase: "gesto", texto: `${quien} cotillea con ${ev.apodoCon ?? "alguien"}.` };
    case "salas_nuevas":
      return { clase: "gesto", texto: "Se abren estancias nuevas en la casa." };
    case "salida":
      return { clase: ev.aciertos ? "malo" : "gesto", texto: `${quien} ${ev.aciertos ? "sale por la puerta" : "falla la salida y queda eliminado"}.` };
    default:
      return null;
  }
}
