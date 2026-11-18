/* Bridge UI para say-my-name dentro de madrigueras.
   Inyecta #hoja y #avisos en el contenedor del juego y reimplementa
   las funciones de corvus/app/ui.js adaptadas a ese contenedor. */

export function h(tag, at = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(at)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const x of hijos.flat(3)) {
    if (x == null || x === false) continue;
    el.append(x.nodeType ? x : document.createTextNode(String(x)));
  }
  return el;
}

let _contenedor = null;
let alCerrar = null;
let turno = 0;

export function iniciarUI(contenedor) {
  _contenedor = contenedor;

  if (!contenedor.querySelector("#hoja")) {
    const hoja = document.createElement("div");
    hoja.id = "hoja";
    /* La clase es la que trae todas las reglas de la hoja (fixed, velo,
       panel…). En el original venía puesta en el index.html; aquí se creaba
       sin ella y el modal caía al final del documento, en el flujo. */
    hoja.className = "hoja";
    hoja.hidden = true;
    contenedor.append(hoja);
  }
  if (!contenedor.querySelector("#avisos")) {
    const avisos = document.createElement("div");
    avisos.id = "avisos";
    avisos.className = "avisos";
    contenedor.append(avisos);
  }
}

function getHoja() {
  return _contenedor?.querySelector("#hoja") ?? document.getElementById("hoja");
}

export function abrirHoja({ titulo, sub, cuerpo, pie, sinAsa, clase }) {
  const caja = getHoja();
  turno += 1;
  caja.hidden = false;
  caja.replaceChildren(
    h("div", { class: "velo", onclick: cerrarHoja }),
    h(
      "div",
      { class: "panel" + (clase ? " " + clase : ""), role: "dialog", "aria-modal": "true" },
      sinAsa ? null : h("div", { class: "asa" }),
      titulo != null ? h("h2", { text: titulo }) : null,
      sub ? h("p", { class: "sub", text: sub }) : null,
      h("div", { class: "cuerpo" }, cuerpo),
      pie || null
    )
  );
  requestAnimationFrame(() => caja.classList.add("abierta"));
}

export function cerrarHoja() {
  const caja = getHoja();
  if (caja.hidden) return;
  turno += 1;
  const mio = turno;
  caja.classList.remove("abierta");
  const cb = alCerrar;
  alCerrar = null;
  setTimeout(() => {
    if (turno === mio) {
      caja.hidden = true;
      caja.replaceChildren();
      if (cb) cb();
    }
  }, 170);
}

export function confirmar(titulo, texto, si = "Sí") {
  return new Promise((ok) => {
    let decidido = false;
    alCerrar = () => { if (!decidido) ok(false); };
    abrirHoja({
      titulo,
      cuerpo: h(
        "div",
        {},
        h("p", { class: "vacio", text: texto }),
        h("button", {
          class: "boton",
          text: si,
          onclick: () => { decidido = true; alCerrar = null; cerrarHoja(); ok(true); },
        }),
        h("button", {
          class: "boton secundario",
          text: "Mejor no",
          onclick: () => { decidido = true; alCerrar = null; cerrarHoja(); ok(false); },
        })
      ),
    });
  });
}

export function aviso(texto) {
  const caja = _contenedor?.querySelector("#avisos") ?? document.getElementById("avisos");
  const t = h("div", { class: "toast", text: texto });
  caja.append(t);
  setTimeout(() => t.remove(), 2600);
}
