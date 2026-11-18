/* Las acciones no se inventan aquí: se pintan las que el motor acaba de
   declarar legales. Si una fila no está, es que no se puede. */

import { h, abrirHoja, cerrarHoja, aviso } from "./ui.js";
import { objetoDe } from "./imagenes.js";
import { tema } from "./contenido.js";

const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function nombreDe(v, id, ctx) {
  if (v.mano && v.mano.id === id) return v.mano.nombre;
  if (v.bolsa && v.bolsa.id === id) return v.bolsa.nombre;
  return ctx.nombreObjeto(id);
}

export function etiqueta(a, v, ctx) {
  switch (a.tipo) {
    case "mover":
      return { texto: `Ir ${al(v.mapa[a.a].nombre)}`, detalle: null };
    case "registrar": {
      const par = `huecos ${a.ver[0] + 1} y ${a.ver[1] + 1}`;
      return { texto: `Registrar los ${par}`, detalle: "miras y coges una" };
    }
    case "coger":
      return {
        texto: `Coger ${a.info?.nombre ?? ctx.nombreObjeto(a.obj)}`,
        detalle: `${a.de === "centro" ? "está a la vista" : "lo has visto"} · a la ${a.sitio === "bolsa" ? "bolsa" : "mano"}`,
      };
    case "usar":
      return { texto: `Usar ${nombreDe(v, a.obj, ctx)}`, detalle: "aquí, a ver si sirve" };
    case "esconder":
      return { texto: `Esconder ${nombreDe(v, a.obj, ctx)}`, detalle: "en esta sala" };
    case "soltar":
      return { texto: `Soltar ${nombreDe(v, a.obj, ctx)}`, detalle: "la casa lo esconde en otra estancia" };
    case "guardar":
      return { texto: "Guardarlo en la bolsa", detalle: null };
    case "tirar":
      return { texto: `Tirar ${nombreDe(v, a.obj, ctx)}`, detalle: "desaparece · vuelve al amanecer" };
    case "cambiar": {
      /* Una sola acción para las dos flechas. Se cuenta lo que entra y lo que
         sale, porque quien mira ve las dos cosas. */
      const guarda = v.mano?.nombre;
      const saca = v.bolsa?.nombre;
      if (guarda && saca)
        return { texto: `⇄ Cambiar ${guarda} por ${saca}`, detalle: "se ve qué guardas y qué sacas" };
      if (saca) return { texto: `⇄ Sacar ${saca} de la bolsa`, detalle: "a la mano, a la vista" };
      return { texto: "⇄ Cambiar la mano y la bolsa", detalle: null };
    }
    case "pasar":
      return { texto: "Pasar el resto del día", detalle: "dejas el sitio al siguiente" };
    case "cotillear":
      return { texto: `Cotillear con ${ctx.apodoDe(a.con)} sobre ${a.sobre}`, detalle: "1 acción · 1 vez al día" };
    case "indagar":
      return { texto: `Indagar sobre ${a.sobre}`, detalle: "fusiona 3 dichos en un dato cierto · gratis" };
    case "robar":
      return a.obj
        ? { texto: `Robarle ${ctx.nombreObjeto(a.obj)} a ${ctx.apodoDe(a.a)}`, detalle: `de la ${a.de}` }
        : { texto: `Registrar la bolsa de ${ctx.apodoDe(a.a)}`, detalle: "a ciegas · gastas la ganzúa" };
    case "reclamar":
      return { texto: `Reclamar pista a ${ctx.apodoDe(a.a)}`, detalle: "pista verdadera · objeto se queda con ellos" };
    case "interrogar":
      return { texto: `Interrogar a ${ctx.apodoDe(a.a)}`, detalle: "con la lupa" };
    case "habilidad":
      if (a.cual === "tranca" && a.a) return { texto: `Golpear a ${ctx.apodoDe(a.a)} con la tranca`, detalle: "pierde 3 acciones en su próximo turno" };
      if (a.cual === "tranca") return { texto: `Trancar la puerta ${al(v.mapa[a.hacia].nombre)}`, detalle: "hoy y mañana" };
      if (a.cual === "manos") return { texto: "Ponerse los guantes de terciopelo", detalle: "gratis · +2 acciones este turno" };
      if (a.cual === "vaso") return { texto: "Brindar con la copa de estaño", detalle: "todos pierden 1 acción · tú ganas 1 por cada uno" };
      if (a.cual === "empujon") return { texto: `Empujar a ${ctx.apodoDe(a.a)}`, detalle: `hacia ${v.mapa[a.hacia]?.nombre ?? a.hacia}` };
      return { texto: a.cual, detalle: null };
    case "destrancar":
      return { texto: `Abrir el cerrojo ${al(v.mapa[a.hacia].nombre)}`, detalle: "con la ganzúa · permanente" };
    case "salir":
      return { texto: "Intentar salir de la casa", detalle: "hay que decir todos los nombres" };
    default:
      return { texto: a.tipo, detalle: null };
  }
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

function fila(a, v, ctx, tras) {
  const { texto, detalle } = etiqueta(a, v, ctx);
  /* Pasar no cuesta ficha: se queda sin jugar la jornada, que ya es bastante. */
  const coste =
    a.tipo === "pasar" || a.tipo === "indagar" || a.tipo === "tirar"
      ? "gratis"
      : a.tipo === "hablar"
      ? "1"
      : a.tipo === "coger"
        ? (a.sitio === "bolsa" ? "1" : "gratis")
        : "1";

  return h(
    "button",
    {
      class: "opcion",
      onclick: () => {
        cerrarHoja();
        tras(a);
      },
    },
    h("span", {}, texto, detalle ? h("span", { class: "detalle", text: detalle }) : null),
    h("span", { class: "coste", text: coste })
  );
}

/* Cuántos nombres de la mesa siguen sin sospecha definitiva. Vive en el mismo
   sitio que lee el aviso de salida, para que las dos cosas no se separen. */
function nombresSinDefinitivo(ctx) {
  try {
    const guardadas = JSON.parse(localStorage.getItem(`casa.sospechas.${ctx.semilla}`) || "{}");
    return (ctx.nombres ?? []).filter((n) => !guardadas[n]?.[0]).length;
  } catch {
    return (ctx.nombres ?? []).length;
  }
}

/* El único paso: de qué NOMBRE quieres que te hable quien tienes delante. Se
   pregunta por el nombre, no por el personaje: preguntar por la Hilandera y que
   te contestaran sobre Javi era decirte que Javi es la Hilandera. Cada nombre es
   una acción concreta del motor, nunca se lanza al azar. */
export function elegirSobreQuien(con, cotilleos, ctx) {
  const lista = h("div", { class: "cotilleo-nombres" },
    ...cotilleos.map((a) =>
      h("button", {
        class: "boton secundario",
        text: `Sobre ${a.sobre}`,
        onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
      })
    )
  );
  abrirHoja({
    titulo: `Cotillear con ${ctx.apodoDe(con)}`,
    sub: "¿De quién quieres que te hable?",
    cuerpo: lista,
    sinAsa: true,
  });
}

export function abrirAcciones(v, acciones, ctx) {
  const cuerpo = h("div", {});
  const tras = (a) => ctx.ejecutar(a);
  const con = (tipos) => acciones.filter((a) => tipos.includes(a.tipo));

  /* Lo que se hace con la puerta de al lado va donde uno se mueve: al mirar la
     casa y sus salidas salen la copa, la tranca y el cerrojo. Se quedan también
     en Habilidades, para quien las busque ahí. */
  const dePuerta = acciones.filter((a) => a.tipo === "habilidad" || a.tipo === "destrancar");
  const moverse = con(["mover"]);
  if (moverse.length || dePuerta.length) {
    cuerpo.append(
      h("div", { class: "grupo" }, h("div", { class: "k", text: "Moverse" }),
        ...moverse.map((a) => fila(a, v, ctx, tras)),
        ...dePuerta.map((a) => fila(a, v, ctx, tras))
      )
    );
  }

  const mirar = con(["registrar"]);
  if (mirar.length) {
    const esTotal = mirar.some(a => !a.ver);

    if (esTotal) {
      const btnRegistrar = h("button", { class: "boton", text: "Registrar sala" });
      btnRegistrar.addEventListener("click", () => {
        const accion = mirar.find(a => !a.ver) ?? { tipo: "registrar" };
        const evs = ctx.ejecutar(accion);
        if (evs && evs.length) {
          mostrarRegistro(null, evs[0].vistos || [], ctx, null, evs[0].cajas, false, null, !v.mano || !v.bolsa, evs[0].pa ?? null);
        } else {
          pendingReg = true;
          cerrarHoja();
        }
      });
      cuerpo.append(h("div", { class: "grupo" }, h("div", { class: "k", text: "Registrar" }), btnRegistrar));
    } else {
      const nHuecos = v.mapa[v.sala].huecos ?? 4;
      const seleccion = new Set();
      const btnRegistrar = h("button", { class: "boton", text: "Registrar", disabled: true });

      const huecosBtns = Array.from({ length: nHuecos }, (_, i) => {
        const btn = h("button", { class: "hueco-btn", text: String(i + 1) });
        btn.addEventListener("click", () => {
          if (seleccion.has(i)) {
            seleccion.delete(i);
            btn.classList.remove("on");
          } else if (seleccion.size < 2) {
            seleccion.add(i);
            btn.classList.add("on");
          }
          btnRegistrar.disabled = seleccion.size !== 2;
        });
        return btn;
      });

      btnRegistrar.addEventListener("click", () => {
        const par = [...seleccion].sort((a, b) => a - b);
        const accion = mirar.find(a => a.ver && a.ver[0] === par[0] && a.ver[1] === par[1])
          ?? { tipo: "registrar", ver: par };
        const evs = ctx.ejecutar(accion);
        if (evs && evs.length) {
          mostrarRegistro(par, evs[0].vistos || [], ctx, null, evs[0].cajas, false, null, !v.mano || !v.bolsa, evs[0].pa ?? null);
        } else {
          pendingReg = par;
          cerrarHoja();
        }
      });

      cuerpo.append(
        h("div", { class: "grupo" },
          h("div", { class: "k" }, "Registrar ", h("span", { class: "detalle", text: "elige dos huecos" })),
          h("div", { class: "huecos-selector" }, ...huecosBtns),
          btnRegistrar
        )
      );
    }
  }

  const pasar = con(["pasar"]);
  if (pasar.length) {
    cuerpo.append(
      h("div", { class: "grupo" }, h("div", { class: "k", text: "El turno" }), pasar.map((a) => fila(a, v, ctx, tras)))
    );
  }

  const centro = acciones.filter((a) => a.tipo === "coger" && a.de === "centro");
  if (centro.length) {
    cuerpo.append(
      h("div", { class: "grupo" },
        h("div", { class: "k" }, "A la vista ",
          h("span", { class: "detalle", text: "a la mano, gratis · a la bolsa, 1" })
        ),
        centro.map((a) => fila(a, v, ctx, tras))
      )
    );
  }

  const vistos = [];
  if (vistos.length) {
    cuerpo.append(
      h("div", { class: "grupo" },
        h("div", { class: "k" }, "Lo que acabas de registrar ",
          h("span", { class: "detalle", text: "a la mano, gratis · a la bolsa, 1" })
        ),
        vistos.map((a) => fila(a, v, ctx, tras))
      )
    );
  }

  const tuyos = [
    ...con(["usar", "esconder", "guardar", "cambiar", "tirar"]),
    ...acciones.filter(a => a.tipo === "habilidad" && a.cual === "vaso"),
  ];
  if (tuyos.length) {
    cuerpo.append(
      h("div", { class: "grupo" }, h("div", { class: "k", text: "Lo que llevas" }), tuyos.map((a) => fila(a, v, ctx, tras)))
    );
  }

  const golpes = acciones.filter((a) => a.tipo === "habilidad" && a.cual === "tranca" && a.a);
  const gente = con(["hablar", "robar", "reclamar", "interrogar"]);
  if (gente.length || golpes.length) {
    const filas = gente.map((a) => fila(a, v, ctx, tras));
    if (golpes.length) {
      filas.push(h("button", {
        class: "opcion",
        onclick: () => elegirAQuienGolpear(golpes, ctx),
      },
        h("span", {}, "Golpear con la tranca",
          h("span", { class: "detalle", text: "gasta la tranca · la víctima pierde 3 acciones" })
        ),
        h("span", { class: "coste", text: "1" })
      ));
    }
    cuerpo.append(
      h("div", { class: "grupo" }, h("div", { class: "k", text: "Con la gente" }), ...filas)
    );
  }

  /* Cotillear: una fila por cada personaje que tienes en la sala, ni una más.
     Al pulsar la de uno se abre directamente el «¿sobre quién?», así que solo
     hay un modal y no una lista de treinta pares ni dos hojas seguidas. */
  const cotillear = con(["cotillear"]);
  if (cotillear.length) {
    const quienes = [];
    const vistos = new Set();
    for (const a of cotillear) {
      if (vistos.has(a.con)) continue;
      vistos.add(a.con);
      quienes.push(a.con);
    }
    cuerpo.append(
      h("div", { class: "grupo" },
        h("div", { class: "k" }, "Cotillear ",
          h("span", { class: "detalle", text: "1 vez al día · 1 acción" })
        ),
        ...quienes.map((conId) => h("button", {
          class: "opcion",
          onclick: () => elegirSobreQuien(conId, cotillear.filter((a) => a.con === conId), ctx),
        },
          h("span", {}, `Cotillear con ${ctx.apodoDe(conId)}`,
            h("span", { class: "detalle", text: "eliges de qué nombre te habla" })
          ),
          h("span", { class: "coste", text: "1" })
        ))
      )
    );
  }

  const antorchas = acciones.filter(a => a.tipo === "habilidad" && a.cual === "antorcha");
  const empujones = acciones.filter(a => a.tipo === "habilidad" && a.cual === "empujon");
  const cuerdas  = acciones.filter(a => a.tipo === "habilidad" && a.cual === "cuerda");
  const hab = con(["habilidad", "destrancar"]).filter(a => a.cual !== "antorcha" && a.cual !== "empujon" && a.cual !== "cuerda");
  const hayHab = hab.length || antorchas.length || empujones.length || cuerdas.length;
  if (hayHab) {
    const filas = hab.map((a) => fila(a, v, ctx, tras));
    if (antorchas.length) {
      filas.push(h("button", {
        class: "opcion",
        onclick: () => elegirPasadizo(antorchas, v, ctx),
      },
        h("span", {}, "Usar el pasadizo",
          h("span", { class: "detalle", text: "te teletransporta a cualquier sala abierta" })
        ),
        h("span", { class: "coste", text: "1" })
      ));
    }
    if (empujones.length) {
      filas.push(h("button", {
        class: "opcion",
        onclick: () => elegirEmpujon(empujones, v, ctx),
      },
        h("span", {}, "Usar el empujón de guardián",
          h("span", { class: "detalle", text: "envía a alguien a una sala contigua" })
        ),
        h("span", { class: "coste", text: "1" })
      ));
    }
    if (cuerdas.length) {
      filas.push(h("button", {
        class: "opcion",
        onclick: () => elegirCuerda(cuerdas, ctx),
      },
        h("span", {}, "Usar la cuerda de atar",
          h("span", { class: "detalle", text: "ata a alguien: no puede moverse esta jornada" })
        ),
        h("span", { class: "coste", text: "1" })
      ));
    }
    cuerpo.append(
      h("div", { class: "grupo" }, h("div", { class: "k", text: "Habilidades" }), ...filas)
    );
  }

  /* Para salir hay que llevar los nombres de la mesa marcados en Sospechas: con
     uno sin definir, el servidor rechaza la salida y la fila solo servía para
     gastar un toque y un susto. Se esconde hasta que estén todos.
     La puerta solo existe en la sala que la tiene: en el resto no se muestra. */
  const tienePuerta = !!v.mapa[v.sala]?.puerta;
  const sinDefinitivo = tienePuerta ? nombresSinDefinitivo(ctx) : 0;
  const puerta = tienePuerta ? con(["salir"]).filter(() => sinDefinitivo === 0) : [];
  if (puerta.length) {
    cuerpo.append(
      h(
        "div",
        { class: "grupo" },
        h("div", { class: "k", text: "La puerta" }),
        h("button", {
          class: "opcion",
          onclick: () => {
            cerrarHoja();
            setTimeout(() => avisarAntesDeSalir(v, ctx), 180);
          },
        }, h("span", {}, "Intentar salir", h("span", { class: "detalle", text: "hay que decir todos los nombres" })), h("span", { class: "coste", text: "1" }))
      )
    );
  }

  /* Falta algún definitivo: se dice por qué no está la puerta, en vez de
     dejar que desaparezca sin explicación. Solo en la sala con puerta. */
  if (tienePuerta && !puerta.length && sinDefinitivo > 0 && !v.yo?.bloqueadoSalir) {
    cuerpo.append(
      h("div", { class: "grupo" },
        h("div", { class: "k", text: "La puerta" }),
        h("div", { class: "opcion", style: "opacity:.6;cursor:default" },
          h("span", {}, "Salir no está disponible",
            h("span", { class: "detalle", text: `faltan ${sinDefinitivo} nombre${sinDefinitivo > 1 ? "s" : ""} por definir en Sospechas` })),
          h("span", { class: "coste", text: "—" })
        )
      )
    );
  }

  /* Falló la salida hoy: la puerta sigue cerrada y la hoja lo dice. Antes el
     botón simplemente desaparecía y parecía que la acción no existía. */
  if (tienePuerta && !puerta.length && v.yo?.bloqueadoSalir) {
    cuerpo.append(
      h("div", { class: "grupo" },
        h("div", { class: "k", text: "La puerta" }),
        h("div", { class: "opcion", style: "opacity:.6;border-color:var(--rojo);cursor:default" },
          h("span", {}, "Salir bloqueado",
            h("span", { class: "detalle", style: "color:var(--rojo)", text: "has fallado la salida: hasta el amanecer no puedes volver a intentarlo" })),
          h("span", { class: "coste", text: "—" })
        )
      )
    );
  }

  if (!cuerpo.childElementCount) {
    cuerpo.append(h("p", { class: "vacio", text: "No te queda nada que hacer hoy. Pasa la jornada." }));
  }

  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo" },
      "Jornada ", h("b", { text: String(v.dia) }),
      ` · ${v.pa} ${v.pa === 1 ? "acción" : "acciones"}`
    ),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );

  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, cuerpo), sinAsa: true });
}

/* Dos pasos: se paga por mirar y solo entonces aparecen los nombres. */
let pendingReg = null;

/* El registro que tienes delante. Se guarda para poder repintarlo sin volver
   a pagar: la mirada deja coger dos objetos y cerrar la hoja en el primero
   obligaba a registrar de nuevo para el segundo, que estaba a la vista. */
let registroAbierto = null; // { par, vistos, nombres, cajas }

function registroEnPantalla() {
  return !!document.querySelector("#hoja .registro");
}

/* `libre`: ¿te queda algún sitio donde meterlo? Si lo hay y no se ofrece
   cogerlo, es que ya no está: alguien se lo llevó mientras dormías. Decía
   «no te cabe» y no tenía nada que ver. */
function mostrarRegistro(par, vistos, ctx, nombres, cajas, cerrado = false, infos = null, libre = null, paSnap = null) {
  registroAbierto = { par, vistos, nombres, cajas };
  const opciones = ctx.acciones.filter(
    (a) => a.tipo === "coger" && a.de === "hueco" && vistos.includes(a.obj)
      && (paSnap === null || paSnap > 0 || a.sitio !== "bolsa")
  );
  const nombreDe = (id) => nombres?.[id] ?? infos?.[id]?.nombre ?? ctx.nombreObjeto(id);
  /* Una tarjeta por hueco: el motor dice qué hay en cada uno —aunque esté
     vacío—, así que no se corre la lista ni se pierde el hueco de en medio. */
  const cajasHueco = cajas?.length ? cajas : par.map((hueco, i) => ({ hueco, obj: vistos[i] ?? null }));

  /* Por qué no se puede coger lo que se ve. Decir «se lo ha llevado alguien»
     cuando en realidad te has quedado sin fichas es mentir al jugador: el
     registro gastaba la última acción y el objeto seguía en su hueco. */
  const razonSinCoger = (() => {
    if (cerrado) return "el registro se cerró";
    if (libre === false) return "no te cabe";
    if ((ctx.pa ?? 1) <= 0) return "te has quedado sin acciones justo ahora";
    /* Sin ningún coger de hueco en el menú, el registro se cerró (amaneció o
       cambió la jornada): el objeto puede seguir ahí y no se ha llevado nadie
       nada. Solo si hay otros huecos que coger y este no está, se lo llevaron. */
    if (!ctx.acciones.some((a) => a.tipo === "coger" && a.de === "hueco"))
      return "el registro se cerró: vuelve a registrar si sigue interesándote";
    return "ya no está: se lo ha llevado alguien";
  })();

  const tarjetas = cajasHueco.map(({ hueco, obj: objOrig }) => {
    const sitios = objOrig ? opciones.filter((a) => a.obj === objOrig) : [];
    /* Si el objeto se fue (alguien lo cogió antes que tú), el hueco se muestra
       vacío: ver el nombre con "se lo llevaron" es más confuso que útil. */
    /* Lo que te has llevado en este mismo registro sigue en su hueco del
       dibujo, pero ya no se ofrece cogerlo: se dice dónde lo llevas en vez de
       culpar a nadie de su desaparición. */
    const vista = ctx.v?.();
    const llevo = objOrig
      ? (vista?.mano?.id === objOrig ? "mano" : vista?.bolsa?.id === objOrig ? "bolsa" : null)
      : null;
    const obj = objOrig && sitios.length === 0 && !llevo && razonSinCoger === "ya no está: se lo ha llevado alguien" ? null : objOrig;
    const info = obj ? (sitios[0]?.info ?? infos?.[obj] ?? null) : null;
    const nombre = obj ? info?.nombre ?? nombreDe(obj) : null;

    const marco = h("div", { class: "registro-hueco-img" + (obj ? "" : " vacio") });
    if (obj) {
      const im = document.createElement("img");
      im.src = objetoDe(nombre);
      im.alt = nombre;
      im.onerror = () => { im.style.display = "none"; };
      marco.append(im);
      /* Ya te lo dijo: cogerlo solo sirve para moverlo o esconderlo. Mejor
         saberlo antes de gastar una acción en llevártelo. */
      if (ctx.v?.()?.bien?.[obj]) marco.append(h("div", { class: "marca-usado", text: "ya usado" }));
      if (info?.dueño && info.dueño === ctx.v?.()?.yo?.id) marco.append(h("div", { class: "objeto-card-tag-tuyo", text: "tuyo" }));
    }

    const usos = info?.sugiere?.length
      ? h("div", { class: "registro-usos" },
          h("div", { class: "registro-lbl", text: "posibles usos" }),
          h("div", { class: "registro-tags" },
            ...info.sugiere.map((id) =>
              h("span", { class: "inv-sala-tag", text: mayus(tema.salas[id]?.nombre ?? id) })
            )
          )
        )
      : null;

    return h("div", { class: "registro-hueco" + (obj ? "" : " vacio") },
      h("div", { class: "registro-hueco-tit", text: `Hueco ${hueco + 1}` }),
      marco,
      h("div", { class: "registro-hueco-nombre", text: obj ? nombre : "vacío" }),
      usos,
      sitios.length
        ? h("div", { class: "registro-botones" }, ...sitios.map((a) => {
            const v = ctx.v?.();
            const slotObj = v?.[a.sitio];
            const esMio = !!slotObj && slotObj.dueño === v?.yo?.id;
            /* La mano es gratis y la bolsa cuesta una ficha: el botón lo dice
               antes de pulsarlo, no después. */
            const txt =
              (a.sitio === "bolsa" ? "A la bolsa · 1 PA" : "A la mano · gratis") + (esMio ? " · mío" : "");
            return h("button", {
              class: "mini" + (esMio ? " registro-btn-mio" : ""),
              text: txt,
              onclick: () => {
                /* El botón se pintó con el menú del momento; si la casa ha
                   cambiado (otra acción, otro amanecer), se busca el mismo
                   coger ahora y, si ya no está, se dice por qué en vez de
                   mandar una acción que el servidor va a rechazar en
                   silencio. */
                const vivo = ctx.acciones.find(
                  (x) => x.tipo === "coger" && x.obj === obj && x.sitio === a.sitio
                );
                if (!vivo) {
                  aviso("Eso ya no se puede: la casa ha cambiado. Mira a ver dónde está ese objeto ahora.");
                  return;
                }
                /* La hoja se queda abierta: el registro deja una segunda
                   cogida y, si te la llevas a la bolsa, se paga aquí mismo. En
                   local la casa ya está al día; en online la vuelve a pintar
                   `refrescarRegistro` cuando llega la vista. */
                const sucesos = ctx.ejecutar(vivo);
                if (sucesos && sucesos.length) refrescarRegistro(ctx.v?.(), ctx);
              },
            });
          }))
        : obj
          ? h("div", { class: "registro-sin" + (llevo ? " registro-llevas" : ""), text: llevo ? `en tu ${llevo}` : razonSinCoger })
          : null
    );
  });

  const cuerpo = h("div", { class: "registro" },
    cerrado
      ? h("p", { class: "registro-aviso", text: "Aquí está lo que viste: la jornada cambió antes de que pudieras llevarte nada, así que el registro se ha cerrado. Vuelve a registrar si te interesa lo que hay." })
      : null,
    h("div", { class: "registro-huecos" }, ...tarjetas),
    /* La regla que deja fuera a una de las salas que sugiere el objeto: la casa
       no reparte ninguno en la estancia donde sirve. Solo falla si otro lo
       trajo hasta aquí a propósito, que también es un dato. */
    h("p", { class: "registro-nota", text: "Ningún objeto empieza en la estancia donde sirve: si lo encuentras donde nadie lo ha traído, esta sala no cuenta entre sus usos." })
  );

  const cabReg = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: par ? `Huecos ${par[0] + 1} y ${par[1] + 1}` : "Toda la sala" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: () => { registroAbierto = null; cerrarHoja(); } })
  );
  /* Cuando ya no queda nada que coger —sala vacía, o te llevaste lo que había—
     el pie deja de ofrecer «no llevarte nada» y pasa a cerrar. */
  const pieReg = h("button", {
    class: "boton secundario",
    text: opciones.length ? "No llevarte nada" : "Cerrar registro",
    onclick: () => { registroAbierto = null; cerrarHoja(); },
  });
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cabReg, cuerpo, pieReg), sinAsa: true });
}

/* La casa ha cambiado con el registro abierto —te has llevado algo, o alguien
   de la mesa—: se vuelve a pintar la misma hoja con lo que queda. La hoja NO
   se cierra sola: un registro vacío se quedaba en blanco y desaparecía sin
   que hubiera pasado nada, y cerrar al segundo objeto dejaba al jugador sin
   ver dónde lo llevaba. Se cierra cuando se pulsa «Cerrar registro». */
export function refrescarRegistro(v, ctx) {
  if (!registroAbierto || !registroEnPantalla()) return;
  const { par, vistos, nombres, cajas } = registroAbierto;
  const libre = v ? !v.mano || !v.bolsa : null;
  mostrarRegistro(par, vistos, ctx, nombres, cajas, false, null, libre);
}

export function mirarDos(par, ctx) {
  cerrarHoja();
  const evs = ctx.ejecutar({ tipo: "registrar", ver: par });
  if (!evs || !evs.length) {
    pendingReg = par;
    return;
  }
  mostrarRegistro(par, evs[0].vistos || [], ctx, null, evs[0].cajas);
}

/* En modo online: llamar tras onVista para mostrar el resultado del registro.
   Se usan los sucesos que el servidor manda al que actuó, porque la mirada de
   la vista desaparece al amanecer: si el registro era la última acción del día,
   mirar solo la vista dejaba el clic sin ninguna respuesta. */
export function checkPendingRegistro(v, ctx, sucesos = []) {
  if (!pendingReg) return;
  const par = pendingReg === true ? null : pendingReg;
  pendingReg = null;

  const ev = (sucesos || []).find((s) => s.tipo === "registrar");
  const mirada = v?.mirada;
  const viva = par === null
    ? !!(mirada && mirada.abiertos)
    : !!(mirada && mirada.abiertos?.[0] === par[0] && mirada.abiertos?.[1] === par[1]);

  const libre = v ? !v.mano || !v.bolsa : null;

  if (viva) {
    mostrarRegistro(par, mirada.vistos, ctx, mirada.nombres, mirada.cajas, false, null, libre, v?.pa ?? null);
    return;
  }
  if (ev) {
    mostrarRegistro(par, ev.vistos || [], ctx, ev.nombres ?? null, ev.cajas, true, ev.info ?? null, libre, ev.pa ?? null);
    return;
  }
  if (mirada) mostrarRegistro(par, mirada.vistos, ctx, mirada.nombres, mirada.cajas, false, null, libre);
  else aviso("La casa no ha devuelto el registro: la vista se ha puesto al día. Míralo otra vez.");
}

/* Si el servidor rechaza la acción, el registro pendiente no debe quedarse
   esperando: si no, el siguiente cambio de vista abriría un modal viejo. */
export function cancelarRegistro() {
  pendingReg = null;
  registroAbierto = null;
}

export function avisarAntesDeSalir(v, ctx) {
  const guardadas = (() => {
    try { return JSON.parse(localStorage.getItem(`casa.sospechas.${ctx.semilla}`) || "{}"); } catch { return {}; }
  })();
  const nombres = ctx.nombres ?? [];
  const filas = nombres.map(nombre => {
    const definitivo = guardadas[nombre]?.[0] || "";
    return h("div", { class: "salir-fila" },
      h("span", { class: "salir-nombre", text: nombre }),
      definitivo
        ? h("span", { class: "persona-nombre-tag salir-tag", text: definitivo })
        : h("span", { class: "salir-vacio", text: "sin definir" })
    );
  });
  const sinDefinir = nombres.filter(n => !guardadas[n]?.[0]).length;
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "¿Seguro que sales?" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const cuerpo = h("div", { class: "persona-modal" },
    h("p", { style: "color:var(--tenue);font-size:13px;margin:0 0 10px", text: "Comprueba tu cuaderno. Tus sospechas definitivas:" }),
    h("div", { class: "salir-lista" }, ...filas),
    sinDefinir > 0
      ? h("p", { style: "color:var(--rojo);font-size:12px;margin:10px 0 0", text: `${sinDefinir} nombre${sinDefinir > 1 ? "s" : ""} sin definitivo: márcalo${sinDefinir > 1 ? "s" : ""} en Sospechas antes de salir.` })
      : h("p", { style: "color:var(--verde);font-size:12px;margin:10px 0 0", text: "Todos los definitivos están marcados." }),
    h("button", { class: "boton", style: "margin-top:14px", text: "Salir de la casa", onclick: () => {
      const otros = v.todos.filter(q => !q.fuera);
      /* guardadas[nombreSecreto][0] = apodo → para cada apodo, encontrar su nombreSecreto */
      const nombreDeApodo = (apodo) => (ctx.nombres ?? []).find(n => guardadas[n]?.[0] === apodo) || "";
      const asignados = otros.map(q => ({ apodo: q.apodo, nombre: nombreDeApodo(q.apodo) }));
      if (asignados.some(d => !d.nombre)) {
        aviso("Faltan nombres definitivos: márcalos en el cuaderno antes de salir.");
        return;
      }
      asignados.push({ apodo: v.yo.apodo, nombre: v.yo.nombre });
      cerrarHoja();
      ctx.ejecutar({ tipo: "salir", dichos: asignados });
    } })
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, cuerpo), sinAsa: true });
}

function elegirAQuienGolpear(golpes, ctx) {
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Golpear con la tranca" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const lista = h("div", { class: "persona-modal" },
    ...golpes.map((a) => h("button", {
      class: "opcion",
      onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
    },
      h("span", {}, ctx.apodoDe(a.a)),
      h("span", { class: "coste", text: "1" })
    ))
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, lista), sinAsa: true });
}

export function elegirCuerda(cuerdas, ctx) {
  if (cuerdas.length === 1) { ctx.ejecutar(cuerdas[0]); return; }
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Atar · ¿a quién?" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const lista = h("div", { class: "persona-modal" },
    ...cuerdas.map((a) => h("button", {
      class: "opcion",
      onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
    },
      h("span", {}, ctx.apodoDe(a.a)),
      h("span", { class: "coste", text: "1" })
    ))
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, lista), sinAsa: true });
}

export function elegirPasadizo(antorchas, v, ctx) {
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Usar el pasadizo" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const lista = h("div", { class: "persona-modal" },
    ...antorchas.map((a) => h("button", {
      class: "opcion",
      onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
    },
      h("span", {}, v.mapa[a.hacia]?.nombre ?? a.hacia),
      h("span", { class: "coste", text: "1" })
    ))
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, lista), sinAsa: true });
}

export function elegirEmpujon(empujones, v, ctx) {
  /* Paso 1: elige a quién empujar (si hay varias víctimas) */
  const victimas = [...new Map(empujones.map(a => [a.a, a])).values()];
  if (victimas.length === 1) {
    _elegirDestinoEmpujon(empujones, v, ctx);
    return;
  }
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Empujar · ¿a quién?" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  const lista = h("div", { class: "persona-modal" },
    ...victimas.map((a) => h("button", {
      class: "opcion",
      onclick: () => _elegirDestinoEmpujon(empujones.filter(e => e.a === a.a), v, ctx),
    },
      h("span", {}, ctx.apodoDe(a.a)),
      h("span", { class: "coste", text: "1" })
    ))
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, lista), sinAsa: true });
}

function _elegirDestinoEmpujon(opciones, v, ctx) {
  /* Paso 2: elige a qué sala destino */
  if (opciones.length === 1) { cerrarHoja(); ctx.ejecutar(opciones[0]); return; }
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
