import { h, abrirHoja, cerrarHoja, confirmar } from "../ui.js";
import { etiqueta, avisarAntesDeSalir, elegirSobreQuien, elegirEmpujon, elegirCuerda } from "../acciones.js";
import { contarEspera } from "../relato.js";

/* La etiqueta de «es tuyo»: el objeto que habla de ti no te dice nada, y sin
   esta marca el menú parece roto cuando solo ofrece esconderlo. */
const esTuyo = (v, o) => !!o && o.dueño === v.yo.id;
import { objetoDe, retratoDe, peonDe, RETRATO_PLACEHOLDER, PEON_PLACEHOLDER } from "../imagenes.js";

/* Tocar un objeto que está a la vista no lo coge a ciegas: abre la elección y
   enseña lo que cuesta cada sitio. La mano es gratis; la bolsa, una ficha. */
function abrirCoger(obj, v, ctx) {
  const accionDe = (sitio) =>
    (ctx.acciones || []).find((a) => a.tipo === "coger" && a.obj === obj.id && a.sitio === sitio);
  const filas = [
    { sitio: "mano", texto: "A la mano", detalle: "se ve cuál es", coste: "gratis", falta: "ya llevas algo en la mano" },
    { sitio: "bolsa", texto: "A la bolsa", detalle: "se ve el gesto, no el objeto", coste: "1 PA", falta: v.bolsa ? "la bolsa está llena" : "sin fichas" },
  ];
  abrirHoja({
    titulo: obj.nombre,
    sub: "¿Dónde lo pones?",
    cuerpo: h(
      "div",
      { class: "grupo" },
      ...filas.map((f) => {
        const a = accionDe(f.sitio);
        return h(
          "button",
          {
            class: "opcion",
            disabled: !a,
            onclick: () => {
              if (!a) return;
              cerrarHoja();
              ctx.ejecutar(a);
            },
          },
          h("span", {}, f.texto, h("span", { class: "detalle", text: a ? f.detalle : f.falta })),
          h("span", { class: "coste", text: a ? f.coste : "—" })
        );
      })
    ),
  });
}

// Crea un círculo con la imagen de un objeto (ganzúa, lupa, etc.)
function iconoObjeto(nombreObjeto) {
  const d = document.createElement("div");
  d.className = "persona-accion-icono";
  const i = document.createElement("img");
  i.src = objetoDe(nombreObjeto);
  i.alt = nombreObjeto;
  i.onerror = () => { i.style.display = "none"; };
  d.append(i);
  return d;
}

export function verPersonaModal(q, v, ctx) { return verPersona(q, v, ctx); }

function verPersona(q, v, ctx) {
  // Cabecera: pill con apodo + botón cerrar
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: q.apodo }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );

  // Retrato centrado
  const retratoEl = h("div", { class: "persona-modal-retrato" });
  const img = document.createElement("img");
  img.src = retratoDe(q.apodo);
  img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
  img.alt = q.apodo;
  retratoEl.append(img);

  // Objeto en la mano
  let objEl = null;
  if (q.mano) {
    const mio = q.mano.dueño === v.yo.id;
    objEl = h("div", { class: "persona-modal-objeto" + (mio ? " mio" : "") });
    const imgCircle = document.createElement("div");
    imgCircle.className = "persona-modal-objeto-img";
    const objImg = document.createElement("img");
    objImg.src = objetoDe(q.mano.nombre);
    objImg.alt = q.mano.nombre;
    objImg.onerror = () => { objImg.style.display = "none"; };
    imgCircle.append(objImg);
    /* Nada de `append(... : null)`: el DOM escribe la palabra «null» si le
       pasas un null suelto (la ayuda `h` sí lo ignora, `append` no). */
    objEl.append(
      imgCircle,
      h("span", { class: "persona-modal-objeto-nombre", text: q.mano.nombre })
    );
    if (mio) objEl.append(h("span", { class: "persona-modal-objeto-tuyo", text: "tuyo" }));
  }

  // Cotilleos que te ha dado esta persona. Solo de quién son: el contenido
  // puede ser mentira y no se lee hasta indagar.
  const dichosDe = v.dichos.filter(d => d.de === q.apodo);
  const pistasEl = h("div", { class: "persona-modal-pistas-bloque" });
  pistasEl.append(h("div", { class: "persona-modal-pistas-cab" },
    h("span", { class: "persona-modal-pistas-n", text: String(dichosDe.length) }),
    h("span", { class: "persona-modal-pistas-lbl", text: dichosDe.length === 1 ? " cotilleo" : " cotilleos" })
  ));
  for (const d of dichosDe) {
    pistasEl.append(h("div", { class: "persona-modal-pista-fila" },
      h("span", { class: "persona-modal-pista-nombre", text: d.nombre }),
      h("span", { class: "persona-modal-pista-dia", text: `J${d.dia}` })
    ));
  }

  // Acciones legales para esta persona. Cotillear también está aquí: desde su
  // ficha se elige de qué nombre te habla, un paso más y sin destinatario al
  // azar. En la hoja de acciones, lo mismo: una fila por personaje.
  const golpe = ctx.acciones.find(a => a.tipo === "habilidad" && a.cual === "tranca" && a.a === q.id);
  const empujonesAqui = ctx.acciones.filter(a => a.tipo === "habilidad" && a.cual === "empujon" && a.a === q.id);
  const cuerdasAqui = ctx.acciones.filter(a => a.tipo === "habilidad" && a.cual === "cuerda" && a.a === q.id);
  const otrasAcciones = ctx.acciones.filter(a =>
    ["robar", "reclamar", "interrogar"].includes(a.tipo) && a.a === q.id
  );
  const cotilleos = ctx.acciones.filter(a => a.tipo === "cotillear" && a.con === q.id);
  const accionesEl = h("div", { class: "persona-modal-acciones" });

  /* Cotillear con quien tienes delante: se abre la lista de nombres y se elige
     de quién quieres que te hable. */
  if (cotilleos.length) {
    accionesEl.append(h("button", {
      class: "persona-modal-accion",
      onclick: () => elegirSobreQuien(q.id, cotilleos, ctx),
    },
      h("span", { class: "persona-modal-accion-txt" },
        "Cotillear",
        h("span", { class: "detalle", text: "1 acción · 1 vez al día · eliges de qué nombre" })
      )
    ));
  }

  for (const a of otrasAcciones) {
    const { texto, detalle } = etiqueta(a, v, ctx);
    const icono = (a.tipo === "robar") ? "una ganzúa de hueso" : (a.tipo === "interrogar") ? "una lupa de orfebre" : null;
    accionesEl.append(h("button", { class: "persona-modal-accion", onclick: () => { cerrarHoja(); ctx.ejecutar(a); } },
      h("span", { class: "persona-modal-accion-txt" },
        texto,
        h("span", { class: "detalle", text: detalle })
      ),
      icono ? iconoObjeto(icono) : null
    ));
  }

  if (golpe) {
    accionesEl.append(h("button", {
      class: "persona-modal-accion",
      onclick: () => { cerrarHoja(); ctx.ejecutar(golpe); },
    },
      h("span", { class: "persona-modal-accion-txt" },
        "Golpear con la tranca",
        h("span", { class: "detalle", text: "gasta la tranca · pierde 3 acciones en su próximo turno" })
      ),
      iconoObjeto("una tranca de roble")
    ));
  }

  if (empujonesAqui.length) {
    accionesEl.append(h("button", {
      class: "persona-modal-accion",
      onclick: () => _elegirDestinoEmpujonModal(empujonesAqui, v, ctx),
    },
      h("span", { class: "persona-modal-accion-txt" },
        "Empujar",
        h("span", { class: "detalle", text: "gasta el empujón · lo envía a una sala contigua" })
      ),
      iconoObjeto("un empujón de guardián")
    ));
  }

  if (cuerdasAqui.length) {
    accionesEl.append(h("button", {
      class: "persona-modal-accion",
      onclick: () => { cerrarHoja(); elegirCuerda(cuerdasAqui, ctx); },
    },
      h("span", { class: "persona-modal-accion-txt" },
        "Atar",
        h("span", { class: "detalle", text: "gasta la cuerda · no puede moverse esta jornada" })
      ),
      iconoObjeto("una cuerda de atar")
    ));
  }

  if (!otrasAcciones.length && !golpe && !empujonesAqui.length && !cuerdasAqui.length) {
    accionesEl.append(h("p", { class: "persona-modal-sin-acciones", text: "Nada que hacer aquí ahora mismo." }));
  }

  /* Recuperar no cabe sin hueco. Sin decirlo, la opción desaparece y parece
     que el motor se ha olvidado de ella. */
  if (q.mano && q.mano.dueño === v.yo.id && v.mano && v.bolsa) {
    accionesEl.append(
      h("p", { class: "persona-modal-sin-acciones", text: "Llevas la mano y la bolsa llenas: suelta o esconde algo para poder recuperarlo." })
    );
  }

  // Definitivos del cuaderno (slot 0 de sospechas guardadas en localStorage)
  const sospechasGuardadas = JSON.parse(localStorage.getItem(`casa.sospechas.${ctx.semilla}`) || "{}");
  const definitivos = v.gente
    .filter(p => sospechasGuardadas[p.id]?.[0])
    .map(p => ({ apodo: p.apodo, nombre: sospechasGuardadas[p.id][0] }));
  const definitivosEl = h("div", { class: "persona-modal-definitivos" });
  if (definitivos.length) {
    definitivosEl.append(
      h("div", { class: "persona-modal-seccion-lbl", text: `${definitivos.length} definitivo${definitivos.length > 1 ? "s" : ""}` }),
      ...definitivos.map(d => h("div", { class: "persona-modal-definitivo-fila" },
        h("span", { class: "persona-nombre-tag", text: d.apodo })
      ))
    );
  }

  const infoLateral = h("div", { class: "persona-modal-lateral" },
    h("div", { class: "persona-modal-seccion-lbl", text: "lleva en la mano" }),
    objEl || h("div", { class: "persona-modal-objeto persona-modal-objeto-vacio" },
      h("div", { class: "persona-modal-objeto-img" }),
      h("span", { class: "persona-modal-objeto-nombre", text: "manos vacías" })
    ),
    ...(() => {
      if (!q.esYo) return [];
      const bolsaEl = v.bolsa
        ? (() => {
            const wrap = h("div", { class: "persona-modal-objeto" });
            const imgWrap = h("div", { class: "persona-modal-objeto-img" });
            const bi = document.createElement("img");
            bi.src = objetoDe(v.bolsa.nombre);
            bi.alt = v.bolsa.nombre;
            bi.onerror = () => { bi.style.display = "none"; };
            imgWrap.append(bi);
            wrap.append(imgWrap, h("span", { class: "persona-modal-objeto-nombre", text: v.bolsa.nombre }));
            return wrap;
          })()
        : h("div", { class: "persona-modal-objeto persona-modal-objeto-vacio" },
            h("div", { class: "persona-modal-objeto-img" }),
            h("span", { class: "persona-modal-objeto-nombre", text: "bolsa vacía" })
          );
      return [h("div", { class: "persona-modal-seccion-lbl", text: "lleva en la bolsa" }), bolsaEl];
    })(),
    (() => {
      /* Tus tres objetos: los que hablan de ti. Compactos, porque aquí el
         hueco es el de la columna y lo que importa es reconocerlos. */
      if (!q.esYo) return [];
      const mios = v.mios ?? [];
      const fila = h("div", { class: "persona-modal-mios" });
      for (let i = 0; i < 3; i++) {
        const o = mios[i];
        const caja = h("div", {
          class: "persona-modal-mio" + (o ? "" : " vacio"),
          title: o ? o.nombre : "por llegar",
        });
        if (o) {
          const im = document.createElement("img");
          im.src = objetoDe(o.nombre);
          im.alt = o.nombre;
          im.onerror = () => { im.style.display = "none"; };
          caja.append(im);
        } else {
          caja.append(h("span", { text: "?" }));
        }
        fila.append(caja);
      }
      return [
        h("div", { class: "persona-modal-seccion-lbl", text: "tus objetos" }),
        h("p", { class: "persona-modal-desc", text: "Están escondidos por el castillo y dan pistas sobre quién eres." }),
        fila,
      ];
    })(),
    definitivosEl
  );

  const filaMedia = h("div", { class: "persona-modal-fila-media" }, retratoEl, infoLateral);

  const cuerpo = h("div", { class: "persona-modal" },
    cab,
    filaMedia,
    h("div", { class: "persona-modal-sep" }),
    accionesEl
  );

  abrirHoja({ titulo: null, cuerpo, sinAsa: true });
}
import { tema } from "../contenido.js";

/* Coordenadas axiales del hexágono isométrico (punta arriba/abajo).
   q = columna, r = fila. Adyacentes = una arista compartida. */
const AX = {
  trono:      [0, 0],
  cocinas:    [-1, 0],
  jardin:     [1, 0],
  biblioteca: [0, 1],
  cripta:     [-1, 1],
  armeria:    [-2, 1],
  torre:      [-1, -1],
  capilla:    [0, -1],
};

function plano(v, ctx) {
  const R  = 40;
  // Proporciones medidas del artwork (imagen 512×512):
  // half-height=220px, half-width=208px, side-vertex-y=94px
  const R2H = 208 / 220;  // ancho/alto del hex del artwork
  const RSY = 112 / 220;  // posición vertical de los vértices laterales
  const IMG = 512 / 220;  // tamaño de imagen / half-height
  const RH  = R * R2H;
  const RY  = R * 1.06;       // punta arriba/abajo ligeramente más extendida
  const BY  = R * 0.045;      // los 3 vértices inferiores suben
  const TY  = R * 0.015;      // el vértice de arriba baja
  const HW  = RH * 2;
  const VS  = R * (1 + RSY);  // espaciado vertical correcto para tesela
  const OX  = 50, OY = 50;
  const [cq, cr] = AX[v.sala];

  function hexCenter(id) {
    const [q, r] = AX[id];
    return [OX + HW * ((q - cq) + (r - cr) / 2), OY + VS * (r - cr)];
  }

  function hexPts(cx, cy, expand = 0) {
    const ry  = R + expand;
    const ryt = RY + expand;
    const rx  = ry * R2H;
    const sy  = ry * RSY;
    return [
      [cx,      cy - ryt + TY],
      [cx + rx, cy - sy],
      [cx + rx, cy + sy  - BY],
      [cx,      cy + ryt - BY],
      [cx - rx, cy + sy  - BY],
      [cx - rx, cy - sy],
    ];
  }

  const pStr = (arr) => arr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  const drawOrder = [
    ...Object.keys(AX).filter(id => id !== v.sala)
      .sort((a, b) => {
        const dr = (AX[a][1] - cr) - (AX[b][1] - cr);
        return dr !== 0 ? dr : (AX[a][0] - cq) - (AX[b][0] - cq);
      }),
    v.sala,
  ];

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "5 7 90 90");
  svg.setAttribute("class", "mapa-iso");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  svg.append(defs);

  // Gradiente radial para sombra de peones
  const sombGrad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
  sombGrad.setAttribute("id", "peon-sombra");
  sombGrad.setAttribute("cx", "50%"); sombGrad.setAttribute("cy", "50%");
  sombGrad.setAttribute("r", "50%");
  const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  s1.setAttribute("offset", "0%"); s1.setAttribute("stop-color", "#000"); s1.setAttribute("stop-opacity", "1");
  const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  s2.setAttribute("offset", "100%"); s2.setAttribute("stop-color", "#000"); s2.setAttribute("stop-opacity", "0");
  sombGrad.append(s1, s2);
  defs.append(sombGrad);

  for (const id of drawOrder) {
    const s = v.mapa[id];
    const actual = id === v.sala;
    const vecina = tema.salas[v.sala].salidas.includes(id) && s.abierta;

    const [cx, cy] = hexCenter(id);
    const E   = 0.6;  // expansión para sellar huecos entre tiles
    const pts = hexPts(cx, cy, E);
    const ps  = pStr(pts);
    const psBorder = pStr(hexPts(cx, cy));

    const opac = actual ? 1 : vecina ? 0.72 : s.abierta ? 0.28 : 0.13;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("opacity", opac);
    g.style.cursor = "pointer";
    g.addEventListener("click", () => {
      if (id === v.sala) { if (v.turno?.esMio !== false) ctx.actuar(); }
      else verSala(v, ctx, id);
    });

    // Fondo ligeramente expandido para cerrar huecos sub-pixel
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    bg.setAttribute("points", ps);
    bg.setAttribute("fill", "#1a1712");
    bg.setAttribute("stroke", "none");
    g.append(bg);

    // Imagen recortada al hexágono expandido
    const clipId = `c-${id}`;
    const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    cp.setAttribute("id", clipId);
    const cpPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    cpPoly.setAttribute("points", ps);
    cp.append(cpPoly);
    defs.append(cp);

    const Re = R + E;
    const imgSz = Re * IMG;  // imagen cuadrada escalada al hex del artwork
    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    /* Ruta absoluta: dentro de la plataforma el documento vive en /app/, así
       que `img/salas/…` resolvía a /app/img/salas/… y no existía. */
    img.setAttribute("href", `/app/juegos/say-my-name/img/salas/${id}.webp`);
    img.setAttribute("x",      (cx - imgSz / 2).toFixed(2));
    img.setAttribute("y",      (cy - imgSz / 2).toFixed(2));
    img.setAttribute("width",  imgSz.toFixed(2));
    img.setAttribute("height", imgSz.toFixed(2));
    img.setAttribute("preserveAspectRatio", "none");
    img.setAttribute("clip-path", `url(#${clipId})`);
    img.setAttribute("pointer-events", "none");
    g.append(img);

    // Velo para salas cerradas
    if (!s.abierta) {
      const velo = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      velo.setAttribute("points", psBorder);
      velo.setAttribute("fill", "rgba(0,0,0,0.55)");
      velo.setAttribute("pointer-events", "none");
      g.append(velo);
    }


    // Avatares de gente en la sala actual — a lo largo de los dos lados inferiores del hex
    if (actual && v.gente.length) {
      const peonW = 10.5;
      const peonH = 16.5;
      // Vértice inferior y esquinas inferiores del hex
      const botX  = cx,       botY  = cy + RY - BY;
      const blX   = cx - RH,  blY   = cy + R * RSY - BY;
      const brX   = cx + RH,  brY   = cy + R * RSY - BY;
      const n = v.gente.length;
      // Longitud de cada lado inferior del hex en unidades SVG
      const sideLen = Math.sqrt((brX - botX) ** 2 + (brY - botY) ** 2);
      const stepT = 6.5 / sideLen;  // ~15px medidos sobre el lado del hex
      [...v.gente].reverse().forEach((q, ri) => {
        const i = v.gente.length - 1 - ri;
        let fx, fy;
        if (i === 0) {
          fx = botX;
          fy = botY - 5;
        } else {
          const rank = Math.ceil(i / 2);
          const side = i % 2;  // 1=der, 0=izq
          const t = rank * stepT;
          const startY = botY - 5;
          fx = side === 1 ? botX + (brX - botX) * t : botX + (blX - botX) * t;
          fy = side === 1 ? startY + (brY - botY) * t : startY + (blY - botY) * t;
        }
        const sombra = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        sombra.setAttribute("cx", fx.toFixed(2));
        sombra.setAttribute("cy", (fy - 4).toFixed(2));
        sombra.setAttribute("rx", (peonW * 0.4).toFixed(2));
        sombra.setAttribute("ry", (peonW * 0.16).toFixed(2));
        sombra.setAttribute("fill", "url(#peon-sombra)");
        sombra.setAttribute("pointer-events", "none");
        g.append(sombra);

        const el = document.createElementNS("http://www.w3.org/2000/svg", "image");
        el.setAttribute("href", peonDe(q.apodo));
        el.addEventListener("error", () => el.setAttribute("href", PEON_PLACEHOLDER));
        el.setAttribute("x", (fx - peonW / 2).toFixed(2));
        el.setAttribute("y", (fy - peonH).toFixed(2));
        el.setAttribute("width", peonW.toFixed(2));
        el.setAttribute("height", peonH.toFixed(2));
        el.setAttribute("preserveAspectRatio", "xMidYMax meet");
        el.setAttribute("pointer-events", "none");
        g.append(el);
      });
    }

    // Objetos en el suelo — encima de los personajes en z-order
    const objetosSuelo = actual ? [
      ...( v.centro ?? []).map(o => ({ id: o.id, nombre: o.nombre, cepo: false })),
      ...(v.mapa[id]?.cepo ? [{ id: "cepo", nombre: "cepo de hierro", cepo: true }] : []),
    ] : [];
    if (objetosSuelo.length) {
      const objW = 7, objH = 7;
      const botX  = cx,       botY  = cy + RY - BY;
      const blX   = cx - RH,  blY   = cy + R * RSY - BY;
      const brX   = cx + RH,  brY   = cy + R * RSY - BY;
      const sideLen = Math.sqrt((brX - botX) ** 2 + (brY - botY) ** 2);
      const stepT = 6.5 / sideLen;
      [...objetosSuelo].reverse().forEach((obj, ri) => {
        const i = objetosSuelo.length - 1 - ri;
        let fx, fy;
        if (i === 0) {
          fx = botX; fy = botY + 0.5;
        } else {
          const rank = Math.ceil(i / 2);
          const side = i % 2;
          const t = rank * stepT;
          const startY = botY + 0.5;
          fx = side === 1 ? botX + (brX - botX) * t : botX + (blX - botX) * t;
          fy = side === 1 ? startY + (brY - botY) * t : startY + (blY - botY) * t;
        }
        const puedeCoger = !obj.cepo && v.turno?.esMio && ctx.acciones?.some(a => a.tipo === "coger" && a.obj === obj.id);
        const objG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        objG.style.cursor = puedeCoger ? "pointer" : "default";
        if (puedeCoger) objG.addEventListener("click", (e) => { e.stopPropagation(); abrirCoger(obj, v, ctx); });
        const clipId = `oc-${obj.id}`;
        const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        cp.setAttribute("id", clipId);
        const cpR = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        cpR.setAttribute("x", (fx - objW / 2).toFixed(2));
        cpR.setAttribute("y", (fy - objH).toFixed(2));
        cpR.setAttribute("width", objW); cpR.setAttribute("height", objH);
        cpR.setAttribute("rx", "1.5");
        cp.append(cpR);
        defs.append(cp);
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", (fx - objW / 2).toFixed(2));
        bg.setAttribute("y", (fy - objH).toFixed(2));
        bg.setAttribute("width", objW); bg.setAttribute("height", objH);
        bg.setAttribute("rx", "1.5"); bg.setAttribute("fill", "#000");
        bg.setAttribute("stroke", obj.cepo ? "#f5c518" : "var(--linea)");
        bg.setAttribute("stroke-width", "0.4");
        objG.append(bg);
        const im = document.createElementNS("http://www.w3.org/2000/svg", "image");
        im.setAttribute("href", objetoDe(obj.nombre));
        im.setAttribute("x", (fx - objW / 2).toFixed(2));
        im.setAttribute("y", (fy - objH).toFixed(2));
        im.setAttribute("width", objW); im.setAttribute("height", objH);
        im.setAttribute("preserveAspectRatio", "xMidYMid meet");
        im.setAttribute("clip-path", `url(#${clipId})`);
        im.setAttribute("pointer-events", "none");
        objG.append(im);
        g.append(objG);
      });
    }

    svg.append(g);
  }

  // Flechas hacia salas vecinas navegables
  for (const id of Object.keys(AX)) {
    if (id === v.sala) continue;
    const s = v.mapa[id];
    const vecina = tema.salas[v.sala].salidas.includes(id) && s.abierta;
    const trancada = v.mapa[v.sala].cerradas?.includes(id);
    const cerrojo  = v.mapa[v.sala].cerrojadas?.includes(id);
    const mover = ctx.acciones.find(a => a.tipo === "mover" && a.a === id);
    if (!vecina || trancada) {
      /* Mostrar icono en puertas bloqueadas (cerrojo o tranca) */
      if (vecina && trancada) {
        const [nx, ny] = hexCenter(id);
        const px = (OX + nx) / 2, py = (OY + ny) / 2;
        const lockG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        lockG.style.cursor = "pointer";
        lockG.addEventListener("click", (e) => { e.stopPropagation(); verSala(v, ctx, id); });
        const lockBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        lockBg.setAttribute("cx", px.toFixed(2)); lockBg.setAttribute("cy", py.toFixed(2));
        lockBg.setAttribute("r", "4.5"); lockBg.setAttribute("fill", "rgba(0,0,0,0.55)");
        lockG.append(lockBg);
        const lockTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lockTxt.setAttribute("x", px.toFixed(2)); lockTxt.setAttribute("y", (py + 2.5).toFixed(2));
        lockTxt.setAttribute("text-anchor", "middle"); lockTxt.setAttribute("font-size", "5.5");
        lockTxt.setAttribute("pointer-events", "none");
        const lockImg = document.createElementNS("http://www.w3.org/2000/svg", "image");
        lockImg.setAttribute("href", objetoDe("una tranca de roble"));
        lockImg.setAttribute("x", (px - 3).toFixed(2)); lockImg.setAttribute("y", (py - 3).toFixed(2));
        lockImg.setAttribute("width", "6"); lockImg.setAttribute("height", "6");
        lockImg.setAttribute("pointer-events", "none");
        lockG.append(lockImg);
        svg.append(lockG);
      }
      if (vecina && cerrojo) {
        const [nx, ny] = hexCenter(id);
        const px = (OX + nx) / 2, py = (OY + ny) / 2;
        const lockG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        lockG.style.cursor = "pointer";
        lockG.addEventListener("click", (e) => { e.stopPropagation(); verSala(v, ctx, id); });
        const lockBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        lockBg.setAttribute("cx", px.toFixed(2)); lockBg.setAttribute("cy", py.toFixed(2));
        lockBg.setAttribute("r", "4.5");
        lockBg.setAttribute("fill", "rgba(0,0,0,0.55)");
        lockG.append(lockBg);
        const lockTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lockTxt.setAttribute("x", px.toFixed(2)); lockTxt.setAttribute("y", (py + 2.5).toFixed(2));
        lockTxt.setAttribute("text-anchor", "middle"); lockTxt.setAttribute("font-size", "5.5");
        lockTxt.setAttribute("pointer-events", "none");
        lockTxt.textContent = "🔒";
        lockG.append(lockTxt);
        svg.append(lockG);
      }
      continue;
    }
    if (!mover) continue;

    const [nx, ny] = hexCenter(id);
    // Punto a mitad entre la sala actual y la vecina
    const px = (OX + nx) / 2;
    const py = (OY + ny) / 2;

    // Dirección hacia la sala vecina (para la flecha)
    const dxN = nx - OX, dyN = ny - OY;
    const distN = Math.sqrt(dxN * dxN + dyN * dyN);
    const ux = dxN / distN, uy = dyN / distN;
    const angle = Math.atan2(dyN, dxN) * 180 / Math.PI;

    // Grupo pulsante
    const gDot = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gDot.setAttribute("transform-origin", `${px.toFixed(2)} ${py.toFixed(2)}`);
    gDot.setAttribute("class", "nav-dot-pulse");
    gDot.style.cursor = "pointer";
    gDot.addEventListener("click", (e) => { e.stopPropagation(); verSala(v, ctx, id); });

    // Halo
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", px.toFixed(2));
    halo.setAttribute("cy", py.toFixed(2));
    halo.setAttribute("r", "3.6");
    halo.setAttribute("fill", "#c9a227");
    halo.setAttribute("opacity", "0.2");
    halo.setAttribute("pointer-events", "none");
    gDot.append(halo);

    // Círculo sólido
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", px.toFixed(2));
    dot.setAttribute("cy", py.toFixed(2));
    dot.setAttribute("r", "1.87");
    dot.setAttribute("fill", "#f0c84a");
    dot.setAttribute("pointer-events", "none");
    gDot.append(dot);

    // Chevron (angulito) apuntando hacia la sala
    const ch = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const cs = 0.58; // tamaño del chevron (0,73 menos un 20 %)
    /* Medio paso por delante del punto: centrado del todo se quedaba corto y
       empujado los 0,3 de antes se iba hacia la sala vecina. */
    const chx = px + ux * 0.15, chy = py + uy * 0.15;
    ch.setAttribute("d", `M ${(chx - cs).toFixed(2)},${(chy - cs * 0.5).toFixed(2)} L ${chx.toFixed(2)},${(chy + cs * 0.5).toFixed(2)} L ${(chx + cs).toFixed(2)},${(chy - cs * 0.5).toFixed(2)}`);
    ch.setAttribute("fill", "none");
    ch.setAttribute("stroke", "#000000");
    ch.setAttribute("stroke-opacity", "0.7");
    ch.setAttribute("stroke-width", "0.5");
    ch.setAttribute("stroke-linecap", "round");
    ch.setAttribute("stroke-linejoin", "round");
    ch.setAttribute("transform", `rotate(${(angle - 90).toFixed(1)}, ${chx.toFixed(2)}, ${chy.toFixed(2)})`);
    ch.setAttribute("pointer-events", "none");
    gDot.append(ch);

    // Área de toque ampliada (invisible)
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hitArea.setAttribute("cx", px.toFixed(2));
    hitArea.setAttribute("cy", py.toFixed(2));
    hitArea.setAttribute("r", "7");
    hitArea.setAttribute("fill", "transparent");
    gDot.append(hitArea);

    svg.append(gDot);
  }

  const VB_CERCA = "5 7 90 90";
  const VB_LEJOS = "-110 -55 275 205";
  let lejos = false;

  const caja = h("div", { class: "mapa" });
  caja.style.position = "relative";

  const iconExpand  = `<svg width="20" height="20" viewBox="0 0 20 20" fill="#c9a227"><polygon points="0,0 6,0 0,6"/><polygon points="20,0 14,0 20,6"/><polygon points="0,20 6,20 0,14"/><polygon points="20,20 14,20 20,14"/></svg>`;
  const iconCompress = `<svg width="20" height="20" viewBox="0 0 20 20" fill="#c9a227"><polygon points="6,6 0,6 6,0"/><polygon points="14,6 20,6 14,0"/><polygon points="6,14 0,14 6,20"/><polygon points="14,14 20,14 14,20"/></svg>`;

  /* Círculo de salida: aparece en la sala del Trono cuando se puede salir.
     Hardcodeado true temporalmente para ver el aspecto visual. */
  const accionSalir = ctx.acciones.find(a => a.tipo === "salir");
  const todosDefinitivos = (() => {
    try {
      const g = JSON.parse(localStorage.getItem(`casa.sospechas.${ctx.semilla}`) || "{}");
      return (ctx.nombres ?? []).every(n => g[n]?.[0]);
    } catch { return false; }
  })();
  if (accionSalir && todosDefinitivos) {
    // Vértice superior-derecho del hex del trono
    const [tx, ty] = hexCenter(v.sala);
    const sx = tx + RH * 0.88 - 22;
    const sy = ty - R * RSY * 0.8;
    const gSalir = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gSalir.setAttribute("transform-origin", `${sx.toFixed(2)} ${sy.toFixed(2)}`);
    gSalir.setAttribute("class", "nav-dot-pulse");
    gSalir.style.cursor = "pointer";
    gSalir.addEventListener("click", (e) => { e.stopPropagation(); avisarAntesDeSalir(v, ctx); });

    const haloS = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    haloS.setAttribute("cx", sx.toFixed(2)); haloS.setAttribute("cy", sy.toFixed(2));
    haloS.setAttribute("r", "3.6"); haloS.setAttribute("fill", "#c84a4a"); haloS.setAttribute("opacity", "0.2");
    haloS.setAttribute("pointer-events", "none");
    gSalir.append(haloS);

    const dotS = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dotS.setAttribute("cx", sx.toFixed(2)); dotS.setAttribute("cy", sy.toFixed(2));
    dotS.setAttribute("r", "1.87"); dotS.setAttribute("fill", "#e05555");
    dotS.setAttribute("pointer-events", "none");
    gSalir.append(dotS);

    // Chevron igual al de movimiento, apuntando hacia la derecha (hacia la puerta)
    const cs = 0.58;
    const chS = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chS.setAttribute("d", `M ${(sx - cs).toFixed(2)},${(sy - cs * 0.5).toFixed(2)} L ${sx.toFixed(2)},${(sy + cs * 0.5).toFixed(2)} L ${(sx + cs).toFixed(2)},${(sy - cs * 0.5).toFixed(2)}`);
    chS.setAttribute("fill", "none");
    chS.setAttribute("stroke", "#000000");
    chS.setAttribute("stroke-opacity", "0.7");
    chS.setAttribute("stroke-width", "0.5");
    chS.setAttribute("stroke-linecap", "round");
    chS.setAttribute("stroke-linejoin", "round");
    chS.setAttribute("transform", `rotate(${(-45 - 90).toFixed(1)}, ${sx.toFixed(2)}, ${sy.toFixed(2)})`);
    chS.setAttribute("pointer-events", "none");
    gSalir.append(chS);

    const hitS = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hitS.setAttribute("cx", sx.toFixed(2)); hitS.setAttribute("cy", sy.toFixed(2));
    hitS.setAttribute("r", "7"); hitS.setAttribute("fill", "transparent");
    gSalir.append(hitS);

    svg.append(gSalir);
  }

  /* Etiquetas de nombre de sala: solo visibles en modo lejos */
  const gLabels = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gLabels.setAttribute("class", "mapa-labels");
  gLabels.style.display = "none";
  for (const id of Object.keys(AX)) {
    const s = v.mapa[id];
    if (!s?.abierta) continue;
    const [cx, cy] = hexCenter(id);
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", cx);
    txt.setAttribute("y", cy + 2);
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("dominant-baseline", "middle");
    txt.setAttribute("font-size", "4.5");
    txt.setAttribute("font-weight", "600");
    txt.setAttribute("fill", id === v.sala ? "#c9a227" : "#e8dcc8");
    txt.setAttribute("pointer-events", "none");
    txt.textContent = (s.nombre ?? id).charAt(0).toUpperCase() + (s.nombre ?? id).slice(1);
    gLabels.append(txt);
  }
  svg.append(gLabels);

  const btnZoom = document.createElement("button");
  btnZoom.innerHTML = iconExpand;
  btnZoom.style.cssText = "position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;line-height:0;padding:4px;z-index:1";
  btnZoom.addEventListener("click", () => {
    lejos = !lejos;
    svg.setAttribute("viewBox", lejos ? VB_LEJOS : VB_CERCA);
    btnZoom.innerHTML = lejos ? iconCompress : iconExpand;
    gLabels.style.display = lejos ? "" : "none";
  });

  /* Drag to pan en modo lejos */
  let dragging = false, dragStartX = 0, dragStartY = 0;
  let vbx = 0, vby = 0, vbw = 0, vbh = 0;
  function parsVB() {
    const [x, y, w, h] = svg.getAttribute("viewBox").split(" ").map(Number);
    return { x, y, w, h };
  }
  svg.addEventListener("pointerdown", (ev) => {
    if (!lejos) return;
    dragging = true;
    dragStartX = ev.clientX; dragStartY = ev.clientY;
    const vb = parsVB(); vbx = vb.x; vby = vb.y; vbw = vb.w; vbh = vb.h;
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = vbw / rect.width;
    const scaleY = vbh / rect.height;
    const dx = (ev.clientX - dragStartX) * scaleX;
    const dy = (ev.clientY - dragStartY) * scaleY;
    svg.setAttribute("viewBox", `${(vbx - dx).toFixed(1)} ${(vby - dy).toFixed(1)} ${vbw} ${vbh}`);
  });
  svg.addEventListener("pointerup", () => { dragging = false; });
  svg.addEventListener("pointercancel", () => { dragging = false; });

  const tagSala = document.createElement("div");
  tagSala.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;pointer-events:none;z-index:1;white-space:nowrap";
  const nombreSala = v.mapa[v.sala].nombre;
  const spanNombre = document.createElement("span");
  spanNombre.textContent = nombreSala.charAt(0).toUpperCase() + nombreSala.slice(1);
  spanNombre.style.cssText = "font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;border:1px solid var(--linea);background:var(--panel2)";
  const huecos = v.mapa[v.sala].huecos ?? 0;
  const spanHuecos = document.createElement("span");
  spanHuecos.textContent = huecos;
  spanHuecos.title = `${huecos} huecos`;
  spanHuecos.style.cssText = "font-size:12px;font-weight:600;padding:5px 9px;border-radius:999px;border:1px solid var(--linea);background:var(--panel2);color:var(--tenue)";
  tagSala.append(spanNombre, spanHuecos);

  function iconoMapa(obj, lado, label, onclick) {
    /* Si el objeto es tuyo se dice aquí, como el «yo» de tu ficha: es la
       respuesta a «¿por qué no me deja usarlo?». */
    const tuyo = !!obj && obj.dueño === v.yo.id;
    const icono = h("div", { class: "mapa-objeto-flotante-icono" + (tuyo ? " tuyo" : "") });
    if (obj) {
      const im = document.createElement("img");
      im.src = objetoDe(obj.nombre);
      im.alt = obj.nombre;
      im.title = tuyo ? `${obj.nombre} · es tuyo` : obj.nombre;
      im.onerror = () => { im.style.display = "none"; };
      icono.append(im);
    }
    if (obj?.acarreo > 0) icono.append(h("div", { class: "marca-acarreo", text: String(obj.acarreo), title: `Jornadas restantes de acarreo: ${obj.acarreo}` }));
    /* La misma pastilla que el «yo» del retrato, dentro de la imagen y abajo a
       la derecha: mismo idioma, mismo sitio en las dos vistas. */
    if (tuyo) icono.append(h("span", { class: "mapa-objeto-tuyo", text: "tuyo" }));
    return h("div", { class: "mapa-objeto-flotante mapa-objeto-" + lado, onclick },
      h("span", { class: "mapa-objeto-label", text: label }),
      icono
    );
  }

  const inventarioGroup = h("div", { class: "mapa-inventario-group" },
    iconoMapa(v.bolsa, null, "bolsa", () => ctx.verInventario()),
  );

  const manoIcon = iconoMapa(v.mano, "der", "mano", () => ctx.verInventario());

  const btnAyuda = h("button", { class: "mapa-ayuda-btn", text: "?", onclick: () => ctx.verReglas?.() });

  caja.append(svg, tagSala, btnZoom, inventarioGroup, manoIcon, btnAyuda);
  if (v.mapa[v.sala]?.humo) caja.append(h("div", { class: "humo-overlay" }));
  return caja;
}

/* Lo que se ve al tocar una estancia. Nada de dentro: a los demás y a lo que
   guardan solo se les ve desde la sala en la que estás. */
function verSala(v, ctx, id) {
  const s = v.mapa[id];
  const actual = id === v.sala;
  const vecina = tema.salas[v.sala].salidas.includes(id) && s.abierta;
  const trancada = !actual && v.mapa[v.sala].cerradas?.includes(id);
  const cerrojo  = !actual && v.mapa[v.sala].cerrojadas?.includes(id);
  const mover = ctx.acciones.find((a) => a.tipo === "mover" && a.a === id);

  const cuerpo = h("div");

  if (actual) cuerpo.append(h("p", { class: "vacio", text: "Estás aquí." }));
  else if (!s.abierta)
    cuerpo.append(h("p", { class: "vacio", text: `Esta estancia no existe hasta la jornada ${s.entra}.` }));
  else if (cerrojo)
    cuerpo.append(h("p", { class: "vacio", text: "La puerta está cerrada con cerrojo. Necesitas una ganzúa para abrirla." }));
  else if (trancada)
    cuerpo.append(h("p", { class: "vacio", text: "La puerta está trancada: aguanta esta jornada y la siguiente." }));
  else if (!vecina) cuerpo.append(h("p", { class: "vacio", text: "Solo se va a una estancia contigua." }));

  /* Los huecos de otra estancia no se ven: hay que estar dentro. */
  if (s.huecos != null) cuerpo.append(h("p", { class: "vacio", text: `${s.huecos} huecos.` }));

  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Movimiento" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );

  if (!actual && vecina && !trancada) {
    const trancar = ctx.acciones.find(a => a.tipo === "habilidad" && a.cual === "tranca" && a.hacia === id);
    const vaso    = ctx.acciones.find(a => a.tipo === "habilidad" && a.cual === "vaso"   && a.hacia === id);
    if (mover || trancar || vaso) {
      const botones = [];
      if (mover) botones.push(h("button", {
        class: "boton",
        text: `Ir a ${s.nombre} · 1 acción`,
        onclick: () => { cerrarHoja(); ctx.ejecutar(mover); },
      }));
      if (vaso) botones.push(h("button", {
        class: "boton",
        text: `Escuchar con la copa · 1 acción`,
        onclick: () => { cerrarHoja(); ctx.ejecutar(vaso); },
      }));
      if (trancar) botones.push(h("button", {
        class: "boton",
        text: `Trancar puerta · 1 acción`,
        onclick: () => { cerrarHoja(); ctx.ejecutar(trancar); },
      }));
      botones.push(h("button", { class: "boton secundario", text: "Cancelar", onclick: cerrarHoja }));
      cuerpo.append(h("div", { class: "sala-modal-acciones" }, ...botones));
    } else {
      cuerpo.append(h("p", { class: "vacio", text: "No te quedan acciones hoy." }));
    }
  }

  if (!actual && trancada) {
    const destrancar2 = ctx.acciones.find(a => a.tipo === "habilidad" && a.cual === "ganzua" && a.hacia === id)
                     || ctx.acciones.find(a => a.tipo === "destrancar" && a.hacia === id);
    if (destrancar2) {
      cuerpo.append(h("div", { class: "sala-modal-acciones" },
        h("button", {
          class: "boton",
          text: `Abrir la tranca · 1 acción`,
          onclick: () => { cerrarHoja(); ctx.ejecutar(destrancar2); },
        }),
        h("button", { class: "boton secundario", text: "Cancelar", onclick: cerrarHoja })
      ));
    }
  }

  if (!actual && cerrojo) {
    const destrancar = ctx.acciones.find(a => a.tipo === "destrancar" && a.hacia === id);
    if (destrancar) {
      cuerpo.append(
        h("div", { class: "sala-modal-acciones" },
          h("button", {
            class: "boton",
            text: `Abrir el cerrojo · 1 acción`,
            onclick: () => { cerrarHoja(); ctx.ejecutar(destrancar); },
          }),
          h("button", { class: "boton secundario", text: "Cancelar", onclick: cerrarHoja })
        )
      );
    }
  }

  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, cuerpo), sinAsa: true });
}

function sala(v, ctx) {
  const s = v.mapa[v.sala];
  const tarjeta = h("div", { class: "tarjeta" });


  const cols = 4;
  const total = Math.max(Math.ceil(Math.max(v.gente.length, 1) / cols) * cols, cols);
  const cards = v.gente.map((q) => {
    const card = h("div", {
      class: "persona-card" + (q.esYo ? " persona-card-yo" : ""),
      onclick: () => verPersona(q, v, ctx)
    });

    const tagNombre = document.createElement("div");
    tagNombre.className = "persona-nombre-tag";
    tagNombre.textContent = q.apodo;
    card.append(tagNombre);

    const retrato = h("div", { class: "persona-retrato" });
    const img = document.createElement("img");
    img.src = retratoDe(q.apodo);
    img.onerror = () => { img.src = RETRATO_PLACEHOLDER; };
    img.alt = q.apodo;
    retrato.append(img);
    if (q.esYo) retrato.append(h("div", { class: "persona-retrato-yo-tag", text: "yo" }));
    if (q.cepo) {
      const cepoBadge = h("div", { class: "persona-cepo-badge" });
      const cepoImg = document.createElement("img");
      cepoImg.src = objetoDe("un cepo de hierro");
      cepoImg.alt = "cepo";
      cepoBadge.append(cepoImg);
      retrato.append(cepoBadge);
    }

    if (q.mano) {
      const objCircle = document.createElement("div");
      const esMio = esTuyo(v, q.mano);
      objCircle.className = "persona-objeto-circulo" + (esMio ? " mio" : "");
      objCircle.title = esMio ? `${q.mano.nombre} · es tuyo` : q.mano.nombre;
      const objImg = document.createElement("img");
      objImg.src = objetoDe(q.mano.nombre);
      objImg.alt = q.mano.nombre;
      objImg.title = q.mano.nombre;
      objImg.onerror = () => { objCircle.title = q.mano.nombre; objImg.style.display = "none"; };
      objCircle.append(objImg);
      retrato.append(objCircle);
      /* La misma marca que el «yo» del retrato, en oro: el objeto que es tuyo
         no se puede usar, y sin la etiqueta parece que el juego falla. */
      if (esMio) retrato.append(h("span", { class: "persona-objeto-tuyo", text: "tuyo" }));
    }

    card.append(retrato);
    return card;
  });

  // Ranuras vacías para completar la fila
  for (let i = v.gente.length; i < total; i++) {
    cards.push(h("div", { class: "persona-card persona-card-vacia" },
      h("div", { class: "persona-nombre-tag persona-nombre-tag-vacia" }),
      h("div", { class: "persona-retrato persona-retrato-vacia" })
    ));
  }

  /* El número, a la vista: si alguien se ha ido, se ve en cuántos son antes
     de buscar la cara que falta. */
  tarjeta.append(
    h("p", { class: "gente-cuenta", text: `Aquí ahora · ${v.gente.length}` }),
    /* La copa pegada a la pared: mientras no te muevas, oyes esa estancia. */
    ...(v.escucha ? [h("p", { class: "escucha-chip", text: `Con la copa en la pared · ${v.escucha.nombre}` })] : []),
    ...(v.mapa[v.sala]?.humo ? [h("p", { class: "escucha-chip humo-chip", text: "⚠ Sala con humo · no puedes registrar, coger, robar ni usar objetos esta jornada" })] : []),
    ...(v.mapa[v.sala]?.cepo ? [h("p", { class: "escucha-chip cepo-chip", text: "⚠ Hay un cepo en esta sala · atrapa al siguiente que entre" })] : []),
    /* Atrapado: el cepo cierra el movimiento hasta el amanecer, y sin decirlo
       no hay forma de entender por qué no salen las salidas. */
    ...(v.gente?.find((q) => q.esYo)?.cepo ? [h("p", { class: "escucha-chip cepo-chip", text: "⚠ Un cepo te tiene atrapado · no puedes moverte hasta el próximo amanecer" })] : []),
    h("div", { class: "gente-grid" }, ...cards)
  );

  const hayVista = v.centro.length || v.mapa[v.sala]?.cepo;
  if (hayVista) {
    const cepoCard = v.mapa[v.sala]?.cepo ? (() => {
      const im = document.createElement("img");
      im.src = objetoDe("cepo de hierro");
      im.alt = "Cepo de hierro";
      im.onerror = () => { im.style.display = "none"; };
      return h("div", { class: "centro-obj-card" },
        h("span", { class: "persona-nombre-tag centro-obj-tag", text: "Cepo de hierro" }),
        h("div", { class: "centro-obj-img centro-obj-img--cepo" }, im)
      );
    })() : null;

    tarjeta.append(
      h("p", { class: "gente-cuenta", style: "margin-top:22px", text: `A la vista · ${v.centro.length + (cepoCard ? 1 : 0)}` }),
      h("div", { class: "centro-objetos-grid" }, ...v.centro.map(o => {
        const puedeCoger = v.turno?.esMio && ctx.acciones?.some(a => a.tipo === "coger" && a.obj === o.id);
        const im = document.createElement("img");
        im.src = objetoDe(o.nombre);
        im.alt = o.nombre;
        im.onerror = () => { im.style.display = "none"; };
        const imgWrap = h("div", { class: "centro-obj-img" }, im);
        const card = h("div", { class: "centro-obj-card" + (puedeCoger ? " centro-obj-coger" : "") },
          h("span", { class: "persona-nombre-tag centro-obj-tag", text: o.nombre }),
          imgWrap
        );
        if (puedeCoger) card.addEventListener("click", () => abrirCoger(o, v, ctx));
        return card;
      }), cepoCard)
    );
  }

  return tarjeta;
}

function _elegirDestinoEmpujonModal(opciones, v, ctx) {
  cerrarHoja();
  if (opciones.length === 1) { ctx.ejecutar(opciones[0]); return; }
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Empujar · ¿hacia dónde?" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const lista = h("div", { class: "persona-modal" },
    ...opciones.map((a) => h("button", {
      class: "opcion",
      onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
    },
      h("span", {}, v.mapa[a.hacia]?.nombre ?? a.hacia),
      h("span", { class: "coste", text: "1" })
    ))
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, lista), sinAsa: true });
}

/* Lo que ha pasado delante de ti desde tu última acción. Es la respuesta a
   «me he movido y el Bufón ya estaba allí»: la casa cambia mientras esperas,
   y esto dice cómo. */
function espera(v) {
  const todas = (v.espera || [])
    .map((ev) => ({ ...contarEspera(ev, v), dia: ev.dia }))
    .filter((l) => l && l.texto);
  if (!todas.length) return null;
  const ultimas = todas.slice(-6);
  const resto = todas.length - ultimas.length;
  const wrap = h("div", { class: "espera" });
  const cab = h("div", { class: "espera-cab" },
    h("div", { class: "espera-titulo" },
      v.turno?.esMio ? "Mientras esperabas tu turno" : "Mientras esperas tu turno"
    ),
    h("button", { class: "espera-cerrar", text: "✕", onclick: () => wrap.remove() })
  );
  wrap.append(cab);
  if (resto > 0) wrap.append(h("div", { class: "espera-mas", text: `Antes de esto, ${resto} cosa${resto === 1 ? "" : "s"} más en la crónica.` }));
  wrap.append(h("div", { class: "espera-lista" },
    ...ultimas.map((l) => h("div", { class: "suceso " + (l.clase || "") },
      h("div", { class: "marca" }),
      h("div", { text: l.texto })
    ))
  ));
  return wrap;
}

export function pintarCasa(v, ctx) {

  const frag = document.createDocumentFragment();
  frag.append(plano(v, ctx));
  const visto = espera(v);
  if (visto) frag.append(visto);
  /* De uno en uno: si el turno es de otro, el botón lo dice y no se pulsa.
     El anfitrión tiene una salida: mandar a un bot a jugar por el que se ha
     quedado parado, para que no pierda su jornada ni la mesa se congele. */
  const turno = v.turno ?? { esMio: true, apodo: "" };
  frag.append(
    h("div", { class: "mapa-acciones-barra" },
      turno.esMio
        ? v.pa > 0
          ? h("button", { class: "mapa-acciones-btn", onclick: () => ctx.actuar() },
              "Realizar acción ", h("span", { class: "mapa-acciones-pa", text: `(${v.pa} ${v.pa === 1 ? "acción" : "acciones"})` })
            )
          : h("div", { class: "mapa-acciones-vacio" }, "Nada que hacer hoy. Pasa a la jornada.")
        : (() => {
            const segs = Array.from({ length: turno.de }, (_, i) => {
              const cls = i === turno.mio - 1 ? " mio" : i < turno.n - 1 ? " hecho" : "";
              return h("span", { class: "jornada-seg" + cls });
            });
            return h("button", { class: "mapa-acciones-btn espera", disabled: true },
              h("span", {}, "Espera tu turno…"),
              h("div", { class: "jornada-barra espera-barra" }, ...segs)
            );
          })(),
      null
    )
  );
  frag.append(sala(v, ctx));
  return frag;
}
