/* ================================================================== */
/*  v3 — LA POLÍTICA                                            */
/*                                                                    */
/*  El bot no decide qué es legal: elige entre lo que le ofrecen las   */
/*  reglas. No lee el estado: lee `vista()`, el mismo papel que recibe  */
/*  una persona en el navegador. Si aquí aparece un dato que la vista   */
/*  no da, es una trampa.                                              */
/* ================================================================== */

import { legales, vista, aplicar, aQuienLeToca } from "./motor.js";

/* El turno entero de un bot: sus acciones y, si le sobran fichas, pasa. Lo usan
   el servidor y la partida local para que nadie se quede esperando a un bot. */
export function jugarTurno(e, pid, { sinSalir = false } = {}) {
  const p = e.jugadores[pid];
  if (!p || p.fuera) return;
  for (let k = 0; k < 8 && !e.fin && p.pa > 0; k++) {
    if (aQuienLeToca(e) !== pid) break;
    let accion = null;
    try { accion = elegir(e, pid, sinSalir); } catch { break; }
    if (!accion) break;
    try { aplicar(e, pid, accion); } catch { break; }
  }
  /* Lo que le sobre no se queda para mañana: pasa y deja el sitio. */
  if (!e.fin && p.pa > 0 && aQuienLeToca(e) === pid) {
    try { aplicar(e, pid, { tipo: "pasar" }); } catch { /* nada */ }
  }
}

export function elegir(e, pid, sinSalir = false) {
  const v = vista(e, pid);
  const acts = legales(e, pid);
  if (!acts.length) return null;

  const listos = v.cerrados.length >= v.puedenSalir;
  const puerta = Object.keys(v.mapa).find((s) => v.mapa[s].puerta);

  /* Con todos los nombres, a la puerta y se sale: los rivales y, al final,
     el suyo. */
  if (listos && !sinSalir) {
    const salir = acts.find((a) => a.tipo === "salir");
    if (salir)
      return {
        tipo: "salir",
        dichos: [
          ...v.cerrados.slice(0, v.puedenSalir).map((c) => ({ apodo: c.apodo, nombre: c.nombre })),
          { apodo: v.yo.apodo, nombre: v.yo.nombre },
        ],
      };
    const m = hacia(v, acts, puerta);
    if (m) return m;
  }

  const obj = objetivo(v, puerta);
  let mejor = null;
  let nota = -Infinity;

  for (const a of acts) {
    const n = puntuar(v, a, obj, puerta);
    if (n > nota) {
      nota = n;
      mejor = a;
    }
  }

  return mejor;
}

/* ------------------------------------------------------------------ */
export function puntuar(v, a, obj, puerta) {
  const abiertaHoy = v.visto[v.sala] && v.visto[v.sala].dia === v.dia;
  const faltan = v.puedenSalir - v.cerrados.length; /* cuántos nombres faltan para salir */

  switch (a.tipo) {
    case "salir":
      return -100; /* fuera de su momento */

    case "indagar": {
      /* Gratis y convierte dichos en dato cierto: prioridad máxima siempre. */
      const ya = v.sabe[a.sobre] ? Object.keys(v.sabe[a.sobre]).length : 0;
      return 200 - ya * 5;
    }

    case "cotillear": {
      /* Ahora se pregunta por un nombre, no por un personaje. */
      const nombre = a.sobre;
      if (!nombre) return 125;
      /* Ya cerrado: poco valor */
      if (v.cerrados?.some?.((c) => c.nombre === nombre)) return 60;
      /* Ya tenemos todos los rasgos confirmados: no aporta */
      if (v.sabe[nombre] && Object.keys(v.sabe[nombre]).length >= 3) return 55;
      /* Contamos fuentes únicas de dichos no usados sobre esta persona */
      const fuentesLibres = new Set(
        v.dichos.filter((d) => d.nombre === nombre && !d.usado).map((d) => d.de)
      ).size;
      /* Con 1 dicho ya acumulado, el siguiente permite indagar: máxima prioridad */
      if (fuentesLibres === 1) return 148;
      /* Sin dichos aún: útil pero menos urgente */
      return 125;
    }

    case "reclamar":
      /* Un dato verdadero garantizado: casi tan bueno como indagar */
      return 155;

    case "usar": {
      const o = enMano(v, a.obj);
      if (!o || o.tipo === "habilidad") return -50;
      if (o.dueño === v.yo.id) return -60;
      if (o.tipo !== "situacion" && o.dueño && yaCerrado(v, o.dueño)) return -55;
      if (v.bien[o.id] && (o.tipo !== "situacion" || v.bien[o.id] === v.sala)) return -55;
      const rumor = v.dichos.some(
        (d) => d.nombre === o.dueñoNombre && !(v.sabe[o.dueñoNombre] || {})[d.rasgo]
      );
      if (o.sugiere.includes(v.sala) && !probado(v, o.id, v.sala)) return 105 + (rumor ? 6 : 0);
      return -40;
    }

    case "coger": {
      const o = a.info;
      if (!o) return 10;
      if (o.tipo === "habilidad") return 102;
      if (o.tipo === "situacion") return v.bien[o.id] ? 10 : 66;
      if (o.dueño === v.yo.id) return 8;
      if (v.bien[o.id]) return 12;
      if (o.dueño && yaCerrado(v, o.dueño)) return 30;
      if (o.sugiere && o.sugiere.length && o.sugiere.every((s) => probado(v, o.id, s))) return 14;
      /* Solo vale la pena coger un objeto de rasgo si PODEMOS usarlo YA en esta sala
         o en la siguiente (sugiere incluye la sala actual o adyacente). */
      if (o.sugiere && o.sugiere.includes(v.sala)) return 92; /* úsalo aquí mismo */
      return 45; /* coger para llevar: menos urgente que cotillear */
    }

    case "registrar": {
      const visita = v.visto[v.sala];
      const visitadaHoy = visita && visita.dia === v.dia;
      const huecosTotales = v.mapa[v.sala]?.huecos ?? 0;
      const yaAbiertos = (v.huecosVistos?.[v.sala] || []);

      /* Sala totalmente explorada */
      const huecosNuevos = huecosTotales - yaAbiertos.length;
      if (huecosNuevos <= 0) {
        const objetosSueltos = (visita?.ids || []).filter((id) => !v.bien[id] && !enMano(v, id)).length;
        return objetosSueltos > 0 ? 20 : -40;
      }

      /* Modo total (sin a.ver): registra toda la sala de golpe */
      if (!a.ver) return visitadaHoy ? -20 : 32;

      /* Modo par: puntuar según huecos frescos */
      const frescos = a.ver.filter((i) => !yaAbiertos.includes(i)).length;
      const frescosHoy = a.ver.filter((i) => !abiertosHoy(v, v.sala).includes(i)).length;
      if (visitadaHoy && frescosHoy === 0) return -20;
      return frescos === 2 ? 32 : frescos === 1 ? 14 : -20;
    }

    case "esconder": {
      const o = enMano(v, a.obj);
      if (!o) return -50;
      if (o.tipo === "rasgo" && o.dueño === v.yo.id)
        return v.gente.length ? 18 : v.dia <= 2 ? 128 : 45;
      if (o.tipo === "habilidad") return -40;
      if (v.bien[o.id] || (o.tipo !== "situacion" && o.dueño && yaCerrado(v, o.dueño)))
        return 88;
      return 5;
    }

    case "mover": {
      const aqui = obj === v.sala;
      const d = distancia(v, a.a, obj || puerta);
      if (d === Infinity) return -80;
      return aqui ? 6 - 8 * d : 46 - 8 * d;
    }

    case "robar": {
      const o = a.info;
      if (!o) return -5;
      if (v.bien[o.id] || (o.tipo !== "situacion" && o.dueño && yaCerrado(v, o.dueño))) return 10;
      return 86;
    }

    case "interrogar":
      return 58;

    case "guardar":
      return 6;

    case "cambiar":
      return 4;

    case "habilidad": {
      const hayGente = v.gente && v.gente.length > 0;
      const dist = distancia(v, v.sala, obj || puerta);
      switch (a.cual) {
        case "vaso":    return hayGente ? 28 : 5;
        case "manos":   return v.pa <= 1 ? 85 : v.pa <= 2 ? 42 : 10;
        case "antorcha":return dist >= 3 ? 72 : dist >= 2 ? 35 : 12;
        case "capa":    return dist >= 2 ? 55 : 10;
        case "tranca":  return hayGente ? 62 : 22;
        case "lupa":    return hayGente ? 65 : 10;
        case "cepo":    return !hayGente ? 68 : 10;
        case "humo":    return v.gente && v.gente.length >= 2 ? 58 : 10;
        case "cuerda":  return hayGente ? 52 : 5;
        case "empujon": return hayGente ? 38 : 5;
        case "ganzua":  return 45;
        default:        return 10;
      }
    }

    case "destrancar": {
      const dObj = distancia(v, v.sala, obj || puerta);
      return dObj === Infinity ? 72 : 18;
    }

    default:
      return -100;
  }
}

/* ------------------------------------------------------------------ */
/*  De dónde a dónde                                                   */
/* ------------------------------------------------------------------ */
export function objetivo(v, puerta) {
  const faltan = v.puedenSalir - v.cerrados.length;

  if (faltan <= 1) return puerta;

  /* 1. Objeto en mano con salas sin probar: ir a la más cercana. */
  const buenos = [v.mano, v.bolsa]
    .filter(Boolean)
    .filter((o) => o.tipo !== "habilidad")
    .filter((o) => o.dueño !== v.yo.id)
    .filter((o) => !v.bien[o.id])
    .filter((o) => !(o.tipo !== "situacion" && o.dueño && yaCerrado(v, o.dueño)));

  for (const o of buenos) {
    const porProbar = o.sugiere
      .filter((s) => !probado(v, o.id, s))
      .sort((a, b) => distancia(v, v.sala, a) - distancia(v, v.sala, b));
    if (porProbar.length) return porProbar[0];
  }

  /* 1.5 Hacer sitio: con la mano y la bolsa llenas no se puede coger nada, así
        que el objetivo es la sala más cercana donde soltar lo que estorba.
        Antes no había este paso y el bot se quedaba abriendo huecos que no
        podía aprovechar (el mismo par hasta cuatro veces en un día). */
  if (v.mano && v.bolsa) {
    const estorbo = [v.mano, v.bolsa].find(
      (o) => o && o.tipo !== "habilidad" && (v.bien[o.id] || o.dueño === v.yo.id)
    );
    if (estorbo) {
      const donde = Object.keys(v.mapa)
        .filter((s) => v.mapa[s].abierta && s !== v.sala)
        .filter((s) => !v.intentos.some((i) => i.obj === estorbo.id && i.sala === s))
        .sort((a, b) => distancia(v, v.sala, a) - distancia(v, v.sala, b));
      if (donde.length) return donde[0];
    }
  }

  /* 2. Esta sala tiene huecos que nunca hemos abierto: quedarse a registrar,
        pero solo si hay hueco donde llevarse lo que aparezca. Sin sitio, la
        ficha se va en memoria: primero se busca dónde soltar lo que se lleva. */
  const aqui = v.mapa[v.sala].huecos ?? 0;
  const yaAbiertosAqui = (v.huecosVistos?.[v.sala] || []).length;
  if (yaAbiertosAqui < aqui && !(v.mano && v.bolsa)) return v.sala;

  /* 3. La sala nueva más cercana. Si ya has barrido esta y hay más gente
        dentro, que no vayan todos a la misma: cada asiento arranca hacia una
        distinta. El turno es fijo (día + asiento), así que no hay azar y la
        partida sigue siendo reproducible. */
  const sinVer = Object.keys(v.mapa)
    .filter((s) => v.mapa[s].abierta && !v.visto[s] && s !== v.sala)
    .sort((a, b) => distancia(v, v.sala, a) - distancia(v, v.sala, b));
  if (sinVer.length) {
    if (v.gente.length > 1) {
      const d0 = distancia(v, v.sala, sinVer[0]);
      const cerca = sinVer.filter((s) => distancia(v, v.sala, s) === d0);
      return cerca[(v.dia + Number(v.yo.id.slice(1))) % cerca.length];
    }
    return sinVer[0];
  }

  /* 4. Jugador adyacente con quien cotillear (misma sala o 1 paso): no perseguir
        a través del mapa para evitar ping-pong. */
  const cotilleos = v.todos
    ?.filter((q) => q.id !== v.yo.id && !v.cerrados?.some((c) => c.id === q.id))
    .filter((q) => q.sala && v.mapa[q.sala]?.abierta)
    .sort((a, b) => distancia(v, v.sala, a.sala) - distancia(v, v.sala, b.sala));
  if (cotilleos?.length) {
    const cercano = cotilleos[0];
    if (distancia(v, v.sala, cercano.sala) <= 1) return cercano.sala;
  }

  /* 5. Sala con objetos conocidos sin recoger. */
  const conObjetos = Object.entries(v.visto)
    .filter(([, x]) => x.ids.length)
    .map(([s]) => s)
    .filter((s) => s !== v.sala && v.mapa[s]?.abierta);
  if (conObjetos.length)
    return conObjetos.sort((a, b) => distancia(v, v.sala, a) - distancia(v, v.sala, b))[0];

  if (v.sala !== puerta) return puerta;
  return puerta;
}

function hacia(v, acts, destino) {
  let mejor = null;
  let d = distancia(v, v.sala, destino);
  for (const a of acts) {
    if (a.tipo !== "mover") continue;
    const suya = distancia(v, a.a, destino);
    if (suya < d) {
      d = suya;
      mejor = a;
    }
  }
  return mejor;
}

function distancia(v, desde, hasta) {
  if (!desde || !hasta) return Infinity;
  if (desde === hasta) return 0;
  const d = { [desde]: 0 };
  const cola = [desde];
  while (cola.length) {
    const s = cola.shift();
    const sala = v.mapa[s];
    for (const x of sala.salidas) {
      if (!v.mapa[x] || !v.mapa[x].abierta) continue;
      if (sala.cerradas.includes(x) || x in d) continue;
      d[x] = d[s] + 1;
      if (x === hasta) return d[x];
      cola.push(x);
    }
  }
  return Infinity;
}

/* ------------------------------------------------------------------ */
/* Los huecos que ya se miraron hoy en esta sala. */
function abiertosHoy(v, sala) {
  const x = v.visto[sala];
  return x && x.dia === v.dia ? x.abiertos || [] : [];
}

function enMano(v, id) {
  if (v.mano && v.mano.id === id) return v.mano;
  if (v.bolsa && v.bolsa.id === id) return v.bolsa;
  return null;
}

function probado(v, obj, sala) {
  return v.intentos.some((i) => i.obj === obj && i.sala === sala);
}

function yaCerrado(v, dueño) {
  return v.cerrados.some((c) => c.id === dueño);
}
