/* Piezas de la partida que viven en `app.js` de corvus y no son una vista: el
   panel de «Lo que llevas», las reglas, y traducir ids a nombres. Se copian tal
   cual, cambiando `api` por el `ctx` de la plataforma. */

import { h, abrirHoja, cerrarHoja } from "./ui.js";
import { objetoDe } from "./imagenes.js";
import { elegirPasadizo, elegirCuerda, elegirEmpujon } from "./acciones.js";

/* ── ids → nombres ── */

export function apodoDe(v, id) {
  if (!v) return "alguien";
  if (v.yo?.id === id) return v.yo.apodo ?? "alguien";
  return v.todos?.find((p) => p.id === id)?.apodo
    ?? v.gente?.find((q) => q.id === id)?.apodo
    ?? "alguien";
}

/* Los objetos solo traen su nombre cuando están a la vista (mano, bolsa,
   centro, mirada, lo tuyo). Se aprende de ahí, como hacía `nombresObj` en el
   original con los sucesos. Si no consta, «algo». */
export function nombreObjeto(v, id) {
  if (!v) return "algo";
  if (v.mano?.id === id) return v.mano.nombre;
  if (v.bolsa?.id === id) return v.bolsa.nombre;
  const enCentro = v.centro?.find((o) => o.id === id);
  if (enCentro) return enCentro.nombre;
  const mio = v.mios?.find((o) => o.id === id);
  if (mio) return mio.nombre;
  const usado = v.bienUsados?.find((o) => o.id === id);
  if (usado) return usado.nombre;
  const enMirada = v.mirada?.nombres?.[id];
  if (enMirada) return enMirada;
  const deGente = v.gente?.map((q) => q.mano).find((o) => o?.id === id);
  if (deGente) return deGente.nombre;
  return "algo";
}

/* ── «Lo que llevas» ── */

export function verLoQueLlevas(v, ctx) {
  function bloqueObjeto(o, etiq) {
    /* Lo que ya te ha hablado se marca como en el pergamino: la misma tapa
       oscura, para que se vea antes de buscarle un uso que ya no tiene. */
    const gastado = o ? !!v.bien?.[o.id] : false;
    const imgWrap = h("div", { class: "inv-objeto-img" });
    if (o) {
      const im = document.createElement("img");
      im.src = objetoDe(o.nombre);
      im.alt = o.nombre;
      im.onerror = () => { im.style.display = "none"; };
      imgWrap.append(im);
      if (gastado) imgWrap.append(h("div", { class: "marca-usado", text: "ya usado" }));
      /* El acarreo, encima de la imagen: en una línea de 10 px bajo el nombre
         no se veía. */
      if (o.acarreo > 0)
        imgWrap.append(h("div", {
          class: "marca-acarreo",
          text: `acarreo · ${o.acarreo}`,
          title: `Cada amanecer gasta una; al llegar a cero se te cae donde estés.`,
        }));
    }
    const salas = o?.sugiere?.map((id) => {
      const nombre = v.mapa[id]?.nombre ?? id;
      const intentado = (v.intentos || []).some((i) => i.obj === o.id && i.sala === id);
      return h("span", { class: "inv-sala-tag" + (intentado ? " intentado" : ""), text: nombre.charAt(0).toUpperCase() + nombre.slice(1) });
    }) ?? [];
    /* Usarlo desde aquí: la casilla ya sabe qué llevas y dónde estás, así que
       no hay que ir a la lista de acciones para probarlo en la estancia. Si ya
       dio lo que tenía, usar no vuelve a decir nada: solo queda esconderlo. */
    const probadoAqui = o
      ? v.bien?.[o.id] === v.sala || (v.intentos || []).some((i) => i.obj === o.id && i.sala === v.sala)
      : false;
    const usar = o && !gastado && !probadoAqui
      ? ctx.acciones.find((a) => a.tipo === "usar" && a.obj === o.id)
      : null;
    const esconder = o ? ctx.acciones.find((a) => a.tipo === "esconder" && a.obj === o.id) : null;
    /* Soltarlo del todo: ni se queda en la sala ni hay que acarrear con él. */
    const soltar = o ? ctx.acciones.find((a) => a.tipo === "soltar" && a.obj === o.id) : null;
    /* Las habilidades no se esconden ni se sueltan: se tiran, y gratis. */
    const tirar = o ? ctx.acciones.find((a) => a.tipo === "tirar" && a.obj === o.id) : null;
    const activarManos = o?.clase === "manos" ? ctx.acciones.find((a) => a.tipo === "habilidad" && a.cual === "manos") : null;
    const activarCapa  = o?.clase === "capa"  ? ctx.acciones.find((a) => a.tipo === "habilidad" && a.cual === "capa")  : null;
    const activarHumo  = o?.clase === "humo"  ? ctx.acciones.find((a) => a.tipo === "habilidad" && a.cual === "humo")  : null;
    const activarCepo  = o?.clase === "cepo"  ? ctx.acciones.find((a) => a.tipo === "habilidad" && a.cual === "cepo")  : null;
    const antorchas = o?.clase === "antorcha" ? ctx.acciones.filter((a) => a.tipo === "habilidad" && a.cual === "antorcha") : [];
    const interrogaciones = o?.clase === "lupa" ? ctx.acciones.filter((a) => a.tipo === "interrogar") : [];
    const golpes = o?.clase === "tranca" ? ctx.acciones.filter((a) => a.tipo === "habilidad" && a.cual === "tranca" && a.a) : [];
    const cuerdaOps = o?.clase === "cuerda" ? ctx.acciones.filter((a) => a.tipo === "habilidad" && a.cual === "cuerda") : [];
    const empujonOps = o?.clase === "empujon" ? ctx.acciones.filter((a) => a.tipo === "habilidad" && a.cual === "empujon") : [];
    /* El objeto propio se marca como el personaje propio: el mismo lenguaje. */
    const tuyo = !!o && o.dueño === v.yo.id;
    return h("div", { class: "inv-bloque" + (tuyo ? " tuyo" : "") },
      h("div", { class: "inv-etiq-fila" },
        h("div", { class: "inv-etiq", text: etiq }),
        tuyo ? h("div", { class: "inv-etiq inv-etiq-tuyo", text: "tuyo" }) : null
      ),
      imgWrap,
      o ? h("div", { class: "inv-nombre", text: o.nombre }) : h("div", { class: "inv-vacio", text: "vacío" }),
      tuyo ? h("p", { class: "inv-propio", text: "Es tuyo: a ti no te dice nada. Sirve para que lo lean los demás." }) : null,
      salas.length ? h("div", { class: "inv-salas-bloque" },
        h("div", { class: "inv-salas-lbl", text: "posibles usos" }),
        h("div", { class: "inv-salas" }, ...salas)
      ) : null,
      usar || esconder || soltar || tirar || activarManos || activarCapa || activarHumo || activarCepo || antorchas.length || interrogaciones.length || golpes.length || cuerdaOps.length || empujonOps.length ? h("div", { class: "inv-acciones" },
        usar ? h("button", {
          class: "mini inv-usar",
          text: "Usar aquí · 1",
          onclick: () => { cerrarHoja(); ctx.ejecutar(usar); },
        }) : null,
        esconder ? h("button", {
          class: "mini inv-esconder",
          text: "Esconder aquí · 1",
          onclick: () => { cerrarHoja(); ctx.ejecutar(esconder); },
        }) : null,
        soltar ? h("button", {
          class: "mini inv-soltar",
          text: "Soltar · 1",
          title: "Te lo quitas de encima: la casa lo vuelve a esconder en otra estancia",
          onclick: () => { cerrarHoja(); ctx.ejecutar(soltar); },
        }) : null,
        tirar ? h("button", {
          class: "mini inv-soltar inv-tirar",
          text: "Tirar · gratis",
          title: "La habilidad desaparece y la casa la repone al amanecer",
          onclick: () => { cerrarHoja(); ctx.ejecutar(tirar); },
        }) : null,
        activarManos ? h("button", {
          class: "mini inv-usar",
          text: "Ponerse · gratis · +2 acciones",
          onclick: () => { cerrarHoja(); ctx.ejecutar(activarManos); },
        }) : null,
        activarCapa ? h("button", {
          class: "mini inv-usar",
          text: "Ponerse la capa · 1",
          onclick: () => { cerrarHoja(); ctx.ejecutar(activarCapa); },
        }) : null,
        activarHumo ? h("button", {
          class: "mini inv-usar",
          text: "Usar frasco de humo · 1",
          onclick: () => { cerrarHoja(); ctx.ejecutar(activarHumo); },
        }) : null,
        activarCepo ? h("button", {
          class: "mini inv-usar",
          text: "Poner cepo · 1",
          onclick: () => { cerrarHoja(); ctx.ejecutar(activarCepo); },
        }) : null,
        antorchas.length ? h("button", {
          class: "mini inv-usar",
          text: "Usar pasadizo · 1",
          onclick: () => { cerrarHoja(); elegirPasadizo(antorchas, v, ctx); },
        }) : null,
        ...interrogaciones.map((a) => h("button", {
          class: "mini inv-usar",
          text: `Interrogar a ${ctx.apodoDe(a.a)} · 1`,
          onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
        })),
        ...golpes.map((a) => h("button", {
          class: "mini inv-usar",
          text: `Golpear a ${ctx.apodoDe(a.a)} · 1`,
          onclick: () => { cerrarHoja(); ctx.ejecutar(a); },
        })),
        cuerdaOps.length ? h("button", {
          class: "mini inv-usar",
          text: "Atar · 1",
          onclick: () => { cerrarHoja(); elegirCuerda(cuerdaOps, ctx); },
        }) : null,
        empujonOps.length ? h("button", {
          class: "mini inv-usar",
          text: "Empujar · 1",
          onclick: () => elegirEmpujon(empujonOps, v, ctx),
        }) : null,
      ) : null
    );
  }

  /* Las dos flechas, entre la mano y la bolsa: una sola acción las da la
     vuelta. Se pone aquí porque es donde se está mirando qué llevas, y el
     cambio se ve: quien esté en la sala ve lo que guardas y lo que sacas. */
  const cambiar = ctx.acciones.find((a) => a.tipo === "cambiar");
  const flechas = cambiar
    ? h("button", {
        class: "inv-cambiar",
        title: cambiar.detalle
          ? `Cambiar la mano por la bolsa · 1 · ${cambiar.detalle}`
          : "Cambiar la mano por la bolsa · 1",
        onclick: () => {
          cerrarHoja();
          ctx.ejecutar(cambiar);
        },
      },
        h("span", { class: "inv-cambiar-icono", text: "⇄" }),
        h("span", { class: "inv-cambiar-coste", text: "1" })
      )
    : null;

  const cuerpo = h("div", { class: "inv-cuerpo" },
    bloqueObjeto(v.bolsa, "bolsa · tapado"),
    bloqueObjeto(v.mano,  "mano · a la vista"),
    /* Las flechas, debajo de las dos casillas: metidas en medio robaban ancho
       y dejaban el modal en miniatura. */
    flechas ? h("div", { class: "inv-cambio" },
      flechas,
      h("span", { class: "inv-cambio-lbl", text: "cambiar la mano por la bolsa" })
    ) : null,
    cambiar
      ? h("p", { class: "inv-nota inv-nota-cambio", text: "Las flechas cambian la mano por la bolsa: cuesta una acción y se ve — quien esté en la sala ve qué guardas y qué sacas a la mano." })
      : null,
    /* La regla sirve para descartar una de las salas de la lista. */
    h("p", { class: "inv-nota", text: "Ningún objeto empieza en la estancia donde sirve: si lo encuentras donde nadie lo ha traído, esa sala no cuenta entre sus usos." })
  );

  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "Lo que llevas" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, cuerpo), sinAsa: true });
}

/* ── «¿Cómo se juega?» ── */

export function verReglasModal() {
  const texto = document.createElement("div");
  texto.className = "reglas-modal";
  texto.innerHTML = `
<p><b>Objetivo:</b> cada personaje que ves es una persona de la mesa con un nombre de verdad. Averigua quién es quién y sal por la puerta del Vestíbulo antes que nadie.</p>
<p><b>Rasgos:</b> cada personaje tiene tres rasgos físicos (gafas, pelo largo, barba…). Con los tres identificados sabes quién es. En el Pergamino → Sospechas los vas marcando: los círculos son lo que ya has confirmado, y los cinco huecos de cada nombre son tus apuestas.</p>
<p><b>Objetos:</b> cada jugador tiene objetos propios. Si te llevas el de otro al sitio donde sirve y lo usas, te dice un rasgo de su dueño —«Celia lleva gafas»—. Uno solo no desvela nada: hay que usarlo. Los objetos de tu propio personaje no aparecen a tu vista ni puedes cogerlos.</p>
<p><b>Registrar una sala:</b> cuesta 1 acción y es la única manera de ver qué hay en los huecos de donde estás. La mirada te deja llevarte <b>hasta dos objetos de los que ves</b>: el primero <b>a la mano, gratis</b>, y el segundo <b>a la bolsa, una acción más</b>. Si coges uno y quieres el otro, la hoja se queda abierta: no hay que pagar otro registro. Los huecos vacíos no cuestan nada, solo mirar cuesta.</p>
<p><b>Lo que llevas:</b> un objeto en la mano y uno en la bolsa. Guardar cuesta 1, cambiar uno por otro cuesta 1, y son gestos que se ven: quien esté en la sala sabe qué escondes. Si no quieres acarrear, <b>soltar</b> cuesta 1 y es distinto de esconder: lo escondido se queda en la sala donde estás y lo soltado se va a otra estancia, así que nadie sabe dónde ha caído. Si no sueltas un objeto, se te cae solo a los dos amaneceres (tuyo) o tres (de otro).</p>
<p><b>Cotilleos:</b> una vez al día, 1 acción, con alguien de tu sala que <b>sepa algo de alguien</b> —si nadie ha usado todavía un objeto, nadie sabe nada y no hay charla—. Preguntas por un <b>nombre</b> —Javi, Elena—: si sabe algo de ese nombre te lo cuenta y, al acertar, suelta además otro cotilleo de una persona distinta; si no sabe, solo te da uno al azar. Tres de cada diez cotilleos son mentira: con dos cotilleos sobre el mismo nombre puedes <b>indagar</b> y confirmar un rasgo de verdad. Dos cotilleos por nombre son el tope: con dos, ese nombre queda cerrado.</p>
<p><b>Reclamar:</b> si detectas que alguien lleva un objeto tuyo, puedes reclamarlo. Como «compensación» recibes gratis un rasgo al azar de alguien que todavía no tengas —una pista que no viene de un cotilleo—.</p>
<p><b>Acciones:</b> 6 PA por jornada, no se acumulan. Moverse 1 · registrar 1 · usar un objeto 1 · esconder 1 · soltar 1 · guardar en la bolsa 1 · cambiar mano por bolsa 1 · robar 1 · reclamar una pista 1 · interrogar con la lupa 1 · cotillear 1 · salir 1. Tirar una habilidad que no quieres es gratis. Cuando todos gastan sus PA, amanece. La casa crece: en la jornada 3 entran más objetos y las habilidades, y en la 5 se abren estancias nuevas.</p>
<p><b>Salir:</b> solo cuenta si aciertas todos los nombres de la mesa, así que la puerta no aparece hasta que tengas un definitivo en cada uno (el tuyo no hace falta). Si la intentas y fallas, se cierra hasta el amanecer: esa jornada ya no puedes volver a probar.</p>
<p><b>Sin prisa y sin bots:</b> si te toca, la mesa te espera lo que haga falta; nadie juega tus acciones por ti. Con la app cerrada te llega un aviso al móvil de que es tu turno y de cuántas acciones te quedan.</p>`;
  const cab = h("div", { class: "persona-modal-cab" },
    h("div", { class: "persona-nombre-tag persona-modal-titulo", text: "¿Cómo se juega?" }),
    h("button", { class: "persona-modal-cerrar", text: "✕", onclick: cerrarHoja })
  );
  abrirHoja({ titulo: null, cuerpo: h("div", {}, cab, texto), sinAsa: true });
}
