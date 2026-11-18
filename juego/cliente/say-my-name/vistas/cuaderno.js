import { h, abrirHoja, cerrarHoja } from "../ui.js";
import { tema } from "../contenido.js";
import { retratoDe, objetoDe, RETRATO_PLACEHOLDER } from "../imagenes.js";
import * as nube from "../nube.js";

const claveSospechas = (semilla) => `casa.sospechas.${semilla}`;
const claveNotas = (semilla) => `casa.notas.${semilla}`;
const clavePagina  = (semilla) => `casa.cuaderno-pag.${semilla}`;
const claveDichosVistos = (semilla) => `casa.dichos-vistos.${semilla}`;

function leer(clave, porDefecto) {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto ? JSON.parse(bruto) : porDefecto;
  } catch { return porDefecto; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {}
}

/* ── Página 1: retratos con rasgos visuales ── */
function paginaPersonajes(v) {
  const frag = document.createDocumentFragment();
  const grid = h("div", { class: "cuaderno-grid" });

  for (const q of v.todos) {
    const retrato = h("div", { class: "cuaderno-retrato" });
    const img = document.createElement("img");
    img.src = retratoDe(q.apodo);
    img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
    img.alt = q.apodo;
    retrato.append(img);

    const rasgosEl = h("div", { class: "rasgos" },
      tema.rasgos.map(r =>
        h("span", { class: "rasgo " + (q.rasgos[r] ? "si" : "no") },
          h("span", { class: "rasgo-icono", text: q.rasgos[r] ? "✓" : "✕" }),
          " " + r
        )
      )
    );

    grid.append(
      h("div", { class: "cuaderno-card" },
        retrato,
        h("div", { class: "cuaderno-card-info" },
          h("div", { class: "apodo-cab" }, h("h3", { text: q.apodo })),
          rasgosEl
        )
      )
    );
  }
  frag.append(grid);

  frag.append(h("div", { class: "titulo", text: "Nombres en juego" }));
  /* Los que se han repartido de verdad en esta mesa, no el mazo entero: con
     seis jugadores hay ocho nombres y dos no son de nadie. El tuyo va marcado,
     que es el único que sabes sin deducir. */
  const nombresEnJuego = v.nombres ?? [];
  const mio = v.yo?.nombre ?? null;
  frag.append(
    nombresEnJuego.length
      ? h("div", { class: "tarjeta" },
          h("div", { class: "cuaderno-nombres" },
            nombresEnJuego.map(n => h("span", {
              class: "cuaderno-nombre-tag" + (n === mio ? " tuyo" : ""),
              text: n,
            }))
          ),
          h("p", { class: "cuaderno-nombres-pie", text: mio
            ? `Tú eres ${mio}. Los demás se reparten ocultos: cada uno sabe el suyo y nadie más.`
            : "Se reparten ocultos: cada uno sabe el suyo y nadie más." })
        )
      : h("p", { class: "vacio", text: "Los nombres salen cuando empieza la partida." })
  );

  return frag;
}

const HABILIDAD_DESC = {
  ganzua: "Abre un cerrojo · o registra la bolsa de alguien",
  tranca: "Tranca una puerta · o golpea a alguien: pierde 3 acciones",
  lupa:   "Interroga a alguien con detalle",
  vaso:   "Brindas: todos pierden 1 acción, tú ganas 1 por cada uno",
  manos:    "Te da 2 acciones extra este turno",
  antorcha: "Te teletransporta a cualquier sala abierta",
  cepo:     "Coloca una trampa: inmoviliza al siguiente que entre",
  humo:     "Llena la sala de humo: bloquea acciones en ella",
  cuerda:   "Ata a alguien: no puede moverse el resto del turno",
  empujon:  "Empuja a alguien a una sala contigua",
  capa:     "4 movimientos gratis hasta que hagas otra acción",
};

function tarjetaObjeto(nombre, clase, tuyo, usado, salaDonde) {
  const img = document.createElement("img");
  img.src = objetoDe(nombre);
  img.alt = nombre;
  img.onerror = () => { img.style.opacity = "0.2"; };

  const inner = [];
  inner.push(img);
  if (tuyo) inner.push(h("span", { class: "objeto-card-tag-tuyo", text: "tuyo" }));
  if (usado) inner.push(h("div", { class: "objeto-card-overlay-usado" }, h("span", { text: "ya usado" })));

  const card = h("div", { class: "objeto-card" + (usado ? " objeto-card-usado" : "") }, ...inner);

  card.addEventListener("click", () => {
    const cab = h("div", { class: "persona-modal-cab" },
      h("div", { class: "persona-nombre-tag persona-modal-titulo", text: nombre }),
      h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
    );
    const im = document.createElement("img");
    im.src = objetoDe(nombre);
    im.alt = nombre;
    im.style.cssText = "width:100%;height:100%;object-fit:contain;padding:16px";
    im.onerror = () => { im.style.display = "none"; };
    const imgWrap = h("div", { class: "objeto-modal-img" }, im);
    const info = [];
    if (tuyo) info.push(h("p", { class: "objeto-modal-tuyo", text: "Este objeto es tuyo" }));
    if (usado) info.push(h("p", { class: "objeto-modal-usado-txt", text: salaDonde ? `Usado en ${salaDonde}` : "Ya lo has usado" }));
    if (clase) info.push(h("p", { class: "objeto-modal-desc", text: HABILIDAD_DESC[clase] ?? clase }));
    const cuerpo = h("div", { class: "objeto-modal-cuerpo" }, imgWrap, ...info);
    abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, cuerpo), sinAsa: true });
  });
  return card;
}

/* ── Página 2: repertorio completo de objetos del juego ── */
function paginaObjetos(v, semilla) {
  const frag = document.createDocumentFragment();
  const usadoNombres = new Set((v.bienUsados || []).map(u => u.nombre));
  const mioNombres = new Set((v.mios || []).map(o => o.nombre));

  /* Objetos de rasgo: barajados con semilla para que no se agrupen por sala */
  const enJuego = v.objetosEnJuego ? new Set(v.objetosEnJuego) : null;
  const baseCompleta = [
    ...tema.objetos,
    ...(v.dia >= 3 ? (tema.situacion ?? []) : []),
    ...(v.dia >= 5 ? Object.values(tema.quinta).flat() : []),
  ];
  const base = enJuego ? baseCompleta.filter(o => enJuego.has(o.nombre)) : baseCompleta;
  /* Fisher-Yates con semilla determinística (misma vista para todos en la misma partida) */
  let s = (semilla ?? 1) | 0;
  const rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0x100000000; };
  const mezclados = base.slice();
  for (let i = mezclados.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
  }
  frag.append(h("div", { class: "titulo", text: "Objetos de la casa" }));
  frag.append(h("div", { class: "objetos-grid" },
    mezclados.map(o => {
      const usado = (v.bienUsados || []).find(u => u.nombre === o.nombre);
      return tarjetaObjeto(o.nombre, null, mioNombres.has(o.nombre), !!usado, usado?.sala);
    })
  ));

  /* Objetos de habilidad */
  frag.append(h("div", { class: "titulo", text: "Habilidades" }));
  const clasesHabs = v.clasesHabsEnJuego ? new Set(v.clasesHabsEnJuego) : null;
  frag.append(h("div", { class: "objetos-grid" },
    tema.habilidades.filter(o => !o.oculto && (!clasesHabs || clasesHabs.has(o.clase))).map(o => {
      const card = tarjetaObjeto(o.nombre, o.clase, mioNombres.has(o.nombre), false);
      card.append(h("span", { class: "objeto-card-habilidad", text: HABILIDAD_DESC[o.clase] ?? o.clase }));
      return card;
    })
  ));

  return frag;
}

/* ── Página 3: cotilleos ── */
/* Los cotilleos no se leen: se cuentan. De cada persona se ve cuántas fuentes
   distintas te han hablado de ella —«Javi 1/2»—, no lo que te contaron: el
   cotilleo es la moneda, y lo que vale de verdad sale al indagar. Los que han
   llegado desde la última visita llevan «nuevo». */
function paginaCotilleos(v, ctx, semilla) {
  const frag = document.createDocumentFragment();
  frag.append(h("div", { class: "titulo", text: "Cotilleos de la corte" }));
  const dichos = v.dichos ?? [];
  if (!dichos.length) {
    frag.append(h("p", { class: "vacio", text: "Nadie te ha contado nada todavía." }));
    return frag;
  }

  const claveDicho = (d) => `${d.de}|${d.nombre}|${d.rasgo}|${d.valor}|${d.dia}`;
  const vistos = new Set(leer(claveDichosVistos(semilla), []));
  const nuevos = new Set();

  const porNombre = {};
  for (const d of dichos) {
    if (!porNombre[d.nombre]) porNombre[d.nombre] = [];
    porNombre[d.nombre].push(d);
    if (!vistos.has(claveDicho(d))) nuevos.add(claveDicho(d));
  }

  frag.append(h("p", { class: "dichos-pie", text: "Con dos cotilleos sobre la misma persona puedes indagar y convertirlo en un rasgo de verdad. Dos es el tope: con dos, ese nombre queda cerrado." }));

  const indagarAcciones = (ctx.acciones ?? []).filter((a) => a.tipo === "indagar");
  for (const [nombre, ds] of Object.entries(porNombre)) {
    const accion = indagarAcciones.find((a) => a.sobre === nombre);
    const fuentesLibres = new Set(ds.filter((d) => !d.usado).map((d) => d.de)).size;
    const cerrada = ds.length > 0 && fuentesLibres === 0;
    const hayNuevos = ds.some((d) => nuevos.has(claveDicho(d)));
    frag.append(h("div", { class: "tarjeta dichos-grupo" },
      h("div", { class: "dichos-nombre-cab" },
        h("b", { text: nombre }),
        cerrada
          ? h("span", { class: "dichos-cerrada", text: "ya indagado" })
          : h("span", {
              class: "dichos-fuentes",
              text: `${Math.min(fuentesLibres, 2)}/2 ${fuentesLibres === 1 ? "cotilleo" : "cotilleos"}`,
            }),
        !cerrada && hayNuevos ? h("span", { class: "dicho-nuevo", text: "nuevo" }) : null,
        !cerrada && accion ? h("button", {
          class: "mini dichos-indagar",
          text: "Indagar",
          onclick: () => { ctx.ejecutar(accion); ctx.repintar(); },
        }) : null
      )
    ));
  }

  /* Lo que acabas de ver deja de ser nuevo la próxima vez. */
  escribir(claveDichosVistos(semilla), [...vistos, ...nuevos]);
  return frag;
}

/* ── Página 4: sospechas, pistas y notas ── */
function paginaNotas(v, ctx, semilla, guardadas) {
  const frag = document.createDocumentFragment();

  frag.append(h("div", { class: "titulo", text: "Sospechas" }));
  const guardar = () => {
    escribir(claveSospechas(semilla), guardadas);
    nube.guardar(semilla, v.yo?.nombre, guardadas);
    /* El ranking se avisa solo: al repintar, el adaptador cuenta los
       definitivos de esta libreta y se lo manda a la mesa (`reportarCuaderno`).
       Antes había aquí un `emitirRanking` que no hacía nada. */
  };
  /* Cinco marcos: el definitivo —el que va a la salida—, dos sospechas y dos
     descartes. Los descartes van con la raya encima: son la otra mitad de la
     misma libreta. */
  const SLOTS = [
    { label: "Definitivo", definitivo: true, descarte: false },
    { label: "Sospecha 1", definitivo: false, descarte: false },
    { label: "Sospecha 2", definitivo: false, descarte: false },
    { label: "Descarte 1", definitivo: false, descarte: true },
    { label: "Descarte 2", definitivo: false, descarte: true },
  ];
  /* Las libretas de tres huecos (Definitivo, Sospecha 1, 2) se leen tal cual. */
  const parDe = (nombre) => [...(guardadas[nombre] || []), "", "", "", "", ""].slice(0, 5);

  function abrirPicker(nombre, idx) {
    const par = parDe(nombre);
    const elegir = (apodo) => {
      par[idx] = apodo;
      guardadas[nombre] = par;
      guardar();
      cerrarHoja();
      ctx.repintar();
    };
    const cab = h("div", { class: "persona-modal-cab" },
      h("div", { class: "persona-nombre-tag persona-modal-titulo", text: `${nombre} · ${SLOTS[idx].label}` }),
      h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
    );
    const grid = h("div", { class: "sospecha-picker-grid" },
      ...v.todos.map(q => {
        const img = document.createElement("img");
        img.src = retratoDe(q.apodo);
        img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
        img.alt = q.apodo;
        const btn = h("button", { class: "sospecha-picker-item" + (par[idx] === q.apodo ? " seleccionado" : ""),
          onclick: () => elegir(q.apodo) },
          img,
          h("span", { text: q.apodo })
        );
        return btn;
      })
    );
    const borrar = h("button", { class: "sospecha-picker-borrar", onclick: () => elegir("") }, "Borrar");
    abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, grid, borrar), sinAsa: true });
  }

  /* Los nombres que se repartieron y no son el tuyo: el propio no hay que
     deducirlo. Antes salía el mazo de ocho entero, así que con seis jugadores
     había dos nombres que no eran de nadie y faltaba el tuyo. */
  const nombres = (v.nombres ?? tema.nombres).filter((n) => n !== v.yo?.nombre);
  for (const nombre of nombres) {
    const par = parDe(nombre);
    const rasgos = v.sabe?.[nombre];

    const slots = SLOTS.map(({ label, definitivo, descarte }, idx) => {
      const apodo = par[idx];
      const wrap = h("div", { class: "sospecha-slot" + (definitivo ? " definitivo" : "") + (descarte ? " descarte" : "") });
      if (apodo) {
        const img = document.createElement("img");
        img.src = retratoDe(apodo);
        img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
        img.alt = apodo;
        wrap.append(img);
      } else {
        const plus = h("span", { class: "sospecha-slot-plus", text: "+" });
        wrap.append(plus);
      }
      wrap.addEventListener("click", () => abrirPicker(nombre, idx));
      const lbl = h("span", { class: "sospecha-slot-lbl", text: apodo || label });
      return h("div", { class: "sospecha-slot-col" }, wrap, lbl);
    });

    /* Los tres rasgos, en círculos, pegados al borde derecho del nombre. El
       hueco vacío también se ve: es lo que aún no te han dicho. */
    const rasgosCirculos = h("div", { class: "sospecha-rasgos" },
      ...tema.rasgos.map(r => {
        const conocido = rasgos && r in rasgos;
        const val = conocido ? rasgos[r] : null;
        const clase = "sospecha-rasgo-circ" + (conocido ? (val ? " si" : " no") : " vacio");
        return h("div", { class: "sospecha-rasgo" },
          h("span", { class: "sospecha-rasgo-lbl", text: r }),
          h("div", { class: clase }, conocido ? (val ? "✓" : "✕") : "·")
        );
      })
    );

    frag.append(
      h("div", { class: "tarjeta sospecha-ficha" },
        h("div", { class: "sospecha-cab" },
          h("div", { class: "sospecha-cab-nombre" },
            h("h3", { text: nombre }),
          ),
          rasgosCirculos
        ),
        h("div", { class: "sospecha-slots" }, ...slots)
      )
    );
  }

  /* Lo que dijo un objeto de situación, con la jornada en que lo dijo. El aviso
     vale mientras la persona siga allí: en cuanto se mueve, el motor lo pasa a
     `sabeDondeFue` y aquí queda tachado. Una nota tachada no sirve para deducir,
     pero se queda a la vista, que es lo que hace un cuaderno de verdad. */
  const vigentes = Object.entries(v.sabeDonde ?? {})
    .filter(([, sala]) => !!sala)
    .map(([nombre, sala]) => ({ nombre, sala, vale: true }));
  const tachados = Object.entries(v.sabeDondeFue ?? {})
    .filter(([, sala]) => !!sala)
    .map(([nombre, sala]) => ({ nombre, sala, vale: false }));
  const vistos = [...vigentes, ...tachados]
    .sort((a, b) => (v.sabeDondeDia?.[b.nombre] ?? 0) - (v.sabeDondeDia?.[a.nombre] ?? 0));
  if (vistos.length) {
    frag.append(h("div", { class: "titulo", text: "Dónde los vi" }));
    frag.append(
      h("div", { class: "tarjeta vistos-lista" },
        ...vistos.map(({ nombre, sala, vale }) => {
          const dia = v.sabeDondeDia?.[nombre];
          const edad = dia ? v.dia - dia : null;
          const cuando = !dia ? "" : edad === 0 ? "hoy" : edad === 1 ? "ayer" : `hace ${edad} jornadas`;
          return h("div", { class: "visto-fila" + (vale ? "" : " caducado") },
            h("b", { text: nombre }),
            h("span", { class: "visto-sala", text: v.mapa?.[sala]?.nombre ?? sala }),
            h("span", { class: "visto-dia", text: vale ? cuando : [cuando, "se movió"].filter(Boolean).join(" · ") })
          );
        }),
        h("p", { class: "visto-pie", text: "Lo que decía el objeto al usarlo. Lo tachado ya no vale: esa persona se ha movido desde entonces." })
      )
    );
  }

  frag.append(h("div", { class: "titulo", text: "Mis notas" }));
  const area = h("textarea", {
    placeholder: "Tus deducciones: qué apodo le toca a cada nombre y en qué estancia los viste.",
    oninput: (ev) => escribir(claveNotas(semilla), ev.target.value),
  });
  area.value = leer(claveNotas(semilla), "");
  frag.append(h("div", { class: "tarjeta" }, area));

  return frag;
}

/* ── Raíz ── */
export function pintarCuaderno(v, ctx, pagina = "personajes") {
  const semilla = ctx.semilla;
  const guardadas = leer(claveSospechas(semilla), {});

  const contenido = h("div", { class: "cuaderno-contenido" });
  if (pagina === "personajes") contenido.append(paginaPersonajes(v));
  else if (pagina === "objetos") contenido.append(paginaObjetos(v, semilla));
  else if (pagina === "cotilleos") contenido.append(paginaCotilleos(v, ctx, semilla));
  else contenido.append(paginaNotas(v, ctx, semilla, guardadas));

  return contenido;
}
