import { h } from "../ui.js";

export function pintarCronica(v, ctx) {
  const frag = document.createDocumentFragment();
  const lineas = ctx.diario || [];

  if (!lineas.length) {
    frag.append(h("p", { class: "vacio", text: "Todavía no ha pasado nada." }));
    return frag;
  }

  const porDia = new Map();
  for (const l of lineas) {
    if (!porDia.has(l.dia)) porDia.set(l.dia, []);
    porDia.get(l.dia).push(l);
  }

  for (const [dia, lista] of porDia) {
    frag.append(
      h(
        "div",
        { class: "dia-bloque" },
        h("h3", { text: `Jornada ${dia}` }),
        lista.map((l) =>
          h(
            "div",
            { class: "suceso " + (l.clase || "") },
            h("span", { class: "marca" }),
            h("span", { text: l.texto })
          )
        )
      )
    );
  }

  return frag;
}
