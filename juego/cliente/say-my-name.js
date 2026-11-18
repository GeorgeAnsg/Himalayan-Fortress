/* Cliente visual de Say My Name — adaptador para madrigueras.
   Envuelve las vistas de corvus en la interfaz pintar(contenedor, opciones). */

export { pintar as pintarVestibulo } from "./say-my-name/vestibulo.js";
import { iniciarUI, h } from "./say-my-name/ui.js";
import { pintarCasa } from "./say-my-name/vistas/casa.js";
import { pintarCuaderno } from "./say-my-name/vistas/cuaderno.js";
import { pintarCronica } from "./say-my-name/vistas/cronica.js";
import { pintarRanking } from "./say-my-name/vistas/ranking.js";
import { abrirAcciones, checkPendingRegistro, refrescarRegistro } from "./say-my-name/acciones.js";
import { apodoDe, nombreObjeto, verLoQueLlevas, verReglasModal } from "./say-my-name/partida.js";
import { PA_POR_DIA } from "./say-my-name/reglas.js";

/* CSS del juego, cargado una sola vez. */
function asegurarCSS() {
  if (document.getElementById("smn-css")) return;
  const link = document.createElement("link");
  link.id = "smn-css";
  link.rel = "stylesheet";
  link.href = "/app/juegos/say-my-name/say-my-name.css";
  document.head.append(link);
}

/* TEMPORAL: manda al servidor las medidas del móvil (alto del viewport, safe
   area, caja de las barras) para localizar por qué el pie no llega al borde.
   Se quita cuando esté arreglado. */
let _ultimaMedida = 0;
function medirPie() {
  const ahora = Date.now();
  if (ahora - _ultimaMedida < 3000) return;
  _ultimaMedida = ahora;
  setTimeout(() => {
    const caja = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.top), Math.round(b.bottom), Math.round(b.height)];
    };
    const sonda = document.createElement("div");
    sonda.style.cssText = "position:fixed;top:0;left:-10px;width:1px;pointer-events:none";
    document.body.append(sonda);
    sonda.style.height = "env(safe-area-inset-top, 0px)";
    const safeTop = Math.round(sonda.getBoundingClientRect().height);
    sonda.style.height = "env(safe-area-inset-bottom, 0px)";
    const safeBottom = Math.round(sonda.getBoundingClientRect().height);
    sonda.remove();
    const bd = getComputedStyle(document.body);
    const vv = window.visualViewport;
    const tab = document.getElementById("tablero");
    const datos = {
      vista: _vista,
      vp: [window.innerWidth, window.innerHeight],
      vv: vv ? [Math.round(vv.height), Math.round(vv.offsetTop), Math.round(vv.width), vv.scale] : null,
      pantalla: [screen.width, screen.height, screen.availHeight, devicePixelRatio],
      docEl: [document.documentElement.clientWidth, document.documentElement.clientHeight],
      body: [...caja(document.body), bd.height, bd.paddingTop, bd.paddingBottom, bd.overflow, bd.position],
      cabecera: caja(document.getElementById("smn-cabecera")),
      nav: caja(document.getElementById("smn-nav-global")),
      sub: caja(document.getElementById("smn-cuaderno-nav")),
      tablero: caja(tab),
      tabScroll: tab ? [Math.round(tab.scrollTop), Math.round(tab.scrollHeight)] : null,
      scroll: [window.scrollY, Math.round(document.scrollingElement.scrollHeight)],
      safe: [safeTop, safeBottom],
      app: matchMedia("(display-mode: standalone)").matches ? "standalone" : "navegador",
      ua: navigator.userAgent,
    };
    fetch("/api/medir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
    }).catch(() => {});
  }, 250);
}

let _contenedor = null;
let _opciones = null;
let _vista = "casa";
let _cuadernoPag = "personajes";
let _cuadernoEnviado = null;

export function pintar(contenedor, opciones) {
  const { publica, privada, jugadores, tu, acciones, alAccion, log, ranking, alCuaderno } = opciones;
  if (!publica) { contenedor.textContent = "Cargando…"; return; }

  asegurarCSS();
  iniciarUI(contenedor);

  _contenedor = contenedor;
  _opciones = opciones;

  /* ctx: objeto de contexto equivalente al de corvus/app/app.js */
  const ctx = {
    get acciones() { return acciones ?? []; },
    get semilla() { return publica.idMap ? JSON.stringify(publica.idMap) : "0"; },
    get pa() { return privada?.pa ?? 1; },
    get paMax() { return privada?.paMax ?? PA_POR_DIA; },
    /* La crónica sale del registro de la mesa, que ahora trae la jornada de
       cada línea. Las de la plataforma («entra en la madriguera», «la mesa
       queda en 5») van sin tipo y se quedan fuera: la crónica es del juego. */
    get diario() {
      /* Las líneas del registro se leen en orden: las que traen jornada la
         mandan y las que no se quedan en la última conocida (las viejas, de
         antes de que el servidor la guardara). */
      let dia = 1;
      const fuera = [];
      for (const l of log ?? []) {
        if (l.dia) dia = l.dia;
        if (!l.tipo || l.tipo === "nota" || l.tipo === "sala" || l.tipo === "dia") continue;
        fuera.push({ dia, texto: l.texto, clase: l.tipo });
      }
      return fuera;
    },
    /* Los nombres de los demás, como en el original: el motor manda `nombres`
       con el tuyo dentro y aquí se quita. Antes se leía `nombresOtros`, que no
       existe en la vista, así que la lista iba vacía: el círculo rojo de
       salida se daba por bueno siempre y el aviso previo no tenía nombres. */
    get nombres() {
      const todos = privada?.nombres ?? [];
      return todos.filter((n) => n !== privada?.yo?.nombre);
    },
    aviso: (txt) => {
      const caja = contenedor.querySelector("#avisos");
      if (!caja) return;
      const t = h("div", { class: "toast", text: txt });
      caja.append(t);
      setTimeout(() => t.remove(), 2600);
    },
    repintar: () => pintar(contenedor, _opciones),
    ejecutar: (accion) => alAccion?.(accion),
    /* Tocar la estancia donde estás abre la hoja de acciones, como el
       `actuar()` del original; no manda nada al servidor por sí solo. */
    actuar: () => abrirAcciones(privada, ctx.acciones, ctx),
    pasarDia: () => alAccion?.({ tipo: "pasar" }),
    v: () => privada,
    esAnfitrion: () => false,
    saltarTurno: () => alAccion?.({ tipo: "pasar" }),
    verReglas: () => verReglasModal(),
    /* Las vistas preguntan por nombres e ids continuamente; sin esto, la hoja
       de acciones y la ficha de cada personaje se rompían. */
    apodoDe: (id) => apodoDe(privada, id),
    nombreObjeto: (id) => nombreObjeto(privada, id),
    verInventario: () => verLoQueLlevas(privada, ctx),
    /* El ranking es público: el servidor dice cuántos definitivos lleva cada
       uno (es lo único del cuaderno que sale de tu móvil). */
    get ranking() { return ranking ?? []; },
    reportarCuaderno: (datos) => alCuaderno?.(datos),
  };

  /* La partida no deja scrollear la página: scrollea el tablero. Así las dos
     barras no se mueven aunque el navegador del móvil recoja sus barras al
     desplazar (que era lo que las subía). */
  document.body.classList.add("smn-en-partida");
  contenedor.className = "smn-juego";
  contenedor.replaceChildren(
    ...contenedor.querySelectorAll("#hoja, #avisos"),
  );
  /* Mantener #hoja y #avisos, reconstruir el resto */
  const hoja = contenedor.querySelector("#hoja");
  const avisos = contenedor.querySelector("#avisos");
  contenedor.replaceChildren();
  if (hoja) contenedor.append(hoja);
  if (avisos) contenedor.append(avisos);

  /* El armazón del juego, igual que en la app original: cabecera con la
     jornada y las acciones, barra de pestañas al pie y el submenú del
     pergamino. Va colgado del body —fijo de verdad— y `limpiar()` se lo lleva
     al salir de la mesa. */
  pintarArmazon(ctx, publica);

  /* Partida terminada: solo la crónica */
  if (publica.fin) {
    contenedor.append(pintarCronica(privada, ctx));
    return;
  }

  let pantalla;
  if (_vista === "cuaderno") {
    pantalla = pintarCuaderno(privada, ctx, _cuadernoPag);
  } else if (_vista === "cronica") {
    pantalla = pintarCronica(privada, ctx);
  } else if (_vista === "ranking") {
    pantalla = pintarRanking(privada, ctx);
  } else {
    pantalla = pintarCasa(privada, ctx);
  }

  /* Sin botón de salir propio: la plataforma ya lo tiene en sus ajustes y
     aquí quedaba un «Salir» suelto al final del tablero. */
  contenedor.append(pantalla);
  if (hoja) contenedor.append(hoja);
  if (avisos) contenedor.append(avisos);

  /* Lo mismo que hace `alLlegarVista` en el original: si había un registro
     esperando, se abre con lo que acaba de devolver la casa, y si sigue
     abierto se repinta para que salga lo que queda. */
  checkPendingRegistro(privada, ctx, []);
  refrescarRegistro(privada, ctx);

  medirPie();

  /* Y se avisa a la mesa de cuántos definitivos llevas, solo cuando cambian:
     es lo que hace que el ranking se vaya actualizando como en el original. */
  const firma = `${ctx.semilla}:${contarDefinitivos(ctx.semilla)}`;
  if (alCuaderno && firma !== _cuadernoEnviado) {
    _cuadernoEnviado = firma;
    alCuaderno({
      definitivos: contarDefinitivos(ctx.semilla),
      total: privada?.nombres?.length ?? 0,
    });
  }
}

/* Definitivos puestos en el cuaderno de esta casa (lo guarda la vista de
   sospechas en el móvil). */
function contarDefinitivos(semilla) {
  try {
    const g = JSON.parse(localStorage.getItem(`casa.sospechas.${semilla}`) || "{}");
    return Object.values(g).filter((x) => x?.[0]).length;
  } catch {
    return 0;
  }
}

/* Las cuatro pestañas y las cuatro páginas del pergamino, tal cual las tenía
   el juego antes de portarlo. */
const VISTAS = [
  { id: "casa", label: "Castillo" },
  { id: "cuaderno", label: "Pergamino" },
  { id: "cronica", label: "Crónica" },
  { id: "ranking", label: "Ranking" },
];
const PAGINAS = [
  { id: "personajes", label: "Personajes" },
  { id: "objetos", label: "Objetos" },
  { id: "cotilleos", label: "Cotilleos" },
  { id: "sospechas", label: "Sospechas" },
];

/* Las pestañas se pintan una vez por actualización de la mesa; el tablero se
   sustituye al repintar. Se busca el vivo en cada clic para que una pestaña no
   escriba en un nodo que ya no está en la página. */
function repintarVista() {
  pintar(document.getElementById("tablero") ?? _contenedor, _opciones);
}

function pintarArmazon(ctx, publica) {
  for (const id of ["smn-cabecera", "smn-nav-global", "smn-cuaderno-nav"]) {
    document.getElementById(id)?.remove();
  }
  if (publica?.fin) return;

  /* Cabecera: la jornada a la izquierda y las acciones que quedan a la
     derecha, como la `.barra` del original. Sin campana: los avisos que usa la
     mesa son los de la plataforma. */
  const pa = ctx.pa ?? 0;
  const paMax = Math.max(ctx.paMax ?? PA_POR_DIA, pa);
  const capa = ctx.v()?.yo?.capa ?? 0;
  document.body.append(
    h("header", { id: "smn-cabecera", class: "smn-cabecera" },
      h("div", { class: "smn-dia" }, "Jornada ", h("b", { text: `${ctx.v()?.dia ?? 1}` })),
      h("div", { class: "barra-acciones" },
        h("span", { class: "barra-acciones-lbl", text: "Acciones" }),
        ...Array.from({ length: paMax }, (_, i) =>
          h("span", { class: "mapa-accion-dot" + (i >= pa ? " gastado" : "") })
        ),
        capa > 0 ? h("span", { class: "barra-capa-chip", text: `🧥 ×${capa}` }) : null
      )
    )
  );

  const nav = h("nav", { id: "smn-nav-global", class: "smn-barra" });
  for (const { id, label } of VISTAS) {
    const btn = h("button", { class: "smn-pestana" + (_vista === id ? " on" : ""), text: label });
    btn.addEventListener("click", () => { _vista = id; repintarVista(); });
    nav.append(btn);
  }
  document.body.append(nav);

  /* El submenú del pergamino cuelga justo encima de las pestañas y solo se ve
     cuando se está en él. */
  if (_vista === "cuaderno") {
    const sub = h("div", { id: "smn-cuaderno-nav", class: "cuaderno-tabs" });
    for (const { id, label } of PAGINAS) {
      const btn = h("button", { class: "cuaderno-tab" + (_cuadernoPag === id ? " on" : ""), text: label });
      btn.addEventListener("click", () => { _cuadernoPag = id; repintarVista(); });
      sub.append(btn);
    }
    document.body.append(sub);
  }
}
