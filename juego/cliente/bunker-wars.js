/* Cliente visual de Bunker Wars — Himalayan Fortress */

import { esc, avatarSVG, modal, cerrarModal } from "../../app/ui.js";

/* ── Registro de depuración ──────────────────────────────────────────────
   Todo lo de la mesa sale con el prefijo [bw], para poder seguir una partida
   desde la consola del navegador y compararla con el log del servidor. */
const registro = (...args) => console.log("%c[bw]", "color:#c2705a;font-weight:700", ...args);

/* Un tablero en una línea: E1/2:atacante1@dueno, … */
const resumenCalles = (senderos) => (senderos ?? []).flatMap((sd, i) =>
  (sd?.posiciones ?? []).flatMap((f, p) => f
    ? [`E${i + 1}/${p + 1}:${f.tipo ?? "?"}${f.nivel ?? "?"}${f.dueno ? "@" + String(f.dueno).slice(0, 8) : ""}`]
    : [])
).join(" ") || "vacías";

/* Errores y recursos que no cargan también al registro: sin esto, un 404 se
   quedaba solo en la consola y nadie sabía qué faltaba. */
window.addEventListener("error", (ev) => {
  const t = ev?.target;
  if (t && t !== window && t.tagName) {
    registro("recurso no cargado:", t.tagName, t.src || t.href || "");
    return;
  }
  registro("error:", ev?.message, `${ev?.filename ?? ""}:${ev?.lineno ?? ""}`);
}, true);
window.addEventListener("unhandledrejection", (ev) => {
  registro("promesa rechazada:", ev?.reason?.message ?? ev?.reason);
});

export function pintar(contenedor, opciones) {
  /* La música es de este juego y vive fuera de #pantalla: se monta una vez y
     sobrevive a los repintados del turno. */
  montarMusica();
  const { publica, privada, jugadores, tu, acciones, alAccion, alSalir, scroll, alFinal } = opciones;
  if (!publica) { contenedor.innerHTML = "Cargando…"; return; }
  /* Se guarda la última vista para poder volver desde la fortaleza de un
     rival sin pedirle nada a la app. */
  vistaContenedor = contenedor;
  vistaOpciones = opciones;

  const { luna, fase, turnoActual, jugadores: tableros } = publica;
  const yo = tableros?.[tu] ?? null;
  const rivales = Object.values(tableros ?? {}).filter(j => j.id !== tu);
  const teToca = privada?.teToca ?? false;

  const enviar = typeof alAccion === "function" ? alAccion : null;
  /* Cada jugada queda en el registro: qué se manda y qué contesta la mesa. */
  enviarAccion = enviar
    ? (accion) => {
        registro("→", JSON.stringify(accion));
        return Promise.resolve()
          .then(() => enviar(accion))
          .then((r) => {
            registro("←", JSON.stringify(accion), r?.error
              ? `ERROR: ${r.error}`
              : `ok · fase ${r?.sala?.fase ?? "?"} · luna ${r?.sala?.datos?.estado?.luna ?? "?"}`);
            return r;
          }, (err) => {
            registro("←", JSON.stringify(accion), "EXCEPCIÓN:", err?.message ?? err);
            throw err;
          });
      }
    : null;
  salirMesa = typeof alSalir === "function" ? alSalir : null;

  /* Fondo fijo del Himalaya */
  if (!document.getElementById("bw-cielo-global")) {
    const cielo = document.createElement("div");
    cielo.id = "bw-cielo-global";
    cielo.className = "cielo"; // usa el CSS del demo directamente
    document.body.appendChild(cielo);
  }
  document.body.classList.add("bw-himalaya", "mapa-himalaya");

  accionesMesa = acciones ?? [];
  /* Antes de sustituir el estado, se recuerda qué monstruos había en las
     jaulas: si en esta vista uno aparece en la lanzadera, se le hace volar
     desde su jaula en lugar de aparecer con un fade. */
  const boxAntes = Array.isArray(boxActual) ? boxActual.slice() : [];
  boxActual = privada?.box ?? [];
  lanzaderasMesa = privada?.lanzaderas ?? [];
  const lanzaderaMovidas = (lanzaderasMesa ?? []).flatMap((m, i) => {
    if (!m?.id) return [];
    const boxIdx = boxAntes.findIndex((x) => x?.id === m.id);
    if (boxIdx >= 0 && boxIdx < 4) return [{ id: m.id, nivel: m.nivel, vuela: m.vuela, boxIdx, lanzadera: i }];
    const prevPos = fichasPrevias.get(m.id);
    return prevPos ? [{ id: m.id, nivel: m.nivel, vuela: m.vuela, lanzadera: i, desdePath: prevPos }] : [];
  });
  /* Los que ya estaban en el camino y este repintado salen hacia la lanzadera:
     hacen el último tramo como una ficha más, en su turno, y solo después se
     apagan para aparecer en la lanzadera (ver prepararSalidasLanzadera). Si
     las dos lanzaderas están llenas el motor los deja en la cola: el viaje es
     el mismo, solo cambia el sitio donde aparecen. */
  const colaMovidas = (privada?.colaLanzaderas ?? []).flatMap((m, i) => {
    if (!m?.id) return [];
    const prevPos = fichasPrevias.get(m.id);
    return prevPos ? [{ id: m.id, nivel: m.nivel, vuela: m.vuela, cola: i, desdePath: prevPos }] : [];
  });
  const salidasLanzadera = [
    ...lanzaderaMovidas.filter((m) => m.desdePath && m.desdePath.paso > 0),
    ...colaMovidas.filter((m) => m.desdePath?.paso > 0),
  ];
  /* Por calle, el que sale: hace falta en el tablero para saber que el
     atacante de la casilla 1 ha caído contra él, no por una carta. */
  const salen = new Map(salidasLanzadera.map((m) => [m.desdePath.calle, {
    id: m.id, nivel: m.nivel, paso: m.desdePath.paso,
  }]));
  energiaMesa = privada?.energia ?? 0;
  accionesRestantesMesa = privada?.accionesRestantes ?? 0;
  faseMesa = fase ?? null;
  tocaMesa = teToca;
  cienciasMesa = yo?.bunker?.ciencia ?? [];
  criaderoMesa = yo?.bunker?.laboratorio ?? 0;
  nivelEnemigoMesa = publica.nivelEnemigo ?? 1;
  lunaMesa = publica.luna ?? 1;
  /* Una línea por jugador en la barra; la tuya siempre la primera. */
  jugadoresMesa = Object.entries(tableros ?? {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.id === tu ? -1 : b.id === tu ? 1 : 0));
  turnoMesa = turnoActual ?? null;
  yoMesa = tu ?? null;
  miTableroMesa = yo ?? null;
  /* En «por equipos», los aliados son los vivos del mismo equipo (también
     los bots del equipo); en «todos contra todos» no hay aliados. */
  modoMesa = publica.modo ?? "todos";
  miEquipoMesa = tableros?.[yoMesa]?.equipo ?? 0;
  aliadosMesa = modoMesa === "equipos"
    ? jugadoresMesa.filter((p) =>
        p.id !== yoMesa && p.vivo !== false && (p.equipo ?? 0) === miEquipoMesa)
    : [];
  peticionesMesa = privada?.peticiones ?? [];
  enviosPendientesMesa = privada?.enviosPendientes ?? [];
  registro(`vista · luna ${lunaMesa} · fase ${faseMesa} · turno ${turnoMesa ?? "?"}${teToca ? " (tú)" : ""}`,
    "· mis calles:", resumenCalles(yo?.senderos), "· ataques:", ataquesEnCamino().length);
  const hayPeticionesAjenas = peticionesMesa.some((p) => p.de !== yoMesa);

  /* Sin decretos no queda nada que decidir en la fase de acciones: se manda el
     pase solo, porque la pestaña de acciones ya no existe. */
  /* Solo se pasa solo cuando no queda ni una moneda ni un decreto y no hay
     aliados humanos a los que pedir ayuda: con cualquiera de esas opciones
     todavía hay algo que el jugador puede decidir. El pase espera a que la
     pantalla acabe de enseñar la última jugada: su animación se programa más
     abajo, en este mismo repintado, y sin esta espera el descarte salía
     encima del disparo, del ataque o del movimiento. */
  if (teToca && fase === "acciones"
      && (privada?.energia ?? 0) <= 0
      && (privada?.accionesRestantes ?? 0) <= 0
      && !aliadosMesa.some((a) => !a.esBot && !/^bot-/i.test(a.id))
      && !pasandoAuto) {
    pasandoAuto = true;
    const pasar = () => {
      if (faseMesa !== "acciones" || !tocaMesa) { pasandoAuto = false; return; }
      const falta = Math.max(0, descarteEspera - performance.now());
      if (falta) { setTimeout(pasar, falta); return; }
      Promise.resolve(enviarAccion?.({ tipo: "pasar" })).finally(() => { pasandoAuto = false; });
    };
    setTimeout(pasar, 0);
  }

  /* El CSS va a <head> y se queda ahí. Antes viajaba con el marcado, así que
     cada repintado (la app vacía #pantalla) lo borraba y volvía a pegarlo: se
     llegaba a ver el HUD sin estilos, texto blanco sobre negro, antes de que
     todo se recolocara. */
  instalarCss();

  /* Al empezar otro turno (o otra luna) se cierra todo lo que quedara abierto
     del turno anterior: paneles, cartas, descartes y avisos de la partida. Lo
     único que puede abrirse a partir de aquí es el aviso de turno nuevo y, si
     toca, la fase de lanzaderas. */
  const claveTurno = `${luna}:${turnoActual}`;
  if (claveTurno !== claveTurnoVista) {
    claveTurnoVista = claveTurno;
    cerrarUiDeTurno();
    /* Los marcadores de la jornada son del turno anterior: si no se limpian,
       una partida nueva con la misma luna y jugador puede saltarse la carta o
       el avance porque cree que esa fase ya se enseñó. */
    faseAutoHecha = null;
    rivalLanzarElegido = null;
    clearTimeout(relojConfirmar);
    bloquearPorAvance(false);
    /* La pestaña abierta se recuerda entre repintados, pero no debe sobrevivir
       al cambio de turno: si no, el panel de aliados se reconstruye abierto en
       cuanto llega el turno nuevo. */
    tabMesa = "cartas";
    viendoJugador = null;
  }

  /* Modo visita: la fortaleza de otro jugador, en su estado y sin controles. */
  if (viendoJugador && publica.jugadores?.[viendoJugador]) {
    pintarVistaRival(contenedor, publica, viendoJugador, privada);
    return;
  }
  viendoJugador = null;

  contenedor.innerHTML = `
    ${yo ? pintarMiBunker(yo, privada, fase, { salen }) : ""}

  `;
  /* La jornada empieza por la lanzadera y sigue con el avance de atacantes,
     el de defensores y la carta. Esas fases las conduce `programarJornada`
     después de montar el tablero, para que cada movimiento tenga su tiempo. */
  const estrenaTurno = teToca && (fase === "lanzar" || fase === "avance")
    && claveTurno !== turnoEmpezado;

  /* La app vacía #pantalla antes de este repintado; el scroll que tenía el
     jugador llega en `scroll`. Se devuelve para que la bajada al tablero no se
     pierda al pasar de avance a defensores, carta, etc. */
  const pantallaScroll = document.getElementById("pantalla");
  const scrollPrevio = Number.isFinite(scroll) ? scroll : (pantallaScroll?.scrollTop ?? 0);

  /* La copia de los que salen se crea antes de animar: así entra en la cola de
     su calle como cualquier otro defensor. La lanzadera espera apagada. */
  if (salidasLanzadera.length) prepararSalidasLanzadera(contenedor, salidasLanzadera);
  const anim = animarFichas(contenedor);
  registro(`pintado · ${anim.movidas} movidas (${anim.ataques} atacantes, ${anim.defensores} defensores)`
    + ` · ${anim.entradas} entradas · ${anim.extraLuchas("atacantes") ? "pelea atacantes" : ""}`
    + `${anim.extraLuchas("defensores") ? " pelea defensores" : ""}`);
  /* Fuera de tu turno no se anima nada de esto: el monstruo que te lanzan se
     queda en la casilla 1 y se le ve llegar al empezar tu turno, antes del
     avance (animarLlegadaEnviados). Primero aparecen los enviados, luego se
     mueven, y el Destino entra después con su carta. */
  /* Las que nacen de una jaula se funden directamente en su lanzadera: solo
     las que vienen del camino se ven viajar (prepararSalidasLanzadera). */
  const lanzaderaDesdeCaja = lanzaderaMovidas.filter((m) => !m.desdePath);
  if (lanzaderaDesdeCaja.length) animarEntradaLanzadera(contenedor, lanzaderaDesdeCaja);
  if (entradasPendientes.length) animarEntradaBunker(contenedor, entradasPendientes);
  if (aniquiladasPendientes.length) animarAniquiladas(contenedor, aniquiladasPendientes);
  /* Si el jugador ya estaba abajo del todo se queda abajo: el repintado suele
     traer contenido nuevo (una acción más, el panel de decretos) y devolverle
     el píxel de antes le subía la vista para bajarla otra vez. */
  if (!estrenaTurno && pantallaScroll && (alFinal === true || scrollPrevio > 0)) {
    /* Se devuelve el scroll ya, en el mismo tick del repintado. Pidiéndolo
       para el siguiente frame, el navegador llegaba a pintar la pantalla con
       el scroll a cero y luego volvía a bajar: ese era el salto que se veía
       al entrar la carta de Destino con la vista abajo. El segundo intento
       cubre lo que cambie de alto después. */
    const volver = () => {
      if (!pantallaScroll.isConnected) return;
      pantallaScroll.scrollTop = alFinal === true ? pantallaScroll.scrollHeight : scrollPrevio;
    };
    volver();
    requestAnimationFrame(volver);
  }

  /* Nav, mano y box al body para position:fixed real (no relativo a #pantalla) */
  document.getElementById("bw-nav-global")?.remove();
  document.querySelector("body > .bw-mano-wrap")?.remove();
  document.querySelector("body > .bw-panel.box-panel")?.remove();
  document.querySelector("body > .bw-panel.acciones-panel")?.remove();
  document.querySelector("body > .bw-panel.manuscritos-panel")?.remove();
  document.querySelector("body > .bw-panel.torres-panel")?.remove();
  document.querySelector("body > .bw-panel.mapa-panel")?.remove();
  document.querySelector("body > .bw-panel.disparo-panel")?.remove();
  document.querySelector("body > .bw-panel-overlay")?.remove();
  document.querySelector("body > .bw-panel.aliados-panel")?.remove();

  disparoPanel = null;

  const navEl2 = document.createElement("nav");
  navEl2.id = "bw-nav-global";
  navEl2.className = "bw-nav";
  /* position y bottom inline para que sea inmediato, antes del primer paint */
  /* Sin fixed: el menú es la última fila de la columna de la app. */
  navEl2.style.cssText = "width:100%;flex:0 0 auto;";
  navEl2.innerHTML = `
    <button class="bw-nav-tab" data-tab="box" type="button">
      <span>Jaulas</span>
    </button>
    <button class="bw-nav-tab" data-tab="torres" type="button">
      <span>Torres</span>
    </button>
    <button class="bw-nav-tab" data-tab="mapa" type="button">
      <span>Mapa</span>
    </button>
    ${aliadosMesa.length ? `<button class="bw-nav-tab" data-tab="aliados" type="button">
      <span class="bw-nav-label">Aliados${hayPeticionesAjenas
        ? `<span class="bw-nav-badge" title="Hay peticiones de otros aliados" aria-label="Hay peticiones de otros aliados">!</span>`
        : ""}</span>
    </button>` : ""}
    <button class="bw-nav-tab" data-tab="manuscritos" type="button">
      <span>Reglas</span>
    </button>`;
  document.body.appendChild(navEl2);

  /* Alto real de la barra y del menú, en vivo: de ahí cuelgan el escenario, la
     mano y el panel del box. Cualquier notch o barra del navegador entra aquí. */
  const medirAlto = () => {
    const b = document.getElementById("barra");
    const n = document.getElementById("bw-nav-global");
    const raiz = document.documentElement;
    if (b) raiz.style.setProperty("--alto-barra", Math.max(0, Math.round(b.getBoundingClientRect().bottom)) + "px");
    if (n) {
      /* Su propio alto, no innerHeight - nav.top: el menú cierra la columna, y
         la mano y el panel se cuelgan de él. Con innerHeight, en iOS la mano
         caía por debajo del menú (la franja amarilla en Safari). */
      raiz.style.setProperty("--alto-nav", Math.max(0, Math.round(n.getBoundingClientRect().height)) + "px");
    }
  };
  medirAlto();
  addEventListener("resize", medirAlto);
  if (window.visualViewport) visualViewport.addEventListener("resize", medirAlto);
  setTimeout(medirAlto, 60);

  const descartando = fase === "descartar" && !!privada?.teToca;
  const mano = privada?.mano ?? [];
  const manoWrap = document.createElement("div");
  manoWrap.className = `bw-mano-wrap${descartando ? " descartando" : ""}`;
  manoWrap.innerHTML = `<div class="bw-mano">${mano.length ? mano.map(c => pintarCarta(c, privada, fase, yo?.bunker)).join("") : ""}</div>`;
  document.body.appendChild(manoWrap);

  const boxPanel = document.createElement("div");
  boxPanel.className = "bw-panel box-panel oculto";
  boxPanel.innerHTML = pintarBox(privada);
  document.body.appendChild(boxPanel);

  /* Manuscritos: la referencia de reglas, para consultar sin salir de la mesa */
  const manPanel = document.createElement("div");
  manPanel.className = "bw-panel manuscritos-panel oculto";
  manPanel.innerHTML = pintarManuscritos();
  document.body.appendChild(manPanel);

  /* Torres: los tres huecos, uno por camino, con su nivel y su alzado. */
  const torresPanel = document.createElement("div");
  torresPanel.className = "bw-panel torres-panel oculto";
  torresPanel.innerHTML = pintarTorres(yo?.bunker?.torres ?? [], yo?.senderos ?? []);
  document.body.appendChild(torresPanel);
  torresPanel.addEventListener("click", (ev) => {
    /* El hueco de la torre (el + o la torre ya construida) abre el mismo panel
       que el hueco de la fortaleza: construir o mejorar desde los dos sitios. */
    const torreSlot = ev.target.closest("[data-torre-pos]");
    if (torreSlot) {
      abrirTorre(Number(torreSlot.dataset.torrePos));
      return;
    }
    /* Un monstruo mío en su peldaño: encima sale el panel de avanzar/atacar. */
    const mio = ev.target.closest("[data-mover-slot]");
    if (mio) {
      abrirMonstruo({
        sendero: Number(mio.dataset.sendero),
        posicion: Number(mio.dataset.posicion),
        id: mio.dataset.ficha,
        nivel: Number(mio.dataset.nivel),
      });
      return;
    }
    const slot = ev.target.closest("[data-disparo-slot]");
    if (!slot) return;
    abrirDisparo({
      sendero: Number(slot.dataset.sendero),
      posicion: Number(slot.dataset.posicion),
      nivel: Number(slot.dataset.nivel),
    });
  });

  /* Mapa: el listado de rivales, en el mismo tipo de panel que las jaulas. */
  const mapaPanel = document.createElement("div");
  mapaPanel.className = "bw-panel mapa-panel oculto";
  mapaPanel.innerHTML = pintarMapa();
  document.body.appendChild(mapaPanel);
  mapaPanel.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-jugador]");
    if (!b) return;
    viendoJugador = b.dataset.jugador;
    const cont = document.getElementById("tablero");
    if (cont && vistaOpciones) { vistaContenedor = cont; pintar(cont, vistaOpciones); }
  });

  /* Aliados: solo existe la pestaña si hay otros jugadores humanos. */
  let aliadosPanel = null;
  if (aliadosMesa.length) {
    aliadosPanel = document.createElement("div");
    aliadosPanel.className = "bw-panel aliados-panel oculto";
    aliadosPanel.innerHTML = pintarAliados(aliadosMesa, peticionesMesa, enviosPendientesMesa);
    document.body.appendChild(aliadosPanel);
    prepararAliados(aliadosPanel, aliadosMesa);
  }

  /* Velo común de los paneles: difumina y tiñe la fortaleza, pero queda por
     debajo del menú para que las pestañas sigan visibles y pulsables. */
  const panelOverlay = document.createElement("div");
  panelOverlay.className = "bw-panel-overlay oculto";
  document.body.appendChild(panelOverlay);

  /* Parallax: el contenedor de scroll en el motor es #pantalla, no window */
  const pantalla = document.getElementById("pantalla");
  const sueloEl = contenedor.querySelector(".suelo");
  let rafPending = false;
  function parallax() {
    rafPending = false;
    const sy = pantalla ? pantalla.scrollTop : window.scrollY;
    const max = pantalla
      ? pantalla.scrollHeight - pantalla.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const t = max > 0 ? sy / max : 0;
    sueloEl?.style.setProperty("--py-clouds",   `${sy * 0.3}px`);
    sueloEl?.style.setProperty("--py-cloud",    `${sy * 0.2}px`);
    sueloEl?.style.setProperty("--py-cloud-sm", `${sy * -0.4}px`);
        /* Banderines en vertical: al hacer scroll se quedan un poco atrás (suben
       respecto del marco). Un 5 % más de esa subida es bajar el arrastre de
       0,15 a 0,1425. */
    sueloEl?.style.setProperty("--py-flags",   `${sy * 0.1425}px`);
        /* Banderines: se abren al hacer scroll (uno hacia cada lado). A −0,42 se
       separaban demasiado rápido; un 20 % menos lento es −0,336. */
    sueloEl?.style.setProperty("--px-flags",   `${sy * -0.336}px`);
      /* La niebla no se pasa del final: con +50 se metía 50 px por debajo del
         suelo, su borde opaco quedaba recortado y abajo asomaba una franja
         (negra antes, de nubes después). A tope de scroll queda a ras. */
      /* 10,7 u son los 40 px de antes a 375 px de ancho, en proporción. */
    sueloEl?.style.setProperty("--py-fog",      `${(1 - t) * 10.7}cqw`);
    /* Vista arriba el mapa se ve un 15 % más grande y vuelve a su tamaño al
       bajar. Va en el mundo entero para que el castillo, los caminos, los
       círculos de calle, las jaulas y el tablero crezcan juntos. */
    const mundo = contenedor.querySelector(".mundo");
    if (mundo) {
      const p = max > 0 ? Math.min(1, Math.max(0, sy / max)) : 0;
      mundo.style.setProperty("--zoom-mapa", (1.15 - 0.15 * p).toFixed(3));
    }
  }
  (pantalla ?? window).addEventListener("scroll", () => {
    if (!rafPending) { rafPending = true; requestAnimationFrame(parallax); }
  }, { passive: true });
  parallax();

  /* Mano de cartas */
  const manoEl = manoWrap;
  manoEl?.addEventListener("click", async (ev) => {
    const carta = ev.target.closest(".bw-carta");
    if (!carta || !manoEl.contains(carta)) return;
    if (faseMesa === "descartar" && tocaMesa) {
      const uid = carta.dataset.uid;
      if (!uid || !enviarAccion) return;
      const r = await enviarAccion({ tipo: "descartar", cartaIds: [uid] });
      if (r?.error) aviso(r.error, { error: true });
      return;
    }
    abrirCarta(carta);
  });

  /* Enlace «pasar turno» de la franja del HUD. */
  contenedor.querySelector(".bw-hud-pasar")?.addEventListener("click", async (ev) => {
    if (!enviarAccion || !tocaMesa) return;
    ev.currentTarget.disabled = true;
    const r = await enviarAccion({ tipo: "saltar_turno" });
    if (r?.error) { aviso(r.error, { error: true }); ev.currentTarget.disabled = false; }
  });

  /* Acciones legales */
  const botones = [...contenedor.querySelectorAll(".bw-accion")];
  for (const b of botones) {
    b.addEventListener("click", async () => {
      const accion = acciones[Number(b.dataset.i)];
      if (!accion || !enviarAccion) return;
      /* «Terminar decretos» cierra el panel de acciones: lo que viene detrás (la
         ronda de monstruos) hay que verlo en el tablero, no bajo el panel. Se
         cambia de pestaña para que tampoco vuelva a abrirse al repintar. */
      if (accion.tipo === "pasar") activarTab("box");
      botones.forEach((x) => { x.disabled = true; });
      const r = await enviarAccion(accion);
      if (r?.error) {
        aviso(r.error, { error: true });
        botones.forEach((x) => { x.disabled = false; });
      }
    });
  }

  /* Salir */
  contenedor.querySelector(".bw-salir")?.addEventListener("click", async () => {
    if (!salirMesa) return;
    const r = await modal({
      titulo: "¿Salir de la partida?",
      texto: "Tu asiento queda libre y la partida sigue sin ti. Para volver a jugar tendrás que crear otra mesa o entrar con su código.",
      botones: [
        { texto: "Seguir jugando", estilo: "secundario", valor: null },
        { texto: "Salir de la partida", estilo: "peligro", valor: "salir" },
      ],
    });
    if (r !== "salir") return;
    const res = await salirMesa();
    if (res?.error) aviso(res.error, { error: true });
    document.getElementById("bw-cielo-global")?.remove();
    document.getElementById("bw-nav-global")?.remove();
    document.querySelector("body > .bw-mano-wrap")?.remove();
    document.querySelector("body > .bw-panel.box-panel")?.remove();
    document.querySelector("body > .bw-panel.acciones-panel")?.remove();
    document.querySelector("body > .bw-panel.manuscritos-panel")?.remove();
    document.querySelector("body > .bw-panel.torres-panel")?.remove();
    document.querySelector("body > .bw-panel.mapa-panel")?.remove();
    document.querySelector("body > .bw-panel.aliados-panel")?.remove();
    document.querySelector("body > .bw-panel.disparo-panel")?.remove();
    document.querySelector("body > .bw-panel-overlay")?.remove();
    disparoPanel = null;
    document.body.classList.remove("bw-himalaya", "mapa-himalaya");
  });

  /* Ciencia del HUD: al tocarla, sus cartas instaladas. */
  contenedor.querySelector(".bw-edif-ciencia")?.addEventListener("click", abrirCiencia);

  /* Box: el monstruo se manda desde su hueco; el hueco libre abre el criadero. */
  boxPanel.addEventListener("click", (ev) => {
    const vacio = ev.target.closest(".bw-box-slot.vacio");
    if (vacio) { abrirCriadero(Number(vacio.dataset.box) || 0); return; }
    const slot = ev.target.closest(".bw-box-slot[data-mon-id]");
    if (!slot) return;
    const mon = boxActual.find((m) => m?.id === slot.dataset.monId);
    if (mon) abrirEnvio(mon);
  });

  /* Criadero del mapa y huecos libres del box: abren la lista de monstruos. */
  contenedor.querySelectorAll('[data-edif="criadero"]').forEach((el) => el.addEventListener("click", abrirCriadero));
  contenedor.querySelectorAll(".fort-slot").forEach((el) => {
    const idMon = el.dataset.monId;
    if (idMon) {
      /* Con monstruo: se toca la jaula para mandarlo, igual que en el panel.
         Antes solo respondían las vacías y la jaula llena no hacía nada. */
      el.addEventListener("click", () => {
        const mon = boxActual.find((m) => m?.id === idMon);
        if (mon) abrirEnvio(mon);
      });
      return;
    }
    el.addEventListener("click", () => abrirCriadero(Number(el.dataset.box) || 0));
  });

  /* Torres: el hueco con el + abre construir y la torre abre mejorarla. El
     nivel 3 es el máximo y para subir hace falta la armería del nivel nuevo. */
  for (const el of contenedor.querySelectorAll("[data-pos-torre]")) {
    el.addEventListener("click", () => abrirTorre(Number(el.dataset.posTorre)));
  }

  /* Atacantes: al tocar una ficha que sube, el cálculo de las torres para
     matarla. Los monstruos propios no responden a este toque. */
  for (const el of contenedor.querySelectorAll(".ficha.atacante, .ficha.ajena")) {
    el.addEventListener("click", () => abrirDisparo({
      sendero: Number(el.dataset.sendero),
      posicion: Number(el.dataset.pos),
      nivel: Number(el.dataset.nivel),
    }));
  }

  /* Mis monstruos en mis escaleras: avanzar o atacar. En la visita a otra
     fortaleza esas fichas no son mías y no responden. */
  for (const el of contenedor.querySelectorAll(".ficha.mia")) {
    if (vistaRival) break;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirMonstruo({
        sendero: Number(el.dataset.sendero),
        posicion: Number(el.dataset.pos),
        id: el.dataset.fid,
        nivel: Number(el.dataset.nivel),
      });
    });
  }

  /* Tabs de navegación inferior */
  function activarTab(id) {
    tabMesa = id;
    navEl2.querySelectorAll(".bw-nav-tab").forEach(t => t.classList.toggle("activo", t.dataset.tab === id));
    boxPanel.classList.toggle("oculto", id !== "box");
    manPanel.classList.toggle("oculto", id !== "manuscritos");
    torresPanel.classList.toggle("oculto", id !== "torres");
    mapaPanel.classList.toggle("oculto", id !== "mapa");
    aliadosPanel?.classList.toggle("oculto", id !== "aliados");
    manoWrap.classList.toggle("oculto", id !== "cartas");
    actualizarOverlayPaneles();
  }
      navEl2.querySelectorAll(".bw-nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      /* Cualquier pestaña cierra antes el disparo, si estaba abierto. */
      cerrarDisparo();
      const id = tab.dataset.tab;
      /* Volver a tocar la pestaña abierta cierra el panel, como la X. */
      activarTab(id === tabMesa ? "cartas" : id);
    });
  });
  /* Se recuerda la pestaña abierta entre repintados (el servidor empuja estado
     a menudo y no queremos que el panel se cierre solo). */
  activarTab(tabMesa === "aliados" && !aliadosPanel ? "cartas" : tabMesa);

  /* La X de la cabecera cierra el panel y devuelve la mano. */
  [boxPanel, manPanel, torresPanel, mapaPanel, ...(aliadosPanel ? [aliadosPanel] : [])].forEach((panel) => {
    panel.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-cerrar-panel]")) activarTab("cartas");
    });
  });

  /* Fase DESCARTAR: la mano entera en un modal, para elegir qué se tira. Se
     abre al final del repintado, cuando ya se sabe cuánto dura la animación
     de la jugada que ha cerrado el turno (ver `programarDescarte`). */
  if (fase !== "descartar") {
    document.getElementById("bw-modal-descartar")?.remove();
    clearTimeout(relojDescarte);
  }

  /* Regalo de un aliado: la caja baja volando al empezar tus decretos y
     después se cuenta lo que trae. Los recursos ya vienen sumados del motor. */
  const regalos = privada?.regalos ?? [];
  if (fase === "acciones" && teToca && !viendoJugador) {
    const pendientes = regalos.filter((g) => !regalosVistos.has(g.id) && !regalosCerrados.has(g.id));
    if (pendientes.length && !regaloMostrando) {
      pendientes.forEach((g) => regalosVistos.add(g.id));
      regaloMostrando = true;
      programarRegalo(pendientes);
    }
  }

  /* La secuencia de la jornada se lanza después de montar el tablero: aviso
     de inicio, lanzaderas, atacantes, defensores y carta. */
  programarJornada(anim, { estrenaTurno, claveTurno });
  /* Las jugadas sueltas (avanzar, atacar, disparar…) no las anima la jornada:
     sin esto, la ficha se quedaba en la casilla vieja hasta el repintado
     siguiente y el movimiento no se veía nunca. El descarte espera a que esa
     animación acabe. */
  animarJugadaSuelta(anim);
  if (fase === "descartar" && teToca) {
    programarDescarte();
    /* Si el modal ya está en pantalla, el repintado no puede dejar paneles
       abiertos por debajo. */
    if (document.getElementById("bw-modal-descartar")) cerrarDebajoDelDescarte();
  }

  /* Cajas de toque encima del tablero, solo para depurar (?zonas=1). */
  pintarZonas();
}

/* ── Zonas de toque (depuración) ──────────────────────────────────────────
   Con ?zonas=1 se dibujan encima del juego las cajas reales de todo lo que
   responde a un toque. No son los dibujos: son las áreas de hit, que es donde
   se ve por qué una jaula y una torre se pisan. */
const ZONAS = [
  [".fort-slot",         "jaula",     "#22c55e"],
  [".torre .torre-zona", "torre",     "#ef4444"],
  [".hueco",             "hueco",     "#f59e0b"],
  [".lanzadera",         "lanzadera", "#38bdf8"],
  [".ficha",             "ficha",     "#eab308"],
  [".fort-circulo-edif", "edificio",  "#a855f7"],
  [".fort-plat",         "recursos",  "#ec4899"],
];
let capaZonas = null;
let rafZonas = 0;
let frameZonas = 0;

function pintarZonas() {
  let activo = false;
  try { activo = new URLSearchParams(location.search).get("zonas") === "1"; } catch { /* nada */ }
  if (!activo) {
    if (capaZonas) {
      capaZonas.remove();
      capaZonas = null;
      cancelAnimationFrame(rafZonas);
    }
    return;
  }
  if (capaZonas) return;
  capaZonas = document.createElement("div");
  capaZonas.id = "bw-zonas";
  capaZonas.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none";
  document.body.appendChild(capaZonas);
  const paso = () => {
    if (!capaZonas) return;
    if (frameZonas++ % 6 === 0) {
      const cajas = [];
      for (const [sel, nombre, color] of ZONAS) {
        document.querySelectorAll(sel).forEach((el, i) => {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) return;
          const pos = el.dataset.posTorre ?? el.closest?.(".torre")?.dataset?.posTorre ?? null;
          const caja = el.dataset.box ?? null;
          /* En las jaulas, el número de jaula y el del hueco dentro de ella. */
          const hueco = caja == null ? null
            : [...document.querySelectorAll(`.fort-slot[data-box="${caja}"]`)].indexOf(el) + 1;
          const et = pos ? ` ${pos}` : caja != null ? ` ${Number(caja) + 1}·${hueco}` : ` ${i + 1}`;
          cajas.push(`<div style="position:fixed;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;box-sizing:border-box;border:2px solid ${color};background:${color}26;color:${color}"><span style="position:absolute;left:0;top:0;background:#000c;padding:1px 3px;white-space:nowrap;font:700 10px/1.1 ui-monospace,monospace">${nombre}${et}</span></div>`);
        });
      }
      capaZonas.innerHTML = cajas.join("");
    }
    rafZonas = requestAnimationFrame(paso);
  };
  paso();
}

/* ── Animación del avance ─────────────────────────────────────────────────── */

/* Última casilla conocida de cada ficha, para saber cuáles se han movido. */
const fichasPrevias = new Map();
/* Entradas en el búnker detectadas al pintar mi tablero: un atacante que
   estaba en la puerta y ya no está. Se animan al final del repintado. */
let entradasPendientes = [];
/* Fichas que una carta se ha llevado sin pelear (Purga y compañía): se les
   deja su humo en la casilla, como al que mata una torre pero sin bolas. */
let aniquiladasPendientes = [];
/* Entradas ya animadas: el motor las manda (con id) y no se repiten aunque la
   mesa se repinte varias veces con el mismo estado. */
const entradasHechasBunker = new Set();
let entradasPrimerPintado = true;
/* Fichas de monstruos (ajenas o atacantes) que había en el tablero la última
   vez: si ahora hay más, es que acaban de aparecer. */
let ajenasPrevias = null;

/* Ritmo de la jornada. Cada ficha se mueve por separado, con una pausa corta
   antes de la siguiente. */
const MS_ATAQUE = 1000;  // duración del deslizamiento de cada ficha
const MS_PAUSA = 150;    // separación entre fichas
const MS_BAJADA = 650;   // bajada de la vista hasta el tablero
const MS_ESPERA_BAJADA = 250;   // quieto abajo antes de mover atacantes
const MS_ESPERA_ATAQUE = 250;   // quieto antes de que empiece el primer atacante
const MS_ESPERA_DEFENSA = 250;  // quieto antes de que empiece la defensa
const MS_ESPERA_EFECTO = 300;   // quieto antes de animar lo que ha hecho la carta
const MS_ESPERA_FIN = 300;      // margen después del último movimiento
const MS_FICHA = MS_ATAQUE;
const MS_FUNDIDO_LANZADERA = 320; // la ficha aparece en su lanzadera, sin viaje
const MS_NUBE = 700;      // la nube del combate, del choque al humo
/* El monstruo que sale del camino se queda un momento en la casilla 1 antes de
   apagarse, para que se vea que ha llegado; si ha peleado, se queda hasta que
   el humo se va del todo. Después se apaga y aparece en su lanzadera. */
const MS_QUIETO_LANZADERA = 300;
const MS_FUNDIDO_SALIDA = 240;
const MS_HUMO_FIN_SALIDA = MS_NUBE + 420 - 160; // del humo abierto a retirado
const MS_SALIDA_MAX = 4000; // red: la lanzadera nunca se queda vacía
const MS_LUCHA = MS_FICHA + MS_NUBE + 420; // fantasma + nube + desvanecido
const MS_VUELO_DISPARO = 420;  // las bolas, de la torre al monstruo
const MS_DISPARO = MS_VUELO_DISPARO + 100 + 560 + 440; // bolas, nube y humo
const duracionGrupo = (n) => (n > 0 ? n * (MS_FICHA + MS_PAUSA) - MS_PAUSA : 0);

/* Devuelve cuántas fichas se han movido, cuántas son atacantes y funciones
   para lanzar el deslizamiento por grupos. Todas las fichas se quedan en su
   casilla de salida hasta que se llama a la función de su grupo.

   Los atacantes se animan en la fase de avance y los defensores en la suya:
   así nunca se mueven a la vez. */
function animarFichas(raiz, { diferir = true } = {}) {
  let movidas = 0;
  let ajenas = 0;
  const esAjena = (el) => el.classList.contains("atacante") || el.classList.contains("ajena");
  const pendientes = [];

  for (const el of raiz.querySelectorAll(".ficha[data-ol]")) {
    const ol = el.dataset.ol;
    const ot = el.dataset.ot;
    const finL = el.style.left;
    const finT = el.style.top;
    const atacante = esAjena(el);
    const entra = el.dataset.entra === "1";
    el.removeAttribute("data-ol");
    el.removeAttribute("data-ot");
    el.removeAttribute("data-entra");
    if (diferir) { el.style.left = `${ol}%`; el.style.top = `${ot}%`; }
    pendientes.push({ el, ol, ot, finL, finT, atacante, entra });
    movidas++;
    if (atacante) ajenas++;
  }

  /* Primero la ficha que va delante en el sentido de la marcha: así deja libre
     la casilla en la que entra la que viene detrás y no se solapan.
     Los atacantes suben hacia la fortaleza, o sea que el de delante es el que
     está más arriba en el mapa (menos top). Mis monstruos bajan hacia la
     lanzadera: empiezan los de la casilla 1, la más alejada de la fortaleza,
     y siguen 2, 3 y 4 (la más cercana). */
  pendientes.sort((a, b) => {
    const da = parseFloat(a.ot) || 0;
    const db = parseFloat(b.ot) || 0;
    if (a.atacante !== b.atacante) return a.atacante ? -1 : 1;
    return a.atacante ? da - db : db - da;
  });

  /* Retardo real de cada ficha: nadie arranca antes de que el de delante suyo
     en la misma calle haya terminado su tramo (con dos monstruos seguidos, el
     de atrás espera a que el de delante acabe; antes podían solaparse y se
     veían avanzar a la vez, como si la mesa se hubiera saltado el orden). */
  const retrasosDe = (lista, retardoBase = 0) => {
    const finDeCalle = new Map();
    return lista.map((p, i) => {
      const calle = p.el.dataset.sendero ?? "";
      const turno = retardoBase + i * (MS_FICHA + MS_PAUSA);
      const ocupada = finDeCalle.get(calle);
      const retardo = ocupada == null ? turno : Math.max(turno, ocupada);
      finDeCalle.set(calle, retardo + MS_FICHA + MS_PAUSA);
      return retardo;
    });
  };

  const reproducirLista = (lista, retardoBase = 0) => {
    const retrasos = retrasosDe(lista, retardoBase);
    lista.forEach(({ el, ol, ot, finL, finT, entra, pelea }, i) => {
      const retardo = retrasos[i];
      const mover = () => {
        /* La ficha se queda en la casilla anterior hasta su turno; solo
           entonces se le pone el destino y se lanza el deslizamiento. Con
           delay + fill, iOS la pintaba directamente en el destino y se veía
           el «ploc» en vez del movimiento.
           Para las entradas desde la niebla NO se cambia el estilo antes del
           animate: evita el salto visual de niebla→pos1 que ocurría porque el
           navegador pintaba un frame con el estilo final antes de que la
           animación tomara el control. */
        if (!entra) {
          el.style.left = finL;
          el.style.top = finT;
        } else {
          /* Igual que en la llegada: el reposo visible, la niebla la pone la
             animación. Sin esto, al cancelarla la ficha quedaba invisible. */
          el.style.opacity = "1";
        }
        const frames = entra
          ? [{ left: `${ol}%`, top: `${ot}%`, opacity: 0 }, { left: finL, top: finT, opacity: 1 }]
          : [{ left: `${ol}%`, top: `${ot}%` }, { left: finL, top: finT }];
        const anim = el.animate?.(frames, {
            duration: MS_FICHA,
            easing: "cubic-bezier(.45,.05,.3,1)",
            ...(entra ? { fill: "forwards" } : {}),
          }
        );
        if (entra && anim) {
          if (el.dataset.fid) llegadasAnunciadas.add(el.dataset.fid);
          anim.onfinish = () => {
            el.style.left = finL;
            el.style.top = finT;
            el.style.opacity = "1";
            anim.cancel();
          };
        }
      };
      if (retardo > 0) setTimeout(mover, retardo);
      else mover();
      /* El que sale hacia la lanzadera no desaparece al llegar: se queda un
         momento en la casilla 1 o, si ha peleado, todo el humo; después se
         apaga para encenderse ya en la lanzadera. */
      if (el.dataset.puesto != null) {
        const espera = pelea ? MS_HUMO_FIN_SALIDA : MS_QUIETO_LANZADERA;
        setTimeout(() => despedirALaLanzadera(raiz, el), retardo + MS_FICHA + espera);
      }
    });
  };

  /* ── Combates: el fantasma del caído y la nube del choque ──
     El que cae se queda un momento en el tablero: si murió atacando, se
     desliza hasta el que le planta cara; si el otro le ha quitado la casilla,
     espera donde estaba y el ganador se le echa encima. Después sale la nube
     de polvo, se apaga y se queda el que ha ganado. */
  const fantasmas = [...raiz.querySelectorAll(".ficha.fantasma[data-lucha]")];
  /* Las salidas a lanzadera que han ganado en la casilla 1 esperan a que el
     humo del combate se vaya antes de despedirse. */
  const ganadoresDefensa = new Set(
    fantasmas.filter((g) => g.dataset.grupo === "defensores").map((g) => g.dataset.ganador),
  );
  for (const p of pendientes) {
    if (p.el.dataset.puesto != null) p.pelea = ganadoresDefensa.has(p.el.dataset.fid);
  }
  /* `llegada`: cuánto tarda en llegar el que ataca a la casilla del otro. La
     nube entra con su fundido justo antes, así que se abre del todo cuando el
     que se acerca ya está encima. */
  const pelear = (fantasma, llegada = null) => {
    if (fantasma.dataset.hecha) return;
    fantasma.dataset.hecha = "1";
    const nube = raiz.querySelector(`.bw-nube[data-nube="${fantasma.dataset.lucha}"]`);
    const dl = `${fantasma.dataset.dl}%`;
    const dt = `${fantasma.dataset.dt}%`;
    fantasma.style.display = "block";
    /* Si el que cae murió atacando, es él quien se acerca al otro. */
    let propia = 0;
    if (fantasma.style.left !== dl || fantasma.style.top !== dt) {
      const ol = fantasma.style.left;
      const ot = fantasma.style.top;
      fantasma.style.left = dl;
      fantasma.style.top = dt;
      fantasma.animate?.(
        [{ left: ol, top: ot }, { left: dl, top: dt }],
        { duration: MS_FICHA, easing: "cubic-bezier(.45,.05,.3,1)" },
      );
      propia = MS_FICHA;
    }
    const entra = Math.max(0, (llegada ?? propia) - 160);
    setTimeout(() => {
      nube?.classList.add("on");
      /* El caído se va ya tapado por la nube, sin otro fundido a la vista: al
         irse la nube queda solo el que ha ganado. */
      setTimeout(() => fantasma.remove(), 220);
      setTimeout(() => nube?.classList.add("sale"), MS_NUBE);
      setTimeout(() => nube?.remove(), MS_NUBE + 420);
    }, entra);
  };
  const reproducirLuchas = (grupo, retardoBase = 0, movers = []) => {
    const luchasG = fantasmas.filter((g) => g.dataset.grupo === grupo);
    for (const g of luchasG) {
      const id = g.dataset.ganador;
      const i = id ? movers.findIndex((p) => p.el.dataset.fid === id) : -1;
      const llegada = i >= 0 ? i * (MS_FICHA + MS_PAUSA) + MS_FICHA : null;
      setTimeout(() => pelear(g, llegada), retardoBase);
    }
    return luchasG.length;
  };

  const listaDe = (grupo) => grupo === "atacantes"
    ? pendientes.filter(p => p.atacante)
    : grupo === "defensores" ? pendientes.filter(p => !p.atacante) : pendientes;
  /* Lo que se alarga el grupo por las despedidas, contado desde que acaba el
     último tramo normal: la fase no se cierra hasta que la lanzadera se
     enciende, o el repintado siguiente se llevaría la animación a medias. */
  const colaSalidas = (grupo) => {
    const lista = listaDe(grupo);
    const retrasos = retrasosDe(lista, 0);
    let fin = 0;
    lista.forEach((p, i) => {
      if (p.el.dataset.puesto == null) return;
      const espera = p.pelea ? MS_HUMO_FIN_SALIDA : MS_QUIETO_LANZADERA;
      fin = Math.max(fin, retrasos[i] + MS_FICHA + espera + MS_FUNDIDO_SALIDA + MS_FUNDIDO_LANZADERA);
    });
    return Math.max(0, fin - duracionGrupo(lista.length));
  };
  const reproducir = (retardoBase = 0) => {
    reproducirLista(pendientes, retardoBase);
    return colaSalidas("todos");
  };
  const reproducirAtacantes = (retardoBase = 0) => {
    const lista = listaDe("atacantes");
    reproducirLista(lista, retardoBase);
    reproducirLuchas("atacantes", retardoBase, lista);
    return colaSalidas("atacantes");
  };
  const reproducirDefensores = (retardoBase = 0) => {
    const lista = listaDe("defensores");
    reproducirLista(lista, retardoBase);
    reproducirLuchas("defensores", retardoBase, lista);
    return colaSalidas("defensores");
  };

  if (!diferir) reproducir();
  const luchasDe = (grupo) => fantasmas.filter((g) => g.dataset.grupo === grupo).length;
  return {
    movidas, ajenas, reproducir, colaSalidas,
    entradas: pendientes.filter(p => p.entra).length,
    reproducirAtacantes, reproducirDefensores,
    ataques: pendientes.filter(p => p.atacante).length,
    defensores: pendientes.filter(p => !p.atacante).length,
    /* Lo que dura de más la pelea de ese grupo (0 si no hay ninguna). */
    extraLuchas: (grupo) => (luchasDe(grupo) ? MS_LUCHA : 0),
  };
}

/* Un monstruo que llega a su lanzadera desde la jaula aparece con un fundido
   corto y nada más. El vuelo de una copia por la pantalla se comía la
   atención y, como el repintado reconstruye el tablero, la jaula de origen ni
   siquiera estaba ya donde se suponía. Los que salen del camino sí viajan: se
   animan con el resto de la jornada (prepararSalidasLanzadera). */
function animarEntradaLanzadera(raiz, movidas) {
  requestAnimationFrame(() => {
    for (const m of movidas) {
      const destino = raiz.querySelector(`.lanzadera[data-lanzadera="${m.lanzadera + 1}"]`);
      if (!destino) continue;
      const fadeInLanzadera = (retardo = 0) => {
        destino.querySelectorAll(".lanzadera-img, .lanzadera-nv").forEach((el) => {
          el.animate?.(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: MS_FUNDIDO_LANZADERA, delay: retardo, easing: "ease-out", fill: "backwards" },
          );
        });
      };
      if (m.desdePath) continue; // los que salen del camino van con la jornada
      fadeInLanzadera();
    }
  });
}

/* ── Salida del camino a la lanzadera ─────────────────────────────────────
   El motor mueve al monstruo de la casilla 2 a la 1 y, en el mismo avance, lo
   pasa a la lanzadera. Si solo se pintara el estado nuevo, la ficha
   desaparecía del camino y aparecía ya en la lanzadera. Aquí se deja una
   copia en su casilla de antes para que haga el último tramo con las demás
   fichas, se quede un momento allí (o hasta que se va el humo, si ha peleado
   con un atacante) y solo entonces se apague, para encenderse en la lanzadera. */

function ocultarLanzadera(destino) {
  if (!destino) return;
  destino.dataset.llega = "0";
  destino.querySelectorAll(".lanzadera-img, .lanzadera-nv").forEach((el) => { el.style.opacity = "0"; });
}

function mostrarLanzadera(destino) {
  if (!destino || destino.dataset.llega === "1") return;
  destino.dataset.llega = "1";
  destino.querySelectorAll(".lanzadera-img, .lanzadera-nv").forEach((el) => {
    el.style.opacity = "";
    el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: MS_FUNDIDO_LANZADERA, easing: "ease-out" });
  });
}

/* El hueco al que va un monstruo: su lanzadera o, si las dos estaban llenas,
   el sitio de la cola. Los dos se distinguen por `data-puesto` (lanzadera-1,
   cola-2…). */
function puestoDestino(raiz, puesto) {
  const [tipo, n] = String(puesto ?? "").split("-");
  if (!n) return null;
  return tipo === "cola"
    ? raiz.querySelector(`.lanzadera-cola[data-cola="${n}"]`)
    : raiz.querySelector(`.lanzadera[data-lanzadera="${n}"]`);
}

/* Se apaga en la casilla 1 y se enciende en la lanzadera: un cambio de sitio,
   no una aparición. El relevo es en dos tiempos para que no se amontonen. */
function despedirALaLanzadera(raiz, ficha) {
  if (!ficha?.isConnected) return;
  const destino = puestoDestino(raiz, ficha.dataset.puesto);
  const irse = () => { ficha.remove(); mostrarLanzadera(destino); };
  const fundido = ficha.animate?.([{ opacity: 1 }, { opacity: 0 }], {
    duration: MS_FUNDIDO_SALIDA, easing: "ease-in", fill: "forwards",
  });
  if (fundido) setTimeout(irse, MS_FUNDIDO_SALIDA);
  else irse();
}

function prepararSalidasLanzadera(raiz, movidas) {
  if (!tocaMesa) return;
  const fichas = raiz.querySelector(".bw-fichas");
  if (!fichas) return;
  for (const m of movidas) {
    const { calle, paso } = m.desdePath ?? {};
    const desde = LOSAS[calle]?.[paso];
    const hasta = LOSAS[calle]?.[0];
    const puesto = m.cola != null ? `cola-${m.cola + 1}` : `lanzadera-${m.lanzadera + 1}`;
    const destino = puestoDestino(raiz, puesto);
    if (!desde || !hasta || !destino) continue;
    /* La lanzadera enseña al monstruo cuando llega, no antes. */
    ocultarLanzadera(destino);
    setTimeout(() => { if (destino.dataset.llega === "0") mostrarLanzadera(destino); }, MS_SALIDA_MAX);
    const ficha = document.createElement("div");
    ficha.className = "ficha mia bw-sale";
    ficha.dataset.puesto = puesto;
    ficha.dataset.fid = m.id;
    ficha.dataset.sendero = String(calle + 1);
    ficha.dataset.nivel = String(m.nivel);
    /* Nace en la casilla de antes y ya lleva el destino: animarFichas la
       desliza a la casilla 1 como a cualquier otro defensor. */
    ficha.style.cssText = `left:${hasta.l}%;top:${hasta.t}%;z-index:4;pointer-events:none`;
    ficha.dataset.ol = desde.l;
    ficha.dataset.ot = desde.t;
    ficha.innerHTML = htmlFicha(m, false);
    fichas.append(ficha);
    registro(`sale a lanzadera · E${calle + 1}·${paso + 1} · nv${m.nivel}`);
  }
}

/* Una ficha que se lleva una carta (Purga, «aniquilar»…) no pelea con nadie:
   se le pinta una copia en su casilla, sale la nube del combate y se va con
   ella. El mismo humo que el disparo de las torres, pero sin las bolas. */
function animarAniquiladas(raiz, lista) {
  const fichas = raiz.querySelector(".bw-fichas");
  if (!fichas || !lista.length) return 0;
  let total = 0;
  lista.forEach((a, i) => {
    const pos = LOSAS[a.calle]?.[a.paso];
    if (!pos) return;
    /* En cadena: primero el humo de uno y luego el del siguiente. */
    const retardo = i * 260;
    const copia = document.createElement("div");
    copia.className = `ficha bw-aniquilada ${a.esAtacante ? "atacante" : "mia"}`;
    copia.style.cssText = `left:${pos.l}%;top:${pos.t}%;z-index:6;pointer-events:none`;
    copia.innerHTML = `<img src="${imgMonstruo(a.nivel, a.esAtacante)}" alt="" class="ficha-img"><b class="ficha-nv">${a.nivel}</b>`;
    fichas.append(copia);
    const nube = document.createElement("div");
    nube.className = "bw-nube";
    nube.style.cssText = `left:${pos.l}%;top:${pos.t}%`;
    nube.innerHTML = `<img src="${BASE_IMG}/nube-combate.png" alt="">`;
    fichas.append(nube);
    setTimeout(() => {
      nube.classList.add("on");
      const fundido = copia.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "ease-in", fill: "forwards" });
      if (!fundido) copia.style.opacity = "0";
      setTimeout(() => copia.remove(), 260);
      setTimeout(() => nube.classList.add("sale"), MS_NUBE);
      setTimeout(() => nube.remove(), MS_NUBE + 420);
    }, retardo);
    total = Math.max(total, retardo + MS_NUBE + 420);
    registro(`aniquilada · E${a.calle + 1}·${a.paso + 1} · nv${a.nivel}`);
  });
  return total;
}

/* ── Entrada en el búnker ─────────────────────────────────────────────────
   Cuando un atacante pisa la puerta y entra, desaparece del tablero y la vida
   baja. Sin nada en pantalla parecía que la vida se perdía sola, así que se
   dibuja una copia en la puerta, sube hacia las torres y se desvanece, con la
   nube del combate a los pies: ha peleado en la puerta para quitarnos vida. */
const SUBIDA_ENTRADA = 4.4; // % del alto del tablero: ~30 px en un móvil
/* La vida que se lleva no necesita un círculo nuevo: el monstruo ya trae su
   pastilla roja con el nivel, que es justo lo que resta al búnker. Al entrar,
   esa pastilla se despega hacia arriba, va creciendo y se difumina; el
   monstruo sube y se apaga debajo, con el humo en la puerta. Mismo tiempo
   para los dos, para que se lea como una sola cosa: pelea, entra y resta. */
const MS_VIDA = 1400;     // lo que tarda en subir y desvanecerse
/* La entrada va en una capa fija sobre la pantalla, como las bolas de las
   torres, pero con un marco que ocupa justo el tablero: así las fichas siguen
   en % de sus casillas y la animación no la corta el repintado del turno.
   Antes vivía dentro del tablero y el repintado de la fase siguiente se la
   llevaba por delante: con dos monstruos entrando —el segundo sale medio
   segundo después—, el primero llegaba a acabar y el segundo se quedaba sin
   animación. El marco se recoloca mientras dura, para que el tablero pueda
   seguir bajando con la vista sin que la entrada se descuadre. */
function animarEntradaBunker(raiz, entradas) {
  const capaTablero = raiz.querySelector(".bw-fichas");
  if (!capaTablero) return;
  const caja = capaTablero.getBoundingClientRect();
  if (!caja.width || !caja.height) return;

  /* 1 % del ancho del mundo, medido en el tablero: fuera de él la unidad no
     existe (se define en .mundo) y fichas, humo y pastilla saldrían a cero. */
  const sonda = document.createElement("div");
  sonda.style.cssText = "position:absolute;height:0;width:calc(10 * var(--u))";
  capaTablero.append(sonda);
  const u = (sonda.getBoundingClientRect().width || caja.width / 10) / 10;
  sonda.remove();

  const capa = document.createElement("div");
  capa.className = "bw-disparo-capa";
  document.body.append(capa);
  const marco = document.createElement("div");
  marco.style.cssText = `position:fixed;left:${caja.left}px;top:${caja.top}px;width:${caja.width}px;height:${caja.height}px`;
  marco.style.setProperty("--u", `${u}px`);
  capa.append(marco);

  /* El marco sigue al tablero (scroll, repintado con otro nodo) mientras dure
     algo en pantalla. */
  let finSeguir = 0;
  const seguir = () => {
    const r = raiz.querySelector(".bw-fichas")?.getBoundingClientRect();
    if (r?.width) {
      marco.style.left = `${r.left}px`;
      marco.style.top = `${r.top}px`;
      marco.style.width = `${r.width}px`;
      marco.style.height = `${r.height}px`;
    }
    if (performance.now() < finSeguir && marco.isConnected) requestAnimationFrame(seguir);
    else if (!marco.isConnected) capa.remove();
  };
  requestAnimationFrame(seguir);

  entradas.forEach((entrada, i) => {
    const { l, t, nivel } = entrada;
    const ficha = document.createElement("div");
    ficha.className = "ficha atacante bw-entrando";
    ficha.style.left = `${l}%`;
    ficha.style.top = `${t}%`;
    ficha.innerHTML = htmlFicha(entrada, true);
    const nube = document.createElement("div");
    nube.className = "bw-nube bw-nube-puerta";
    nube.style.left = `${l}%`;
    nube.style.top = `${t}%`;
    nube.innerHTML = `<img src="${BASE_IMG}/nube-combate.png" alt="">`;
    marco.append(ficha, nube);

    /* De una en una, como las demás fichas de la jornada. */
    const arranque = i * (MS_FICHA / 2);
    const acaba = arranque + Math.max(MS_NUBE + 420, MS_VIDA + 120);
    finSeguir = Math.max(finSeguir, performance.now() + acaba + 100);
    setTimeout(() => {
      nube.classList.add("on");
      ficha.animate?.(
        [
          { top: `${t}%`, opacity: 1 },
          { top: `${Number(t) - SUBIDA_ENTRADA}%`, opacity: 0 },
        ],
        { duration: MS_VIDA, easing: "ease-in", fill: "forwards" },
      );
      if (!ficha.animate) ficha.style.opacity = "0";
      /* La pastilla del nivel, que ya venía con el monstruo, es la vida que se
         lleva: se suelta de la ficha, sube y crece mientras se apaga. Se
         respeta el desplazamiento de cada nivel (el 1 va 5 px más abajo). */
      const pastilla = ficha.querySelector(".ficha-nv");
      const sube = (v) => `translate(-50%, calc(-50% - ${nivel === 1 ? 15 : 20}px - ${v} * var(--u)))`;
      pastilla?.animate?.(
        [
          { transform: `${sube(0)} scale(1)`, opacity: 1, easing: "ease-out" },
          { transform: `${sube(4.2)} scale(1.55)`, opacity: 1, offset: 0.4 },
          { transform: `${sube(11)} scale(3)`, opacity: 0 },
        ],
        { duration: MS_VIDA, easing: "linear", fill: "forwards" },
      );
    }, arranque);
    setTimeout(() => nube.classList.add("sale"), arranque + MS_NUBE);
    setTimeout(() => {
      nube.remove();
      ficha.remove();
      if (!marco.childElementCount) capa.remove();
    }, acaba);
  });
}

/* Turno cuyo aviso de «Es tu turno» ya se ha aceptado. Se guarda en el propio
   navegador para que, si cierras la app a mitad de turno y vuelves, no se repita
   el aviso: la clave lleva la luna y el jugador, así que en el turno siguiente
   vuelve a salir. */
const LS_TURNO = "bw-turno-empezado";
const leerTurnoEmpezado = () => { try { return localStorage.getItem(LS_TURNO); } catch { return null; } };
function guardarTurnoEmpezado(clave) { try { localStorage.setItem(LS_TURNO, clave); } catch { /* sin almacenamiento */ } }
let turnoEmpezado = leerTurnoEmpezado();

/* ── Secuencia de la jornada ──────────────────────────────────────────────
   El motor para en cada fase para que se vea: avance de atacantes, avance de
   defensores, carta y carta resuelta. Aquí se encadenan las animaciones y se
   manda el «confirmar» cuando la pantalla ha terminado de enseñar cada paso. */
let faseAutoHecha = null;
let claveTurnoVista = null;
let relojConfirmar = null;
let avisoInicioAbierto = false;
/* Rival elegido en el modal de lanzaderas: se conserva al lanzar una de las
   dos lanzaderas para que la segunda siga en la misma fortaleza. */
let rivalLanzarElegido = null;

/* Baja la vista hasta el tablero con una duración fija: primero se ve el
   terreno y después se mueven las fichas. */
function bajarAlTablero(ms = MS_BAJADA) {
  const pantalla = document.getElementById("pantalla");
  if (!pantalla) return Promise.resolve();
  const desde = pantalla.scrollTop;
  const hasta = Math.max(0, pantalla.scrollHeight - pantalla.clientHeight);
  if (Math.abs(hasta - desde) < 2) return Promise.resolve();
  return new Promise((resolver) => {
    const t0 = performance.now();
    const paso = (ahora) => {
      const k = Math.min(1, (ahora - t0) / ms);
      const suave = 1 - Math.pow(1 - k, 3);
      pantalla.scrollTop = desde + (hasta - desde) * suave;
      if (k < 1) requestAnimationFrame(paso);
      else resolver();
    };
    requestAnimationFrame(paso);
  });
}

function confirmarFase(ms = 0) {
  clearTimeout(relojConfirmar);
  /* Se apunta la fase que pedía este aviso. Si al dispararse la mesa ya está en
     otra —llegó antes otra confirmación, o el jugador cerró la carta justo
     cuando saltaba este temporizador—, el aviso se tira: el servidor lo
     rechazaría con un «no está permitida» que no es culpa de nadie y, peor,
     una confirmación vieja puede adelantar una fase que aún se está leyendo
     (pasaba con la carta de Destino: la caja del aliado salía encima). */
  const claveAlPedir = `${lunaMesa}:${turnoMesa}:${faseMesa}`;
  relojConfirmar = setTimeout(async () => {
    if (!enviarAccion) return;
    if (claveAlPedir !== `${lunaMesa}:${turnoMesa}:${faseMesa}`) {
      registro("confirmar descartado · la fase ya cambió ·", claveAlPedir);
      return;
    }
    registro("confirmar", faseMesa, "en", ms, "ms");
    /* El bloqueo sigue puesto: se suelta cuando la jornada llega a una fase en
       la que el jugador decide. Soltarlo aquí dejaba un hueco entre el final
       del movimiento y la fase siguiente en el que se podía tocar una jaula. */
    const r = await enviarAccion({ tipo: "confirmar" });
    if (r?.error) aviso(r.error, { error: true });
  }, ms);
}

function animarYConfirmar(anim, fn, n, { antes = 0, despues = MS_ESPERA_FIN } = {}) {
  bloquearPorAvance(true);
  /* Se llama siempre: sin fichas que mover puede haber una pelea que enseñar.
     Devuelve lo que la animación se alarga de más (la despedida en la
     lanzadera), que se suma a la espera para no cortarla a mitad. */
  const cola = (fn ? fn(antes) : 0) || 0;
  confirmarFase(antes + duracionGrupo(n) + Math.max(despues, cola));
}

function iniciarFase(anim) {
  if (!tocaMesa || viendoJugador) return;
  /* Jornada terminada: la mesa ya pide una decisión (lanzar, decretos o
     descarte), así que se devuelve el control. */
  if (faseMesa === "lanzar" || faseMesa === "acciones" || faseMesa === "descartar") {
    bloquearPorAvance(false);
  }
  if (faseMesa === "lanzar") {
    registro("fase lanzar · se abre la lanzadera si toca");
    abrirLanzarSiToca();
    return;
  }

  const clave = `${lunaMesa}:${turnoMesa}:${faseMesa}`;
  if (faseAutoHecha === clave) {
    registro(`fase ${faseMesa} ya hecha (${clave})`);
    return;
  }
  registro(`fase ${faseMesa} · ${anim.movidas} movidas · luchas ${anim.extraLuchas("atacantes")}/${anim.extraLuchas("defensores")}`);

  if (faseMesa === "avance") {
    /* El motor todavía no ha movido nada: primero se baja al tablero, se deja
       un instante de espera y al confirmar se aplica el avance de atacantes.
       Sin un solo atacante en los caminos no hay avance que enseñar: se pasa
       al tirón y la carta de Destino sale sin ese hueco. */
    faseAutoHecha = clave;
    if (!hayAtacantesEnCaminos()) { confirmarFase(0); return; }
    bloquearPorAvance(true);
    bajarAlTablero().then(() => {
      /* Lo primero que se ve son los recién enviados naciendo de la bruma en la
         casilla 1; el avance de los atacantes arranca justo después. */
      const llegada = animarLlegadaEnviados();
      confirmarFase(llegada + MS_ESPERA_BAJADA);
    });
    return;
  }
  if (faseMesa === "defensores") {
    /* Aquí llegan los atacantes ya movidos: se animan antes de pasar a la
       carta. Si no se ha movido ninguno ni hay pelea, no se espera. */
    faseAutoHecha = clave;
    const extra = anim.extraLuchas("atacantes");
    if (!anim.ataques && !extra) { confirmarFase(0); return; }
    animarYConfirmar(anim, anim.reproducirAtacantes, anim.ataques, {
      antes: MS_ESPERA_ATAQUE,
      despues: MS_ESPERA_FIN + extra,
    });
    return;
  }
  if (faseMesa === "carta") {
    /* Aquí llegan los defensores ya movidos: se animan y, al terminar, se
       pide la carta. Sin defensores que mover (ni pelea), directo a la carta. */
    faseAutoHecha = clave;
    const extra = anim.extraLuchas("defensores");
    if (!anim.defensores && !extra) { confirmarFase(0); return; }
    animarYConfirmar(anim, anim.reproducirDefensores, anim.defensores, {
      antes: MS_ESPERA_DEFENSA,
      despues: MS_ESPERA_FIN + extra,
    });
    return;
  }
  if (faseMesa === "carta_ver") {
    faseAutoHecha = clave;
    const carta = privadaMesa?.cartaDestino ?? null;
    if (!carta) { confirmarFase(0); return; }
    marcarDestinoVisto(claveDestino(carta));
    abrirDestino(carta, {
      alCerrar: () => {
        /* El efecto se aplica en el servidor al confirmar; no se anima hasta
           que llegue la fase carta_efecto, ya sin el modal delante. */
        bloquearPorAvance(true);
        confirmarFase(0);
      },
    });
    return;
  }
  if (faseMesa === "carta_efecto") {
    /* La carta ya está cerrada: ahora se ve lo que ha hecho (entradas,
       retrocesos, avances extra…) antes de pasar a monedas. Si ha metido
       monstruos en las escaleras, la vista baja primero: si no, la entrada se
       quedaba fuera de pantalla y solo se veía el tablero quieto. */
    faseAutoHecha = clave;
    const verEfecto = () => animarYConfirmar(anim, anim.reproducir, anim.movidas, {
      antes: MS_ESPERA_EFECTO,
      despues: MS_ESPERA_FIN,
    });
    if (!anim.movidas && !anim.entradas) { verEfecto(); return; }
    bloquearPorAvance(true);
    bajarAlTablero().then(verEfecto);
  }
}

/* ¿Queda algún atacante en mis caminos? Si no hay ninguno, la fase de avance
   no tiene nada que enseñar y se salta. */
function hayAtacantesEnCaminos() {
  return (miTableroMesa?.senderos ?? []).some((s) =>
    (s.posiciones ?? []).some((f) => f?.tipo === "atacante"));
}

/* El orden del turno es el de la mesa: primero aparece lo que te han mandado
   (los enviados, naciendo de la bruma en la casilla 1 de cada camino), después
   el avance de atacantes —estos incluidos— y más tarde la carta de Destino con
   los suyos. Esta función hace el primer paso; cada ficha se anuncia una sola
   vez y devuelve lo que tarda para encadenar el avance detrás. */
const llegadasAnunciadas = new Set();
function animarLlegadaEnviados() {
  const tablero = document.querySelector(".tablero");
  if (!tablero) return 0;
  const fichas = [...tablero.querySelectorAll('.ficha.ajena[data-pos="0"], .ficha.atacante[data-pos="0"]')]
    .filter((el) => el.dataset.fid && !llegadasAnunciadas.has(el.dataset.fid) && el.animate);
  let total = 0;
  fichas.forEach((el, i) => {
    const calle = Number(el.dataset.sendero) - 1;
    const desde = ENTRADA[calle];
    if (!desde) return;
    llegadasAnunciadas.add(el.dataset.fid);
    const retardo = i * (MS_FICHA + MS_PAUSA);
    /* LOSAS[calle][0] es la pos 0 real: animarFichas puede haber movido el
       elemento a ENTRADA antes de que lleguemos aquí, así que no leemos
       el.style.left sino la casilla directamente. */
    const losa0 = LOSAS[calle]?.[0];
    const fin = losa0 ? { l: `${losa0.l}%`, t: `${losa0.t}%` } : { l: el.style.left, t: el.style.top };
    el.style.left = `${desde.l}%`;
    el.style.top = `${desde.t}%`;
    /* El estilo de reposo es visible: la animación pone el 0 de la bruma y el
       relleno lo mantiene al acabar. Si otro repintado cancela la animación,
       la ficha no puede quedarse con el opacity:0 de la niebla. */
    el.style.opacity = "1";
    /* Nace apagado en la bruma y sube hasta su casilla; el relleno «both»
       mantiene el destino al acabar (la ficha se queda en su sitio hasta que
       el repintado del avance rehaga el tablero). */
    el.animate(
      [
        { left: `${desde.l}%`, top: `${desde.t}%`, opacity: 0 },
        { left: fin.l, top: fin.t, opacity: 1 },
      ],
      { duration: MS_FICHA, easing: "cubic-bezier(.45,.05,.3,1)", delay: retardo, fill: "both" },
    );
    registro(`llega enviado · ${el.dataset.fid} · E${calle + 1} · nv${el.dataset.nivel}`);
    total = Math.max(total, retardo + MS_FICHA);
  });
  return total;
}

/* Fases que conduce la jornada: esas ya se animan solas, una detrás de otra. */
const FASES_JORNADA = new Set(["lanzar", "avance", "defensores", "carta", "carta_ver", "carta_efecto"]);

/* Respiro antes de lanzar el movimiento: si la posición se cambia en el mismo
   fotograma que se pinta la ficha, iOS salta directo al destino. */
const RETARDO_SUELTA = 40;

/* Jugada que no es de la jornada (decretos, descarte, fin de turno): el
   repintado ya trae el movimiento y la pelea, solo hay que reproducirlos.
   Devuelve lo que tarda en verse entera para poder encadenar el descarte. */
function animarJugadaSuelta(anim) {
  if (!tocaMesa || viendoJugador || FASES_JORNADA.has(faseMesa)) return 0;
  const peleaA = anim.extraLuchas("atacantes");
  const peleaD = anim.extraLuchas("defensores");
  if (!anim.movidas && !peleaA && !peleaD) return 0;
  const lanzar = () => {
    anim.reproducirAtacantes(0);
    anim.reproducirDefensores(0);
  };
  requestAnimationFrame(() => setTimeout(lanzar, RETARDO_SUELTA));
  const total = Math.max(
    duracionGrupo(anim.ataques) + peleaA,
    duracionGrupo(anim.defensores) + peleaD,
    duracionGrupo(anim.defensores) + anim.colaSalidas("defensores"),
  ) + RETARDO_SUELTA + MS_ESPERA_FIN;
  descarteEspera = Math.max(descarteEspera, performance.now() + total);
  return total;
}

/* Nombre con el que se ha registrado el jugador que tiene el turno ahora
   mismo: es lo que enseña la franja del HUD mientras no te toca. */
function nombreEnTurno() {
  return jugadoresMesa.find((p) => p.id === turnoMesa)?.nombre ?? "otro jugador";
}

/* Quién te acaba de mandar un monstruo: los que otro jugador ha lanzado y
   siguen en la casilla 1, esperando su primer avance. Los que ya suben por los
   peldaños de arriba no se anuncian (ya se les vio llegar), y los que traen las
   cartas de Destino no tienen dueño. Así el aviso cuenta justo los que van a
   aparecer de la bruma al empezar tu turno, ni uno más. */
function ataquesEnCamino() {
  const lista = [];
  for (const s of miTableroMesa?.senderos ?? []) {
    const f = s.posiciones?.[0];
    if (f?.tipo !== "atacante" || !f.dueno) continue;
    const quien = jugadoresMesa.find((p) => p.id === f.dueno)?.nombre ?? "Un rival";
    const clave = `${quien}:${f.nivel}:${s.id}`;
    const yaEsta = lista.find((x) => x.clave === clave);
    if (yaEsta) { yaEsta.cuantos += 1; continue; }
    lista.push({ clave, de: quien, nivel: f.nivel, sendero: s.id, cuantos: 1 });
  }
  registro("ataques en camino:", lista.map((a) => `${a.de} ${a.cuantos}×nv${a.nivel} E${a.sendero}`).join(" | ") || "ninguno");
  return lista;
}

/* Un bloque por jugador: «¡Tal te está atacando!» en negrita y, debajo, qué
   bicho y por qué escalera sube, en texto normal. */
function htmlAtaques(lista) {
  if (!lista.length) return "";
  const porJugador = new Map();
  for (const a of lista) {
    const suyos = porJugador.get(a.de) ?? [];
    suyos.push(a);
    porJugador.set(a.de, suyos);
  }
  const bloques = [...porJugador].map(([nombre, suyos]) => {
    const detalles = suyos.map((a) => {
      const bicho = a.cuantos === 1
        ? nombreMonstruo(a.nivel)
        : `${a.cuantos} ${pluralMonstruo(a.nivel)}`;
      const texto = bicho.charAt(0).toUpperCase() + bicho.slice(1);
      return `<div class="bw-turno-ataques-det">${esc(texto)}`
        + ` por la escalera ${esc(escaleraDe(a.sendero))}.</div>`;
    }).join("");
    return `<div class="bw-turno-ataques-grupo">
      <div class="bw-turno-ataques-tit"><b>¡${esc(nombre)} te está atacando!</b></div>
      ${detalles}
    </div>`;
  }).join("");
  return `<div class="bw-turno-ataques">${bloques}</div>`;
}

/* Torres dañadas desde tu último turno (bombardeos y cartas de Destino): la
   misma caja roja que los ataques, con el nivel de antes y el de ahora. */
function htmlTorres(lista) {
  if (!lista?.length) return "";
  const filas = lista.map((t) => {
    const tit = t.de
      ? `${t.de} te ha bombardeado la torre ${t.pos}`
      : `${t.carta ?? "El Destino"} te ha ${t.despues ? "dañado" : "derribado"} la torre ${t.pos}`;
    const nivel = t.despues
      ? `${torreEnRomano(t.antes)} → ${torreEnRomano(t.despues)}`
      : `${torreEnRomano(t.antes)} → destruida`;
    return `<div class="bw-turno-ataques-grupo bw-turno-torre">
      <div class="bw-turno-ataques-tit"><b>${esc(tit)}</b></div>
      <div class="bw-turno-ataques-det">${esc(`Nivel ${nivel}`)}</div>
    </div>`;
  }).join("");
  return `<div class="bw-turno-ataques bw-turno-torres">${filas}</div>`;
}

function programarJornada(anim, { estrenaTurno, claveTurno }) {
  if (!tocaMesa || viendoJugador) return;
  registro(`jornada · fase ${faseMesa} · ${estrenaTurno ? "abre el aviso de turno" : "sigue"} · clave ${claveTurno}`);

  if (estrenaTurno) {
    if (avisoInicioAbierto) return;
    if (document.querySelector(".bw-modal-fondo")) return;
    const capa = document.getElementById("capa");
    if (capa && !capa.hidden) return;
    avisoInicioAbierto = true;
    modal({
      titulo: "",
      texto: "Es tu turno",
      clase: "modal-version",
      html: htmlAtaques(ataquesEnCamino()) + htmlTorres(privadaMesa?.avisosTorre ?? []),
      botones: [{ texto: "Empezar", estilo: "boton", valor: "ok" }],
      obligatorio: true,
    }).then(async () => {
      avisoInicioAbierto = false;
      turnoEmpezado = claveTurno;
      guardarTurnoEmpezado(claveTurno);
      iniciarFase(anim);
    });
    return;
  }

  iniciarFase(anim);
}

/* Mientras dura la fase de avance ninguna acción del usuario responde: no se
   toca una casilla que aún se está moviendo. Se apaga al llegar la siguiente
   fase; el reloj es solo una red por si esa fase no llegara. */
let relojAvance = null;
function bloquearPorAvance(activo) {
  clearTimeout(relojAvance);
  if (!activo) { document.body.classList.remove("bw-avanzando"); return; }
  document.body.classList.add("bw-avanzando");
  relojAvance = setTimeout(() => document.body.classList.remove("bw-avanzando"), 4000);
}

/* ── Matar monstruo con las torres ─────────────────────────────────────── */

/* Reparto del daño para matar un atacante: primero la torre de su propia calle
   (hace su nivel) y después las demás (hacen uno menos, salvo con la ciencia
   de torres universales). El coste es el daño hecho, igual que en el motor. */
function planDisparo(nivel, senderoId, bunker) {
  const ciencia = bunker?.ciencia ?? [];
  const universal = ciencia.some(c => c.efecto === "torreta_universal");
  const barata = ciencia.some(c => c.efecto === "torreta_barata");
  const torres = (bunker?.torres ?? []).map((t, i) => {
    if (!t?.nivel) return null;
    const propia = (t.sendero ?? i + 1) === senderoId;
    const tope = t.inhabilitada ? 0 : (propia || universal ? t.nivel : Math.max(0, t.nivel - 1));
    return { pos: i + 1, nivel: t.nivel, propia, universal, inhabilitada: !!t.inhabilitada, tope };
  }).filter(Boolean);
  const orden = [...torres].sort((a, b) =>
    (Number(b.propia) - Number(a.propia)) || (b.tope - a.tope) || (a.pos - b.pos));
  let falta = nivel;
  const usadas = [];
  for (const t of orden) {
    if (falta <= 0) break;
    if (t.tope <= 0) continue;
    const usa = Math.min(t.tope, falta);
    usadas.push({ ...t, usa });
    falta -= usa;
  }
  const capacidad = torres.reduce((s, t) => s + t.tope, 0);
  const alcanza = capacidad >= nivel;
  return {
    torres, usadas, capacidad, alcanza,
    coste: alcanza ? Math.max(0, nivel - (barata ? 1 : 0)) : null,
    universal, barata,
  };
}

/* ── Disparo de las torres: dos bolas y la nube del impacto ────────────────
   Dos bolas negras de 3×3 círculos salen de las torres que disparan y cruzan
   el tablero hasta el atacante. En cuanto llegan, la nube de la pelea se abre
   encima, el monstruo desaparece debajo y la nube se va con fundido. Va en una
   capa fija sobre la pantalla: el repintado del turno cambia las fichas, y si
   la animación viviera dentro del tablero se cortaría a la mitad. */
function rectDe(el) {
  const r = el?.getBoundingClientRect?.();
  return r && r.width && r.height ? r : null;
}

function dispararConTorres({ sendero, posicion, plan }) {
  const tablero = document.querySelector(".tablero");
  if (!tablero) return;
  const ficha = tablero.querySelector(`.ficha[data-sendero="${sendero}"][data-pos="${posicion}"]`);
  const rFicha = rectDe(ficha);
  if (!rFicha) return;
  const img = ficha.querySelector("img");
  const rImg = rectDe(img) ?? rFicha;
  const centro = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  /* Una bola por torre que dispara; si solo hay una, las dos salen de ella. */
  const torres = (plan?.usadas ?? [])
    .map((t) => rectDe(tablero.querySelector(`[data-pos-torre="${t.pos}"]`)))
    .filter(Boolean);
  /* Disparo lanzado desde la lista de acciones: sin reparto a mano, la bola
     sale de la torre de esa calle y, si no hay, de la primera torre. */
  if (!torres.length) {
    const propia = rectDe(tablero.querySelector(`[data-pos-torre="${sendero}"]`))
      ?? rectDe(tablero.querySelector(".torre[data-pos-torre]"));
    if (propia) torres.push(propia);
  }
  const origenes = (torres.length ? torres : [rFicha]).map(centro);
  const destino = centro(rFicha);
  const ladoBola = Math.max(12, Math.round(rFicha.width * 0.4));

  const capa = document.createElement("div");
  capa.className = "bw-disparo-capa";
  capa.innerHTML = `
    <img class="bw-disparo-fantasma" src="${esc(img?.getAttribute("src") ?? "")}" alt=""
         style="left:${rImg.left}px;top:${rImg.top}px;width:${rImg.width}px;height:${rImg.height}px">
    ${[0, 1].map((k) => {
      const o = origenes[Math.min(k, origenes.length - 1)];
      return `<div class="bw-bola" style="left:${o.x}px;top:${o.y}px;width:${ladoBola}px;height:${ladoBola}px" data-ox="${o.x}" data-oy="${o.y}">${"<i></i>".repeat(9)}</div>`;
    }).join("")}
    <div class="bw-nube-disparo" style="left:${destino.x}px;top:${destino.y}px;width:${Math.round(rFicha.width * 1.9)}px">
      <img src="${BASE_IMG}/nube-combate.png" alt="">
    </div>`;
  document.body.appendChild(capa);
  /* El disparo también es la última jugada del turno muchas veces: se apunta
     cuándo acaba para que el descarte no salga encima de las bolas y la nube. */
  descarteEspera = Math.max(descarteEspera, performance.now() + MS_DISPARO);

  const VUELO = MS_VUELO_DISPARO;
  [...capa.querySelectorAll(".bw-bola")].forEach((bola, k) => {
    const ox = Number(bola.dataset.ox);
    const oy = Number(bola.dataset.oy);
    /* Un poco de arco: van perdiendo altura a mitad de camino. */
    const arco = -Math.min(110, 40 + Math.abs(destino.y - oy) * 0.22);
    bola.animate?.(
      [
        { left: `${ox}px`, top: `${oy}px`, offset: 0 },
        { left: `${(ox + destino.x) / 2}px`, top: `${(oy + destino.y) / 2 + arco}px`, offset: 0.5 },
        { left: `${destino.x}px`, top: `${destino.y}px`, offset: 1 },
      ],
      { duration: VUELO, delay: k * 90, easing: "ease-in", fill: "both" },
    );
  });

  const nube = capa.querySelector(".bw-nube-disparo");
  setTimeout(() => {
    nube?.classList.add("on");
    capa.querySelector(".bw-disparo-fantasma")?.remove();
    capa.querySelectorAll(".bw-bola").forEach((b) => b.remove());
    setTimeout(() => nube?.classList.add("sale"), 560);
    setTimeout(() => capa.remove(), 560 + 440);
  }, VUELO + 100);
}

/* Plantilla común de los modales de monstruo: título en borgoña, ribete de
   piedra arriba y abajo, y el botón gris de casa para cerrar. La usan tanto
   el monstruo de la jaula (mover o lanzar) como el ataque con torres. */
let fondoModalAjustado = false;

/* La textura del modal, a su tamaño real de pantalla. `naturalWidth` viene en
   píxeles físicos; en un móvil con densidad 2 o 3 hay que dividirlo para que
   un píxel de la imagen ocupe un píxel de la pantalla y no el triple. El tope
   de 160 px evita que en pantallas de densidad 1 o 2 la textura se coma el
   modal y se vea como una foto ampliada en vez de un patrón repetido. */
function ajustarFondoModal() {
  if (fondoModalAjustado) return;
  fondoModalAjustado = true;
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const lado = Math.min(img.naturalWidth / dpr, 160);
    document.documentElement.style.setProperty(
      "--bg-modal-size", `${lado}px auto`,
    );
  };
  img.src = `${BASE_IMG}/bg-modal.jpg`;
}

function modalMonstruo({ titulo, html = "", botones = [], clase = "" }) {
  ajustarFondoModal();
  return modal({ titulo, html, botones, clase: `modal-monstruo bw-hoja-modal${clase ? ` ${clase}` : ""}` });
}

function abrirDisparo({ sendero, posicion, nivel }) {
  const yo = jugadoresMesa.find(p => p.id === yoMesa) ?? null;
  const plan = planDisparo(nivel, sendero, yo?.bunker);
  const accion = accionesMesa.find(a => a.tipo === "atacar_monstruo"
    && a.sendero === sendero && a.posicion === posicion) ?? null;
  /* El modal sale siempre, también cuando no se puede disparar: la razón va
     dentro. Solo se puede actuar en tu fase de decretos. */
  const enDecretos = tocaMesa && faseMesa === "acciones";

  const filas = (plan.alcanza ? plan.usadas : plan.torres).map(t => {
    const dano = plan.alcanza ? t.usa : t.tope;
    const nota = t.inhabilitada ? "bloqueada" : t.propia ? "su calle" : t.universal ? "universal" : "otra calle";
    return `<div class="bw-disparo-fila${t.inhabilitada ? " bloqueada" : ""}">
      <span class="bw-disparo-t">Torre ${t.pos} <em>${nota}</em></span>
      <span class="bw-disparo-n">nv ${t.nivel}</span>
      <b class="bw-disparo-d">${dano}</b>
    </div>`;
  }).join("");

  const monedas = plan.coste ?? 0;
  const moneda = monedas === 1 ? "moneda" : "monedas";
  const puedePagar = plan.alcanza && monedas <= energiaMesa;
  const puede = enDecretos && !!accion && puedePagar;

  const nombreFase = {
    lanzar: "la lanzadera",
    descartar: "el descarte",
    carta: "la carta de Destino",
    energia: "repartir monedas",
    avance: "el avance de los monstruos",
  }[faseMesa] ?? "otra fase";

  /* Razón por la que no se puede, en orden: primero si no es tu momento de
     actuar; después, si las torres no llegan o no hay dinero o decretos. */
  let problema = "";
  if (!tocaMesa) {
    problema = "No es tu turno: espera a que te toque para poder disparar.";
  } else if (faseMesa !== "acciones") {
    problema = `Ahora toca ${nombreFase}. Los ataques con torres se hacen en tu fase de decretos.`;
  } else if (!plan.alcanza) {
    problema = `Las torres llegan a ${plan.capacidad} de daño y el monstruo tiene ${nivel}. No puedes matarlo ahora.`;
  } else if (!puedePagar) {
    problema = `Cuesta ${monedas} ${moneda} y te quedan ${energiaMesa}.`;
  } else if (!accion) {
    problema = accionesRestantesMesa <= 0
      ? "No te quedan decretos este turno."
      : "Ese monstruo ya no está ahí.";
  }

  const html = `
    <div class="bw-disparo">
      ${filas || `<div class="bw-disparo-cab">No tienes torres construidas.</div>`}
      <div class="bw-disparo-total"><span>Daño total</span><b>${plan.alcanza ? nivel : plan.capacidad} / ${nivel}</b></div>
      <div class="bw-disparo-coste"><span>Coste</span><b>${plan.alcanza ? `${monedas} ${moneda} + 1 decreto` : "—"}</b></div>
      ${problema ? `<div class="bw-disparo-aviso">${problema}</div>` : ""}
    </div>`;

  /* Mismo panel que torres/jaulas: encima del menú, con el velo detrás y el
     menú visible para poder cambiar de pestaña sin cerrar nada a mano. */
  disparoPanel?.remove();
  const panel = document.createElement("div");
  panel.className = "bw-panel disparo-panel";
  panel.innerHTML = `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Matar monstruo</div>
      <button class="bw-panel-x" type="button" data-cerrar-disparo aria-label="Cerrar">×</button>
    </div>
    ${html}
    ${puede ? `<div class="bw-disparo-botones"><button type="button" class="bw-modal-usar bw-disparo-matar" data-disparo-matar>Matar · ${monedas} ${moneda}</button></div>` : ""}`;
  document.body.appendChild(panel);
  disparoPanel = panel;
  actualizarOverlayPaneles();
  panel.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-cerrar-disparo]")) { cerrarDisparo(); return; }
    if (!ev.target.closest("[data-disparo-matar]")) return;
    if (!accion || !enviarAccion) return;
    /* Fuera paneles y vista abajo: las bolas salen ya con el tablero a la
       vista y se miden antes de mandar la jugada, que el repintado se lleva
       las fichas. */
    await cerrarParaVerEscaleras();
    dispararConTorres({ sendero, posicion, plan });
    const res = await enviarAccion(accion);
    if (res?.error) aviso(res.error, { error: true });
  });
}

/* ── Torre: construir o mejorar, en el mismo panel inferior ───────────────
   Es el mismo panel que «Matar monstruo»: sube desde abajo, sobre el menú y
   con el velo detrás. Se abre desde el hueco de la fortaleza y desde el hueco
   de la pestaña Torres. Sin la línea «Atacante…»: aquí no hay atacante, y el
   monstruo ya se ve en el tablero. */
/* Los niveles de torre se leen en números romanos: I, II y III. */
const ROMANO_TORRE = { 1: "I", 2: "II", 3: "III" };
const torreEnRomano = (n) => ROMANO_TORRE[Number(n)] ?? String(n);

function abrirTorre(posicion) {
  const pos = Number(posicion);
  if (!pos || pos < 1 || pos > 3) return;

  const yo = jugadoresMesa.find((p) => p.id === yoMesa) ?? null;
  const torres = yo?.bunker?.torres ?? [];
  const t = torres[pos - 1] ?? null;
  const nv = Number(t?.nivel) || 0;
  const esNueva = nv <= 0;
  const siguiente = nv + 1;
  const armeria = yo?.bunker?.armeria ?? 0;
  const alTope = !esNueva && nv >= 3;
  const faltaArmeria = !esNueva && !alTope && siguiente > armeria;
  const enDecretos = tocaMesa && faseMesa === "acciones";
  const sinDecretos = accionesRestantesMesa <= 0;
  /* Construir una torre cuesta 1 moneda; subirla de nivel (II y III), 2. */
  const coste = esNueva ? 1 : 2;
  const sinMoneda = energiaMesa < coste;
  const puede = enDecretos && !sinDecretos && !sinMoneda
    && (esNueva || (!alTope && !faltaArmeria));

  let problema = "";
  if (!tocaMesa) {
    problema = "No es tu turno: espera a que te toque.";
  } else if (!enDecretos) {
    problema = "Las torres se construyen en tu fase de decretos.";
  } else if (sinDecretos) {
    problema = "No te quedan decretos este turno.";
  } else if (esNueva && sinMoneda) {
    problema = "Construir una torre cuesta 1 moneda.";
  } else if (alTope) {
    problema = "Ya está en el nivel máximo (III).";
  } else if (faltaArmeria) {
    problema = `Para subir al nivel ${torreEnRomano(siguiente)} necesitas armería ${siguiente} (tienes ${armeria}).`;
  } else if (!esNueva && sinMoneda) {
    problema = "Subir de nivel cuesta 2 monedas.";
  }

  const caminos = ["Camino izquierdo", "Camino central", "Camino derecho"];
  const html = `
    <div class="bw-disparo">
      <div class="bw-disparo-cab">Escalera <b>${pos}</b> · ${caminos[pos - 1]}.</div>
      <div class="bw-disparo-fila">
        <span class="bw-disparo-t">${esNueva ? "Torre sin construir" : "Torre"}</span>
        <span class="bw-disparo-n">${esNueva ? "hueco libre" : `nivel ${torreEnRomano(nv)}`}</span>
        <b class="bw-disparo-d">${esNueva ? "—" : torreEnRomano(nv)}</b>
      </div>
      <div class="bw-disparo-total"><span>Coste</span><b>${coste} ${coste === 1 ? "moneda" : "monedas"} + 1 decreto</b></div>
      ${!esNueva ? `<div class="bw-disparo-coste"><span>Daño</span><b>${nv} en su escalera</b></div>` : ""}
      ${problema ? `<div class="bw-disparo-aviso">${problema}</div>` : ""}
    </div>`;

  /* Mismo panel que el ataque: fijo abajo, encima del menú y con el velo. */
  disparoPanel?.remove();
  const panel = document.createElement("div");
  panel.className = "bw-panel disparo-panel";
  panel.innerHTML = `
    <div class="bw-panel-head">
      <div class="bw-panel-label">${esNueva ? "Construir torre" : `Torre ${torreEnRomano(nv)}`}</div>
      <button class="bw-panel-x" type="button" data-cerrar-torre aria-label="Cerrar">×</button>
    </div>
    ${html}
    ${puede ? `<div class="bw-disparo-botones"><button type="button" class="bw-modal-usar bw-disparo-matar" data-torre-accion>${esNueva ? "Construir" : `Subir a nivel ${torreEnRomano(siguiente)}`} · ${coste} ${coste === 1 ? "moneda" : "monedas"}</button></div>` : ""}`;
  document.body.appendChild(panel);
  disparoPanel = panel;
  actualizarOverlayPaneles();

  panel.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-cerrar-torre]")) { cerrarDisparo(); return; }
    const boton = ev.target.closest("[data-torre-accion]");
    if (!boton || !enviarAccion) return;
    boton.disabled = true;
    await cerrarParaVerEscaleras();
    const res = await enviarAccion(esNueva
      ? { tipo: "construir_torreta", posicion: pos }
      : { tipo: "evolucionar_torreta", posicion: pos });
    if (res?.error) aviso(res.error, { error: true });
  });
}

/* ── Modal de lanzadera: elegir rival y camino ───────────────────────────── */

/* Abre el modal de lanzadera si de verdad toca (fase, turno y opciones); si ya
   está abierto, lo sincroniza en vez de cerrarlo y volver a abrirlo. El
   repintado lo llama a menudo, así que devuelve false sin tocar nada cuando no
   hay nada que preguntar o hay otro modal encima. */
let lanzarUi = null;

function abrirLanzarSiToca() {
  const ops = accionesMesa.filter(a => a.tipo === "lanzar");
  /* Si la hoja sigue abierta, se queda y se actualiza con lo que sigue siendo
     legal: cerrarla y volver a abrirla entre lanzadera y lanzadera era el
     parpadeo que se veía al mandar dos monstruos. */
  if (lanzarUi) {
    if (!document.getElementById("bw-modal-lanzar")) lanzarUi = null;
    else {
      if (faseMesa !== "lanzar" || !tocaMesa) lanzarUi.cerrar();
      else lanzarUi.sincronizar(ops);
      return false;
    }
  }
  if (faseMesa !== "lanzar" || !tocaMesa || !ops.length) return false;
  if (document.querySelector(".bw-modal-fondo") || document.getElementById("bw-modal-lanzar")) return false;

  /* La fase abre directamente la elección de rival: sin cartel intermedio. */
  const capa = document.getElementById("capa");
  if (capa && !capa.hidden) return false;
  abrirLanzar(ops);
  return true;
}

function abrirLanzar(ops) {
  document.getElementById("bw-modal-lanzar")?.remove();

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-lanzar";
  fondo.className = "bw-modal-fondo";
  document.body.appendChild(fondo);
  document.body.classList.add("bw-lanzando");

  let soltarGlobal = null;
  let enviando = false;
  const cerrar = () => {
    lanzarUi = null;
    soltarGlobal?.();
    fondo.remove();
    document.body.classList.remove("bw-lanzando");
  };
  const noLanzar = accionesMesa.find(a => a.tipo === "no_lanzar") ?? null;

  const enviar = async (accion, boton) => {
    if (!accion || !enviarAccion || enviando) return;
    if (boton) boton.disabled = true;
    /* El nivel se apunta antes de esperar: el repintado que llega con el estado
       nuevo mete la reserva de la cola en el hueco que deja la lanzadera, así
       que después ya no está el monstruo que acabas de mandar. */
    const nvLanzado = lanzaderasModal[accion.lanzadera]?.nivel ?? null;
    enviando = true;
    fondo.classList.add("enviando");
    const r = await enviarAccion(accion);
    enviando = false;
    fondo.classList.remove("enviando");
    if (r?.error) {
      aviso(r.error, { error: true });
      if (boton) boton.disabled = false;
      return;
    }
    if (accion.tipo !== "lanzar") { rivalLanzarElegido = null; cerrar(); return; }
    /* La hoja no se cierra: se queda con lo que la mesa dice ahora mismo, que
       ya no incluye la lanzadera que acaba de salir. */
    lanzaderasModal = lanzaderasMesa;
    /* Lo que vale ahora es lo legal en la mesa: si has llenado el único hueco
       que quedaba, la otra lanzadera se queda sin destino y la hoja se cierra. */
    opsModal = (accionesMesa ?? []).filter(a => a.tipo === "lanzar"
      && a.lanzadera !== accion.lanzadera
      && !(a.rivalId === accion.rivalId && a.sendero === accion.sendero));
    /* La que acaba de salir se queda a la vista en la calle donde la has
       dejado: con la segunda en la mano se ve dónde fue la primera. */
    marcarLanzado(accion.rivalId, accion.sendero, nvLanzado);
    actualizarChips();
  };

  /* Monstruos ya lanzados desde esta hoja, por rival y calle: se vuelven a
     pintar en la entrada de su calle cada vez que la hoja se monta de nuevo,
     para no perder de vista dónde has dejado los que ya has mandado. */
  const lanzados = new Map();
  const pintarLanzados = (rivalId) => {
    if (rivalId == null) return;
    for (const [clave, nv] of lanzados) {
      const [de, calle] = clave.split(":");
      if (de !== String(rivalId)) continue;
      const hueco = fondo.querySelector(
        `.bw-torre[data-calle="${calle}"] .bw-torre-slots .bw-torre-slot:last-child`);
      if (!hueco || hueco.classList.contains("atacante")) continue;
      hueco.className = "bw-box-slot lleno bw-torre-slot atacante";
      hueco.title = `Atacante nivel ${nv} en el peldaño 1`;
      hueco.innerHTML = `<img src="${imgMonstruo(nv, true)}" class="bw-box-img" alt="monstruo">`
        + `<b class="bw-box-nv">${nv}</b><span class="bw-torre-step">1</span>`;
    }
  };
  const marcarLanzado = (rivalId, calle, nv) => {
    if (!nv) return;
    lanzados.set(`${rivalId}:${Number(calle)}`, nv);
    pintarLanzados(rivalId);
  };

  /* Lo que la hoja puede ofrecer ahora mismo. Va aparte porque la hoja ya no
     se cierra entre lanzadera y lanzadera. */
  let opsModal = ops;
  let lanzaderasModal = lanzaderasMesa;
  let firmaVista = "";
  /* La firma es solo lo que se puede lanzar, no las lanzaderas: al lanzar, la
     reserva de la cola entra en el hueco libre y cambia la lista de monstruos
     del mismo índice aunque para el jugador no cambie nada. Contándola, la hoja
     se reconstruía entera después de cada lanzamiento (el fogonazo). */
  const firmaDe = () => opsModal.filter(a => a.tipo === "lanzar")
    .map(a => `${a.lanzadera}.${a.rivalId}.${a.sendero}`).join("|");
  const quedanLanzamientos = () => opsModal.filter(a => a.tipo === "lanzar");

  /* Repinta el paso en el que está la hoja con lo que queda. */
  const repintarPaso = () => {
    firmaVista = firmaDe();
    arrastre?.fantasma?.remove();
    arrastre = null;
    apagarCalles();
    if (!quedanLanzamientos().length) { cerrar(); return; }
    /* La hoja se repinta en su sitio: se le devuelve el scroll para que el
       repintado no la suba de golpe. */
    const scrollHoja = fondo.scrollTop;
    if (rivalActual && quedanLanzamientos().some(a => a.rivalId === rivalActual)) {
      pasoCaminos(rivalActual);
    } else {
      rivalActual = null;
      pasoRivales();
    }
    fondo.scrollTop = scrollHoja;
  };

  /* Con cada repintado de la mesa: si lo legal ha cambiado (una calle ocupada
     por otro, por ejemplo), la hoja se actualiza sin cerrarse. */
  const sincronizar = (nuevas) => {
    opsModal = nuevas ?? opsModal;
    lanzaderasModal = lanzaderasMesa;
    if (enviando || firmaDe() === firmaVista) return;
    repintarPaso();
  };

  /* Tras lanzar solo cambia la fila de cuadros: repintar la hoja entera hacía
     que se vieran desaparecer y volver el modal y la imagen de debajo. */
  const actualizarChips = () => {
    firmaVista = firmaDe();
    apagarCalles();
    if (!quedanLanzamientos().length) { cerrar(); return; }
    const fila = fondo.querySelector(".bw-lz-mis");
    if (!fila || rivalActual == null) { repintarPaso(); return; }
    const indices = [...new Set(opsModal.filter(a => a.rivalId === rivalActual).map(a => a.lanzadera))].sort();
    if (!indices.length) { rivalActual = null; pasoRivales(); return; }
    fila.classList.toggle("sola", indices.length === 1);
    fila.innerHTML = indices.map(chipLanzadera).join("");
  };

  /* Las lanzaderas, abajo y fuera de las calles: el mismo cuadro de la ficha,
     con el monstruo y su círculo de nivel. Se arrastran a la calle donde
     quieras soltarlas. */
  const chipLanzadera = (i) => {
    const mon = lanzaderasModal[i];
    if (!mon?.nivel) return "";
    const dos = lanzaderasModal.filter(Boolean).length > 1;
    const titulo = `${mon.vuela ? "Aves de bruma" : `Monstruo ${mon.nivel}`} de la lanzadera ${i + 1}: arrástralo a una calle`;
    const innerImg = mon.vuela
      ? `<img src="${imgMonstruo("volador", false, true)}" alt=""><b class="bw-lz-mia-nv">✦</b>`
      : `<img src="${imgMonstruo(mon.nivel, false, true)}" alt=""><b class="bw-lz-mia-nv">${mon.nivel}</b>`;
    return `<div class="bw-lz-mia" data-lanzadera="${i}" role="button" tabindex="0"
                 aria-label="${esc(titulo)}" title="${esc(titulo)}"` +
      `>${innerImg}${dos ? `<span class="bw-lz-mia-l">L${i + 1}</span>` : ""}</div>`;
  };

  /* Arrastrar una lanzadera a una calle, o tocarla y tocar la calle. El
     fantasma sigue al dedo y las calles donde se puede soltar se encienden. */
  let rivalActual = null;
  let elegida = null;
  let arrastre = null;
  const opDe = (lanzadera, calle) => opsModal.find(a => a.lanzadera === lanzadera
    && a.rivalId === rivalActual && a.sendero === Number(calle)) ?? null;
  const calles = () => [...fondo.querySelectorAll(".bw-torre[data-calle]")];
  const calleBajo = (x, y) => document.elementFromPoint(x, y)?.closest?.(".bw-torre[data-calle]") ?? null;
  const encenderCalles = (lanzadera) => {
    for (const t of calles()) {
      t.classList.toggle("bw-calle-suelta", lanzadera != null && !!opDe(lanzadera, t.dataset.calle));
      t.classList.remove("bw-calle-encima");
    }
  };
  const apagarCalles = () => {
    for (const t of calles()) t.classList.remove("bw-calle-suelta", "bw-calle-encima");
    for (const c of fondo.querySelectorAll(".bw-lz-mia")) c.classList.remove("bw-lz-mia-elegida");
    elegida = null;
  };

  fondo.addEventListener("pointerdown", (ev) => {
    if (enviando) return;
    const chip = ev.target.closest?.(".bw-lz-mia");
    if (!chip) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    ev.preventDefault();
    arrastre = {
      idx: Number(chip.dataset.lanzadera), id: ev.pointerId,
      x0: ev.clientX, y0: ev.clientY, movido: false, fantasma: null, origen: chip,
    };
    try { chip.setPointerCapture(ev.pointerId); } catch { /* sin captura vale igual */ }
    encenderCalles(arrastre.idx);
  });

  const alMover = (ev) => {
    if (!arrastre || ev.pointerId !== arrastre.id) return;
    /* El fantasma no aparece hasta que el dedo se mueve: un toque normal no
       tiene por qué dejar un cuadro flotando. */
    if (!arrastre.movido) {
      if (Math.hypot(ev.clientX - arrastre.x0, ev.clientY - arrastre.y0) < 8) return;
      arrastre.movido = true;
      const r = arrastre.origen.getBoundingClientRect();
      const fantasma = arrastre.origen.cloneNode(true);
      fantasma.classList.add("bw-lz-fantasma");
      fantasma.style.width = `${r.width}px`;
      fantasma.style.height = `${r.height}px`;
      document.body.appendChild(fantasma);
      arrastre.fantasma = fantasma;
    }
    const f = arrastre.fantasma;
    f.style.left = `${ev.clientX - f.offsetWidth / 2}px`;
    f.style.top = `${ev.clientY - f.offsetHeight / 2}px`;
    const t = calleBajo(ev.clientX, ev.clientY);
    for (const c of calles()) {
      c.classList.toggle("bw-calle-encima", c === t && c.classList.contains("bw-calle-suelta"));
    }
  };

  const alSoltar = (ev) => {
    if (!arrastre || ev.pointerId !== arrastre.id) return;
    const { idx, movido, fantasma, origen } = arrastre;
    arrastre = null;
    fantasma?.remove();
    const t = calleBajo(ev.clientX, ev.clientY);
    const op = movido && t ? opDe(idx, t.dataset.calle) : null;
    if (op) { enviar(op); return; }
    if (movido) {
      apagarCalles();
      aviso("Esa calle no admite monstruos: su entrada ya está ocupada.", { error: true });
      return;
    }
    /* Un toque sin arrastrar: se marca esa lanzadera para elegir la calle. */
    const yaEstaba = elegida === idx;
    apagarCalles();
    if (yaEstaba) return;
    elegida = idx;
    origen.classList.add("bw-lz-mia-elegida");
    encenderCalles(idx);
  };

  const alCancelar = () => {
    arrastre?.fantasma?.remove();
    arrastre = null;
    apagarCalles();
  };

  /* En window: si el dedo se suelta fuera de la hoja, el arrastre termina
     igual. `cerrar` se lleva los oyentes, así que no sobreviven al modal. */
  window.addEventListener("pointermove", alMover);
  window.addEventListener("pointerup", alSoltar);
  window.addEventListener("pointercancel", alCancelar);
  soltarGlobal = () => {
    window.removeEventListener("pointermove", alMover);
    window.removeEventListener("pointerup", alSoltar);
    window.removeEventListener("pointercancel", alCancelar);
    arrastre?.fantasma?.remove();
    arrastre = null;
  };

  /* Segundo toque del modo sin arrastre: la calle elegida. */
  fondo.addEventListener("click", (ev) => {
    if (enviando) return;
    const t = ev.target.closest?.(".bw-torre[data-calle]");
    if (!t || elegida == null) return;
    const op = opDe(elegida, t.dataset.calle);
    if (op) enviar(op);
  });

  /* Cada calle enseña cinco huecos: arriba la torre y debajo sus cuatro
     peldaños. En la lista de rivales es solo el resumen; en el detalle, la
     calle entera es la zona donde se suelta la lanzadera. */
  const callesRival = (r, { bloqueado = false } = {}) => {
    const torres = r.bunker?.torres ?? [];
    const senderos = r.senderos ?? [];

    return `<span class="bw-lz-calles">${[0, 1, 2].map(i => {
      const nTorre = Number(torres[i]?.nivel) || 0;
      const fichas = [3, 2, 1, 0].map(paso => {
        const f = senderos[i]?.posiciones?.[paso]
          ?? (senderos[i]?.monstruos ?? []).find(m => m.pos === paso)
          ?? null;
        /* El peldaño de entrada (el de abajo del todo) se marca en rojo si el
           rival no tiene ninguna calle legal para recibir monstruos. */
        const entradaCerrada = bloqueado && paso === 0 ? "lz-sin-envio" : "";
        if (!f) return cuadroLz(0, "bz-vacio", `Peldaño ${paso + 1}: libre`, entradaCerrada);
        const n = f.nivel ?? f.fuerza ?? "?";
        const atacante = f.tipo === "atacante";
        return cuadroLz(n, atacante ? "bz-at" : "bz-def",
          `${atacante ? "Atacante" : "Defensor"} nivel ${n} en el peldaño ${paso + 1}`, entradaCerrada);
      }).join("");

      return `<span class="bw-lz-calle">
        ${cuadroLz(nTorre, "bz-torre", `Torre ${i + 1}: ${nTorre ? `nivel ${nTorre}` : "vacía"}`)}
        ${fichas}
      </span>`;
    }).join("")}</span>`;
  };

  /* El detalle de lanzamiento es el mismo bloque grande que el panel de
     Torres, pero con el rival como protagonista: torre + cuatro peldaños por
     calle, y las lanzaderas se sueltan sobre la calle que quieras. */
  const tableroRival = (id) => {
    const r = jugadoresMesa.find(x => x.id === id) ?? {};
    return `<div class="bw-lz-torres">${bloqueTorres(r.bunker?.torres ?? [], r.senderos ?? [], {
      interactivo: false,
    })}</div>`;
  };

  const listaRivales = () => (jugadoresMesa ?? [])
    .filter(p => p.id !== yoMesa && !aliadosMesa.some(a => a.id === p.id))
    .map(r => {
      const id = r.id;
      const suyas = opsModal.filter(a => a.rivalId === id);
      const bloqueado = suyas.length === 0;
      const vida = Math.max(0, 20 - (r.puntosMonsters ?? 0));
      /* Cuántos atacantes lleva encima: es lo que explica por qué sus entradas
         están cerradas y lo que no se veía en el resumen. */
      const atacantes = (r.senderos ?? []).reduce((s, sd) =>
        s + (sd.posiciones ?? []).filter(f => f?.tipo === "atacante").length, 0);
      return `
        <button type="button" class="bw-lz-rival${bloqueado ? " bloqueado" : ""}" data-rival="${esc(id)}"
                title="${bloqueado ? "No puedes lanzar a " : "Lanzar a "}${esc(nombreMesa(r))}"${bloqueado ? " disabled" : ""}>
          <span class="bw-lz-rival-cab">
            <b class="bw-lz-rival-nombre">${esc(nombreMesa(r))}</b>
            <span class="bw-lz-rival-vida">❤ ${vida} / 20</span>
          </span>
          ${callesRival(r, { bloqueado })}
          <span class="bw-lz-rival-atac">${atacantes} atacante${atacantes === 1 ? "" : "s"} en sus caminos</span>
        </button>`;
    }).join("");

  const pasoRivales = () => {
    rivalLanzarElegido = null;
    apagarCalles();
    fondo.classList.remove("lz-detalle");
    fondo.classList.add("lz-inicial");
    fondo.innerHTML = `
      <div class="bw-lz bw-lz-hoja">
        <div class="bw-lz-head">
          <div class="bw-lz-tit">Fase de lanzaderas</div>
        </div>
        <p class="bw-lz-sub">Elige una fortaleza enemiga para lanzar tus monstruos.</p>
        <div class="bw-lz-lista">${listaRivales()}</div>
        <div class="bw-lz-pie${noLanzar ? " con-linea" : ""}">
          ${noLanzar ? `<button type="button" class="bw-modal-usar bw-lz-nolanzar">No lanzar</button>` : ""}
        </div>
      </div>`;
    for (const b of fondo.querySelectorAll(".bw-lz-rival")) {
      b.addEventListener("click", () => pasoCaminos(b.dataset.rival));
    }
    fondo.querySelector(".bw-lz-nolanzar")?.addEventListener("click", (ev) => enviar(noLanzar, ev.currentTarget));
  };

  const pasoCaminos = (rivalId) => {
    rivalLanzarElegido = rivalId;
    rivalActual = rivalId;
    elegida = null;
    const rival = jugadoresMesa.find(x => x.id === rivalId) ?? {};
    const vida = Math.max(0, 20 - (rival.puntosMonsters ?? 0));
    /* Solo las lanzaderas que de verdad pueden ir a esta fortaleza. */
    const lanzaderasDe = [...new Set(opsModal.filter(a => a.rivalId === rivalId).map(a => a.lanzadera))].sort();
    /* El detalle sale desde abajo, con el mismo ribete de piedra que el panel
       de Torres: no es otro modal centrado. */
    fondo.classList.remove("lz-inicial");
    fondo.classList.add("lz-detalle");
    fondo.innerHTML = `
      <div class="bw-lz bw-lz-hoja">
        <div class="bw-lz-head bw-lz-cab-detalle">
          <b class="bw-lz-tit">Fortaleza de ${esc(nombreMesa(rival))}</b>
          <span class="bw-lz-vida">❤ ${vida} / 20</span>
        </div>
        <div class="bw-lz-tablero">${tableroRival(rivalId)}</div>
        <div class="bw-lz-mis${lanzaderasDe.length === 1 ? " sola" : ""}">${lanzaderasDe.map(chipLanzadera).join("")}</div>
        <p class="bw-lz-ayuda">Arrastra un monstruo a una calle para lanzarlo. Si prefieres, tócalo y luego toca la calle.</p>
        <div class="bw-lz-pie">
          <button type="button" class="bw-modal-usar bw-lz-atras">Atrás</button>
        </div>
      </div>`;
    fondo.querySelector(".bw-lz-atras").addEventListener("click", pasoRivales);
    pintarLanzados(rivalId);
  };

  const rivalInicial = rivalLanzarElegido
    && ops.some(a => a.rivalId === rivalLanzarElegido)
    && !aliadosMesa.some(a => a.id === rivalLanzarElegido)
    ? rivalLanzarElegido
    : null;
  if (rivalInicial) pasoCaminos(rivalInicial);
  else pasoRivales();
  firmaVista = firmaDe();
  lanzarUi = { sincronizar, cerrar };
}

/* ── Modal de descarte: la mano en 2×2, se marcan y se tiran ─────────────── */

/* El descarte sale cuando la ficha de la última jugada ha terminado de
   moverse: antes el modal se abría de golpe y no se veía la animación. */
let descarteEspera = 0;
let relojDescarte = null;
function programarDescarte() {
  if (document.getElementById("bw-modal-descartar")) return;
  const falta = Math.max(0, descarteEspera - performance.now());
  clearTimeout(relojDescarte);
  if (!falta) { abrirDescarte(); return; }
  relojDescarte = setTimeout(() => {
    if (faseMesa === "descartar" && tocaMesa && !document.getElementById("bw-modal-descartar")) abrirDescarte();
  }, falta);
}

function abrirDescarte() {
  registro("descarte · mano", (privadaMesa?.mano ?? []).length, "cartas");
  document.getElementById("bw-modal-descartar")?.remove();
  /* La mano manda: nada de lo que hubiera abierto debajo debe quedarse. */
  cerrarDebajoDelDescarte();
  const mano = privadaMesa?.mano ?? [];
  if (!mano.length) {
    /* Sin mano no hay nada que elegir: se cierra la fase y se roba. */
    enviarAccion?.({ tipo: "descartar", cartaIds: [] });
    return;
  }

  /* Si no se jugó ninguna carta, descartar una es obligatorio. */
  const maxDesc = 2;
  const puedeNo = accionesMesa.some(a => a.tipo === "descartar" && !(a.cartaIds?.length));

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-descartar";
  fondo.className = "bw-modal-fondo";

  /* Las mismas cartas de papel del modal de una carta, cuatro y algo menores. */
  const celda = (c) => {
    const t = defsCarta(c);
    const coste = c.coste ?? t.costo ?? 0;
    return `
      <button type="button" class="bw-desc-celda" data-uid="${esc(c.uid ?? "")}">
        <div class="bw-carta-grande">
          <span class="bw-carta-coste-grande">${coste}</span>
          <div class="bw-carta-grande-img"><img src="${esc(imgCarta(c.tipo, c.nivel))}" alt=""></div>
          <div class="bw-carta-grande-texto">
            <div class="bw-carta-grande-titulo">${esc(t.label)}</div>
            <p class="bw-carta-grande-desc">${conNegritas(c.descripcion)}</p>
          </div>
        </div>
      </button>`;
  };

  fondo.innerHTML = `
    <div class="bw-modal bw-desc-modal" role="dialog" aria-modal="true" aria-label="Descartar cartas">
      <div class="bw-desc-tit">Descartar cartas</div>
      <div class="bw-desc-grid">${mano.map(celda).join("")}</div>
      <p class="bw-desc-nota">${puedeNo ? "" : "No has usado cartas este turno: debes descartar 1."}</p>
      <div class="bw-modal-acciones">
        <button type="button" class="bw-modal-usar bw-desc-ok" disabled>Descartar</button>
        ${puedeNo ? `<button type="button" class="bw-modal-usar bw-desc-no">No descartar</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const ok = fondo.querySelector(".bw-desc-ok");
  const nota = fondo.querySelector(".bw-desc-nota");
  const marcar = () => {
    const n = fondo.querySelectorAll(".bw-desc-celda.sel").length;
    ok.disabled = n === 0;
    ok.textContent = n ? `Descartar ${n}` : "Descartar";
    nota.textContent = n === maxDesc ? "Ya tienes las dos marcadas: quita una para cambiar." : "";
  };

  for (const b of fondo.querySelectorAll(".bw-desc-celda")) {
    b.addEventListener("click", () => {
      if (!b.classList.contains("sel") && fondo.querySelectorAll(".bw-desc-celda.sel").length >= maxDesc) return;
      b.classList.toggle("sel");
      marcar();
    });
  }

  const enviar = async (cartaIds, boton) => {
    if (!enviarAccion) return;
    if (boton) boton.disabled = true;
    const clave = [...cartaIds].sort().join(",");
    const op = accionesMesa.find(a => a.tipo === "descartar"
      && [...(a.cartaIds ?? [])].sort().join(",") === clave);
    /* Se cierra antes de enviar: si el turno sigue en descartar, se reabre. */
    fondo.remove();
    const r = await enviarAccion(op ?? { tipo: "descartar", cartaIds });
    if (r?.error) aviso(r.error, { error: true });
  };

  ok.addEventListener("click", () => {
    const ids = [...fondo.querySelectorAll(".bw-desc-celda.sel")].map(el => el.dataset.uid);
    if (ids.length) enviar(ids, ok);
  });
  fondo.querySelector(".bw-desc-no")?.addEventListener("click", (ev) => enviar([], ev.currentTarget));
  /* Sin X: se sale con «Descartar» o con «No descartar». */
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo && puedeNo) enviar([]); });
}

/* ── Modal de la carta de Destino del turno ───────────────────────────────── */

/* La carta ya leída se apunta en el navegador, no solo en memoria: si la app se
   recarga (o el móvil se la come en segundo plano) la carta del turno no vuelve
   a saltar, que era lo que pasaba al repintar o al volver a abrir. */
const LS_DESTINO = "bw-destino-visto";
const leerDestinoVisto = () => { try { return localStorage.getItem(LS_DESTINO); } catch { return null; } };
let destinoVisto = leerDestinoVisto();

function marcarDestinoVisto(clave) {
  destinoVisto = clave;
  try { localStorage.setItem(LS_DESTINO, clave); } catch { /* sin almacenamiento */ }
}

function claveDestino(d) {
  return [d?.luna, d?.jugadorId, d?.tipo, d?.nivel, d?.cantidad].join("|");
}

/* ── Lo que lee el jugador en la carta de Destino ──────────────────────────
   Dos capas: el nombre y el relato con ambientación (lo que se ve en la
   carta) y, debajo en pequeño, la regla exacta (textoDestino). */
const BESTIARIO = { 1: "rastreador", 2: "carroñero", 3: "yeti", 5: "coloso de hielo", 7: "devorador de cumbres", volador: "aves de bruma" };
const BESTIARIO_PL = { 1: "rastreadores", 2: "carroñeros", 3: "yetis", 5: "colosos de hielo", 7: "devoradores de cumbres", volador: "aves de bruma" };

/* A la fortaleza se sube: tres escaleras, la de la izquierda, la central y la
   de la derecha. El camino 1 es el de la izquierda. */
const ESCALERAS = { 1: "de la izquierda", 2: "central", 3: "de la derecha" };
const escaleraDe = (i) => ESCALERAS[i] ?? "central";


function nombreMonstruo(n) { return BESTIARIO[n] ?? `monstruo de nivel ${n}`; }
function pluralMonstruo(n) { return BESTIARIO_PL[n] ?? `monstruos de nivel ${n}`; }

function tituloDestino(d) {
  if (d.titulo) return d.titulo;
  switch (d.tipo) {
    case "amenaza":           return "Avistamiento";
    case "amenaza_triple":    return "La horda avanza";
    case "amenaza_doble":     return "Dos sombras en la nieve";
    case "amenaza_rival":     return "Nadie queda a salvo";
    case "calma":             return "La montaña calla";
    case "aniquilar_entrada": return "El viento purga";
    case "aniquilar_nivel":   return "Los débiles caen";
    case "matar_mayor":       return "Los más fuertes";
    case "avanzar_extra":     return "El paso se acelera";
    case "miedo":             return "Miedo";
    case "convertir_aliado":  return "Traición";
    case "desercion":         return "Deserción";
    case "subir_monstruos":   return "Ascenso";
    case "bajar_monstruos":   return "Degradación";
    case "colocar_monstruos": return "Los criaderos despiertan";
    case "carta_roja":        return "¡Luna roja!";
    default:                  return String(d.tipo ?? "Carta de Destino");
  }
}

/* Devuelve HTML ya escapado: el nombre del monstruo va en negrita */
function relatoDestino(d) {
  const n = d.nivelReal ?? d.nivel ?? 1;
  const escalera = escaleraDe(Array.isArray(d.prio) ? d.prio[0] : 1);
  const cant = d.cantidad ?? 3;
  const uno = `<strong>${esc(nombreMonstruo(n))}</strong>`;
  const varios = `<strong>${esc(pluralMonstruo(n))}</strong>`;
  const E = esc(escalera);
  if (d.descripcion) return esc(String(d.descripcion));
  switch (d.tipo) {
    case "amenaza":
      return `Un ${uno} acaba de ser avistado desde la fortaleza: sube por la escalera ${E}.`;
    case "amenaza_triple":
      return `Tres ${varios} salen de la niebla, uno por cada escalera.`;
    case "amenaza_doble":
      return `Dos ${varios} se acercan por dos de tus escaleras.`;
    case "amenaza_rival":
      return `Un ${uno} aparece en una escalera de cada fortaleza.`;
    case "calma":
      return "No hay monstruos nuevos en el horizonte: la montaña calla.";
    case "aniquilar_entrada":
      return "Una ventisca barre la entrada: los atacantes que esperaban abajo desaparecen.";
    case "aniquilar_nivel":
      return "Los monstruos de nivel 3 o menos de todos los caminos son arrastrados por la nieve.";
    case "matar_mayor":
      return "Los monstruos de mayor nivel de los caminos caen fulminados.";
    case "avanzar_extra":
      return "Los atacantes de tus escaleras redoblan el paso: suben un peldaño más.";
    case "miedo":
      return "Un rugido en la montaña hace retroceder a todos los atacantes de la mesa.";
    case "convertir_aliado":
      return "Un atacante de nivel 5 o menos despierta leal: cambia de bando y defiende tu fortaleza.";
    case "desercion":
      return "Uno de tus defensores se vuelve contra ti: abandona su puesto y ataca tu búnker.";
    case "subir_monstruos":
      return "Tus monstruos de nivel 5 o menos suben de rango bajo la bendición.";
    case "bajar_monstruos":
      return "Los monstruos de nivel 2 o más pierden su rango: la montaña los humilla.";
    case "colocar_monstruos":
      return `Los criaderos han parido nuevas bestias: <strong>${cant} ${esc(pluralMonstruo(n))}</strong> aparecen en tus jaulas, listas para salir a defenderte.`;
    case "carta_roja":
      return "La luna se tiñe de rojo: desde ahora los monstruos llegan con su nivel real.";
    default:
      return esc(textoDestino(d));
  }
}

function imgDestino(d) {
  const n = d.nivelReal ?? d.nivel ?? 1;
  const esVolador = n === "volador";
  const nv = esVolador ? 1 : (n >= 5 ? 3 : n);
  const imgMon = esVolador ? "volador" : `monstruo-nv${nv}`;
  const mapa = {
    amenaza: imgMon,
    amenaza_triple: imgMon,
    amenaza_doble: imgMon,
    amenaza_rival: imgMon,
    amenaza_mixta: imgMon,
    colocar_monstruos: imgMon,
    calma: "defensa",
    buscar_bunker: "recursos",
    aniquilar_entrada: "ataque",
    aniquilar_nivel: "ataque",
    matar_mayor: "ataque",
    avanzar_extra: "avanzar",
    miedo: "retirar",
    convertir_aliado: "defensa",
    desercion: "ataque",
    subir_monstruos: "monstruo-nv3",
    bajar_monstruos: "monstruo-nv1",
    ventisca: "ataque",
    desprendimiento: "ataque",
    carta_roja: "vida",
  };
  /* Versión azul del dibujo, ya recortada sin fondo blanco: así se funde con
     el papel con el multiply sin dejar el recuadro del fondo. */
  return `${BASE_IMG}/cartas/azul/${mapa[d.tipo] ?? "monstruo-nv1"}.png`;
}

function abrirDestino(d, { alCerrar } = {}) {
  document.getElementById("bw-modal-destino")?.remove();
  const fondo = document.createElement("div");
  fondo.id = "bw-modal-destino";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Carta de Destino">
      <div class="bw-carta-grande bw-destino-grande">
        <div class="bw-carta-grande-img"><img src="${esc(imgDestino(d))}" alt=""></div>
        <div class="bw-destino-tag bw-destino-etiqueta">Carta de Destino</div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(tituloDestino(d))}</div>
          <p class="bw-carta-grande-desc">${relatoDestino(d)}</p>
        </div>
      </div>
      <div class="bw-modal-acciones"><button type="button" class="bw-modal-usar">Entendido</button></div>
    </div>`;
  document.body.appendChild(fondo);

  /* Sin X y sin cerrar tocando el fondo: de aquí solo se sale con «Entendido»,
     para que la carta del turno no se quede sin leer. Al cerrar se avisa, que
     es cuando toca bajar al tablero y soltar las animaciones. */
  fondo.querySelector(".bw-modal-usar").addEventListener("click", () => {
    fondo.remove();
    alCerrar?.();
  });
}

/* ── Mi búnker: escena completa del demo ──────────────────────────────────── */

/* Máximos de producción con todo puesto: 3 monedas y 2 monjes de base, más
   1+2+3+4 monedas y 0+1+1+2 decretos de las cuatro cartas de recursos, más la
   prima de una «Subir recursos». */
const MAX_MONEDAS = 14;
const MAX_MONJES  = 7;

/* Totales del turno, igual que el motor: 3 monedas y 2 monjes de base, más lo
   que sume cada carta de recursos, más la prima de «Subir recursos». */
function totalesBunker(bunker) {
  const rec = bunker?.recursos ?? [];
  const monedasCartas = rec.reduce((s, c) =>
    s + (c.nivel >= 4 ? 4 : c.nivel >= 3 ? 3 : c.nivel >= 2 ? 2 : 1), 0);
  const monjesCartas = rec.reduce((s, c) =>
    s + (c.nivel >= 4 ? 2 : c.nivel >= 2 ? 1 : 0), 0);
  return {
    monedas: 3 + monedasCartas + (bunker?.extra?.monedas ?? 0),
    monjes: 2 + monjesCartas + (bunker?.extra?.monjes ?? 0),
    monedasCartas,
    monjesCartas,
  };
}

/* ── Geometría del tablero ──────────────────────────────────────────────────
   Posiciones exactas del demo (% del tablero). Viven fuera del pintado porque
   la llegada de los monstruos enviados también las necesita: se les hace nacer
   en la casilla virtual de entrada antes de su primer avance. */
const LOSAS = [
  [{l:"24.09",t:"77.4"},{l:"24.25",t:"64.6"},{l:"24.5",t:"52.9"},{l:"25.16",t:"41.5"},{l:"26.55",t:"33.66",base:true}],
  [{l:"50.02",t:"77.4"},{l:"49.61",t:"64.6"},{l:"49.2",t:"52.9"},{l:"49.2",t:"41.5"},{l:"49.26",t:"33.66",base:true}],
  [{l:"78.15",t:"77.4"},{l:"76.09",t:"64.6"},{l:"75.67",t:"52.9"},{l:"73.2",t:"41.5"},{l:"74.13",t:"33.66",base:true}],
];

/* Casilla virtual de entrada, una por escalera: la que sale de prolongar la
   recta que forman las dos primeras losas hacia abajo. No existe en el
   tablero, solo sirve para dibujar al monstruo naciendo por debajo y verle
   subir hasta su casilla cuando entra. */
const ENTRADA = LOSAS.map(([a, b]) => ({
  l: (2 * Number(a.l) - Number(b.l)).toFixed(2),
  t: (2 * Number(a.t) - Number(b.t)).toFixed(2),
}));

function pintarMiBunker(j, priv, fase, opciones = {}) {
  /* En la visita a otra fortaleza las monedas y los decretos son privados:
     se pasan como null y se pintan «—». */
  const energia    = priv && "energia" in priv ? priv.energia : 0;
  const mano       = priv?.mano ?? [];
  const descartando = fase === "descartar" && !!priv?.teToca;
  const arm  = j.bunker?.armeria     ?? 0;
  const lab  = j.bunker?.laboratorio ?? 0;
  const cien = (j.bunker?.ciencia ?? []).length;
  const box  = priv?.box ?? [];
  privadaMesa = priv ?? null;
  avisarLanzaderaSinHueco(priv);
  const lanzaderas = priv?.lanzaderas ?? [null, null];
  const colaLanzaderas = priv?.colaLanzaderas ?? [];
  /* Las entradas en el búnker las manda el motor y se animan al final del
     pintado, con la nube de la pelea en la puerta. */
  entradasPendientes = [];
  aniquiladasPendientes = [];
  const s    = j?.senderos ?? [{}, {}, {}];
  const torres = j?.bunker?.torres ?? [null, null, null];
  /* Las dos cifras de la fortaleza son lo que te queda AHORA, no la producción
     del turno (esa ya va en el resumen de arriba, «N por luna nueva»): así
     bajan al jugar una carta, crear un monstruo o disparar una torre. */
  const decretos   = priv && "accionesRestantes" in priv ? priv.accionesRestantes : 0;
  const quedan = {
    monedas:  energia,
    decretos,
  };

  /* Puntos indicadores de nivel (dots) */
  const dots = (n, max) => Array.from({length: max}, (_, i) =>
    `<i class="${i < n ? "lleno" : ""}"></i>`).join("");

  /* Huecos de producción en filas: 14 monedas (4/5/5) y 7 monjes (3/4). Se
     rellenan hasta lo que generas ahora mismo, base incluida. */
  const filas = (n, corte) => {
    const tope = corte.reduce((s, k) => s + k, 0);
    let llenos = Math.min(tope, Math.max(0, n));
    return corte.map(k => `<span class="fort-fila">${Array.from({length: k}, () =>
      `<i class="${llenos-- > 0 ? "lleno" : ""}"></i>`).join("")}</span>`).join("");
  };

  /* Ficha en un paso del sendero */
  const fichaEn = (sd, paso) => {
    const p = sd?.posiciones;
    if (Array.isArray(p)) return p[paso] ?? null;
    return (sd?.monstruos ?? []).find(m => m.pos === paso) ?? null;
  };
  const nivelDe = f => f?.nivel ?? f?.fuerza ?? "?";

  /* La torre de la izquierda, 3 px a la derecha (0,77 % del ancho del tablero a
     390 px): la peana de su casilla se mueve con ella. */
  const TORRES_POS = [{l:"26.55",t:"32.28"},{l:"49.92",t:"32.28"},{l:"74.13",t:"32.28"}];

  /* Foto de las fichas del repintado anterior, antes de sobrescribirla: de
     ahí salen los fantasmas de las que han caído en un combate. */
  const fotoPrevia = new Map(fichasPrevias);
  /* Fichas que el motor ha quitado sin pelea (torre que dispara, Purga, una
     carta): su hueco se queda con humo y no se deslizan hacia el monstruo que
     tengan delante, que además sigue quieto en su casilla. */
  const sinLucha = new Set(j.muertesSinLucha ?? []);
  /* Por calle, el monstruo que sale a la lanzadera en este repintado: no ha
     muerto (lleva su copia en el camino) y es quien gana en la casilla 1. */
  const salen = opciones.salen ?? null;

  /* Fichas reales */
  const fichasHtml = [0,1,2].flatMap(i =>
    [0,1,2,3].map(paso => {
      const f = fichaEn(s[i], paso);
      if (!f) return "";
      const pos = LOSAS[i][paso];
      const esAtacante = f.tipo === "atacante";
      const cls = esAtacante ? (f.dueno ? "ajena" : "atacante") : "mia";
      /* Si la ficha viene de otra casilla, se pinta en la de antes y se mueve
         a la nueva: así se ve el avance del turno. Si no la habíamos visto
         nunca y entra por el primer peldaño, sale de la casilla virtual de
         abajo: es la entrada desde la bruma. */
      const antes = f.id ? fotoPrevia.get(f.id) : null;
      /* Solo se anima el avance dentro de su propia calle. Si la ficha aparece
         en otra calle (o es la primera vez que se ve), se pinta ya en su
         casilla: nunca se la ve cruzar el tablero de una calle a otra. */
      const mismaCalle = !!antes && antes.calle === i;
          const movida = mismaCalle && antes.paso !== paso;
      const entra = !antes && paso === 0;
      const desde = movida ? LOSAS[antes.calle][antes.paso] : (entra ? ENTRADA[i] : null);
      /* La foto es solo de tu tablero: una visita a otra fortaleza escribía
         aquí sus monstruos y dejaba sin comparación el repintado siguiente. */
      if (!opciones.sinLuchas && f.id) fichasPrevias.set(f.id, { calle: i, paso, nivel: nivelDe(f), tipo: f.tipo, vuela: f.vuela });
      /* `data-entra` marca las que aparecen por abajo: fuera de tu turno no
         hay jornada que las anime y se lanzan en el mismo repintado. */
      const desdeAttr = desde
        ? ` data-ol="${desde.l}" data-ot="${desde.t}"${entra ? ' data-entra="1"' : ""}`
        : "";
      /* Icono del monstruo: de espaldas cuando sube la escalera atacando el
         fuerte y de frente cuando lo defiende. Cada nivel usa su lámina; los
         que aún no tienen arte caen en la del nivel 1. */
      const img = f.vuela ? imgMonstruo("volador", esAtacante) : imgMonstruo(nivelDe(f), esAtacante);
      /* Monstruo recién llegado que aún no ha sido anunciado: se esconde hasta
         que animarLlegadaEnviados lo haga emerger de la niebla en el avance. */
      /* Solo se esconde la que va a salir de la bruma al empezar TU avance: en
         cualquier otra fase (o al volver a la mesa) se pinta a la vista,
         porque nadie la va a animar y se quedaba invisible para siempre. */
      const avanceMio = tocaMesa && faseMesa === "avance";
      const ocultoHastaAvance = avanceMio && paso === 0 && esAtacante && f.id && !llegadasAnunciadas.has(f.id);
      /* La que no se va a animar ya cuenta como vista: así no se la vuelve a
         esconder en un repintado posterior de la misma jornada. */
      if (!ocultoHastaAvance && f.id && paso === 0 && esAtacante) llegadasAnunciadas.add(f.id);
      return `<div class="ficha ${cls}" data-fid="${esc(f.id ?? "")}" data-sendero="${s[i]?.id ?? i + 1}" data-pos="${paso}" data-nivel="${nivelDe(f)}"${desdeAttr} style="left:${pos.l}%;top:${pos.t}%${ocultoHastaAvance ? ";opacity:0" : ""}"><img src="${img}" alt="monstruo" class="ficha-img"/><b class="ficha-nv">${f.vuela ? "✦" : nivelDe(f)}</b></div>`;
    })
  ).join("");

  /* ── Fantasmas de los combates ──
     Una ficha que estaba en los caminos en el repintado anterior y ya no está
     ha caído. Se pinta en su casilla para que el que llega se vea chocar con
     ella (o se desliza ella hasta el que le planta cara si murió atacando) y
     encima de los dos sale la nube de la pelea. En la visita a otra fortaleza
     no se comparan fotos: los fantasmas de una visita no son tuyos. */
  const luchas = [];
  const entradas = [];
  const aniquiladas = [];
  if (!opciones.sinLuchas) {
    const vivos = new Set();
    for (let i = 0; i < 3; i++) for (let paso = 0; paso < 4; paso++) {
      const f = fichaEn(s[i], paso);
      if (f?.id) vivos.add(f.id);
    }
    for (const [id, antes] of fotoPrevia) {
      if (vivos.has(id)) continue;
      /* La caída se enseña una sola vez: la ficha sale de la foto. */
      fichasPrevias.delete(id);
      if (salen?.has(id)) continue;
      if (antes.calle == null) continue;
      const esAtacante = antes.tipo === "atacante";
      const esRival = (f) => f && (f.tipo === "atacante") !== esAtacante;
      const paso = antes.paso;
      const suCasilla = fichaEn(s[antes.calle], paso);
      const delante = fichaEn(s[antes.calle], paso + (esAtacante ? 1 : -1));
      /* Muerte sin pelea: humo en su casilla y nada de deslizamiento. */
      if (sinLucha.has(id)) {
        aniquiladas.push({ calle: antes.calle, paso, nivel: antes.nivel, esAtacante });
        continue;
      }
      /* El atacante de la casilla 1 ha caído contra el monstruo que se va a la
         lanzadera: la pelea la gana ese. Sin esto su muerte salía como humo
         suelto y el humo se comía la salida del otro. */
      const saliente = salen?.get(antes.calle);
      if (esAtacante && paso === 0 && saliente?.paso === 1 && saliente.id !== id) {
        luchas.push({
          calle: antes.calle, origen: paso, destino: paso,
          nivel: antes.nivel, vuela: antes.vuela, esAtacante: true,
          ganadorId: saliente.id,
          grupo: "defensores",
        });
        continue;
      }

      /* Si su casilla la ocupa ahora un rival, ese ha ganado y se le ve entrar;
         si está vacía, murió al atacar la casilla de delante. */
      const destino = esRival(suCasilla) ? paso : (esRival(delante) ? paso + (esAtacante ? 1 : -1) : null);
      if (destino == null || destino < 0 || destino > 3) {
        /* Se ha ido sin que nadie la haya comido: la ha quitado una carta
           (Purga, aniquilar…). Se le deja el humo del combate en la casilla,
           sin bolas. En la puerta no: ese atacante ya se anima entrando en el
           búnker, y un monstruo mío que sale de la casilla 1 ha subido a la
           lanzadera, no ha muerto. */
        const loQuitaUnaCarta = !suCasilla && !delante && (esAtacante ? paso !== 3 : paso >= 2);
        if (loQuitaUnaCarta) aniquiladas.push({ calle: antes.calle, paso, nivel: antes.nivel, esAtacante });
        continue;
      }
      const ganador = fichaEn(s[antes.calle], destino);
      if (!ganador || ganador.id === id) continue;
      luchas.push({
        calle: antes.calle, origen: paso, destino,
        nivel: antes.nivel, vuela: antes.vuela, esAtacante,
        /* Quién ha ganado: sirve para saber cuándo llega y abrir la nube. */
        ganadorId: ganador.id ?? "",
        /* Se enseña en la fase que anima al que se ha movido. Si el fantasma
           viaja hasta la casilla del ganador, el choque lo ha buscado él
           (murió atacando) y toca en su fase; si no se mueve, el que llega es
           el ganador y toca en la suya. Mirar solo al ganador dejaba al
           defensor que moría atacando metido en la fase de los atacantes, que
           ya había pasado: la pelea no se veía y el turno se confirmaba solo. */
        grupo: destino !== paso
          ? (esAtacante ? "atacantes" : "defensores")
          : (ganador.tipo === "atacante" ? "atacantes" : "defensores"),
      });
    }
    /* Las entradas las manda el motor y cada una se anima una sola vez por su
       id. Deducirlas de la foto del repintado anterior fallaba en cuanto había
       otro repintado o una visita en medio: la vida subía de golpe y no se
       veía ni la nube ni la pastilla subiendo. */
    for (const en of j?.entradas ?? []) {
      if (!en?.id || entradasHechasBunker.has(en.id)) continue;
      entradasHechasBunker.add(en.id);
      /* Al abrir la app a media partida no se repiten las que ya pasaron. */
      if (entradasPrimerPintado) continue;
      const puerta = (LOSAS[en.calle - 1] ?? LOSAS[0])[3];
      entradas.push({ l: puerta.l, t: puerta.t, nivel: en.nivel, vuela: en.vuela });
    }
    entradasPrimerPintado = false;
    /* El registro de ids no crece sin fin: si se llena, se empieza de cero. */
    if (entradasHechasBunker.size > 300) entradasHechasBunker.clear();
  }
  const luchasHtml = luchas.map((l, k) => {
    const ini = LOSAS[l.calle][l.origen];
    const fin = LOSAS[l.calle][l.destino];
    return       `<div class="ficha fantasma ${l.esAtacante ? "atacante" : "mia"}${tocaMesa ? " ver" : ""}" data-lucha="${k}" data-grupo="${l.grupo}" data-ganador="${esc(l.ganadorId ?? "")}" data-dl="${fin.l}" data-dt="${fin.t}" data-nivel="${l.nivel}" style="left:${ini.l}%;top:${ini.t}%">
          ${htmlFicha(l, l.esAtacante)}
        </div>
        <div class="bw-nube" data-nube="${k}" style="left:${fin.l}%;top:${fin.t}%"><img src="${BASE_IMG}/nube-combate.png" alt=""></div>`;
  }).join("");

  /* Torres */
  const torresHtml = [0,1,2].map(i => {
    const t = torres[i];
    const pos = TORRES_POS[i];
    if (!t || !t.nivel)
      /* El + sube un 1,8 % del alto del tablero respecto al centro de la
         torre: en % para que la distancia crezca con el mapa. */
      /* Hueco de torre: el mismo círculo borgoña con el + que las jaulas. */
      return `<div class="hueco" data-pos-torre="${i + 1}" style="left:${pos.l}%;top:calc(${pos.t}% - 1.8%)"><span class="hueco-mas">+</span></div>`;
    const nv = t.nivel;
    return `
      <div class="torre nv${nv}${t.inhabilitada ? " bloqueada" : ""}" data-pos-torre="${i + 1}" style="left:${pos.l}%;top:${pos.t}%">
        <i class="torre-zona"></i>
        <div class="planta"></div>
        <div class="alzado"></div>
        ${t.inhabilitada ? `<div class="bloqueo">✕</div>` : ""}
        <div class="nivel"><i></i><i></i><i></i></div>
      </div>`;
  }).join("");

  /* Lanzaderas */
  const lanzHtml = [{l:"37.1",t:"77.7"},{l:"63.3",t:"77.9"}].map((pos, i) => {
    const l = lanzaderas[i];
    const dentro = l ? htmlFichaLanzadera(l) : "";
    return `<div class="lanzadera${l ? " lanzadera-llena" : ""}" data-lanzadera="${i + 1}" style="left:${pos.l}%;top:${pos.t}%">${dentro}</div>`;
  }).join("")
  /* Cola de lanzadera: se apilan justo detrás de la lanzadera (misma X, un
     peldaño más abajo y algo más pequeñas), igual que los monstruos de las
     jaulas se ven uno detrás del otro. */
  + colaLanzaderas.slice(0, 2).map((c, i) => {
    /* El que espera es una copia exacta de su lanzadera 30 px más arriba (en
       --u, para que crezca con el mapa) y por debajo en z-index: se apila
       detrás de la llenada, con su nivel a la vista. Así el hueco se ve sin
       tapar al que ya está dentro. */
    const pos = i === 0
      ? { l: "37.1", t: "calc(77.7% - 7.7 * var(--u))" }
      : { l: "63.3", t: "calc(77.9% - 7.7 * var(--u))" };
    return `<div class="lanzadera lanzadera-llena lanzadera-cola" data-cola="${i + 1}" title="En espera de lanzadera (${i + 1})" style="left:${pos.l}%;top:${pos.t};z-index:1;pointer-events:none;opacity:.82">${htmlFichaLanzadera(c)}</div>`;
  }).join("");

  /* Losas */
  const losasHtml = LOSAS.flatMap(calles => calles.map(pos =>
    `<div class="losa${pos.base ? " base-torre" : ""}" style="left:${pos.l}%;top:${pos.t}%"></div>`
  )).join("");

  /* Slots de box en la fort-ui */
  /* Cuatro huecos de la fortaleza: arriba-izquierda, abajo-izquierda,
     arriba-derecha y abajo-derecha. Los retoques van en --u (1 % del ancho del
     mundo) para que sigan en su sitio al girar el móvil. */
  const slotPos = [
    { l:"37.6%",                            t:"calc(63.5% - 1.28 * var(--u))" },  // 5 px arriba
    { l:"calc(37.6% - 0.4 * var(--u))",    t:"calc(73.1% - 1.28 * var(--u))" },  // 5 arriba, 5 izda
    { l:"calc(62.7% + 0.51 * var(--u))",   t:"calc(64.1% - 2.56 * var(--u))" },  // 10 arriba, 2 dcha
    { l:"63.1%",                            t:"calc(72.7% - 0.51 * var(--u))" },  // 2 px arriba
  ];
  const slotsHtml = slotPos.map((pos, i) => {
    const mon = box[i];
    // pos.l y pos.t ya traen su unidad (% o calc), así que no se les añade otra
    /* Un monstruo en el box se pinta como en el tablero: imagen de frente
       (defendiendo) y la pastilla con su fuerza a la derecha. */
    return `<div class="fort-slot${mon ? " fort-slot-lleno" : " fort-slot-vacio"}${i % 2 === 0 ? " fort-slot-arriba" : ""}" data-box="${i < 2 ? 0 : 1}"${mon?.id ? ` data-mon-id="${esc(mon.id)}"` : ""} style="left:${pos.l};top:${pos.t}">${
      mon ? (mon.vuela
        ? `<img src="${imgMonstruo("volador", false, true)}" class="fort-slot-img" alt=""><b class="fort-slot-nv">✦</b>`
        : `<img src="${imgMonstruo(mon.nivel, false, true)}" class="fort-slot-img" alt=""><b class="fort-slot-nv">${mon.nivel}</b>`)
        : `<span class="fort-slot-x">+</span>`
    }</div>`;
  }).join("");

  /* Las entradas detectadas se animan en cuanto el tablero esté en el
     documento. */
  if (!opciones.sinLuchas) {
    entradasPendientes = entradas;
    aniquiladasPendientes = aniquiladas;
  }

  /* Los tres edificios de la fortaleza, con el mismo modelo: arriba la
     pastilla borgoña con un hueco por nivel, y debajo la imagen del edificio
     dentro de su caja. La imagen se pinta siempre: si el nivel es 0 se usa el
     arte del nivel 1, para poder colocar el edificio antes de construirlo. */
  const edificioFortaleza = (izq, arriba, nivel, max, archivo, topPastilla = null, clave = null) => `
              <div class="fort-circulo fort-circulo-edif"${clave ? ` data-edif="${clave}"` : ""} style="left:${izq};top:${arriba}">
                <div class="fort-nivel"${topPastilla == null ? "" : ` style="top:${topPastilla}"`}>${dots(nivel, max)}</div>
                <img src="${BASE_IMG}/edificios/${archivo}" class="fort-edif-img" alt="">
              </div>`;

  return `
    ${pintarHud(j, priv)}
    <section class="escena">
      <div class="mundo">
        <div class="suelo">
          <div class="capa-himalaya capa-bg-clouds"></div>
          <div class="capa-himalaya capa-cloud-l"></div>
          <div class="capa-himalaya capa-cloud-r"></div>
          <div class="capa-himalaya capa-flags"></div>
          <div class="capa-himalaya capa-flags-r"></div>
          <div class="capa-himalaya bloque-mapa">
            <img src="${BASE_IMG}/mapas/nieve/fortress.png" class="img-fortress" width="1178" height="1147" alt="">
            <img src="${BASE_IMG}/mapas/nieve/stairs.png"   class="img-stairs"   width="1214" height="1812" alt="">
            <div class="fort-ui">
              <div class="fort-plat energia" style="left:20.5%;top:25.5%">
                <div class="fort-cifra">${quedan.monedas ?? "—"}</div>
                <div class="fort-pila-caja coins">
                  <img src="${pilaCoins(quedan.monedas ?? 0)}" class="fort-pila" alt=""${(quedan.monedas ?? 0) > 0 ? "" : ` style="visibility:hidden"`}>
                </div>
              </div>
              <div class="fort-plat vida" style="left:80.5%;top:25.4%">
                <div class="fort-cifra">${quedan.decretos ?? "—"}</div>
                <div class="fort-pila-caja decrees">
                  <img src="${pilaDecrees(quedan.decretos ?? 0)}" class="fort-pila" alt=""${(quedan.decretos ?? 0) > 0 ? "" : ` style="visibility:hidden"`}>
                </div>
              </div>
              ${edificioFortaleza("76.2%", "42.47%", lab,  4, `criadero${lab > 0 ? lab : 1}.png`, null, "criadero")}
              ${edificioFortaleza("49.9%", "50.9%",  cien, 2, "laboratorio.png", "0")}
              ${edificioFortaleza("24.2%", "42.47%", arm,  3, `armeria${arm > 0 ? arm : 1}.png`)}
              ${slotsHtml}
            </div>
          </div>
          <div class="capa-himalaya capa-bottom-fog"></div>
        </div>

        <svg class="caminos" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="lecho" d="M24.5 100 L24.5 0"/>
          <path class="lecho" d="M49.2 100 L49.2 0"/>
          <path class="lecho" d="M73.2 100 L73.2 0"/>
        </svg>

        <div class="tablero">
          <div class="bw-layer">
            <div class="num-calle" style="left:calc(24.5% - 0.51 * var(--u));top:83%">1</div>
            <div class="num-calle" style="left:calc(49.2% + 0.77 * var(--u));top:83%">2</div>
            <div class="num-calle" style="left:calc(73.2% + 4.62 * var(--u));top:83%">3</div>
          </div>
          <div class="bw-layer">${lanzHtml}</div>
          <div class="bw-layer">${losasHtml}</div>
          <div class="bw-layer">${torresHtml}</div>
          <div class="bw-layer bw-fichas">${fichasHtml}</div>
          <div class="bw-layer">${luchasHtml}</div>
        </div>
      </div>
    </section>

  `;
}

/* ── HUD: el turno de un vistazo ──────────────────────────────────────────
   Una línea arriba a la izquierda con lo del turno —monedas y monjes que
   quedan sobre los que generas—, la luna y la vida del búnker. */

function pintarHud(j, priv) {
  const tot = totalesBunker(j?.bunker);
  const energia = priv && "energia" in priv ? priv.energia : 0;
  const acciones = priv && "accionesRestantes" in priv ? priv.accionesRestantes : 0;
  const vida = Math.max(0, 20 - (j?.puntosMonsters ?? 0));
  const esAliadoHud = (p) => modoMesa === "equipos" && (p?.equipo ?? 0) === miEquipoMesa;

  /* Las mejoras de la fortaleza: armería (torres de ataque) y criadero
     (crear monstruos). Los nombres internos siguen siendo armeria y
     laboratorio. */
  const armeria = j?.bunker?.armeria ?? 0;
  const criadero = j?.bunker?.laboratorio ?? 0;
  const ciencia = (j?.bunker?.ciencia ?? []).length;
  const ICONO = (n) => `${BASE_IMG}/iconos/${n}.png`;

  /* Un punto por nivel de edificio: lleno en rojo los que tiene. */
  const puntos = (n, max = 4) => Array.from({ length: max }, (_, i) =>
    `<i class="${i < n ? "llena" : ""}"></i>`).join("");

  /* La unidad de la partida es la luna: cada luna nueva, tantas monedas. */
  const recurso = (icono, nombre, turno, quedan) => `
        <div class="bw-rec" title="${nombre}: ${turno} por ciclo. Te quedan ${quedan == null ? "—" : quedan}.">
          <img src="${ICONO(icono + (vistaRival && !esAliadoHud(j) ? "-ic" : "-ic-b"))}" alt="">
          <b>${turno}<em>/ciclo</em></b>
        </div>`;
  /* Un hueco de la fila de abajo: icono, nombre y, o los puntos de nivel, o
     un valor de texto (los huecos libres del box). */
  const edificio = (icono, nombre, nivel, max = 4, valor = null, clave = null) => `
        <div class="bw-edif"${clave ? ` data-edif="${clave}"` : ""} title="${nivel == null ? nombre : `${nombre} a nivel ${nivel}`}">
          ${icono ? `<img src="${ICONO(icono)}" alt="">` : ""}
          <span class="bw-edif-nombre">${nombre}</span>
          ${valor ?? `<span class="bw-edif-puntos">${puntos(nivel, max)}</span>`}
        </div>`;

  /* Grid de turnos pegado al fondo del marco: un slot por jugador. */
  const turnos = jugadoresMesa.map(p => {
    const activo = p.id === turnoMesa;
    return `<div class="bw-turno${activo ? " activo" : ""}" data-jugador="${esc(p.id)}"></div>`;
  }).join("");
  const nTurnos = Math.max(1, jugadoresMesa.length);
  const nivelVida = vida > 12 ? "alta" : vida > 6 ? "media" : "baja";

  /* Tres filas: arriba las monedas, la vida y los decretos; en medio los
     cuatro huecos de la fortaleza; abajo la franja de turnos. */
  return `
    <div class="bw-hud">
      <div class="bw-hud-aviso" title="Turno en curso">
        <span class="bw-hud-aviso-texto">${vistaRival
          ? `Fortaleza de ${esc(j?.nombre ?? "un rival")}`
          : tocaMesa
            ? `<button type="button" class="bw-hud-pasar">Finalizar turno</button>`
            : `Turno de ${esc(nombreEnTurno())}`}</span>
        <div class="bw-hud-turnos aviso" style="grid-template-columns:repeat(${nTurnos},minmax(0,1fr))">${turnos}</div>
      </div>
      <div class="bw-hud-caja" title="Fortaleza: producción, vida y edificios">
        <div class="bw-hud-cuerpo">
          <div class="bw-hud-fila arriba">
            <div class="bw-hud-celda izq">${recurso("monedas", "Monedas", tot.monedas, energia)}</div>
            <div class="bw-hud-vida ${nivelVida}" title="Vida del búnker: ${vida} de 20">
              <img src="${ICONO("escudo")}" alt="">
              <b>${vida}/20</b>
            </div>
            <div class="bw-hud-celda der">${recurso("pergaminos", "Decretos", tot.monjes, acciones)}</div>
          </div>
          <div class="bw-hud-fila medio">
            ${edificio(null, "Armería", armeria, 3)}
            <button type="button" class="bw-edif bw-edif-ciencia" data-ciencia="1"
                    title="Ciencia: ${ciencia} de ${SLOTS_CIENCIA}. Toca para ver las cartas instaladas.">
              <span class="bw-edif-nombre">Ciencia</span>
              <span class="bw-edif-puntos">${puntos(ciencia, SLOTS_CIENCIA)}</span>
            </button>
            ${edificio(null, "Criadero", criadero, 4, null, "criadero")}
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Box de monstruos ───────────────────────────────────────────────────── */

function pintarBox(priv) {
  const box = priv?.box ?? [];

  const caja = (b) => {
    const slots = Array.from({ length: 2 }, (_, k) => {
      const i = b * 2 + k;
      const m = box[i];
      return m
        ? `<div class="bw-box-slot lleno" data-mon-id="${esc(m.id)}" data-box="${b}" title="${m.vuela ? "Aves de bruma" : `Monstruo ${m.nivel}`} (jaula ${b + 1}, hueco ${k + 1}): toca para enviarlo"><img src="${imgMonstruo(m.vuela ? "volador" : m.nivel, false, true)}" class="bw-box-img bw-mon-jaula" alt="monstruo"><b class="bw-box-nv">${m.vuela ? "✦" : m.nivel}</b></div>`
        : `<div class="bw-box-slot vacio" data-box="${b}" title="Jaula ${b + 1}, hueco ${k + 1} libre: toca para criar"><span class="bw-box-x">+</span></div>`;
    }).join("");
    /* La jaula 1 alimenta el camino izquierdo y el central; la 2, el central
       y el derecho. Nunca el 1 y el 3 a la vez. */
    const caminos = b === 0 ? "camino central izquierdo" : "camino central derecho";
    return `
      <div class="bw-caja">
        <div class="bw-caja-label">Jaula ${b + 1}<span class="bw-caja-camino">${caminos}</span></div>
        <div class="bw-box">${slots}</div>
      </div>`;
  };

  return `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Jaulas <span class="bw-panel-sub">${box.filter(Boolean).length} / 4</span></div>
      <button class="bw-panel-x" type="button" data-cerrar-panel aria-label="Cerrar">×</button>
    </div>
    <div class="bw-cajas">${caja(0)}${caja(1)}</div>
    <div class="bw-slot-sub" style="margin-top:10px;margin-bottom:8px;text-align:center">Toca un monstruo para mandarlo a la lanzadera o al inicio de un camino de su caja. Un hueco con aspa abre el criadero.</div>
  `;
}

/* ── Mapa: el listado de rivales, en el mismo panel que jaulas y torres ── */
function nombreMesa(p) {
  if (!p.esBot && !/^bot-/i.test(p.id)) return p.nombre ?? "Jugador";
  const bots = jugadoresMesa.filter((x) => x.esBot || /^bot-/i.test(x.id));
  const i = bots.findIndex((x) => x.id === p.id);
  return i <= 0 ? "Rico" : `Rico ${i + 1}`;
}

/* Cuadro de una calle: el mismo que usa la selección de la lanzadera. */
function cuadroLz(n, tipo, titulo, extra = "") {
  const nivel = Number(n) || 0;
  /* Sin torre, el hueco se marca con una X roja; sin monstruo, queda vacío. */
  return `<span class="bw-lz-cuadro ${tipo}${nivel ? " lleno" : ""}${extra ? ` ${extra}` : ""}" title="${esc(titulo)}">${
    nivel ? `<b class="bw-lz-punto">${nivel}</b>`
      : (tipo === "bz-torre" ? `<i class="bw-torre-x" aria-hidden="true"></i>` : "")
  }</span>`;
}

function pintarMapa() {
  const otros = jugadoresMesa.filter((p) => p.id !== yoMesa);
  const enEquipos = modoMesa === "equipos";
  const esAliado = (p) => enEquipos && (p.equipo ?? 0) === miEquipoMesa;
  const nombreMapa = nombreMesa;
  const tarjeta = (p) => {
    const vida = Math.max(0, 20 - (p.puntosMonsters ?? 0));
    const torres = Array.isArray(p.bunker?.torres) ? p.bunker.torres : [];
    const senderos = Array.isArray(p.senderos) ? p.senderos : [];
    const calles = [0, 1, 2].map((i) => {
      const nTorre = Number(torres[i]?.nivel) || 0;
      const fichas = [3, 2, 1, 0].map((paso) => {
        const f = senderos[i]?.posiciones?.[paso]
          ?? (senderos[i]?.monstruos ?? []).find((m) => m.pos === paso)
          ?? null;
        if (!f) return cuadroLz(0, "bz-vacio", `Peldaño ${paso + 1}: libre`);
        const n = f.nivel ?? f.fuerza ?? "?";
        const atacante = f.tipo === "atacante";
        return cuadroLz(n, atacante ? "bz-at" : "bz-def",
          `${atacante ? "Atacante" : "Defensor"} nivel ${n} en el peldaño ${paso + 1}`);
      }).join("");
      return `<span class="bw-lz-calle">
        ${cuadroLz(nTorre, "bz-torre", `Torre ${i + 1}: ${nTorre ? `nivel ${nTorre}` : "vacía"}`)}
        ${fichas}
      </span>`;
    }).join("");
    const atacantes = senderos.reduce((s, sd) =>
      s + (sd.posiciones ?? []).filter((f) => f?.tipo === "atacante").length, 0);
    return `<button type="button" class="bw-mapa-rival ${esAliado(p) ? "aliado" : (atacantes > 0 ? "con-atacantes" : "enemigo")}" data-jugador="${esc(p.id)}">
      <span class="bw-mapa-nombre">${esc(nombreMapa(p))}</span>
      <span class="bw-mapa-vida">Vida <b>${vida}</b>/20</span>
      <span class="bw-lz-calles bw-mapa-calles">${calles}</span>
      <span class="bw-mapa-atac">${atacantes} atacante${atacantes === 1 ? "" : "s"}</span>
    </button>`;
  };
  const aliados = enEquipos ? otros.filter(esAliado) : [];
  const enemigos = enEquipos ? otros.filter((p) => !esAliado(p)) : otros;
  const seccion = (titulo, lista, clase) => lista.length
    ? `<div class="bw-mapa-seccion"><div class="bw-mapa-seccion-titulo ${clase}">${titulo}</div><div class="bw-mapa-lista">${lista.map(tarjeta).join("")}</div></div>`
    : "";
  return `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Mapa</div>
      <button class="bw-panel-x" type="button" data-cerrar-panel aria-label="Cerrar">×</button>
    </div>
    ${otros.length
      ? `<div class="bw-mapa-secciones">${seccion("Aliados", aliados, "aliados")}${seccion("Enemigos", enemigos, "enemigos")}</div>`
      : `<p class="bw-mapa-vacio">No hay otros jugadores en la mesa.</p>`}
  `;
}

/* ── Aliados: traspaso de monedas, decretos y monstruos ────────────────── */
function pintarAliados(aliados, peticiones = [], enviosPendientes = []) {
  const personas = aliados.map((p) => {
    const vida = Math.max(0, 20 - (p.puntosMonsters ?? 0));
    const huecos = Math.max(0, 4 - Math.min(4, Number(p.boxOcupados) || 0));
    return `<button type="button" class="bw-aliados-persona" data-aliado="${esc(p.id)}">
      <b>${esc(nombreMesa(p))}</b>
      <small>Vida ${vida}/20 · ${huecos} hueco${huecos === 1 ? "" : "s"} de jaula</small>
    </button>`;
  }).join("");

  const unir = (cosas) => cosas.length < 2
    ? (cosas[0] ?? "")
    : `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;

  const slots = [];
  for (const g of enviosPendientes) {
    const cosas = [];
    if (g.monedas) cosas.push(`${g.monedas} moneda${g.monedas === 1 ? "" : "s"}`);
    if (g.decretos) cosas.push(`${g.decretos} decreto${g.decretos === 1 ? "" : "s"}`);
    const niveles = (g.monstruos ?? []).map((m) => m?.nivel ?? m).filter((n) => Number(n) > 0);
    if (niveles.length) cosas.push(`${niveles.length} monstruo${niveles.length === 1 ? "" : "s"} de nivel ${niveles.join(", ")}`);
    slots.push(`<div class="bw-aliados-slot bw-aliados-slot-envio">
      <b>${esc(g.deNombre ?? "Un aliado")}</b>
      <span>Te envía ${esc(unir(cosas))}.</span>
      <small>Para tu próximo turno</small>
    </div>`);
  }
  for (const p of peticiones) {
    const cosas = [
      p.monedas ? "monedas" : "",
      p.decretos ? "decretos" : "",
      p.monstruos ? "monstruos" : "",
    ].filter(Boolean);
    const propia = p.de === yoMesa;
    const nombre = propia ? "Tú" : esc(p.deNombre ?? "Un aliado");
    const cancelar = propia && tocaMesa && faseMesa === "acciones"
      ? `<button type="button" class="bw-aliados-cancelar" data-cancelar-peticion>Cancelar petición</button>`
      : "";
    slots.push(`<div class="bw-aliados-slot bw-aliados-slot-peticion${propia ? " bw-aliados-slot-propia" : ""}">
      <b>${nombre}</b>
      <span>${propia ? "Pides" : "Pide"} ${esc(unir(cosas))}.</span>
      ${cancelar}
    </div>`);
  }
  const visibles = slots.slice(0, 4);
  const columnas = Math.max(1, Math.min(3, visibles.length));
  const cuadricula = visibles.length
    ? `<div class="bw-aliados-slots bw-aliados-slots-${columnas}">${visibles.join("")}</div>`
    : `<div class="bw-aliados-slots bw-aliados-slots-1"><div class="bw-aliados-slot bw-aliados-slot-vacio">No hay peticiones ni envíos pendientes.</div></div>`;

  return `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Aliados</div>
      <button class="bw-panel-x" type="button" data-cerrar-panel aria-label="Cerrar">×</button>
    </div>
    <div class="bw-aliados-intro">Manda recursos a tus aliados y pide lo que necesites. Pedir no gasta decretos ni acciones.</div>

    <div class="bw-aliados-bloque">
      <div class="bw-aliados-titulo">Envíos</div>
      <div class="bw-aliados-lista">${personas}</div>
      <div class="bw-aliados-form oculto" data-form>
        <div class="bw-aliados-destino" data-destino></div>
        <div class="bw-aliados-fila">
          <span>Monedas</span>
          <div class="bw-aliados-contador"><button type="button" data-menos="monedas">−</button><b data-valor="monedas">0</b><button type="button" data-mas="monedas">+</button></div>
        </div>
        <div class="bw-aliados-fila">
          <span>Decretos</span>
          <div class="bw-aliados-contador"><button type="button" data-menos="decretos">−</button><b data-valor="decretos">0</b><button type="button" data-mas="decretos">+</button></div>
        </div>
        <div class="bw-aliados-monstruos">
          <span>Monstruos de tus jaulas</span>
          <div class="bw-aliados-mons" data-mons></div>
        </div>
        <div class="bw-aliados-pie"><span data-resumen>0 monedas · 0 decretos · 0 monstruos</span><button type="button" class="bw-aliados-enviar" data-enviar disabled>Enviar</button></div>
        <div class="bw-aliados-nota" data-nota></div>
      </div>
    </div>

    <div class="bw-aliados-bloque">
      <div class="bw-aliados-titulo">Peticiones</div>
      <div class="bw-aliados-pedir">
        <div class="bw-aliados-chips">
          <button type="button" class="bw-aliados-chip" data-peticion="monedas">Monedas</button>
          <button type="button" class="bw-aliados-chip" data-peticion="decretos">Decretos</button>
          <button type="button" class="bw-aliados-chip" data-peticion="monstruos">Monstruos</button>
        </div>
        <div class="bw-aliados-nota" data-peticion-nota>No cuesta decretos ni acciones.</div>
        <button type="button" class="bw-aliados-enviar bw-aliados-pedir-btn" data-pedir disabled>Hacer petición</button>
      </div>
      ${cuadricula}
    </div>`;
}

function prepararAliados(panel, aliados) {
  const form = panel.querySelector("[data-form]");
  const destino = panel.querySelector("[data-destino]");
  const monsWrap = panel.querySelector("[data-mons]");
  const resumen = panel.querySelector("[data-resumen]");
  const enviar = panel.querySelector("[data-enviar]");
  const nota = panel.querySelector("[data-nota]");
  const pedir = panel.querySelector("[data-pedir]");
  const peticionNota = panel.querySelector("[data-peticion-nota]");
  const chips = [...panel.querySelectorAll("[data-peticion]")];
  const peticion = { monedas: false, decretos: false, monstruos: false };
  let para = null;
  let monedas = 0;
  let decretos = 0;
  const mons = new Set();

  const refrescarPeticion = () => {
    for (const chip of chips) chip.classList.toggle("sel", !!peticion[chip.dataset.peticion]);
    const hay = peticion.monedas || peticion.decretos || peticion.monstruos;
    const enFase = tocaMesa && faseMesa === "acciones";
    pedir.disabled = !enFase || !hay;
    if (!tocaMesa) peticionNota.textContent = "Espera a que te toque para pedir.";
    else if (faseMesa !== "acciones") peticionNota.textContent = "Solo puedes pedir en tu fase de decretos.";
    else if (!hay) peticionNota.textContent = "Elige qué necesitas. No cuesta decretos ni acciones.";
    else peticionNota.textContent = "No cuesta decretos ni acciones.";
  };
  refrescarPeticion();

  const huecosDe = (p) => Math.max(0, 4 - Math.min(4, Number(p.boxOcupados) || 0));
  const maxMon = () => (para ? huecosDe(para) : 0);

  const pintarMons = () => {
    const disponibles = (boxActual ?? []).slice(0, 4).filter(Boolean);
    if (!disponibles.length) {
      monsWrap.innerHTML = `<p class="bw-aliados-vacio">No tienes monstruos en las jaulas.</p>`;
      return;
    }
    monsWrap.innerHTML = disponibles.map((m) => `
      <button type="button" class="bw-aliados-mon${mons.has(m.id) ? " sel" : ""}" data-mon="${esc(m.id)}" title="Monstruo nivel ${m.nivel}">
        <img src="${imgMonstruo(m.nivel, false, true)}" alt="monstruo"><b>${m.nivel ?? "?"}</b>
      </button>`).join("");
  };

  const refrescar = () => {
    if (!para) return;
    panel.querySelector('[data-valor="monedas"]').textContent = monedas;
    panel.querySelector('[data-valor="decretos"]').textContent = decretos;
    for (const b of monsWrap.querySelectorAll("[data-mon]")) b.classList.toggle("sel", mons.has(b.dataset.mon));
    const total = monedas + decretos + mons.size;
    resumen.textContent = `${monedas} moneda${monedas === 1 ? "" : "s"} · ${decretos} decreto${decretos === 1 ? "" : "s"} · ${mons.size} monstruo${mons.size === 1 ? "" : "s"}`;
    const enFase = tocaMesa && faseMesa === "acciones";
    enviar.disabled = !enFase || total <= 0 || mons.size > maxMon();
    if (!tocaMesa) nota.textContent = "Espera a que te toque para enviar.";
    else if (faseMesa !== "acciones") nota.textContent = "Solo puedes enviar en tu fase de decretos.";
    else if (!total) nota.textContent = "Elige monedas, decretos o algún monstruo.";
    else if (mons.size > maxMon()) nota.textContent = `En ${nombreMesa(para)} solo hay ${maxMon()} hueco(s) de jaula.`;
    else nota.textContent = "Le llegará en su próximo turno, antes de sus decretos.";
  };

  const elegir = (p) => {
    para = p;
    monedas = 0;
    decretos = 0;
    mons.clear();
    form.classList.remove("oculto");
    destino.textContent = `Para ${nombreMesa(p)} · vida ${Math.max(0, 20 - (p.puntosMonsters ?? 0))}/20`;
    pintarMons();
    refrescar();
  };

  panel.addEventListener("click", async (ev) => {
    const persona = ev.target.closest("[data-aliado]");
    if (persona) {
      const p = aliados.find((a) => a.id === persona.dataset.aliado);
      if (p) elegir(p);
      return;
    }
    const chip = ev.target.closest("[data-peticion]");
    if (chip) {
      const clave = chip.dataset.peticion;
      if (clave in peticion) peticion[clave] = !peticion[clave];
      refrescarPeticion();
      return;
    }
    if (ev.target.closest("[data-cancelar-peticion]")) {
      if (!enviarAccion || !tocaMesa || faseMesa !== "acciones") return;
      const r = await enviarAccion({ tipo: "cancelar_peticion" });
      if (r?.error) aviso(r.error, { error: true });
      else aviso("Petición cancelada.");
      return;
    }
    if (ev.target.closest("[data-pedir]")) {
      if (!enviarAccion) return;
      const hay = peticion.monedas || peticion.decretos || peticion.monstruos;
      if (!hay || !tocaMesa || faseMesa !== "acciones") return;
      pedir.disabled = true;
      const r = await enviarAccion({ tipo: "pedir_aliado", ...peticion });
      if (r?.error) { aviso(r.error, { error: true }); refrescarPeticion(); return; }
      aviso("Petición enviada a tus aliados.");
      peticion.monedas = false;
      peticion.decretos = false;
      peticion.monstruos = false;
      refrescarPeticion();
      return;
    }
    if (!para) return;
    const mas = ev.target.closest("[data-mas]");
    const menos = ev.target.closest("[data-menos]");
    if (mas || menos) {
      const clave = (mas || menos).dataset[mas ? "mas" : "menos"];
      const delta = mas ? 1 : -1;
      if (clave === "monedas") monedas = Math.max(0, Math.min(energiaMesa, monedas + delta));
      if (clave === "decretos") decretos = Math.max(0, Math.min(accionesRestantesMesa, decretos + delta));
      refrescar();
      return;
    }
    const mon = ev.target.closest("[data-mon]");
    if (mon) {
      const id = mon.dataset.mon;
      if (mons.has(id)) mons.delete(id);
      else if (mons.size >= maxMon()) { aviso(`En ${nombreMesa(para)} no queda ningún hueco de jaula.`, { error: true }); return; }
      else mons.add(id);
      refrescar();
      return;
    }
    if (!ev.target.closest("[data-enviar]")) return;
    if (!enviarAccion || !para) return;
    const total = monedas + decretos + mons.size;
    if (!total) return;
    enviar.disabled = true;
    const r = await enviarAccion({ tipo: "enviar_aliado", para: para.id, monedas, decretos, monstruos: [...mons] });
    if (r?.error) { aviso(r.error, { error: true }); refrescar(); return; }
    aviso(`Enviado a ${nombreMesa(para)}. Le llegará en su próximo turno.`);
    monedas = 0;
    decretos = 0;
    mons.clear();
    pintarMons();
    refrescar();
  });
}

/* ── Torres: un hueco por camino, con el nivel encima y el camino debajo ── */

/* El bloque visual compartido por el panel de Torres y el detalle del rival.
   En el panel propio las torres se pueden tocar; en el rival es solo lectura,
   y cada columna lleva `data-calle` para soltar allí la lanzadera. */
function bloqueTorres(torres, senderos = [], { interactivo = true, marcar = null, huecoTorre = null } = {}) {
  const lista = Array.isArray(torres) ? torres : [];
  const caminos = ["Camino izquierdo", "Camino central", "Camino derecho"];
  const senderosLista = Array.isArray(senderos) ? senderos : [];
  const torre = (i) => {
    const n = Number(lista[i]?.nivel) || 0;
    const dentro = n
      ? `<img src="${imgTorre(n)}" class="bw-box-img bw-torre-ficha" alt="torre nivel ${n}">`
      /* En el rival no hay un «+» que pulsar: si no hay torre, el hueco queda
         vacío. En el panel propio sí se mantiene el «+». */
      : (huecoTorre === "nada" ? ""
        : (huecoTorre === "x" || !interactivo) ? `<i class="bw-torre-x" aria-hidden="true"></i>`
          : `<span class="bw-box-x">+</span>`);
    /* Sin el texto «Torre»: el nivel va en el mismo círculo con número que
       llevan los monstruos arriba a la derecha. */
    const nivel = n
      ? `<b class="bw-box-nv" title="Torre nivel ${n}">${n}</b>`
      : "";
    const sendero = senderosLista[i];
    const fichas = [0, 1, 2, 3].map((paso) =>
      sendero?.posiciones?.[paso] ?? (sendero?.monstruos ?? []).find((m) => m.pos === paso) ?? null);
    const hueco = (paso) => {
      const f = fichas[paso];
      const numero = paso + 1;
      if (!f) {
        return `<div class="bw-box-slot bw-torre-slot vacio" title="Peldaño ${numero}: libre"><span class="bw-torre-step">${numero}</span></div>`;
      }
      const nivelFicha = f.nivel ?? f.fuerza ?? "?";
      const atacante = f.tipo === "atacante";
      /* El modo objetivo convierte la ficha en un botón: el que llama decide
         qué fichas se pueden tocar y con qué atributos se marcan. */
      const marca = marcar ? marcar(sendero, i, paso) : null;
      /* En el panel de torres, el peldaño con un atacante abre el disparo y el
         que tiene un monstruo mío abre el panel de mover/atacar. */
      const attrs = `${interactivo && atacante
        ? ` data-disparo-slot data-sendero="${sendero?.id ?? i + 1}" data-posicion="${paso}" data-nivel="${nivelFicha}"`
        : interactivo && !marca
          ? ` data-mover-slot data-sendero="${sendero?.id ?? i + 1}" data-posicion="${paso}" data-nivel="${nivelFicha}" data-ficha="${esc(f.id ?? "")}"`
          : ""}${marca?.attrs ?? ""}`;
      const titulo = marca?.titulo ?? (atacante
        ? `Atacante nivel ${nivelFicha} en el peldaño ${numero}${interactivo ? ": toca para disparar" : ""}`
        : `${interactivo ? "Tu monstruo" : "Monstruo"} nivel ${nivelFicha} en el peldaño ${numero}${interactivo ? ": toca para avanzar o atacar" : ""}`);
      return `<div class="bw-box-slot lleno bw-torre-slot ${atacante ? "atacante" : "defensor"}${marca ? " objetivo" : ""}"${attrs} title="${titulo}"><img src="${imgMonstruo(nivelFicha, atacante)}" class="bw-box-img" alt="monstruo"><b class="bw-box-nv">${nivelFicha}</b><span class="bw-torre-step">${numero}</span></div>`;
    };
    const attrsTorre = interactivo
      ? ` data-torre-pos="${i + 1}" title="${n ? `Torre nivel ${n}: toca para mejorar` : "Hueco libre: toca para construir"}"`
      : ` title="${n ? `Torre nivel ${n}` : "Torre vacía"}"`;
    /* `data-calle` marca la columna entera: en el detalle del rival es la
       zona donde se suelta la lanzadera, sin apuntar al peldaño exacto. */
    return `
      <div class="bw-torre" data-calle="${sendero?.id ?? i + 1}">
        <div class="bw-torre-camino">${caminos[i]}</div>
        <div class="bw-box-slot bw-torre-img ${n ? "lleno" : "vacio"}"${attrsTorre}>${dentro}${nivel}</div>
        <div class="bw-torre-slots">${[3, 2, 1, 0].map(hueco).join("")}</div>
      </div>`;
  };
  return `<div class="bw-torres">${[0, 1, 2].map(torre).join("")}</div>`;
}

function pintarTorres(torres, senderos = []) {
  const lista = Array.isArray(torres) ? torres : [];
  return `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Torres <span class="bw-panel-sub">${lista.filter(t => t?.nivel).length} / 3</span></div>
      <button class="bw-panel-x" type="button" data-cerrar-panel aria-label="Cerrar">×</button>
    </div>
    ${bloqueTorres(lista, senderos)}
  `;
}

/* ── Acciones y criadero ───────────────────────────────────────────────
   Las jugadas legales se eligen en un modal (fondo gris, botones uno debajo
   de otro) y se cierra al hacer una. El criadero usa el mismo formato. */

/* Espejo de nivelMaxLab del motor, solo para el aviso del panel. */
const NIVEL_MAX_CRIADERO_UI = 5;
const COSTE_MONSTRUO_UI = { 1: 0, 2: 1, 3: 2, 5: 3 };
function nivelMaxCriadero(n) {
  return n >= 4 ? NIVEL_MAX_CRIADERO_UI : Math.max(1, n);
}

/* Lo que el criadero deja criar ahora mismo y lo que cuesta cada nivel. Sin
   esto, los niveles que no salen por falta de monedas parecen un fallo del
   criadero. */
function notaCriadero() {
  const lab = criaderoMesa || 1;
  const max = nivelMaxCriadero(lab);
  const barato = cienciasMesa.some(c => c.efecto === "monstruo_barato") ? 1 : 0;
  const costes = Object.keys(COSTE_MONSTRUO_UI).map(Number)
    .filter(nv => nv <= max)
    .map(nv => `nv ${nv} = ${Math.max(0, COSTE_MONSTRUO_UI[nv] - barato)} mon.`)
    .join(" · ");
  return `🩸 Criadero ${lab} · crea hasta nivel ${max}${costes ? ` · ${costes}` : ""}`;
}

function motivoSinAcciones() {
  return !tocaMesa
    ? "Esperando tu turno."
    : faseMesa === "descartar"
      ? "Ahora toca descartar: elige una carta de la mano."
      : "No te queda ninguna acción este turno.";
}

function cerrarModalAcciones() {
  document.getElementById("bw-modal-acciones")?.remove();
}

/* Modal de acciones: el mismo fondo gris de las cartas y una fila por jugada.
   Al ejecutar una, el modal se cierra (la siguiente se abre otra vez). */
function abrirModalAcciones() {
  cerrarModalAcciones();
  const lista = (accionesMesa ?? []).filter(a => a.tipo !== "lanzar" && a.tipo !== "no_lanzar");
  const cuerpo = lista.length
    ? `<div class="bw-modal-lista">${lista.map(a =>
        `<button type="button" class="bw-modal-usar bw-acc-op" data-i="${accionesMesa.indexOf(a)}">${esc(a.etiqueta ?? a.texto ?? "Acción")}</button>`
      ).join("")}</div>`
    : `<p class="bw-modal-pie">${esc(motivoSinAcciones())}</p>`;

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-acciones";
  fondo.className = "bw-modal-fondo bw-hoja-modal";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Acciones">
      <button type="button" class="bw-modal-x" aria-label="Cerrar">×</button>
      <div class="bw-modal-titulo">Acciones</div>
      ${cuerpo}
      <p class="bw-modal-pie">${esc(notaCriadero())}</p>
    </div>`;
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrar(); });
  fondo.querySelector(".bw-modal-x").addEventListener("click", cerrar);

  for (const b of fondo.querySelectorAll(".bw-acc-op")) {
    b.addEventListener("click", async () => {
      const accion = accionesMesa[Number(b.dataset.i)];
      if (!accion || !enviarAccion) return;
      /* Disparar también desde la lista de acciones enseña las bolas. */
      if (accion.tipo === "atacar_monstruo") {
        dispararConTorres({ sendero: accion.sendero, posicion: accion.posicion, plan: null });
      }
      b.disabled = true;
      const r = await enviarAccion(accion);
      if (r?.error) {
        aviso(r.error, { error: true });
        b.disabled = false;
        return;
      }
      cerrar();
    });
  }
}

/* Bestiario para el criadero: lo que es cada nivel y lo que cuesta criarlo. */
const BESTIARIO_UI = [
  { nivel: 1,        nombre: "Rastreador",       puntos: 1, coste: 0, texto: "1 de vida · 1 de fuerza",  stats: "1 de ataque · 1 de avance" },
  { nivel: "volador",nombre: "Aves de bruma",  puntos: 1, coste: 1, texto: "Vuela sobre defensores · avanza 2 · solo torres la destruyen", stats: "1 de ataque · 2 de avance", vuela: true },
  { nivel: 2,        nombre: "Carroñero",        puntos: 2, coste: 1, texto: "2 de vida · 2 de fuerza",  stats: "2 de ataque · 1 de avance" },
  { nivel: 3,        nombre: "Yeti",             puntos: 3, coste: 2, texto: "3 de vida · 3 de fuerza",  stats: "3 de ataque · 1 de avance" },
  { nivel: 5,        nombre: "Coloso de hielo",  puntos: 5, coste: 3, texto: "5 de vida · 5 de fuerza",  stats: "5 de ataque · 1 de avance" },
];

/* Jaula a la que va la cría: la del hueco del box por el que se entra, así que
   el criadero no necesita preguntarla. */
let boxCriadero = 0;

/* Modal del criadero: los cuatro monstruos del bestiario con su imagen, lo que
   cuesta criarlos, lo que hacen y un botón grande de criar. La jaula es la del
   «+» por el que se ha entrado; si se abre desde el edificio, la primera que
   tenga un hueco libre. */
function abrirCriadero(boxInicial = null) {
  const libresEnBox = (b) => (boxActual ?? []).slice(b * 2, b * 2 + 2).filter((m) => !m).length;
  boxCriadero = (boxInicial === 0 || boxInicial === 1)
    ? boxInicial
    : (libresEnBox(0) > 0 ? 0 : 1);
  document.getElementById("bw-modal-criadero")?.remove();
  if (!tocaMesa || faseMesa !== "acciones") {
    aviso("Solo se cría en tu fase de decretos.", { error: true });
    return;
  }
  if (accionesRestantesMesa <= 0) {
    aviso("Ya no te quedan decretos este turno.", { error: true });
    return;
  }
  if (libresEnBox(0) === 0 && libresEnBox(1) === 0) {
    aviso("Las jaulas están llenas: saca un monstruo antes de criar.", { error: true });
    return;
  }

  const nivelCriadero = criaderoMesa || 1;
  const max = nivelMaxCriadero(nivelCriadero);
  const barato = cienciasMesa.some(c => c.efecto === "monstruo_barato") ? 1 : 0;
  const monedasDe = (m) => Math.max(0, m.coste - barato);
  /* Siempre los cuatro del bestiario: los que el criadero aún no alcanza se
     pintan como hueco, para que la fila mida lo mismo que la de las torres. */
  const lista = BESTIARIO_UI;
  const libre = libresEnBox(boxCriadero) > 0;

  /* Cuadrados de jaula, como los del búnker: el monstruo dentro, su nombre
     debajo, el coste a la izquierda y la fuerza a la derecha. Nada de cartas
     de papel. Lo que el criadero todavía no permite criar deja el mismo
     cuadrado, redondo y a trazos, sin nada dentro. */
  const celda = (m) => {
    if (!m.vuela && m.nivel > max) {
      return `<div class="bw-criar-item"><div class="bw-box-slot bw-criar-hueco" title="Criadero ${ROMANOS[nivelCriadero] || nivelCriadero}: todavía no se puede criar ${esc(m.nombre)}"></div></div>`;
    }
    const monedas = m.vuela ? m.coste : monedasDe(m);
    const puede = monedas <= energiaMesa && libre;
    return `
      <div class="bw-criar-item">
        <button type="button" class="bw-box-slot lleno bw-criar-celda" data-nivel="${m.nivel}"${m.vuela ? ' data-volador="1"' : ""} title="${esc(m.texto)}"${puede ? "" : " disabled"}>
          <img src="${imgMonstruo(m.vuela ? "volador" : m.nivel, false, true)}" class="bw-box-img" alt="">
          <b class="bw-criar-fuerza" title="Fuerza ${m.puntos}">${m.puntos}</b>
          <span class="bw-criar-nombre">${esc(m.nombre)}</span>
        </button>
        <span class="bw-criar-coste">${monedas} ${monedas === 1 ? "moneda" : "monedas"}</span>
      </div>`;
  };

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-criadero";
  fondo.className = "bw-modal-fondo bw-hoja-modal";
  fondo.innerHTML = `
    <div class="bw-modal bw-desc-modal" role="dialog" aria-modal="true" aria-label="Criadero">
      <div class="bw-panel-head">
        <div class="bw-panel-label">Criadero ${ROMANOS[criaderoMesa || 1] || (criaderoMesa || 1)}</div>
        <button class="bw-panel-x" type="button" data-cerrar-criadero aria-label="Cerrar">×</button>
      </div>
      <div class="bw-criar-grid">${lista.map(celda).join("")}</div>
      <p class="bw-criar-pista">Elige el monstruo que quieres criar</p>
      <p class="bw-desc-nota"></p>
      <div class="bw-modal-acciones">
        <button type="button" class="bw-modal-usar bw-criar-ok" disabled>Criar</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const ok = fondo.querySelector(".bw-criar-ok");
  const nota = fondo.querySelector(".bw-desc-nota");
  const pista = fondo.querySelector(".bw-criar-pista");
  const marcar = () => {
    const sel = fondo.querySelector(".bw-criar-celda.sel");
    const esVolador = sel?.dataset.volador === "1";
    const m = sel ? lista.find(x => esVolador ? x.vuela : x.nivel === Number(sel.dataset.nivel)) : null;
    ok.disabled = !m;
    const monedas = m ? (m.vuela ? m.coste : monedasDe(m)) : 0;
    ok.textContent = m ? `Criar ${m.nombre} · ${monedas}` : "Criar";
    pista.textContent = m?.stats ?? "Elige el monstruo que quieres criar";
    nota.textContent = libre ? "" : `La jaula ${ROMANOS[boxCriadero + 1]} está llena: saca un monstruo antes de criar.`;
  };
  marcar();

  /* Un solo monstruo marcado a la vez. */
  for (const b of fondo.querySelectorAll(".bw-criar-celda")) {
    b.addEventListener("click", () => {
      const ya = b.classList.contains("sel");
      fondo.querySelectorAll(".bw-criar-celda").forEach(x => x.classList.remove("sel"));
      if (!ya) b.classList.add("sel");
      marcar();
    });
  }

  const cerrar = () => fondo.remove();
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrar(); });
  fondo.querySelector("[data-cerrar-criadero]").addEventListener("click", cerrar);

  ok.addEventListener("click", async () => {
    const sel = fondo.querySelector(".bw-criar-celda.sel");
    if (!sel || !enviarAccion) return;
    ok.disabled = true;
    const esVolador = sel.dataset.volador === "1";
    const accion = esVolador
      ? { tipo: "crear_volador", boxIdx: boxCriadero }
      : { tipo: "crear_monstruo", nivel: Number(sel.dataset.nivel), boxIdx: boxCriadero };
    const r = await enviarAccion(accion);
    if (r?.error) {
      aviso(r.error, { error: true });
      marcar();
      return;
    }
    cerrar();
  });
}

/* ── Reglas: la referencia de reglas del juego ──────────────────────────── */

function pintarManuscritos() {
  const fila = (a, b, c) => `
    <div class="man-fila">
      <span class="man-a">${esc(a)}</span>
      <span class="man-b">${esc(b)}</span>
      ${c ? `<span class="man-c">${esc(c)}</span>` : "<span></span>"}
    </div>`;
  const seccion = (tit, cuerpo) => `
    <section class="man-sec">
      <div class="man-tit">${esc(tit)}</div>
      ${cuerpo}
    </section>`;
  const parrafo = (txt) => `<p class="man-p">${esc(txt)}</p>`;
  /* Una fase del turno: título en negrita y el detalle detrás, en el mismo
     párrafo. Así el texto largo fluye y no se sale del panel. */
  const paso = (tit, txt) => `<div class="man-paso"><b>${esc(tit)}</b> ${esc(txt)}</div>`;

  return `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Reglas</div>
      <button class="bw-panel-x" type="button" data-cerrar-panel aria-label="Cerrar">×</button>
    </div>

    ${seccion("Fases del turno", `
      ${paso("1. Lanzaderas", "Lanzas los monstruos cargados a las escaleras de un rival.")}
      ${paso("2. Avance atacantes", "Los atacantes de tus escaleras suben un peldaño. Si hay un defensor delante, pelean.")}
      ${paso("3. Avance defensores", "Tus monstruos bajan un peldaño hacia la lanzadera.")}
      ${paso("4. Carta de Destino", "Se revela la carta del ciclo y se resuelve: avistamientos, calma, eventos o un daño a tus torres.")}
      ${paso("5. Decretos", "Gastas tus 2 decretos —y los que den las cartas— en lo que explico debajo.")}
      ${paso("6. Descarte", "Tiras 1 o 2 cartas y robas hasta volver a tener 4 en la mano.")}
      ${parrafo("Con cada decreto puedes hacer una cosa: jugar una carta de la mano, disparar con las torres (el daño se paga en monedas), criar un monstruo (1 decreto + sus monedas), construir una torre (1 decreto + 1 moneda), subir una torre de nivel (1 decreto + 2 monedas) o avanzar un monstruo tuyo (1 decreto + 1 moneda).")}
      ${parrafo("Un monstruo que llega al final de su escalera espera en la lanzadera hasta que lo lances. Si un atacante sube desde el cuarto peldaño, entra en la fortaleza y suma sus puntos: con más de 20, tu fortaleza cae.")}
    `)}

    ${seccion("Destino", `
      ${fila("Luna 1", "Se ha avistado un rastreador", "1 rastreador")}
      ${fila("Luna 2", "Se ha avistado un carroñero", "1 carroñero y 2 rastreadores")}
      ${fila("Luna 3", "Calma", "no aparece nadie")}
      ${fila("Luna 4", "2 rastreadores avistados", "2 rastreadores")}
      ${parrafo("La carta es la misma para toda la mesa y se revela una vez por luna. Este primer ciclo va fijo, para que todas las partidas arranquen igual. Desde la luna 5 el mazo se baraja y solo salen las cartas del tramo de la luna: tramo 2 en las lunas 5 a 8 y tramo 3 desde la 9.")}
    `)}

    ${seccion("Bestiario", `
      ${fila("Rastreador", "Nv 1", "1 pto · gratis")}
      ${fila("Aves de bruma", "Volador", "1 pto · 1 mon. · avanza 2 · vuela sobre defensores · solo torres la destruyen")}
      ${fila("Carroñero", "Nv 2", "2 ptos · 1 mon.")}
      ${fila("Yeti", "Nv 3", "3 ptos · 2 mon.")}
      ${fila("Coloso de hielo", "Nv 5", "5 ptos · 3 mon.")}
      ${fila("Devorador de cumbres", "Nv 7", "7 ptos · no se crea")}
      ${parrafo("Los puntos se suman cuando el monstruo entra en tu fortaleza. Con más de 20, tu fortaleza cae.")}
      ${parrafo("El Aves de bruma es especial: vuela sobre los monstruos defensores (no combate con ellos), avanza 2 peldaños por turno y solo puede ser destruida por las torres.")}
    `)}

    ${seccion("Criadero", `
      ${fila("Criadero 1", "crea hasta Nv 1", "de serie")}
      ${fila("Criadero 2", "crea hasta Nv 2", "2 mon.")}
      ${fila("Criadero 3", "crea hasta Nv 3", "2 mon.")}
      ${fila("Criadero 4", "crea hasta Nv 5", "2 mon.")}
      ${parrafo("Arrancas en el nivel 1. Las cartas Criadero +1 (2 monedas) suben un nivel cada una, pero solo llegan hasta el 3: para el 4 hace falta la carta CRIADERO 4, que desbloquea los colosos. El devorador de cumbres nunca sale del criadero: solo llega por Destino o subiendo de rango.")}
    `)}

    ${seccion("Armería", `
      ${fila("Armería 1", "torres Nv 1", "de serie")}
      ${fila("Armería 2", "torres Nv 2", "2 mon.")}
      ${fila("Armería 3", "torres Nv 3", "2 mon.")}
      ${parrafo("Arrancas en el nivel 1. Las cartas Armería +1 (2 monedas) suben un nivel cada una y solo llegan hasta el 2; el nivel 3 lo da la carta ARMERÍA 3.")}
      ${parrafo("Las tres torres se construyen en la peana del búnker, una por escalera: 1 moneda construirlas y 2 más por cada subida de nivel (nivel II, 3 en total; nivel III, 5).")}
    `)}

    ${seccion("Disparar con las torres", `
      ${parrafo("Toca un atacante que suba por tus escaleras: el daño de tus torres se suma y hay que igualar su nivel para matarlo.")}
      ${parrafo("Cada punto de daño cuesta 1 moneda. Una torre hace su nivel completo en su propia escalera y uno menos en las demás (la de nivel 1 no llega a las otras).")}
      ${parrafo("Mientras haya un atacante en el último peldaño de la escalera de una torre, esa torre queda apagada.")}
    `)}

    ${seccion("Las escaleras", `
      ${parrafo("A la fortaleza se sube. Hay tres escaleras: la de la izquierda, la central y la de la derecha, con cuatro peldaños cada una.")}
      ${parrafo("Los atacantes suben un peldaño al empezar tu turno; al subir desde el cuarto entran en la fortaleza y suman sus puntos.")}
      ${parrafo("Tus monstruos bajan hacia el primer peldaño y, al llegar, pasan a la lanzadera para lanzarlos el turno siguiente.")}
      ${parrafo("Si el atacante que llega a un peldaño es igual o más fuerte, mata al monstruo que lo defiende.")}
    `)}

    ${seccion("Recursos y ciencia", `
      ${fila("Recursos 1 ×4", "+1 moneda por turno", "1 mon.")}
      ${fila("Recursos 2 ×2", "+2 monedas por turno", "2 mon.")}
      ${fila("Decreto 1 ×2", "+1 decreto por turno", "2 mon.")}
      ${fila("Recursos mixta ×2", "+1 moneda y +1 decreto", "3 mon.")}
      ${fila("Monedas 4 ×2", "pagas 2 y recibes 4 al momento", "2 mon.")}
      ${fila("Monedas 6 ×2", "pagas 3 y recibes 6 al momento", "3 mon.")}
      ${parrafo("Las cartas de recursos no tienen tope: cada una suma su producción. La ciencia ocupa 2 huecos y hay cuatro, 8 monedas cada una: Disparar barato, Monstruos baratos, Torres universales y Protección ancestral (nadie, ni carta de Destino ni rival, puede bajar el nivel de tus torres).")}
    `)}

    ${seccion("Cartas de ciencia instantánea", `
      ${fila("Purga — aniquila los monstruos de los peldaños 3 y 4 de tus escaleras", "12 mon.", "")}
      ${fila("Bombardear — baja un nivel a una torre enemiga (la destruye si era de nivel 1)", "3 mon.", "")}
      ${fila("Subir rango — sube un nivel a un monstruo hasta nv 5", "2 mon.", "")}
      ${fila("Bajar rango — baja un nivel a un atacante de tus escaleras", "2 mon.", "")}
      ${fila("Evolucionar torre — sube una torre al siguiente nivel", "2 mon.", "")}
      ${fila("Torre de nivel 2 — construye una torre nv 2 sin necesitar Armería 2", "3 mon.", "")}
      ${fila("Monstruo de nivel 3 — crea un yeti en un box sin necesitar Criadero 3", "3 mon.", "")}
      ${fila("Subir armería — sube un nivel la armería", "3 mon.", "")}
      ${fila("Subir criadero — sube un nivel el criadero", "3 mon.", "")}
      ${fila("Criadero o armería — sube un nivel el criadero o la armería a tu elección", "4 mon.", "")}
      ${parrafo("El precio de arriba es en monedas. Jugar cualquier carta, también estas, gasta además 1 decreto.")}
    `)}

    ${seccion("Equipos y mapa", `
      ${parrafo("En modo equipos juegas con aliados contra enemigos. Desde el menú Mapa ves a todos los participantes: los aliados en azul, los enemigos en rojo.")}
      ${parrafo("Puedes visitar la fortaleza de cualquier jugador tocando su tarjeta en el mapa. Las fortalezas aliadas se muestran en azul y las enemigas en rojo.")}
      ${parrafo("En tu turno puedes enviar monedas, decretos y monstruos a un aliado, o pedir recursos. Pedir no cuesta acciones ni decretos.")}
    `)}
  `;
}

/* ── Carta de Destino del turno ─────────────────────────────────────────── */

function textoDestino(d) {
  const amenaza = ["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival", "amenaza_mixta"].includes(d.tipo);
  const n = d.nivelReal ?? (amenaza && nivelEnemigoMesa === 1 ? Math.min(1, d.nivel ?? 1) : d.nivel);
  const nota = (d.nivel && n !== d.nivel)
    ? ` · la carta es de nivel ${d.nivel}, la luna lo deja en ${n}`
    : "";
  switch (d.tipo) {
    case "amenaza": {
      const ids = Array.isArray(d.senderosDestino) ? d.senderosDestino : [];
      const cantidad = Math.max(1, Number(d.cantidad) || ids.length || 1);
      const monstruos = cantidad === 1
        ? `${nombreMonstruo(n)} (Nv ${n})`
        : `${cantidad} ${pluralMonstruo(n)} (Nv ${n})`;
      if (!ids.length) return `${monstruos} sin hueco libre en las escaleras${nota}`;
      if (ids.length === 1) return `${monstruos} por la escalera ${escaleraDe(ids[0])}${nota}`;
      if (ids.length === 2) return `${monstruos} en las escaleras ${ids.map(escaleraDe).join(" y ")}${nota}`;
      return `${monstruos}, uno por escalera${nota}`;
    }
    case "amenaza_mixta": {
      const puestos = Array.isArray(d.puestos) ? d.puestos : [];
      if (!puestos.length) return "Los avistados no encuentran hueco libre en las escaleras";
      const trozos = puestos.map((p) =>
        `${nombreMonstruo(p.nivel)} (Nv ${p.nivel}) por la escalera ${escaleraDe(p.sendero)}`);
      return trozos.length === 1 ? trozos[0] : `${trozos.slice(0, -1).join(", ")} y ${trozos[trozos.length - 1]}`;
    }
    case "amenaza_triple":  return `3 ${pluralMonstruo(n)}, uno por escalera${nota}`;
    case "amenaza_doble":   return `2 ${pluralMonstruo(n)} en 2 escaleras${nota}`;
    case "amenaza_rival":   return `1 ${nombreMonstruo(n)} en una escalera de cada fortaleza${nota}`;
    case "calma":           return "La montaña calla… no hay monstruos nuevos en el horizonte";
    case "buscar_bunker":   return "Busca en el mazo una carta de búnker que necesites y colócala";
    case "aniquilar_entrada": return "Todos los atacantes de la entrada son aniquilados";
    case "aniquilar_nivel": return "Todos los monstruos de nivel 3 o inferiores de los caminos mueren. Quítalos de las escaleras";
    case "matar_mayor":     return "Los monstruos de mayor nivel de los caminos mueren. Quítalos de las escaleras";
    case "avanzar_extra":   return "Todos los atacantes de tus escaleras suben un peldaño más";
    case "miedo":           return "Todos los atacantes de la mesa retroceden una casilla";
    case "convertir_aliado":return "Convierte un atacante de nivel 5 o menos en un monstruo tuyo";
    case "desercion":       return "Convierte uno de tus monstruos en atacante";
    case "subir_monstruos": return "Tus monstruos de nivel 5 o inferior suben un rango";
    case "bajar_monstruos": return "Tus monstruos de nivel 2 o superior bajan un rango";
    case "colocar_monstruos": return `Pon ${d.cantidad ?? 3} monstruos de nivel ${n} en tus jaulas (criadero)`;
    case "ventisca":        return "Todas tus torres bajan un nivel; las de nivel 1 se derrumban";
    case "desprendimiento": return "Tu torre de más nivel se derrumba";
    case "carta_roja":      return "¡Carta roja! Desde ahora los monstruos suben de nivel";
    default:                return String(d.tipo ?? "");
  }
}

function pintarDestino(d, mazo) {
  if (!d) return "";
  const amenaza = ["amenaza", "amenaza_triple", "amenaza_doble", "amenaza_rival", "amenaza_mixta"].includes(d.tipo);
  return `
    <div class="bw-destino${amenaza ? " amenaza" : ""}${d.tipo === "carta_roja" ? " roja" : ""}">
      <span class="bw-destino-tag">Carta de Destino</span>
      <span class="bw-destino-txt">${esc(textoDestino(d))}</span>
      <span class="bw-destino-mazo" title="Cartas que quedan en el mazo de Destino">${mazo ?? 0} en el mazo</span>
    </div>`;
}

/* ── Carta de mano ──────────────────────────────────────────────────────── */

const NOMBRES_EFECTO = {
  torreta_barata:       "Disparar barato",
  monstruo_barato:      "Monstruos baratos",
  torreta_universal:    "Torres universales",
  proteccion_torres:    "Protección ancestral",
  purga:                "Purga",
  subir_rango:          "Subir rango",
  convertir_aliado:     "Convertir aliado",
  bajar_nivel_enemigo:  "Bajar rango",
  evolucionar_torreta:  "Evolucionar torre",
  torreta2_gratis:      "Torre de nivel 2",
  monstruo3_gratis:     "Monstruo de nivel 3",
  subir_armeria:        "Subir armería",
  subir_laboratorio:    "Subir criadero",
  subir_recursos:       "Subir recursos",
  subir_lab_o_arm:      "Criadero o armería",
};

let enviarAccion = null;
let salirMesa = null;
let nivelEnemigoMesa = 1;
let accionesMesa = [];
let boxActual = [];
let lanzaderasMesa = [];
let privadaMesa = null;
let faseMesa = null;
let tocaMesa = false;
let cienciasMesa = [];
let lunaMesa = 1;
let jugadoresMesa = [];
let turnoMesa = null;
let yoMesa = null;
/* Tablero propio tal cual llega de la mesa: lo usa la elección de objetivo de
   las ciencias que tocan fichas (convertir, bajar rango). */
let miTableroMesa = null;
let modoMesa = "todos";
let miEquipoMesa = 0;
let aliadosMesa = [];
let peticionesMesa = [];
let enviosPendientesMesa = [];
let tabMesa = "cartas";
/* Visita a la fortaleza de otro jugador desde la pestaña Mapa. */
let viendoJugador = null;
let vistaContenedor = null;
let vistaOpciones = null;
let vistaRival = false;
/* Panel de matar monstruo, abierto encima del menú como los demás. */
let disparoPanel = null;
/* Regalos ya enseñados en esta sesión: el motor los conserva para que no se
   pierda el aviso, y el cliente no los repite en cada repintado. */
const regalosVistos = new Set();
/* Avisos ya leídos (se pulsó "Muchas gracias"): aunque el motor conserve el
   regalo y vuelva a llegar en un repintado, no se enseña otra vez. Se persiste
   en localStorage para que un refresco no vuelva a mostrar el mismo regalo. */
const regalosCerrados = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem("bw-regalos-cerrados") ?? "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch { return new Set(); }
})();
const regalosMostrados = new Set();
let regaloMostrando = false;
/* Aviso retrasado: si el turno cambia antes de que salga, se cancela. */
let regaloProgramado = null;

/* Envío de un aliado: la caja con su paracaídas cae sobre el velo y, cuando
   toca el suelo, sube la hoja con lo que traía. La capa de la caja va por
   debajo del modal (960 < 1000), así que la caja queda detrás de la hoja. */
function cerrarRegalo() {
  if (regaloProgramado) { clearTimeout(regaloProgramado); regaloProgramado = null; }
  document.querySelectorAll("#bw-modal-regalo, #bw-regalo-capa").forEach((nodo) => nodo.remove());
  document.body.classList.remove("bw-regalo-abierto");
  for (const id of regalosMostrados) regalosCerrados.add(id);
  try { localStorage.setItem("bw-regalos-cerrados", JSON.stringify([...regalosCerrados])); } catch {}
  regalosMostrados.clear();
  regaloMostrando = false;
}

/* La caja de un aliado espera a que el tablero esté libre. Manda la carta de
   Destino (y el aviso de turno, el descarte, el lanzamiento o un panel
   abierto): la caja se reintenta cada tercio de segundo hasta que no haya
   nada delante, en vez de salir encima de lo que el jugador está leyendo. */
const DELANTE_DEL_REGALO = [
  "#bw-modal-destino", "#bw-modal-descartar", "#bw-modal-acciones",
  "#bw-modal-lanzar", "#bw-modal-objetivo", "#bw-modal-regalo",
  "body > .bw-modal-fondo",
].join(", ");
function programarRegalo(regalos) {
  if (regaloProgramado) clearTimeout(regaloProgramado);
  regaloProgramado = setTimeout(() => {
    regaloProgramado = null;
    const delante = document.querySelector(DELANTE_DEL_REGALO)
      || document.querySelector("body > .bw-panel:not(.oculto)");
    if (delante) {
      registro("regalo en espera · hay algo delante");
      programarRegalo(regalos);
      return;
    }
    mostrarRegalo(regalos);
  }, 350);
}

function mostrarRegalo(regalos) {
  registro("regalo de", (regalos ?? []).map((r) => r.de).join(", "));
  cerrarRegalo();
  regaloMostrando = true;
  for (const g of regalos ?? []) if (g?.id) regalosMostrados.add(g.id);

  /* La caja ya está cayendo mientras la hoja se abre: así entra por arriba,
     se mece a un lado y a otro y acaba metiéndose por debajo del modal. */
  const capa = document.createElement("div");
  capa.id = "bw-regalo-capa";
  capa.className = "bw-regalo-capa";
  capa.innerHTML = `<div class="bw-regalo-caja"><div class="bw-regalo-balanceo">
    <img src="${BASE_IMG}/reward-box.png" alt="">
  </div></div>`;
  document.body.appendChild(capa);
  /* Mientras la hoja está abierta no se puede tocar el menú ni la mano: hay
     que darle a "Muchas gracias" para seguir jugando. */
  document.body.classList.add("bw-regalo-abierto");

  /* Quién manda y qué trae, en dos líneas: el nombre arriba y la carga debajo,
     sumando todas las cajas que hayan llegado juntas. */
  const totales = (regalos ?? []).reduce((t, g) => {
    t.monedas += g.monedas ?? 0;
    t.decretos += g.decretos ?? 0;
    t.monstruos += (g.monstruos?.length ?? 0) + (g.calles?.length ?? 0) + (g.sobran?.length ?? 0);
    t.calles += g.calles?.length ?? 0;
    t.sobran += g.sobran?.length ?? 0;
    return t;
  }, { monedas: 0, decretos: 0, monstruos: 0, calles: 0, sobran: 0 });

  const nombres = (regalos ?? []).map((g) => esc(g.de ?? "Un aliado"));
  const quien = nombres.length <= 1
    ? `${nombres[0] ?? "Un aliado"} te ha enviado una caja a tu fortaleza.`
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]} te han enviado cajas a tu fortaleza.`;

  /* Cuatro cuadrados como los del tablero: monedas, decretos y un cuadrado por
     monstruo con su imagen, su nombre y el nivel en el círculo. */
  const niveles = (regalos ?? []).flatMap((g) => [
    ...(g.monstruos ?? []), ...(g.calles ?? []), ...(g.sobran ?? []),
  ]);
  const items = [];
  if (totales.monedas) items.push({ tipo: "moneda", img: pilaCoins(totales.monedas), nv: totales.monedas });
  if (totales.decretos) items.push({ tipo: "decreto", img: pilaDecrees(totales.decretos), nv: totales.decretos });
  for (const nivel of niveles) items.push({ tipo: "monstruo", img: imgMonstruo(nivel), nv: nivel });
  /* Una caja por cosa: una si manda una, dos si manda dos, tres si manda tres. */
  const cuadros = items.map((it) => `<div class="bw-box-slot bw-regalo-cuadro ${it.tipo}">
      <img class="bw-box-img" src="${esc(it.img)}" alt="">
      <b class="bw-box-nv">${it.nv}</b>
    </div>`).join("");

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-regalo";
  fondo.className = "bw-modal-fondo bw-hoja-modal";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Envío de aliado">
      <div class="bw-regalo-head"><b>Envío de aliado</b></div>
      <p class="bw-regalo-intro">${quien}</p>
      <div class="bw-regalo-slots">${cuadros}</div>
      ${totales.calles ? `<p class="bw-regalo-pie">${totales.calles === 1 ? "El monstruo que no cabía" : "Los monstruos que no cabían"} ${totales.calles === 1 ? "ha" : "han"} ocupado ${totales.calles === 1 ? "un hueco libre" : "huecos libres"} de tus caminos.</p>` : ""}
      ${totales.sobran ? `<p class="bw-regalo-pie">${totales.sobran === 1 ? "El monstruo que no cabe espera" : "Los monstruos que no caben esperan"} en la caja hasta que se libere una jaula.</p>` : ""}
      <div class="bw-modal-acciones">
        <button type="button" class="bw-modal-usar bw-regalo-ok">Muchas gracias</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);
  /* Solo se cierra con el botón: es un aviso que hay que leer. El manejador va
     en el propio botón y también en la hoja, por si el toque cae en el borde. */
  const ok = fondo.querySelector(".bw-regalo-ok");
  ok?.addEventListener("click", (ev) => { ev.stopPropagation(); cerrarRegalo(); });
  fondo.addEventListener("click", (ev) => {
    if (ev.target.closest(".bw-regalo-ok")) cerrarRegalo();
  });
}
function actualizarOverlayPaneles() {
  const paneles = [".box-panel", ".torres-panel", ".mapa-panel", ".manuscritos-panel", ".aliados-panel", ".envio-panel"];
  const abierto = !!disparoPanel || paneles.some((s) => {
    const p = document.querySelector(`body > .bw-panel${s}`);
    return p && !p.classList.contains("oculto");
  });
  document.querySelector("body > .bw-panel-overlay")?.classList.toggle("oculto", !abierto);
}
function cerrarDisparo() {
  if (disparoPanel) { disparoPanel.remove(); disparoPanel = null; }
  actualizarOverlayPaneles();
}

/* Una jugada hecha desde la hoja de Torres se ve en el tablero, no dentro del
   panel: al confirmar se cierra la sub-hoja (Matar / Avanzar-Atacar / torre),
   la hoja de Torres y el velo, se baja la vista hasta las escaleras y solo
   entonces se manda la jugada. Así el disparo, el avance, la pelea o la torre
   nueva se reproducen en directo y sin nada por delante. */
async function cerrarParaVerEscaleras() {
  document.getElementById("bw-panel-mover")?.remove();
  if (disparoPanel) { disparoPanel.remove(); disparoPanel = null; }
  /* La hoja de Torres se esconde, no se quita: la pestaña del menú tiene que
     poder volver a abrirla en el mismo repintado. Se suelta la pestaña activa
     y se devuelve la mano, igual que hace la X del panel. */
  document.querySelectorAll("body > .bw-panel").forEach((p) => p.classList.add("oculto"));
  document.querySelectorAll("#bw-nav-global .bw-nav-tab").forEach((t) => t.classList.remove("activo"));
  tabMesa = "cartas";
  document.querySelector("body > .bw-mano-wrap")?.classList.remove("oculto");
  actualizarOverlayPaneles();
  await bajarAlTablero();
}

/* Cierra la interfaz que pertenece al turno anterior. Se llama antes de montar
   la vista nueva, cuando cambia la luna o el jugador en turno. No toca los
   modales de la plataforma (versión, regalo, aviso de turno): esos no son
   `bw-modal-fondo` y el aviso de turno se abre después de este cierre. */
function cerrarUiDeTurno() {
  lanzarUi = null;
  /* El envío de aliado es ahora una hoja del juego: se cierra al cambiar el
     turno y hay que soltar el aviso, o no volvería a salir nunca más. */
  if (document.getElementById("bw-modal-regalo") || document.getElementById("bw-regalo-capa")) cerrarRegalo();
  document.querySelectorAll(
    "body > .bw-modal-fondo, body > .bw-panel, body > .bw-panel-overlay"
  ).forEach((nodo) => nodo.remove());
  document.querySelector(".bw-carta.activa")?.classList.remove("activa");
  document.body.classList.remove("bw-lanzando");
  disparoPanel = null;
}

/* El descarte va por encima de todo: al salir la mano se cierra cualquier
   panel o modal del juego que hubiera debajo (torre, monstruo, disparo, una
   carta abierta…), sin llevarse por delante el propio descarte. */
function cerrarDebajoDelDescarte() {
  lanzarUi = null;
  if (document.getElementById("bw-modal-regalo") || document.getElementById("bw-regalo-capa")) cerrarRegalo();
  document.querySelectorAll(
    "body > .bw-modal-fondo:not(#bw-modal-descartar), body > .bw-panel, body > .bw-panel-overlay"
  ).forEach((nodo) => nodo.remove());
  document.querySelector(".bw-carta.activa")?.classList.remove("activa");
  document.body.classList.remove("bw-lanzando");
  disparoPanel = null;
}
/* Evita mandar dos veces el pase automático al quedarse sin decretos. */
let pasandoAuto = false;
let energiaMesa = 0;
let criaderoMesa = 0;
let accionesRestantesMesa = 0;

const BASE_IMG   = "/app/juegos/bunker-wars/img";

/* ── Música del juego ──────────────────────────────────────────────────────
   Solo este juego lleva banda sonora: una pista en bucle y un botón para
   apagarla, con el ajuste recordado entre partidas. Los navegadores no dejan
   sonar nada antes de que el jugador toque la pantalla, así que el primer
   play() puede fallar: se reintenta en el primer gesto, sin avisar de nada.
   El <audio> y el botón viven en <body>, fuera de #pantalla, para que los
   repintados del turno no se los lleven por delante. */
const RUTA_MUSICA = "/app/juegos/bunker-wars/audio/tema.m4a";
const CLAVE_MUSICA = "bw-musica";
let musicaEl = null;
let musicaBoton = null;

const ICONO_SONIDO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4Z"/><path d="M15.4 9.3a4 4 0 0 1 0 5.4"/><path d="M18.1 6.7a7.5 7.5 0 0 1 0 10.6"/></svg>';
const ICONO_MUDO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4Z"/><path d="m16.2 9.6 4.6 4.6"/><path d="m20.8 9.6-4.6 4.6"/></svg>';

function montarMusica() {
  if (musicaEl?.isConnected && musicaBoton?.isConnected) return;
  musicaEl?.remove();
  musicaBoton?.remove();

  let suena = true;
  try { suena = localStorage.getItem(CLAVE_MUSICA) !== "0"; } catch {}

  const audio = document.createElement("audio");
  audio.id = "bw-musica-audio";
  audio.src = RUTA_MUSICA;
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.35;
  audio.setAttribute("playsinline", "");
  document.body.appendChild(audio);

  /* El interruptor va en la cabecera de la app, a la izquierda de los recursos:
     ahí ya hay estilo de icono suelto (círculo de 22 px), así que el botón no
     lleva estilos propios. Solo en este juego: lo monta y lo quita el cliente. */
  const boton = document.createElement("button");
  boton.type = "button";
  boton.id = "bw-sonido";
  boton.className = "bw-sonido";
  const der = document.querySelector("#barra .barra-der");
  if (der) {
    der.insertBefore(boton, der.firstChild);
    /* 5 px de aire a su derecha: el icono no queda pegado a lo que tiene al
       lado ni al borde de la barra. */
    boton.style.marginRight = "5px";
  } else {
    /* Sin cabecera (no debería pasar en partida): flotante, para no quedarse
       sin interruptor. */
    boton.style.cssText = "position:fixed;right:10px;top:calc(var(--alto-barra, 52px) + 8px);"
      + "z-index:260;width:26px;height:26px;padding:0;border:1px solid rgba(206,214,222,.18);"
      + "border-radius:50%;display:grid;place-items:center;background:rgba(18,16,14,.55);"
      + "color:#e9dcc6;cursor:pointer;";
    document.body.appendChild(boton);
  }

  const pintaBoton = () => {
    boton.innerHTML = suena ? ICONO_SONIDO : ICONO_MUDO;
    boton.style.opacity = suena ? "1" : ".7";
    boton.setAttribute("aria-pressed", suena ? "true" : "false");
    boton.setAttribute("aria-label", suena ? "Música encendida" : "Música apagada");
    boton.title = suena ? "Música: encendida" : "Música: apagada";
  };

  /* play() devuelve promesa en los navegadores modernos; si la rechaza (falta
     gesto, o iOS al volver de segundo plano) no se hace nada: los listeners de
     gesto siguen puestos y lo reintentan en el siguiente toque. */
  const arrancar = () => {
    if (!suena || document.hidden || !audio.isConnected) return;
    const p = audio.play();
    if (p?.then) p.catch(() => {});
  };

  /* Cualquier gesto vale, y se escuchan varios porque iOS no siempre manda
     `pointerdown` en la PWA instalada: ahí el toque llega como `touchend`. */
  const conGesto = () => arrancar();
  for (const g of ["pointerdown", "touchend", "click", "keydown"]) {
    addEventListener(g, conGesto, true);
  }

  /* La música es de la app abierta: al cambiar a otra app o apagar la pantalla
     se pausa, y al volver sigue donde estaba. `pagehide`/`pageshow` cubren a
     iOS, que no siempre manda `visibilitychange` antes de congelar la PWA. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio.pause();
    else arrancar();
  });
  addEventListener("pagehide", () => audio.pause());
  addEventListener("pageshow", () => arrancar());

  boton.addEventListener("click", () => {
    suena = !suena;
    try { localStorage.setItem(CLAVE_MUSICA, suena ? "1" : "0"); } catch {}
    if (suena) arrancar(); else audio.pause();
    pintaBoton();
    registro("música", suena ? "encendida" : "apagada");
  });

  pintaBoton();
  arrancar();

  musicaEl = audio;
  musicaBoton = boton;
}
/* Láminas de monstruo disponibles por nivel. Los niveles sin arte propio
   (4 y 6, que no existen en el bestiario) usan la del 1. */
const MONSTRUOS_CON_ARTE = new Set([1, 2, 3, 5, 7]);

function imgMonstruo(nivel, atras = false, jaula = false) {
  if (nivel === "volador") {
    const vista = jaula ? "j" : atras ? "t" : "f";
    return `${BASE_IMG}/monstruos/volador-${vista}.png`;
  }
  const n = Number(nivel);
  const arte = MONSTRUOS_CON_ARTE.has(n) ? n : 1;
  /* Tres vistas por nivel: de frente (f), de espaldas (t) y dentro de la reja
     de la jaula (j). En jaulas y lanzaderas se usa siempre la de jaula. */
  const vista = jaula ? "j" : atras ? "t" : "f";
  return `${BASE_IMG}/monstruos/m${arte}-${vista}.png`;
}

/* HTML interno de una ficha de monstruo o del ave de bruma.
   Dos funciones separadas para que cada tipo tenga su propio camino. */
function htmlFichaVolador(atras = false, jaula = false) {
  return `<img src="${imgMonstruo("volador", atras, jaula)}" alt="" class="ficha-img"><b class="ficha-nv">✦</b>`;
}
function htmlFichaMonstruo(m, atras = false, jaula = false) {
  const nv = m?.nivel ?? m?.fuerza ?? 1;
  return `<img src="${imgMonstruo(nv, atras, jaula)}" alt="" class="ficha-img"><b class="ficha-nv">${nv}</b>`;
}
/* Punto de entrada: elige la función según m.vuela. */
function htmlFicha(m, atras = false, jaula = false) {
  return m?.vuela ? htmlFichaVolador(atras, jaula) : htmlFichaMonstruo(m, atras, jaula);
}
/* Igual para el interior de lanzadera/cola (clase distinta para el badge). */
function htmlFichaLanzadera(m) {
  if (m?.vuela) return `<img src="${imgMonstruo("volador", false, true)}" class="lanzadera-img" alt="monstruo"><b class="lanzadera-nv">✦</b>`;
  const nv = m?.nivel ?? m?.fuerza ?? 1;
  return `<img src="${imgMonstruo(nv, false, true)}" class="lanzadera-img" alt="monstruo"><b class="lanzadera-nv">${nv}</b>`;
}

/* Alzado de la torre según su nivel; el 1 si faltara el arte. */
function imgTorre(nivel) {
  const n = Number(nivel);
  const arte = n >= 1 && n <= 3 ? n : 1;
  return `${BASE_IMG}/torres/torre-alzado-nv${arte}.png`;
}
const ASSETS_IMG = "/app/juegos/bunker-wars/img/coins-and-decrees";
const CARD_BG    = `${BASE_IMG}/card.png`;

/* Las pilas van 1:1 con la cifra (7 imágenes como tope). Antes las monedas se
   repartían sobre el máximo de producción (14), así que 4 monedas enseñaban la
   pila de 2: al pasar a «lo que queda» el dibujo tiene que ser el número. */
/* Montones de 1 a 7. Con 0 se sigue pidiendo la imagen del montón de uno,
   pero oculta (visibility:hidden): así la caja conserva su alto y el número
   no se cae hacia abajo. */
function pilaCoins(n)   { return `${ASSETS_IMG}/coins_${Math.min(7, Math.max(1, n))}.png`; }
function pilaDecrees(n) { return `${ASSETS_IMG}/decrees_${Math.min(7, Math.max(1, n))}.png`; }
const SLOTS_CIENCIA = 2;

function defsCarta(c) {
  const defs = {
    recursos:      { emoji: "⚡", label: c.titulo ?? `Recursos nv${c.nivel ?? ""}`,  cls: "recursos",      costo: c.coste },
    decreto:       { emoji: "📜", label: c.titulo ?? `Decreto nv${c.nivel ?? ""}`,   cls: "decreto",       costo: c.coste },
    recursos_mix:  { emoji: "⚡", label: c.titulo ?? `Recursos nv${c.nivel ?? ""}`,  cls: "recursos_mix",  costo: c.coste },
    /* Monedas al momento: pagan su coste y devuelven el doble. */
    recursos_i:    { emoji: "⚡", label: c.titulo ?? "Monedas",  cls: "recursos",  costo: c.coste },
    armeria:       { emoji: "🔧", label: c.titulo ?? `Armería nv${c.nivel ?? ""}`,   cls: "armeria",       costo: c.coste },
    laboratorio:   { emoji: "🧪", label: c.titulo ?? `Criadero nv${c.nivel ?? ""}`,  cls: "laboratorio",   costo: c.coste },
    /* Suben un nivel con techo: armería hasta 2 y criadero hasta 3. */
    armeria_up:    { emoji: "🔧", label: c.titulo ?? "Armería +1",  cls: "armeria",      costo: c.coste },
    laboratorio_up:{ emoji: "🧪", label: c.titulo ?? "Criadero +1", cls: "laboratorio",  costo: c.coste },
    ciencia:       { emoji: "🔬", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Ciencia",    cls: "ciencia",    costo: c.coste },
    ciencia_i:     { emoji: "⚗️", label: c.titulo ?? NOMBRES_EFECTO[c.efecto] ?? c.efecto ?? "Inmediata",  cls: "ciencia_i",  costo: c.coste },
    /* Dichos: no se juegan, solo se descartan. */
    dicho:         { emoji: "📜", label: c.titulo ?? "Dicho",  cls: "dicho",  costo: 0 },
  };
  const def = defs[c.tipo] ?? { emoji: "?", label: c.tipo ?? "Carta", cls: "", costo: c.coste ?? 0 };
  return { ...def, label: tituloCarta(c, def.label) };
}

/* Números romanos para los niveles de las cartas: II, III, IV */
const ROMANOS = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

/* "LABORATORIO 2" → "Laboratorio II": solo la primera letra en mayúscula y
   el nivel en palitos, como se lee en las cartas de papel. */
function tituloCarta(c, fallback) {
  let label = String(c?.titulo ?? fallback ?? "");
  if (!["laboratorio", "armeria", "recursos", "decreto", "recursos_mix"].includes(c?.tipo)) return label;
  const m = label.match(/(\d+)\s*$/);
  const n = c?.nivel ?? (m ? Number(m[1]) : 0);
  label = label.replace(/\s*(nv\.?|nivel)?\s*\d+\s*$/i, "").trim().toLowerCase();
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return n ? `${label} ${ROMANOS[n] ?? n}` : label;
}

function imgCarta(tipo, nivel) {
  const mapa = {
    recursos:     "recursos",
    decreto:      "energia",
    recursos_mix: "recursos",
    recursos_i:   "recursos",
    armeria:      "armeria",
    laboratorio:  "laboratorio",
    armeria_up:     "armeria",
    laboratorio_up: "laboratorio",
    ciencia:      "ciencia",
    ciencia_i:    "ciencia",
    /* Los dichos comparten el pergamino de los decretos. */
    dicho:        "energia",
  };
  const nombre = mapa[tipo] ?? tipo;
  return `${BASE_IMG}/cartas/${nombre}.png`;
}

function cartaValida(c, bunker) {
  /* Un dicho no encaja nunca: no hay forma de jugarlo. */
  if (c.tipo === "dicho") return false;
  if (!bunker) return true;
  if (c.tipo === "armeria")     return c.nivel === (bunker.armeria ?? 0) + 1;
  if (c.tipo === "laboratorio") return c.nivel === (bunker.laboratorio ?? 0) + 1;
  if (c.tipo === "armeria_up")     return (bunker.armeria ?? 1) < 2;
  if (c.tipo === "laboratorio_up") return (bunker.laboratorio ?? 1) < 3;
  if (c.tipo === "recursos")    return true;
  if (c.tipo === "decreto")     return true;
  if (c.tipo === "recursos_mix") return true;
  if (c.tipo === "ciencia")     return !(bunker.ciencia ?? []).some(x => x.efecto === c.efecto);
  if (c.tipo === "ciencia_i") {
    if (c.efecto === "subir_armeria")     return (bunker.armeria ?? 0) < 3;
    if (c.efecto === "subir_laboratorio") return (bunker.laboratorio ?? 0) < 4;
    if (c.efecto === "subir_recursos")    return (bunker.recursos ?? []).some(r => (r.nivel ?? 1) < 4);
    if (c.efecto === "subir_lab_o_arm") {
      return (bunker.laboratorio ?? 0) < 4 || (bunker.armeria ?? 0) < 3;
    }
  }
  return true;
}

function pintarCarta(c, priv, fase, bunker) {
  const t = defsCarta(c);
  const coste = c.coste ?? t.costo ?? 0;
  const energia = priv?.energia ?? 0;
  const encaja = cartaValida(c, bunker);
  const jugable = encaja && fase === "acciones" && !!priv?.teToca
    && (priv?.accionesRestantes ?? 0) > 0 && energia >= coste;
  const sinEnergia = energia < coste;
  const descartable = fase === "descartar" && !!priv?.teToca;
  const img = imgCarta(c.tipo, c.nivel);

  return `
    <div class="bw-carta ${t.cls}${jugable ? " jugable" : " no-jugable"}${descartable ? " descartable" : ""}"
         data-uid="${esc(c.uid ?? "")}"
         data-tipo="${esc(c.tipo ?? "")}"
         data-coste="${coste}"
         data-efecto="${esc(c.efecto ?? "")}"
         data-titulo="${esc(c.titulo ?? t.label)}"
         data-descripcion="${esc(c.descripcion ?? "")}"
         data-emoji="${t.emoji}"
         data-img="${esc(img)}"
         data-encaja="${encaja ? "1" : "0"}"
         data-sin-energia="${sinEnergia ? "1" : "0"}"
         data-jugable="${jugable ? "1" : "0"}">
      ${c.tipo === "dicho" ? "" : `<span class="bw-carta-coste">${coste}</span>`}
      <span class="bw-carta-nombre">${esc(t.label)}</span>
      <div class="bw-carta-img"><img src="${esc(img)}" alt=""></div>
    </div>
  `;
}

/* El texto de las cartas puede traer **negritas** para nombrar monstruos o
   edificios. Se escapa primero y después se convierten los pares de asteriscos
   en <b>: nunca se inyecta HTML que venga de fuera. */
function conNegritas(t) {
  return esc(t ?? "").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function abrirCarta(el) {
  cerrarCarta();
  el.classList.add("activa");
  const d = el.dataset;
  const jugable = d.jugable === "1";
  const sinEnergia = d.sinEnergia === "1";
  const reemplazos = d.tipo === "ciencia" && cienciasMesa.length >= SLOTS_CIENCIA ? cienciasMesa : null;
  const opciones = accionesMesa.filter(a => a.tipo === "mejorar_bunker" && a.cartaId === d.uid);
  /* Avanzar al rival, Convertir aliado y Bajar rango no se eligen en una lista
     de botones: se abre el tablero y se toca la ficha (abrirObjetivo). */
  const conTablero = jugable && !reemplazos
    && CON_TABLERO.includes(d.efecto) && opciones.length > 0;
  const elecciones = !reemplazos && !conTablero && opciones.length > 1 ? opciones : null;
  /* Protección ancestral: el objetivo sigue en la lista, en gris y con el
     motivo a la vista, para que se entienda que existe y que no se puede tocar. */
  const todasBloqueadas = !!elecciones && elecciones.every(a => a.bloqueada);
  const unicaBloqueada = !elecciones && !conTablero && !reemplazos
    && opciones.length === 1 && !!opciones[0]?.bloqueada;

  /* Motivo por el que no se puede jugar, para el pie del modal. Las monedas se
     dicen también aunque el coste ya vaya en rojo: nunca está de más el número. */
  const CON_OBJETIVO = ["subir_rango", "convertir_aliado", "bajar_nivel_enemigo",
    "evolucionar_torreta", "torreta2_gratis", "monstruo3_gratis", "subir_lab_o_arm"];
  const sinObjetivo = jugable && CON_OBJETIVO.includes(d.efecto) && opciones.length === 0;
  /* Si el pie dice que no hay objetivo, el botón no puede quedarse activo. */
  const puedeUsar = jugable && !sinObjetivo && !unicaBloqueada;
  const motivo = jugable
    ? reemplazos
      ? "Tu búnker tiene dos ciencias. Al instalar esta sale una de las dos: elige cuál."
      : elecciones
        ? todasBloqueadas
          ? opciones[0]?.motivo ?? "Ese rival no se puede tocar."
          : "Elige el objetivo de la carta."
        : unicaBloqueada
        ? opciones[0]?.motivo ?? "Ese rival no se puede tocar."
        : sinObjetivo
          ? "Ahora mismo no hay ningún objetivo válido para esta carta: guárdala para más adelante."
          : ""
    : d.tipo === "dicho"
      ? "Un dicho no hace nada: solo se puede descartar en tu fase de descarte."
      : d.encaja === "0"
      ? d.tipo === "ciencia_i"
        ? "Ese edificio ya está a su nivel máximo, así que esta carta no subiría nada: guárdala para cuando lo amplíes."
        : "Esta carta no encaja en tu búnker ahora mismo: sube al nivel inmediatamente siguiente y no repitas lo que ya tienes."
      : sinEnergia
        ? ""
        : accionesRestantesMesa <= 0
          ? "Ya no te quedan decretos este turno."
          : !tocaMesa || faseMesa !== "acciones"
            ? "Solo se puede jugar en tu fase de decretos, cuando te toca."
            : "";

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-carta";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="${esc(tituloCarta(d, d.titulo))}">
      <div class="bw-carta-grande">
        ${d.tipo === "dicho" ? "" : `<span class="bw-carta-coste-grande${sinEnergia ? " sin-energia" : ""}">${d.coste}</span>`}
        <div class="bw-carta-grande-img"><img src="${esc(d.img ?? "")}" alt=""></div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(tituloCarta(d, d.titulo))}</div>
          <p class="bw-carta-grande-desc">${conNegritas(d.descripcion)}</p>
        </div>
      </div>
      <div class="bw-modal-acciones">
        ${reemplazos
          ? reemplazos.map(c => `<button type="button" class="bw-modal-usar" data-reemplazo="${esc(c.efecto ?? "")}"${jugable ? "" : " disabled"}>Quitar ${esc(NOMBRES_EFECTO[c.efecto] ?? c.titulo ?? c.efecto ?? "?")}</button>`).join("")
          : conTablero
            ? `<button type="button" class="bw-modal-usar" data-tablero="1">${esc(ETIQUETA_TABLERO[d.efecto] ?? "Elegir objetivo")}</button>`
          : elecciones
            ? elecciones.map(a => `<button type="button" class="bw-modal-usar" data-accion="${accionesMesa.indexOf(a)}"${jugable && !a.bloqueada ? "" : " disabled"}${a.bloqueada ? ` title="${esc(a.motivo ?? "")}"` : ""}>${esc(a.edificio ? (a.edificio === "armeria" ? "Subir armería" : "Subir criadero") : (a.etiqueta ?? a.texto ?? "Usar carta"))}</button>`).join("")
            : `<button type="button" class="bw-modal-usar"${puedeUsar ? "" : " disabled"}${opciones.length === 1 ? ` data-accion="${accionesMesa.indexOf(opciones[0])}"` : ""}>Usar carta</button>`}
      </div>
      <button type="button" class="bw-modal-cancelar">Cancelar</button>
      ${motivo ? `<p class="bw-modal-nota">${esc(motivo)}</p>` : ""}
    </div>
  `;
  document.body.appendChild(fondo);

  fondo.querySelector(".bw-modal-cancelar").addEventListener("click", cerrarCarta);
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrarCarta(); });
  document.addEventListener("keydown", escaparCarta);

  /* El botón de tablero no envía nada por sí solo: cierra la carta y abre la
     elección sobre el tablero. */
  const btnTablero = fondo.querySelector("[data-tablero]");
  if (btnTablero) {
    btnTablero.addEventListener("click", () => {
      const listaTablero = opciones.slice();
      cerrarCarta();
      abrirObjetivo(d.efecto, d.uid, listaTablero);
    });
  }

  if (jugable) {
    for (const usar of fondo.querySelectorAll(".bw-modal-usar:not([data-tablero])")) {
      usar.addEventListener("click", () => {
        usar.disabled = true;
        usar.textContent = "Usando…";
        const idx = usar.dataset.accion;
        const accion = idx !== undefined && accionesMesa[Number(idx)]
          ? { ...accionesMesa[Number(idx)] }
          : { tipo: "mejorar_bunker", cartaId: d.uid };
        if (usar.dataset.reemplazo) accion.reemplazo = usar.dataset.reemplazo;
        usarCarta(accion, usar);
      });
    }
  }
}

function cerrarCarta() {
  document.getElementById("bw-modal-carta")?.remove();
  document.querySelector(".bw-carta.activa")?.classList.remove("activa");
  document.removeEventListener("keydown", escaparCarta);
}

/* ── Ciencia con objetivo: se elige tocando la ficha ─────────────────────
   Estas tres no se resuelven con una lista de botones: abren el mismo tipo de
   hoja que la fase de lanzaderas. Avanzar al rival pide primero la fortaleza
   (como al lanzar) y luego el monstruo; Convertir aliado y Bajar rango van
   directos al tablero propio. El motor ya manda una acción legal por objetivo,
   así que aquí solo se agrupan y se pintan como fichas tocables. */
const CON_TABLERO = ["convertir_aliado", "bajar_nivel_enemigo"];
const ETIQUETA_TABLERO = {
  convertir_aliado:    "Elegir a quién convertir",
  bajar_nivel_enemigo: "Elegir a quién bajar",
};
const TITULO_TABLERO = {
  convertir_aliado:    "Convertir aliado",
  bajar_nivel_enemigo: "Bajar rango",
};
const SUB_TABLERO = {
  convertir_aliado:    "Toca el atacante que se pasa a tu bando.",
  bajar_nivel_enemigo: "Toca el atacante que baja un rango.",
};

function abrirObjetivo(efecto, cartaUid, opciones) {
  document.getElementById("bw-modal-objetivo")?.remove();
  const lista = (opciones ?? []).filter(a => a.tipo === "mejorar_bunker" && a.cartaId === cartaUid);
  if (!lista.length) return false;

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-objetivo";
  fondo.className = "bw-modal-fondo";
  document.body.appendChild(fondo);
  /* La misma clase que la lanzadera: mientras la hoja está abierta, el menú de
     abajo no abre cartas ni paneles. */
  document.body.classList.add("bw-lanzando");

  const cerrar = () => {
    fondo.remove();
    document.body.classList.remove("bw-lanzando");
    document.removeEventListener("keydown", escaparObjetivo);
  };
  const escaparObjetivo = (ev) => { if (ev.key === "Escape") cerrar(); };
  document.addEventListener("keydown", escaparObjetivo);

  const enviar = async (accion, el) => {
    if (!accion || !enviarAccion) return;
    if (el) el.disabled = true;
    /* Se cierra antes de enviar para que el repintado enseñe el avance limpio. */
    cerrar();
    await usarCarta({ ...accion }, null);
  };

  /* Acciones legales agrupadas por jugador (el propio o el rival según el
     caso) y por calle+peldaño, que es lo que pinta bloqueTorres. */
  const porJugador = (jugadorId) => {
    const mapa = new Map();
    for (const a of lista) {
      const id = a.objetivo?.jugadorId ?? yoMesa;
      if (id !== jugadorId) continue;
      mapa.set(`${a.objetivo?.sendero}|${a.objetivo?.posicion}`, a);
    }
    return mapa;
  };

  /* Resumen de las tres calles para el listado de rivales. */
  const callesResumen = (p, mapa) => [0, 1, 2].map(i => {
    const sd = p.senderos?.[i] ?? {};
    const sid = sd.id ?? i + 1;
    const torre = Number(p.bunker?.torres?.[i]?.nivel) || 0;
    const fichas = [3, 2, 1, 0].map(paso => {
      const f = sd.posiciones?.[paso] ?? (sd.monstruos ?? []).find(m => m.pos === paso) ?? null;
      if (!f) return cuadroLz(0, "bz-vacio", `Peldaño ${paso + 1}: libre`);
      const n = f.nivel ?? f.fuerza ?? "?";
      const atacante = f.tipo === "atacante";
      return cuadroLz(n, atacante ? "bz-at" : "bz-def",
        `${atacante ? "Atacante" : "Defensor"} nivel ${n} en el peldaño ${paso + 1}`,
        mapa.has(`${sid}|${paso}`) ? "objetivo" : "");
    }).join("");
    return `<span class="bw-lz-calle">
      ${cuadroLz(torre, "bz-torre", `Torre ${i + 1}: ${torre ? `nivel ${torre}` : "vacía"}`)}
      ${fichas}
    </span>`;
  }).join("");

  /* Tablero con las fichas legales marcadas y tocables. */
  const tablero = (p, jugadorId) => {
    const mapa = porJugador(jugadorId);
    return `<div class="bw-lz-torres">${bloqueTorres(p.bunker?.torres ?? [], p.senderos ?? [], {
      interactivo: false,
      huecoTorre: "nada",
      marcar: (sendero, i, paso) => {
        const a = mapa.get(`${sendero?.id ?? i + 1}|${paso}`);
        if (!a) return null;
        return {
          attrs: ` data-objetivo-op="${lista.indexOf(a)}"`,
          titulo: esc(a.texto ?? a.etiqueta ?? "Toca para elegir"),
        };
      },
    })}</div>`;
  };

  const pasoRivales = () => {
    fondo.classList.remove("lz-detalle");
    fondo.classList.add("lz-inicial");
    const ids = [...new Set(lista.map(a => a.objetivo?.jugadorId).filter(Boolean))];
    const filas = ids.map(id => {
      const r = jugadoresMesa.find(x => x.id === id) ?? { id };
      const mapa = porJugador(id);
      const vida = Math.max(0, 20 - (r.puntosMonsters ?? 0));
      return `<button type="button" class="bw-lz-rival" data-objetivo-rival="${esc(id)}"
                title="Ver la fortaleza de ${esc(nombreMesa(r))}">
        <span class="bw-lz-rival-cab">
          <b class="bw-lz-rival-nombre">${esc(nombreMesa(r))}</b>
          <span class="bw-lz-rival-vida">❤ ${vida} / 20</span>
        </span>
        <span class="bw-lz-calles">${callesResumen(r, mapa)}</span>
        <span class="bw-ob-cuenta">${mapa.size} monstruo${mapa.size === 1 ? "" : "s"} de nivel 3 o menos puede${mapa.size === 1 ? "" : "n"} avanzar</span>
      </button>`;
    }).join("");
    fondo.innerHTML = `
      <div class="bw-lz bw-lz-hoja">
        <div class="bw-lz-head"><b class="bw-lz-tit">${esc(TITULO_TABLERO[efecto] ?? "Elegir objetivo")}</b></div>
        <p class="bw-lz-sub">${esc(SUB_TABLERO[efecto] ?? "")}</p>
        <div class="bw-lz-lista solo">${filas}</div>
        <div class="bw-lz-pie"><button type="button" class="bw-modal-usar bw-ob-cancelar">Cancelar</button></div>
      </div>`;
  };

  const pasoRival = (rivalId) => {
    const r = jugadoresMesa.find(x => x.id === rivalId) ?? { id: rivalId };
    const vida = Math.max(0, 20 - (r.puntosMonsters ?? 0));
    fondo.classList.remove("lz-inicial");
    fondo.classList.add("lz-detalle");
    fondo.innerHTML = `
      <div class="bw-lz bw-lz-hoja">
        <div class="bw-lz-head bw-lz-cab-detalle">
          <b class="bw-lz-tit">Fortaleza de ${esc(nombreMesa(r))}</b>
          <span class="bw-lz-vida">❤ ${vida} / 20</span>
        </div>
        <p class="bw-lz-sub">${esc(SUB_TABLERO[efecto] ?? "")}</p>
        <div class="bw-lz-tablero">${tablero(r, rivalId)}</div>
        <div class="bw-lz-pie">
          <button type="button" class="bw-modal-usar bw-ob-atras">Atrás</button>
          <button type="button" class="bw-modal-usar bw-ob-cancelar">Cancelar</button>
        </div>
      </div>`;
  };

  const pasoPropio = () => {
    const m = miTableroMesa ?? jugadoresMesa.find(x => x.id === yoMesa) ?? {};
    fondo.classList.remove("lz-inicial");
    fondo.classList.add("lz-detalle");
    fondo.innerHTML = `
      <div class="bw-lz bw-lz-hoja">
        <div class="bw-lz-head"><b class="bw-lz-tit">${esc(TITULO_TABLERO[efecto] ?? "Elegir objetivo")}</b></div>
        <p class="bw-lz-sub">${esc(SUB_TABLERO[efecto] ?? "")}</p>
        <div class="bw-lz-tablero">${tablero(m, yoMesa)}</div>
        <div class="bw-lz-pie"><button type="button" class="bw-modal-usar bw-ob-cancelar">Cancelar</button></div>
      </div>`;
  };

  fondo.addEventListener("click", (ev) => {
    if (ev.target === fondo) return cerrar();
    const op = ev.target.closest("[data-objetivo-op]");
    if (op) return enviar(lista[Number(op.dataset.objetivoOp)], op);
    const rv = ev.target.closest("[data-objetivo-rival]");
    if (rv) return pasoRival(rv.dataset.objetivoRival);
    if (ev.target.closest(".bw-ob-atras")) return pasoRivales();
    if (ev.target.closest(".bw-ob-cancelar")) return cerrar();
  });

  pasoPropio();
  return true;
}

/* ── Ciencia instalada: sus cartas, en el mismo papel que la carta grande ──
   Caben dos (SLOTS_CIENCIA): se muestran una al lado de la otra, o una sola
   si solo hay una. */
function abrirCiencia() {
  document.getElementById("bw-modal-ciencia")?.remove();
  const cartas = cienciasMesa ?? [];

  const celda = (c) => {
    const t = defsCarta(c);
    return `
      <div class="bw-carta-grande">
        <span class="bw-carta-coste-grande">${c.coste ?? 0}</span>
        <div class="bw-carta-grande-img"><img src="${esc(imgCarta(c.tipo, c.nivel))}" alt=""></div>
        <div class="bw-carta-grande-texto">
          <div class="bw-carta-grande-titulo">${esc(t.label)}</div>
          <p class="bw-carta-grande-desc">${conNegritas(c.descripcion)}</p>
        </div>
      </div>`;
  };

  /* Dos huecos fijos, siempre: el que no tiene ciencia queda punteado, como
     los huecos del box, para que se vea que caben dos y cuál está libre. */
  const huecos = Array.from({ length: SLOTS_CIENCIA }, (_, i) => {
    const c = cartas[i];
    return c ? celda(c) : `<div class="bw-ciencia-hueco" title="Hueco de ciencia libre">
        <span aria-hidden="true">+</span><em>libre</em>
      </div>`;
  }).join("");

  const fondo = document.createElement("div");
  fondo.id = "bw-modal-ciencia";
  fondo.className = "bw-modal-fondo";
  fondo.innerHTML = `
    <div class="bw-modal" role="dialog" aria-modal="true" aria-label="Ciencia del búnker">
      <button type="button" class="bw-modal-x" aria-label="Cerrar">×</button>
      <div class="bw-desc-tit">Ciencia</div>
      <div class="bw-ciencia-fila dos">${huecos}</div>
      ${cartas.length ? "" : `<p class="bw-modal-nota">Aquí se guardan las ciencias que se quedan en el búnker. Se instalan al usar sus cartas (las de ciencia, no las inmediatas).</p>`}
    </div>`;
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  const escapar = (ev) => { if (ev.key === "Escape") { cerrar(); document.removeEventListener("keydown", escapar); } };
  fondo.querySelector(".bw-modal-x").addEventListener("click", cerrar);
  fondo.addEventListener("click", (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener("keydown", escapar);
}

/* ── Avanzar monstruo: lanzadera o casilla 4 de un camino ───────────────────
   El mismo modal oscuro de casa (el del descarte, las acciones y el criadero),
   con el monstruo en su cuadrado de jaula en vez de la lámina suelta sobre el
   pergamino: antes salía como una hoja marrón distinta a todo lo demás. */
/* El nombre del lado, no el texto interno de la jugada: «A lanzadera
   izquierda», «A escalera central»… */
const LADO_LANZADERA = { 0: "izquierda", 1: "derecha" };
const LADO_ESCALERA = { 1: "izquierda", 2: "central", 3: "derecha" };

function etiquetaEnvio(accion, mon) {
  if (accion.tipo === "mover_a_lanzadera") {
    const idx = (boxActual ?? []).findIndex((m) => m?.id === mon.id);
    const i = idx >= 2 ? 1 : 0;
    return { texto: `A lanzadera ${LADO_LANZADERA[i]}`, nota: "" };
  }
  if (accion.tipo === "mover_a_sendero") {
    return { texto: `A escalera ${LADO_ESCALERA[accion.sendero] ?? accion.sendero}`, nota: "1 moneda" };
  }
  if (accion.tipo === "avanzar_monstruo") {
    return { texto: `Avanzar al peldaño ${Number(accion.posicion) + 1}`, nota: "1 moneda" };
  }
  return { texto: accion.etiqueta ?? accion.texto ?? "Mover", nota: "" };
}

function abrirEnvio(mon) {
  document.getElementById("bw-panel-envio")?.remove();
  /* El cuadrado del monstruo usa la textura de pergamino de los paneles: hay
     que medirla en píxeles reales o en un móvil Retina sale al triple. */
  ajustarFondoModal();
  /* Lanzadera arriba y después las escaleras de izquierda a derecha. */
  const orden = { mover_a_lanzadera: 0, mover_a_sendero: 1, avanzar_monstruo: 2 };
  const opciones = accionesMesa
    .filter((a) => a.monstruoId === mon.id)
    .sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9)
      || (Number(a.sendero) || 0) - (Number(b.sendero) || 0));

  const panel = document.createElement("div");
  panel.id = "bw-panel-envio";
  panel.className = "bw-panel envio-panel";
  panel.innerHTML = `
    <div class="bw-panel-head">
      <div class="bw-panel-label">Avanzar monstruo</div>
      <button class="bw-panel-x" type="button" data-cerrar-envio aria-label="Cerrar">×</button>
    </div>
    <div class="bw-envio-cuerpo">
      <div class="bw-envio-cuadro">
        <div class="bw-box-slot lleno">
          <img src="${imgMonstruo(mon.nivel, false, true)}" class="bw-box-img bw-mon-jaula" alt="monstruo">
          <b class="bw-box-nv">${mon.nivel ?? "?"}</b>
        </div>
      </div>
      ${opciones.length
        ? `<div class="bw-envio-lista">${opciones.map((a, i) => {
            const e = etiquetaEnvio(a, mon);
            return `<button type="button" class="bw-modal-usar" data-envio-i="${i}">${esc(e.texto)}${e.nota ? `<small>${esc(e.nota)}</small>` : ""}</button>`;
          }).join("")}</div>`
        : `<p class="bw-modal-pie">Ese monstruo no se puede mover ahora.</p>`}
    </div>`;
  /* El panel de jaulas vive pegado al mismo borde: se aparta mientras el del
     monstruo está encima y vuelve al cerrar. */
  const tapados = [...document.querySelectorAll("body > .bw-panel")]
    .filter((p) => !p.classList.contains("oculto"));
  tapados.forEach((p) => p.classList.add("oculto"));
  document.body.appendChild(panel);
  actualizarOverlayPaneles();

  const cerrar = () => {
    panel.remove();
    tapados.forEach((p) => { if (p.isConnected) p.classList.remove("oculto"); });
    actualizarOverlayPaneles();
  };
  panel.querySelector("[data-cerrar-envio]").addEventListener("click", cerrar);

  for (const b of panel.querySelectorAll("[data-envio-i]")) {
    b.addEventListener("click", async () => {
      const accion = opciones[Number(b.dataset.envioI)];
      if (!accion || !enviarAccion) return;
      b.disabled = true;
      const r = await enviarAccion(accion);
      if (r?.error) {
        aviso(r.error, { error: true });
        b.disabled = false;
        return;
      }
      cerrar();
    });
  }
}

/* ── Mover un monstruo de mis escaleras ─────────────────────────────────────
   Tocar una ficha propia abre el mismo panel de la jaula: avanzar (a la
   casilla vacía más cercana de delante) o atacar (al atacante más cercano de
   delante). Cada jugada cuesta 1 moneda y 1 decreto, y solo se ofrece si está
   entre las acciones legales que manda la mesa. */
/* Nivel de una ficha: `nivel` en los monstruos y `fuerza` en los atacantes
   antiguos. (`nivelDe` vive dentro de `pintarMiBunker` y aquí no se ve.) */
const nivelDeFicha = (f) => f?.nivel ?? f?.fuerza ?? "?";

function posicionesDe(sendero) {
  const calle = (miTableroMesa?.senderos ?? []).find((s) => Number(s.id) === Number(sendero));
  return calle?.posiciones ?? [];
}

/* La jugada es la de la casilla de delante y nada más: el monstruo sube un
   peldaño por vez. Si esa casilla está libre la jugada es avanzar, aunque más
   arriba haya un atacante (se le ataca cuando está pegado); si está ocupada
   por un atacante, es atacar. Se mira la calle sin depender de que la jugada
   sea legal: así el título dice lo que toca aunque falten monedas. */
function tipoDeMover(sendero, posicion) {
  const delante = posicionesDe(sendero)[Number(posicion) - 1] ?? null;
  return delante?.tipo === "atacante" ? "atacar" : "avanzar";
}

/* Una sola jugada, al peldaño de delante: atacar si lo ocupa un atacante,
   avanzar si está libre. Con un monstruo propio delante no hay jugada. */
function planMover(sendero, posicion, id) {
  const destino = Number(posicion) - 1;
  if (destino < 0) return null;
  const delante = posicionesDe(sendero)[destino] ?? null;
  if (delante && delante.tipo !== "atacante") return null;
  const a = accionesMesa.find((x) => x.tipo === "avanzar_monstruo"
    && x.monstruoId === id && Number(x.sendero) === Number(sendero)
    && Number(x.posicion) === destino) ?? null;
  if (!a) return null;
  return delante
    ? { accion: a, tipo: "atacar", destino, nivel: nivelDeFicha(delante) }
    : { accion: a, tipo: "avanzar", destino, nivel: null };
}

function abrirMonstruo({ sendero, posicion, id, nivel }) {
  document.getElementById("bw-panel-mover")?.remove();
  ajustarFondoModal();
  const ficha = posicionesDe(sendero)[Number(posicion)] ?? null;
  const nv = nivel ?? nivelDeFicha(ficha);
  const plan = planMover(sendero, posicion, id);
  /* El título es la jugada, no el monstruo: «Avanzar» o «Atacar». */
  const tipo = plan?.tipo ?? tipoDeMover(sendero, posicion);

  const panel = document.createElement("div");
  panel.id = "bw-panel-mover";
  panel.className = "bw-panel envio-panel";
  panel.innerHTML = `
    <div class="bw-panel-head">
      <div class="bw-panel-label">${tipo === "atacar" ? "Atacar" : "Avanzar"}</div>
      <button class="bw-panel-x" type="button" data-cerrar-mover aria-label="Cerrar">×</button>
    </div>
    <div class="bw-envio-cuerpo">
      <div class="bw-envio-cuadro">
        <div class="bw-box-slot lleno">
          <img src="${imgMonstruo(nv, false, false)}" class="bw-envio-foto" alt="monstruo">
          <b class="bw-box-nv">${nv ?? "?"}</b>
        </div>
      </div>
      ${plan
        ? `<div class="bw-envio-lista">
             <button type="button" class="bw-modal-usar" data-mover>${plan.tipo === "atacar" ? "Atacar" : "Avanzar"}<small>1 moneda + 1 decreto</small></button>
           </div>`
        : `<p class="bw-modal-pie">Ese monstruo no se puede mover ahora.</p>`}
    </div>`;

  const tapados = [...document.querySelectorAll("body > .bw-panel")]
    .filter((p) => !p.classList.contains("oculto"));
  tapados.forEach((p) => p.classList.add("oculto"));
  document.body.appendChild(panel);
  actualizarOverlayPaneles();

  const cerrar = () => {
    panel.remove();
    tapados.forEach((p) => { if (p.isConnected) p.classList.remove("oculto"); });
    actualizarOverlayPaneles();
  };
  panel.querySelector("[data-cerrar-mover]").addEventListener("click", cerrar);

  const b = panel.querySelector("[data-mover]");
  b?.addEventListener("click", async () => {
    if (!plan || !enviarAccion) return;
    b.disabled = true;
    /* La hoja se va antes de jugar: el avance o la pelea se ven en directo en
       su escalera, no detrás del panel. */
    await cerrarParaVerEscaleras();
    const r = await enviarAccion(plan.accion);
    if (r?.error) aviso(r.error, { error: true });
  });
}

/* ── Mapa: elegir jugador y visitar su fortaleza ─────────────────────────── */

/* La fortaleza de otro jugador, con la misma escena y su estado público. Las
   monedas y los decretos propios no se ven: se pintan como «—». */
function pintarVistaRival(contenedor, publica, id, miPrivada) {
  const rival = publica.jugadores?.[id];
  if (!rival) { viendoJugador = null; return; }

  /* Fuera el menú, la mano y los paneles: esto es una vista de solo lectura. */
  document.getElementById("bw-nav-global")?.remove();
  document.querySelector("body > .bw-mano-wrap")?.remove();
  document.querySelector("body > .bw-panel.box-panel")?.remove();
  document.querySelector("body > .bw-panel.acciones-panel")?.remove();
  document.querySelector("body > .bw-panel.manuscritos-panel")?.remove();
  document.querySelector("body > .bw-panel.torres-panel")?.remove();
  document.querySelector("body > .bw-panel.mapa-panel")?.remove();
  document.querySelector("body > .bw-panel.aliados-panel")?.remove();
  document.querySelector("body > .bw-panel.disparo-panel")?.remove();
  document.querySelector("body > .bw-panel-overlay")?.remove();
  disparoPanel = null;

  jugadoresMesa = Object.entries(publica.jugadores ?? {}).map(([pid, p]) => ({ id: pid, ...p }));
  turnoMesa = publica.turnoActual ?? null;
  yoMesa = id;
  faseMesa = publica.fase ?? null;
  tocaMesa = false;
  energiaMesa = null;
  accionesRestantesMesa = null;
  boxActual = [];
  lanzaderasMesa = rival.lanzaderas ?? [];
  cienciasMesa = rival.bunker?.ciencia ?? [];
  criaderoMesa = rival.bunker?.laboratorio ?? 0;
  nivelEnemigoMesa = publica.nivelEnemigo ?? 1;
  lunaMesa = publica.luna ?? 1;
  vistaRival = true;

  const esAliadoRival = modoMesa === "equipos" && (rival?.equipo ?? 0) === miEquipoMesa;
  const datosAliado = esAliadoRival ? (miPrivada?.vistasAliados?.[id] ?? null) : null;
  contenedor.classList.toggle("vista-rival-aliado", esAliadoRival);
  contenedor.classList.toggle("vista-rival-enemigo", !esAliadoRival);
  const pantalla = document.getElementById("pantalla");
  const scrollPrevio = pantalla?.scrollTop ?? 0;
  contenedor.innerHTML = `
    <div class="bw-volver-barra">
      <button type="button" class="bw-volver">Volver</button>
    </div>
    ${pintarMiBunker(rival, {
      energia: null,
      accionesRestantes: null,
      mano: [],
      box: datosAliado?.box ?? rival.box ?? [],
      lanzaderas: datosAliado?.lanzaderas ?? rival.lanzaderas ?? [],
      colaLanzaderas: datosAliado?.colaLanzaderas ?? rival.colaLanzaderas ?? [],
      teToca: false,
    }, publica.fase, { sinLuchas: true })}`;

  vistaRival = false;

  if (scrollPrevio > 0 && pantalla) {
    requestAnimationFrame(() => { if (pantalla.isConnected) pantalla.scrollTop = scrollPrevio; });
  }
  contenedor.querySelector(".bw-edif-ciencia")?.addEventListener("click", abrirCiencia);

  contenedor.querySelector(".bw-volver")?.addEventListener("click", () => {
    viendoJugador = null;
    contenedor.classList.remove("vista-rival-aliado", "vista-rival-enemigo");
    /* Volver deja la fortaleza, no el mapa que abrió la visita. */
    tabMesa = "cartas";
    if (vistaContenedor && vistaOpciones) pintar(vistaContenedor, vistaOpciones);
  });
}

function escaparCarta(ev) {
  if (ev.key === "Escape") cerrarCarta();
}

async function usarCarta(accion, boton) {
  if (!enviarAccion) {
    aviso("Sin conexión con la mesa.", { error: true });
    return;
  }
  const etiqueta = boton?.textContent || "Usar carta";
  try {
    const r = await enviarAccion(accion);
    if (r?.error) {
      aviso(r.error, { error: true });
      if (boton) { boton.disabled = false; boton.textContent = etiqueta; }
      return;
    }
    cerrarCarta();
  } catch (e) {
    console.error("Error al usar la carta:", e);
    aviso("No se pudo usar la carta.", { error: true });
    if (boton) { boton.disabled = false; boton.textContent = etiqueta; }
  }
}

function aviso(mensaje, opciones = {}) {
  /* Va en el body, no dentro de `.avisos`: ese contenedor lleva un transform
     para centrarse, y un `position: fixed` dentro de un ancestro transformado
     se coloca respecto al contenedor y no a la pantalla (el aviso salía
     pegado arriba a la derecha). Así queda centrado de verdad. */
  const avisoEl = document.createElement("div");
  avisoEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    padding: 12px 20px; text-align: center;
    background: ${opciones.error ? "#c0392b" : "#3498db"}; color: white;
    border-radius: 6px; z-index: 9999; max-width: min(84vw, 360px); font-size: 14px;`;
  avisoEl.textContent = mensaje;
  document.body.appendChild(avisoEl);
  setTimeout(() => avisoEl.remove(), opciones.ms ?? 3000);
}

/* La fase de lanzaderas se pasa sola cuando no queda un hueco libre en ningún
   camino enemigo. Antes se pasaba en silencio y parecía que la mesa se había
   olvidado de los monstruos: ahora se dice una vez por turno. */
let avisoLanzarVisto = null;
function avisarLanzaderaSinHueco(priv) {
  const avisoMesa = priv?.avisoLanzar ?? null;
  if (!avisoMesa?.texto || avisoMesa.clave === avisoLanzarVisto) return;
  avisoLanzarVisto = avisoMesa.clave;
  aviso(avisoMesa.texto, { ms: 5000 });
}

function labelFase(fase) {
  return {
    lanzar:    "Lanzaderas",
    avance:    "Avanzan atacantes",
    defensores:"Avanzan defensores",
    carta:     "Carta de Destino",
    carta_ver: "Carta de Destino",
    carta_efecto: "Carta de Destino",
    energia:   "Recogiendo monedas",
    acciones:  "Decretos",
    descartar: "Descartar",
    fin_turno: "Fin del turno",
    fin:       "Partida terminada",
  }[fase] ?? fase ?? "—";
}

/* ── CSS del juego (cabecera, stats, destino, nav, cartas) ──────────────── */

/* La hoja del juego se instala una vez en <head> y se queda ahí: así sobrevive
   a los repintados de la app (que vacía #pantalla) y no se reparsean 77 kB de
   CSS en cada empujón de la mesa. */
function instalarCss() {
  if (document.getElementById("bw-css")) return;
  const hoja = document.createElement("style");
  hoja.id = "bw-css";
  hoja.textContent = sinEtiquetas(css()) + sinEtiquetas(cssAdicional());
  document.head.appendChild(hoja);
}
function sinEtiquetas(texto) {
  return String(texto).replace(/^\s*<style>/, "").replace(/<\/style>\s*$/, "");
}

function css() {
  return `<style>
    /* Cuánto se suben las láminas de monstruo dentro de su hueco. El arte nuevo
       trae los pies en el borde de abajo, así que centrada parecía caerse:
       va en % del propio sprite para que se vea igual en la ficha pequeña del
       tablero y en el cuadrado grande del envío. */
    :root { --bw-subida-monstruo: 8%; --bw-subida-lanzadera: 18%; }

    /* Cabecera — flota sobre la fortaleza */
    .bw-top {
      position:fixed; top:env(safe-area-inset-top, 0px); left:0; right:0; z-index:200;
      display:flex; gap:6px; align-items:center; flex-wrap:wrap;
      padding:8px 12px;
      background:linear-gradient(180deg, rgba(4,9,8,.82) 0%, transparent 100%);
      pointer-events:none; /* que no bloquee taps en la fortaleza */
    }
    .bw-top > * { pointer-events:auto; }
    .bw-luna { font-weight:700; font-size:14px; }
    .bw-luna.roja { color:#e74c3c; }
    .bw-fase { font-size:11px; padding:2px 9px; border-radius:99px;
                background:rgba(10,14,12,.72);
                border:1px solid rgba(244,236,221,.16); }
    .bw-rival { font-size:11px; padding:2px 9px; border-radius:99px;
                 background:rgba(10,14,12,.72);
                 border:1px solid rgba(244,236,221,.16);
                 display:flex; gap:4px; align-items:center; }
    .bw-rival.peligro { background:rgba(194,112,90,.22); color:#ffb4a2; border-color:rgba(194,112,90,.5); }
    .bw-salir { margin-left:auto; padding:3px 10px; border-radius:99px; cursor:pointer;
                font:inherit; font-size:11px; color:#ffb4a2;
                background:rgba(10,14,12,.72); border:1px solid rgba(194,112,90,.45); }
    .bw-salir:hover { background:rgba(194,112,90,.30); }

    /* Carta de Destino */
    .bw-destino { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                  padding:10px 16px; background:rgba(4,9,8,.72);
                  border-bottom:1px solid rgba(244,236,221,.08);
                  position:relative; z-index:20; color:#f4ecdd; }
    .bw-destino.amenaza { border-bottom-color:rgba(194,112,90,.35); background:rgba(194,112,90,.12); }
    .bw-destino.roja    { border-bottom-color:rgba(224,75,58,.45); background:rgba(224,75,58,.16); }
    .bw-destino-tag { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
                      color:#b7a992; }
    .bw-destino-txt { font-size:13px; font-weight:600; flex:1; min-width:200px; }
    .bw-destino-mazo { font-size:11px; color:#b7a992; }

    /* Acciones */
    .bw-acciones { display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 20px;
                   position:relative; z-index:20; }
    .bw-accion { padding:11px 16px; border-radius:5px; font-size:14px;
      font-weight:700; cursor:pointer; border:1px solid rgba(18,22,26,.35);
      background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a; }
    .bw-accion:hover { background:linear-gradient(180deg,#e8edf1,#adb9c3); }
    .bw-accion:disabled { opacity:.45; cursor:default; }

    /* Barra de navegación inferior */
    .bw-nav {
      position:fixed; bottom:0; left:0; right:0; z-index:9000;
      display:flex;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      min-height:56px;
      background:rgba(10,14,12,.96);
      backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
      border-top:1px solid rgba(232,222,200,.14);
    }
    .bw-nav::after {
      content:""; position:absolute; bottom:0; left:0; right:0;
      height:env(safe-area-inset-bottom, 0px);
      background:rgba(10,14,12,.96);
      transform:translateY(100%);
    }
    .bw-nav-tab {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:3px; padding:8px 0 0;
      background:none; border:none; cursor:pointer;
      color:rgba(234,227,211,.38);
      font:600 10px/1 ui-sans-serif,sans-serif;
      transition:color .15s;
      position:relative;
    }
    .bw-nav-tab svg { width:22px; height:22px; }
    .bw-nav-label { display:inline-flex; align-items:center; justify-content:center; gap:4px; }
    .bw-nav-badge {
      display:inline-flex; align-items:center; justify-content:center;
      width:15px; height:15px; border-radius:50%; flex:0 0 15px;
      background:#179494; color:#fff;
      font:800 10px/1 ui-monospace, monospace;
      box-shadow:0 0 0 1px rgba(0,0,0,.35);
    }
    .bw-nav-tab.activo { color:rgba(234,227,211,.98); }
    .bw-nav-tab.activo::after {
      content:""; position:absolute; top:0; left:50%; transform:translateX(-50%);
      width:32px; height:3px; background:#e8ddc8; border-radius:0 0 3px 3px;
    }
    .bw-nav-tab:hover { color:rgba(234,227,211,.75); }

    /* Paneles */
    .bw-panel.oculto, .bw-mano-wrap.oculto { display:none !important; }
    .bw-panel {
      border-radius:12px; border:1px solid rgba(244,236,221,.16);
      background:rgba(27,23,19,.95);
      padding:12px; margin:0 16px 10px; color:#f4ecdd;
      position:relative; z-index:20;
    }
    /* Box panel: flota encima del nav */
    .bw-panel.box-panel, .bw-panel.acciones-panel, .bw-panel.manuscritos-panel,
    .bw-panel.torres-panel, .bw-panel.mapa-panel, .bw-panel.aliados-panel,
    .bw-panel.disparo-panel, .bw-panel.envio-panel {
      position:fixed !important;
      bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important;
      left:0 !important; right:0 !important;
      margin:0 !important;
      border-radius:16px 16px 0 0 !important;
      /* Nunca se sale de lado: lo que no quepa se corta antes que dejar el
         panel con scroll horizontal. */
      max-height:50vh; overflow-y:auto; overflow-x:hidden;
      z-index:290 !important;
    }
    /* El panel de jaulas flota justo encima del menú, con el ribete de piedra
       arriba y abajo (más fino que el del modal). */
    .bw-panel.box-panel, .bw-panel.manuscritos-panel, .bw-panel.torres-panel,
    .bw-panel.mapa-panel, .bw-panel.aliados-panel, .bw-panel.disparo-panel {
      padding:0 14px 22px;
      background-color:rgba(27,23,19,.97);
    }
    /* Cabecera común de los paneles: título centrado, algo más grande y una X
       para cerrar a la derecha del todo. */
    .bw-panel-head {
      position:relative; display:flex; align-items:center; justify-content:center;
      min-height:34px; padding:0 38px; margin-bottom:40px; text-align:center;
    }
    .bw-panel-head .bw-panel-label { margin-bottom:0; }
    /* Separación bajo el título: 20 px de aire y una línea fina. */
    .bw-panel-head::after {
      content:""; position:absolute; left:0; right:0; bottom:-20px; height:1px;
      background:rgba(244,236,221,.18); pointer-events:none;
    }
    .bw-panel-x {
      position:absolute; right:-6px; top:50%; transform:translateY(-50%);
      width:34px; height:34px; padding:0; border:0; background:transparent;
      color:#d9cbb6; font:400 26px/1 ui-sans-serif, system-ui, sans-serif;
      display:flex; align-items:center; justify-content:center; cursor:pointer;
      -webkit-tap-highlight-color:transparent;
    }
    .bw-panel-x:active { color:#fff; }
    .box-panel .bw-panel-label, .manuscritos-panel .bw-panel-label,
    .torres-panel .bw-panel-label, .mapa-panel .bw-panel-label,
    .aliados-panel .bw-panel-label, .disparo-panel .bw-panel-label,
    .envio-panel .bw-panel-label, #bw-modal-criadero .bw-panel-label {
      font:700 18px/1.25 ui-serif, Georgia, serif;
      text-transform:none; letter-spacing:.01em;
      color:#f4ecdd; text-align:center;
    }
    .bw-panel-sub { font-size:12px; }
    .box-panel .bw-caja-label {
      font:700 13px/1.25 ui-serif, Georgia, serif;
      text-transform:none; letter-spacing:.01em; color:#d9cbb6;
      text-align:center; margin-bottom:10px;
    }
    .bw-caja-camino {
      display:block; margin-top:3px;
      font:400 11px/1.25 ui-serif, Georgia, serif;
      color:#b8ab96; letter-spacing:0;
    }
    /* Botones de acción del panel: uno por acción legal */
    .bw-acciones { display:grid; gap:6px; }
    .bw-accion-item {
      width:100%; text-align:left; cursor:pointer;
      padding:9px 11px; border-radius:9px;
      font:700 12px/1.25 ui-sans-serif, system-ui, sans-serif;
      color:#f4ecdd; background:rgba(244,236,221,.08);
      border:1px solid rgba(244,236,221,.22);
    }
    .bw-accion-item:active { background:rgba(244,236,221,.2); }
    .bw-accion-item:disabled { opacity:.45; }
    .bw-panel-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
                       color:#b7a992; margin-bottom:10px; }
    .bw-panel-sub { font-weight:400; text-transform:none; letter-spacing:0; }
    .bw-slot-sub { font-size:10px; color:#8b7e6b; }
    .bw-cajas { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .bw-torres { display:grid; grid-template-columns:repeat(3,1fr);
                 gap:clamp(10px, 4vw, 16px); align-items:start; }
    .bw-torre { display:flex; flex-direction:column; align-items:center; min-width:0; }
    .bw-torre-nv { font:700 13px/1.25 ui-serif, Georgia, serif; color:#d9cbb6;
                   text-align:center; margin-bottom:3px; }
    .bw-torre-camino { font:400 11px/1.25 ui-serif, Georgia, serif; color:#b8ab96;
                       text-align:center; margin:0 0 5px; }
    /* La torre y los cuatro peldaños, todos del mismo tamaño. El lado se
       adapta al ancho de la pantalla y al de su columna: 72 px como máximo,
       y encoge en pantallas estrechas para no salirse del panel. */
    .bw-box-slot.bw-torre-img { width:min(72px, 22vw, 100%); }
    /* Los cuatro peldaños del camino, en vertical y en orden 4→1, como suben
       los monstruos: mismo hueco cuadrado que las jaulas. */
    .bw-torre-cuenta { margin:2px 0 0; text-align:center;
                       font:700 10px/1.2 ui-sans-serif, system-ui, sans-serif;
                       color:#8b7e6b; }
    .bw-torre-cuenta.hay { color:#e08a7e; }
    .bw-torre-slots { display:flex; flex-direction:column; margin-top:10px;
                      align-items:center; gap:5px; width:100%; }
    .bw-box-slot.bw-torre-slot { position:relative; z-index:1;
                                 width:min(72px, 22vw, 100%); cursor:default; }
    .bw-torre-slot.vacio { cursor:default; }
    .bw-torre-slot.defensor { cursor:default; }
    .bw-torre-slot.atacante { cursor:pointer; border-color:#b0453a; }
    .bw-torre-slot.atacante .bw-box-nv { background:rgba(176,58,44,.95); }
    .bw-torre-step { position:absolute; left:3px; bottom:2px; pointer-events:none;
                     font:700 9px/1 ui-monospace, monospace; color:rgba(244,236,221,.55); }
    .bw-torre-slot.lleno .bw-torre-step { color:rgba(27,23,19,.62); }
    .bw-torre-slot.vacio .bw-torre-step { position:static; font-size:10px;
                                         color:#8b7e6b; }
    .bw-mapa-secciones { display:flex; flex-direction:column; gap:14px; }
    .bw-mapa-seccion-titulo { margin-bottom:6px; font:800 10px/1.2 ui-sans-serif, system-ui, sans-serif;
                              letter-spacing:.12em; text-transform:uppercase; }
    .bw-mapa-seccion-titulo.aliados { color:#6cc6e0; }
    .bw-mapa-seccion-titulo.enemigos { color:#e08a7e; }
    /* Dos tarjetas por fila: así el mapa no ocupa todo el ancho con una
       sola tarjeta y las tres calles quedan a la vista sin apretarse. */
    .bw-mapa-lista { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; align-items:start; }
    .bw-mapa-rival {
      width:100%; display:grid; grid-template-columns:1fr auto; gap:5px 8px;
      padding:10px 12px; border-radius:9px; box-sizing:border-box;
      border:1px solid transparent;
      background:rgba(244,236,221,.05); color:#f4ecdd;
      text-align:left; cursor:pointer;
    }
    .bw-mapa-rival.enemigo,
    .bw-mapa-rival.con-atacantes { border-color:rgba(176,58,44,.62); background:rgba(176,58,44,.12); }
    .bw-mapa-rival.aliado { border-color:rgba(47,143,191,.65); background:rgba(47,143,191,.12); }
    .bw-mapa-rival:active { filter:brightness(1.15); }
    /* Las tres calles del mapa son las mismas de la selección de lanzadera. */
    .bw-mapa-calles { grid-column:1 / -1; margin-top:8px; padding:0 2px; }
    .bw-mapa-nombre { font:700 15px/1.2 ui-serif, Georgia, serif; }
    .bw-mapa-vida { align-self:center; font:700 11px/1.2 ui-sans-serif, system-ui, sans-serif;
                    color:#d9cbb6; }
    .bw-mapa-vida b { color:#fff; }
    .bw-mapa-torres { grid-column:1 / -1; display:flex; gap:5px; align-items:center; }
    .bw-mapa-torre { position:relative; width:30px; height:30px; border-radius:6px;
                     border:1px dashed rgba(244,236,221,.28); display:grid; place-items:center;
                     background:rgba(0,0,0,.18); }
    .bw-mapa-torre.llena { border:1.5px solid #179494; background:#e8ddc8; }
    .bw-mapa-torre img { width:92%; height:92%; object-fit:contain; }
    .bw-mapa-torre b { position:absolute; top:-4px; right:-4px; min-width:13px; height:13px;
                       border-radius:999px; background:#179494; color:#fff;
                       font:800 8px/13px ui-monospace, monospace; text-align:center; }
    .bw-mapa-torre i { font:800 16px/1 ui-sans-serif, system-ui, sans-serif; color:#8b7e6b; font-style:normal; }
    .bw-mapa-atac { grid-column:1 / -1; font:700 10px/1.2 ui-sans-serif, system-ui, sans-serif;
                    color:#e08a7e; }
    .bw-mapa-vacio { margin:0; text-align:center; color:#8b7e6b; font-size:13px; }
    /* Aliados: el mismo panel de mapa, con contadores y monstruos del box. */
    .bw-aliados-intro { margin:-8px 0 10px; color:#b8ab96; font:400 11px/1.35 ui-serif, Georgia, serif;
                        text-align:center; }
    .bw-aliados-bloque { display:flex; flex-direction:column; gap:8px; }
    .bw-aliados-bloque + .bw-aliados-bloque {
      margin-top:14px; padding-top:14px; border-top:1px solid rgba(244,236,221,.16);
    }
    .bw-aliados-titulo { font:800 11px/1.2 ui-sans-serif, system-ui, sans-serif;
                          letter-spacing:.09em; text-transform:uppercase; color:#8fd4ea; }
    .bw-aliados-pedir { display:flex; flex-direction:column; gap:8px;
                        padding:9px 10px; border:1px dashed rgba(244,236,221,.24);
                        border-radius:9px; }
    .bw-aliados-chips { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
    .bw-aliados-chip { padding:7px 10px; border-radius:999px; cursor:pointer;
                       border:1px solid rgba(244,236,221,.24); background:rgba(244,236,221,.08);
                       color:#d9cbb6; font:700 10.5px/1.2 ui-sans-serif, system-ui, sans-serif; }
    .bw-aliados-chip.sel { border-color:#d9b97a; background:rgba(217,185,122,.2); color:#fff0ce; }
    .bw-aliados-chip:active { filter:brightness(1.15); }
    .bw-aliados-pedir-btn { width:100%; }
    .bw-aliados-slots { display:grid; gap:7px; }
    .bw-aliados-slots-1 { grid-template-columns:1fr; }
    .bw-aliados-slots-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .bw-aliados-slots-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .bw-aliados-slot { min-height:68px; display:flex; flex-direction:column; gap:3px;
                       padding:8px 9px; border-radius:8px; overflow:hidden;
                       background:rgba(244,236,221,.06); border:1px solid rgba(244,236,221,.18);
                       color:#d9cbb6; font:400 10.5px/1.3 ui-serif, Georgia, serif; }
    .bw-aliados-slot b { font:700 12px/1.2 ui-serif, Georgia, serif; color:#f4ecdd; }
    .bw-aliados-slot span { flex:1; }
    .bw-aliados-slot small { font:700 9px/1.2 ui-sans-serif, system-ui, sans-serif; color:#9fc9df; }
    .bw-aliados-slot-peticion { background:rgba(217,185,122,.09); border-color:rgba(217,185,122,.28); }
    .bw-aliados-slot-peticion b { color:#f4e4c4; }
    .bw-aliados-slot-propia { border-color:rgba(244,236,221,.38); }
    .bw-aliados-cancelar { width:100%; margin-top:2px; padding:5px 7px; border-radius:6px;
                            border:1px dashed rgba(244,236,221,.3); background:rgba(244,236,221,.06);
                            color:#e7d6b4; font:700 9px/1.2 ui-sans-serif, system-ui, sans-serif;
                            cursor:pointer; }
    .bw-aliados-cancelar:active { background:rgba(244,236,221,.16); }
    .bw-aliados-slot-envio { background:rgba(47,143,191,.1); border-color:rgba(47,143,191,.3); }
    .bw-aliados-slot-vacio { align-items:center; justify-content:center; text-align:center;
                             border-style:dashed; border-color:rgba(244,236,221,.22);
                             background:transparent; color:#8b7e6b;
                             font:400 11px/1.35 ui-serif, Georgia, serif; }
    .bw-aliados-lista { display:flex; flex-direction:column; gap:7px; }
    .bw-aliados-persona { width:100%; display:flex; flex-direction:column; gap:3px; text-align:left;
                          padding:10px 12px; border-radius:9px; cursor:pointer;
                          border:1px solid rgba(47,143,191,.65); background:rgba(47,143,191,.12);
                          color:#f4ecdd; }
    .bw-aliados-persona b { font:700 15px/1.2 ui-serif, Georgia, serif; }
    .bw-aliados-persona small { font:400 10px/1.2 ui-sans-serif, system-ui, sans-serif; color:#9fc9df; }
    .bw-aliados-persona:active { filter:brightness(1.15); }
    .bw-aliados-form { margin-top:12px; padding-top:12px; border-top:1px solid rgba(244,236,221,.16);
                       display:flex; flex-direction:column; gap:9px; }
    .bw-aliados-form.oculto { display:none; }
    .bw-aliados-destino { font:700 13px/1.25 ui-serif, Georgia, serif; color:#8fd4ea; text-align:center; }
    .bw-aliados-fila { display:flex; align-items:center; justify-content:space-between; gap:12px;
                       font:700 12px/1.2 ui-sans-serif, system-ui, sans-serif; color:#d9cbb6; }
    .bw-aliados-contador { display:flex; align-items:center; gap:8px; }
    .bw-aliados-contador button { width:30px; height:30px; border-radius:7px; border:1px solid rgba(244,236,221,.3);
                                  background:rgba(244,236,221,.1); color:#f4ecdd; font:800 17px/1 ui-sans-serif; cursor:pointer; }
    .bw-aliados-contador button:active { background:rgba(244,236,221,.24); }
    .bw-aliados-contador b { min-width:18px; text-align:center; font:800 14px/1 ui-monospace, monospace; color:#fff; }
    .bw-aliados-monstruos { display:flex; flex-direction:column; gap:5px;
                            font:700 12px/1.2 ui-sans-serif, system-ui, sans-serif; color:#d9cbb6; }
    .bw-aliados-mons { display:flex; gap:6px; flex-wrap:wrap; }
    .bw-aliados-mon { position:relative; width:52px; aspect-ratio:1; border-radius:8px; overflow:hidden;
                      border:1.5px solid rgba(244,236,221,.25); background:#e8ddc8; cursor:pointer; padding:0; }
    .bw-aliados-mon img { width:100%; height:100%; object-fit:contain; }
    .bw-aliados-mon b { position:absolute; top:2px; right:2px; min-width:15px; height:15px; border-radius:999px;
                        background:rgba(var(--c-propio),.95); color:#fff; font:800 9px/15px ui-monospace; text-align:center; }
    .bw-aliados-mon.sel { border-color:#f4ecdd; box-shadow:0 0 0 2px #179494; }
    .bw-aliados-vacio { margin:0; color:#8b7e6b; font:400 11px/1.3 ui-serif, Georgia, serif; }
    .bw-aliados-pie { display:flex; align-items:center; justify-content:space-between; gap:10px;
                      padding-top:2px; }
    .bw-aliados-pie span { font:700 10px/1.25 ui-sans-serif, system-ui, sans-serif; color:#b8ab96; }
    .bw-aliados-enviar { flex:0 0 auto; padding:12px 18px; border-radius:9px; border:0; cursor:pointer;
                         background:linear-gradient(180deg,#7fc9dd,#2f8fbf 55%,#226f96); color:#08222c;
                         font:800 13px/1.2 ui-serif, Georgia, serif; }
    .bw-aliados-enviar:disabled { opacity:.4; cursor:default; }
    .bw-aliados-nota { font:400 10px/1.3 ui-serif, Georgia, serif; color:#8b7e6b; text-align:center; }
    /* Envío de aliado: la caja con su paracaídas entra por arriba, se mece de
       izquierda a derecha y se mete por debajo de la hoja hasta desaparecer.
       La capa (z 960) va por debajo del modal (z 1000). */
    .bw-regalo-capa {
      position:fixed; inset:0; z-index:960; pointer-events:none;
      background:radial-gradient(120% 70% at 50% 28%, rgba(10,9,7,.45), rgba(10,9,7,.82));
      animation:bw-regalo-velo .45s ease-out both;
    }
    /* La caja baja en línea recta y el vaivén lo pone un envoltorio interior:
       así la caída es constante y las ondulaciones suaves, sin tirones. */
    .bw-regalo-caja {
      position:absolute; left:50%; top:-40vh; width:min(46vw,170px);
      transform:translateX(-50%); opacity:0;
      filter:drop-shadow(0 16px 20px rgba(0,0,0,.62));
      animation:bw-regalo-cae 3.2s linear .1s both;
      will-change:top,opacity;
    }
    .bw-regalo-balanceo {
      animation:bw-regalo-vaiven 3.2s ease-in-out infinite;
      transform-origin:50% 0;
    }
    .bw-regalo-caja img { display:block; width:100%; height:auto; }
    @keyframes bw-regalo-velo { from { opacity:0; } to { opacity:1; } }
    /* Bajada lineal: solo se desvanece al principio y al meterse bajo la hoja. */
    @keyframes bw-regalo-cae {
      0%   { top:-40vh; opacity:0; }
      6%   { opacity:1; }
      88%  { opacity:1; }
      100% { top:52vh; opacity:0; }
    }
    /* Una ondulación completa durante la caída: derecha, izquierda y vuelta,
       frenando en cada extremo. */
    @keyframes bw-regalo-vaiven {
      0%   { transform:translateX(-14px) rotate(-2deg); }
      50%  { transform:translateX(14px) rotate(2deg); }
      100% { transform:translateX(-14px) rotate(-2deg); }
    }
    /* Misma hoja que las demás: ribete arriba, título con su línea debajo,
       aire entre bloques y el botón separado del borde de abajo. */
    #bw-modal-regalo .bw-modal {
      animation:bw-regalo-sube .34s cubic-bezier(.2,.85,.3,1) both;
      padding:0 14px 34px; gap:14px;
    }
    #bw-modal-regalo .bw-regalo-head {
      position:relative; display:flex; align-items:center; justify-content:center;
      width:100%; min-height:34px; padding:4px 38px 0; margin:0 0 8px;
      font:700 18px/1.25 ui-serif,Georgia,serif; color:#f4ecdd; text-align:center;
    }
    #bw-modal-regalo .bw-regalo-head::after {
      content:""; position:absolute; left:0; right:0; bottom:-12px; height:1px;
      background:rgba(244,236,221,.18); pointer-events:none;
    }
    @keyframes bw-regalo-sube {
      from { transform:translateY(52px); opacity:0; }
      to   { transform:translateY(0); opacity:1; }
    }
    /* El ribete de piedra va pegado al borde de abajo de la hoja, no a la
       barra del menú: antes quedaba flotando por encima del total. */
    #bw-modal-regalo .bw-modal::after {
      position:absolute; left:0; right:0; bottom:0; height:11px;
      content:""; pointer-events:none; z-index:30;
      background:url('${BASE_IMG}/ribete.png') left center / auto 100% repeat-x;
    }
    .bw-regalo-intro { margin:0; text-align:center; font:400 13px/1.45 ui-serif,Georgia,serif; color:#e6dccb; }
    /* Una caja por cosa, centradas: una si manda una, tres si manda tres.
       Mismo borde gris que los huecos del tablero. */
    .bw-regalo-slots {
      display:flex; flex-wrap:wrap; justify-content:center; gap:8px;
      width:100%; max-width:min(340px,90vw); margin:0 auto;
    }
    /* Con la clase del contenedor delante: .bw-box-slot se define más abajo en
       la hoja y, con la misma especificidad, ganaba su width:100% y apilaba
       las cajas a lo ancho de toda la pantalla. */
    .bw-regalo-slots .bw-regalo-cuadro {
      flex:0 0 auto; width:clamp(56px,18vw,76px);
      border:1.5px solid rgba(244,236,221,.30) !important;
      background:rgba(0,0,0,.22); cursor:default; border-radius:8px;
    }
    .bw-regalo-cuadro .bw-box-img { height:80%; }
    /* El círculo, con el color de cada cosa: oro, rojo y turquesa. */
    .bw-regalo-cuadro.moneda   .bw-box-nv { background:rgba(224,163,63,.95); }
    .bw-regalo-cuadro.decreto  .bw-box-nv { background:rgba(176,58,44,.95); }
    .bw-regalo-cuadro.monstruo .bw-box-nv { background:rgba(var(--c-propio),.95); }
    .bw-regalo-pie { margin:0; font:400 10px/1.4 ui-serif,Georgia,serif; color:#8b7e6b; text-align:center; }
    #bw-modal-regalo .bw-modal-acciones { width:100%; }
    #bw-modal-regalo .bw-regalo-ok { width:100%; box-sizing:border-box; }
    /* Velo de los paneles: por debajo del menú, para que se siga viendo. */
    .bw-panel-overlay {
      position:fixed; inset:0; z-index:280;
      background:rgba(8,7,5,.42);
      backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
    }
    .bw-panel-overlay.oculto { display:none; }
    .bw-panel.disparo-panel { max-height:80vh; overflow-y:auto; z-index:290; }
    /* Torres necesita más alto: cuatro peldaños en vertical bajo cada una. */
    .bw-panel.torres-panel { max-height:70vh; padding-bottom:34px; }
    .bw-panel.mapa-panel { max-height:75vh; padding-bottom:34px; }
    .bw-panel.aliados-panel { max-height:70vh; }
    .bw-disparo-botones { margin-top:-1px; }
    .bw-disparo-botones .bw-modal-usar {
      width:100%; padding:16px 12px; border-radius:9px;
      font:700 14px/1.2 ui-serif, Georgia, serif;
    }
    .bw-disparo-botones .bw-disparo-matar {
      background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a;
    }
    .bw-caja-label { font-size:10px; font-weight:800; letter-spacing:.06em;
                     text-transform:uppercase; color:#b7a992; margin-bottom:5px; }
    .bw-box { display:grid; grid-template-columns:repeat(2, 1fr); gap:5px; }
    .bw-box-slot { position:relative; width:100%; aspect-ratio:1 / 1; min-width:0;
                   border-radius:8px; display:flex;
                   align-items:center; justify-content:center; font-size:11px; font-weight:800;
                   border:1px dashed rgba(244,236,221,.16); color:#8b7e6b;
                   overflow:hidden; }
    /* Jaula llena: pergamino, borde turquesa, el monstruo dentro y su nivel
       en el círculo de arriba a la derecha. */
    .bw-box-slot.lleno {
      border:1.5px solid #179494;
      background-color:#e8ddc8;
      background-image:url('${BASE_IMG}/bg-modal.jpg');
      background-position:center;
      background-size:var(--bg-modal-size, 160px auto);
      background-repeat:repeat;
      color:#fff; cursor:pointer;
    }
    .bw-box-slot.lleno:hover { filter:brightness(1.06); }
    .bw-box-img {
      position:absolute; left:50%; top:50%;
      transform:translate(-50%, calc(-50% - var(--bw-subida-monstruo, 0%)));
      height:92%; width:auto; max-width:92%;
      pointer-events:none;
      filter:drop-shadow(0 3px 4px rgba(0,0,0,.4));
    }
    /* Solo los monstruos se suben: el alzado de la torre y las pilas de monedas
       o decretos del envío ya vienen centrados y se quedan donde estaban. */
    .bw-torre-ficha,
    .bw-regalo-cuadro.moneda .bw-box-img,
    .bw-regalo-cuadro.decreto .bw-box-img {
      transform:translate(-50%,-50%);
    }
    /* Lámina de jaula: el monstruo va dentro de la reja y el dibujo trae aire
       alrededor, así que se pinta algo más grande que la de calle. */
    .bw-mon-jaula { height:104%; max-width:104%; }
    .bw-box-nv {
      position:absolute; top:3px; right:3px;
      width:18px; height:18px; padding:0;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
      border-radius:50%; background:rgba(var(--c-propio),.92); color:#fff;
      font:800 9px/1 ui-monospace, monospace; text-align:center;
      overflow:hidden; box-sizing:border-box;
      /* Filo blanco de 1 px al 50 %: dibuja el borde sin agrandar el círculo. */
      box-shadow:0 0 0 1px rgba(255,255,255,.5), 0 1px 2px rgba(0,0,0,.35);
    }
    /* Hueco libre: punteado de 1 px, translúcido y con un aspa blanca en el
       centro. Se toca para criar. */
    .bw-box-slot.vacio {
      border:1px dashed rgba(244,236,221,.42);
      background:rgba(0,0,0,.14);
      cursor:pointer;
    }
    .bw-box-slot.vacio:hover { background:rgba(244,236,221,.12); }
    .bw-box-x {
      width:17px; height:17px; border-radius:50%;
      display:grid; place-items:center;
      background:#fff; color:#12100e;
      font:800 15px/1 ui-sans-serif, system-ui, sans-serif;
    }

    /* Mano de cartas */
    .bw-mano-wrap {
      position:fixed; bottom:calc(56px + env(safe-area-inset-bottom, 0px)); left:0; right:0; z-index:200;
      display:flex; justify-content:center;
      pointer-events:none;
    }
    .bw-mano {
      /* El ancho de la fila no depende de cuántas cartas queden: así el
         padding porcentual de cada carta se mide siempre igual. */
      --carta-ancho: min(max(80px, 21vw), calc((100vw - 30px) / 4));
      width: calc(var(--carta-ancho) + var(--carta-ancho) + var(--carta-ancho) + var(--carta-ancho) + 30px);
      display:flex;
      justify-content:center;
      gap:10px;
      /* Las cartas sí se tocan, pero el hueco de la fila (por donde suben al
         pulsarlas) no debe tragarse el arrastre del fondo. */
      pointer-events:none;
    }
    .bw-carta {
      pointer-events:auto; cursor:pointer;
      /* Todo lo de dentro va en cqw: la carta se ve igual de grande o de
         pequeña, y lo de dentro escala con ella. */
      container-type:inline-size;
      /* Ancho estable: el mismo que cabe con cuatro cartas en la mano. Antes
         la carta crecía al quedar menos y el título/imagen se desplazaban
         respecto al número, que va anclado arriba. */
      width:var(--carta-ancho);
      flex:0 0 auto;
      aspect-ratio:1024/1536;
      border-radius:5px;
      background:url('${CARD_BG}') center/100% 100% no-repeat;
      box-shadow:0 8px 20px rgba(0,0,0,.65);
      display:flex; flex-direction:column; align-items:center;
      padding-top:9%; gap:2px;
      color:#2a1808;
      /* Cuánto queda metida la carta bajo el menú: 54 % → 45 % → 39 % → 33 %
         → 43 % → 38 % → 43 % (los 5 puntos de abajo que faltaban). */
      transform:translateY(43%);
      transition:transform .18s ease, box-shadow .18s ease;
      position:relative; user-select:none;
    }
    /* La carta solo se levanta mientras su modal está abierto. No usamos
       :hover/:active: en móvil el hover se queda pegado tras el toque. */
    .bw-carta.activa {
      /* Al abrirla sube solo un 5 % del alto, para que no dé un salto */
      transform:translateY(33%); box-shadow:0 14px 28px rgba(0,0,0,.8);
    }
    .bw-carta.descartable { outline:2px solid rgba(224,83,63,.7); }
    .bw-carta .bw-carta-coste {
      position:absolute; top:calc(3.5% - 2px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 8.5cqw/1 ui-serif,serif;
      color:#7a1010;
    }
    .bw-carta .bw-carta-img {
      order:2;
      /* 26 % → 34 % → 41 % → 49,2 % (+20 % sobre 41): el dibujo es cuadrado y
         el alto es lo que lo limita, así que subir el alto un 20 % lo agranda
         un 20 % sin tocar el ancho, que ya sobra.
         Sin transform, porque un transform aquí aísla al <img> y el
         mix-blend-mode:multiply deja de fundirse con el papel de la carta. */
      flex:0 0 49.2%; width:91%;
      margin-top:3px;
      display:flex; align-items:center; justify-content:center;
      overflow:hidden;
      /* Los mismos 12 px que el título, con la misma técnica (solo pintura),
         para no repetir el transform que rompía el multiply del dibujo. */
      position:relative; top:8.5cqw;
    }
    .bw-carta .bw-carta-img img {
      width:100%; height:100%; object-fit:contain;
      mix-blend-mode:multiply;
    }
    .bw-carta .bw-carta-nombre {
      order:1;
      width:100%; text-align:center;
      font:700 calc(9.8cqw - 2px)/1.2 ui-serif,serif;
      color:#2a1808; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      /* −17 px sobre una carta de 82 px de ancho: en % del ancho, para que
         suba lo mismo en cualquier tamaño. */
      margin-top:-20.7cqw;
      /* 12 px más abajo dentro de la carta (14.6 cqw a 82 px de ancho), menos
         los 5 px que sube ahora (6.1 cqw): queda en 8.5 cqw. Se mueve sin
         tocar el reparto del flex, así que ni el título ni el dibujo cambian
         de tamaño ni empujan nada. */
      position:relative; top:8.5cqw;
    }

    /* Modal carta ampliada */
    .bw-modal-fondo {
      position:fixed; inset:0; background:rgba(0,0,0,.65);
      display:flex; align-items:center; justify-content:center;
      z-index:1000; padding:20px;
    }
    /* Los modales de juego que no son cartas ni el aviso de turno salen como
       hojas inferiores, con el mismo borde que los paneles de jaulas/torres. */
    .bw-modal-fondo.bw-hoja-modal {
      background:transparent; align-items:flex-end; padding:0;
    }
    .bw-modal-fondo.bw-hoja-modal .bw-modal,
    body.bw-himalaya #capa .modal.bw-hoja-modal {
      position:fixed; left:0; right:0;
      bottom:var(--alto-nav, 34px);
      width:100%; max-height:50vh; margin:0; overflow:auto;
      box-sizing:border-box;
      border-radius:16px 16px 0 0; border-bottom:0;
      padding:0 14px 22px;
      background-color:rgba(27,23,19,.97);
      pointer-events:auto;
    }
    .bw-modal { position:relative; display:flex; flex-direction:column; align-items:center; gap:14px; }
    /* Cerrar: siempre en la esquina de arriba a la derecha de la pantalla, a
       20 px de los bordes y sin salirse con el safe-area del móvil. */
    .bw-modal-x {
      position:fixed; z-index:5;
      top:calc(env(safe-area-inset-top, 0px) + 20px);
      right:calc(env(safe-area-inset-right, 0px) + 20px);
      width:32px; height:32px; border-radius:50%;
      display:grid; place-items:center; cursor:pointer;
      border:1px solid rgba(244,236,221,.28); background:rgba(18,16,14,.94);
      color:#f4ecdd; font:700 18px/1 ui-sans-serif,system-ui,sans-serif;
    }
    .bw-carta-grande {
      /* Carta de papel de los modales: todo lo de dentro en cqw, para que la
         de descarte (más pequeña) salga idéntica en proporciones. */
      container-type:inline-size;
      width:min(58vw,230px); aspect-ratio:1024/1536;
      border-radius:9px;
      background:url('${CARD_BG}') center/100% 100% no-repeat;
      box-shadow:0 24px 60px rgba(0,0,0,.9);
      display:grid;
      grid-template-rows:54% 1fr;
      padding:7% 9% 7%;
      color:#2a1808;
      position:relative;
      animation:bwCartaAbre .18s ease;
    }
    @keyframes bwCartaAbre { from { opacity:0; transform:scale(.9) translateY(10px); } to { opacity:1; transform:none; } }
    /* Ciencia instalada: una o dos cartas, una al lado de la otra. Con dos se
       estrechan para que quepan de sobra en el móvil. */
    .bw-ciencia-fila { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .bw-ciencia-fila.dos .bw-carta-grande { width: min(42vw, 172px); }
    /* Hueco de ciencia sin carta: la misma carta punteada, como los huecos del
       box, con el + de los sitios libres. */
    .bw-ciencia-hueco {
      width:min(42vw,172px); aspect-ratio:1024/1536;
      border:2px dashed rgba(244,236,221,.38);
      border-radius:9px;
      background:rgba(0,0,0,.3);
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:6px; color:rgba(244,236,221,.6);
      font:700 30px/1 ui-monospace,monospace;
    }
    .bw-ciencia-hueco em {
      font:600 10px/1 ui-sans-serif,system-ui,sans-serif; font-style:normal;
      letter-spacing:.08em; text-transform:uppercase;
    }
    .bw-carta-coste-grande {
      position:absolute; top:calc(3.5% - 5px); left:50%; transform:translateX(-50%);
      width:16%; aspect-ratio:1;
      display:flex; align-items:center; justify-content:center;
      font:800 8.5cqw/1 ui-serif,serif; color:#7a1010;
    }
    /* Sin monedas para pagarla: el número de coste en rojo intenso con sombra */
    .bw-carta-coste-grande.sin-energia {
      color:#e81010;
      text-shadow:0 0 4px #000, 0 1px 3px #000, 0 2px 6px rgba(0,0,0,.7);
    }
    .bw-carta-grande-img {
      border-radius:3px; overflow:visible;
      display:flex; align-items:center; justify-content:center;
    }
    .bw-carta-grande-img img {
      width:85%; height:85%; object-fit:contain;
      mix-blend-mode:multiply; transform:translateY(11.7cqw);
    }
    .bw-carta-grande-texto {
      display:flex; flex-direction:column; justify-content:flex-start;
      gap:2.6cqw; padding-top:4%; margin-top:15.9cqw;
    }
    .bw-carta-grande-titulo { font:700 8.5cqw/1.3 ui-serif,serif; color:#7a1010; text-align:center; }
    /* Descripción de las cartas del modal: la tipografía plana que hicimos
       para la carta de Destino (sin serif, peso normal, poco aire) */
    .bw-carta-grande-desc {
      margin:2.1cqw 0 0; padding:0;
      font-family:inherit; font-weight:400;
      font-size:6.8cqw; line-height:1.35;
      letter-spacing:.02em;
      -webkit-font-smoothing:auto;
      color:#3a2010; text-align:center;
    }
    /* El relato, 2 px más pegado al titular */
    .bw-destino-grande .bw-carta-grande-desc { margin-top:calc(2.1cqw - 2px); }
    /* Centrados y por encima de la carta, que si no les tapa la mitad */
    .bw-modal-acciones { display:flex; justify-content:center; gap:10px; position:relative; z-index:3; }
    .bw-modal-acciones button {
      padding:0 24px; min-height:38px; border-radius:5px;
      font-size:14px; font-weight:800; cursor:pointer; border:none;
    }
    /* La carta abierta y sus acciones comparten exactamente el mismo ancho. */
    #bw-modal-carta .bw-modal-acciones {
      width:min(58vw,230px); flex-direction:column; gap:10px;
    }
    #bw-modal-carta .bw-modal-acciones .bw-modal-usar {
      width:100%; box-sizing:border-box;
    }
    #bw-modal-carta .bw-modal-cancelar {
      width:min(58vw,230px); min-height:38px; border-radius:5px;
      background:rgba(0,0,0,.42); color:#f4ecdd; cursor:pointer;
      border:1px solid rgba(244,236,221,.35);
      font:700 13px/1 ui-serif,Georgia,serif;
    }
    /* Misma tipografía que el título de las cartas (ui-serif, 700) */
    .bw-modal-acciones button.bw-modal-usar {
      font-family:ui-serif, serif; font-weight:700;
    }
    .bw-modal-usar { background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1); color:#12161a; }
    /* Deshabilitado: oscuro y opaco. Con opacidad se transparentaba lo de
       detrás y no se leía el estado. */
    .bw-modal-usar:disabled {
      background:#1d2126; color:#6f7783;
      box-shadow:inset 0 0 0 1px rgba(244,236,221,.14);
      cursor:not-allowed;
    }

    /* Carta de Destino: papel azul propio. La imagen va en el hueco de arriba,
       la etiqueta en la banda del centro y el texto debajo de la raya. */
    .bw-destino-grande {
      display:block; padding:0;
      background:url('${BASE_IMG}/destiny.png') center / 100% 100% no-repeat;
    }
    .bw-destino-grande .bw-carta-grande-img {
      position:absolute; left:13%; right:13%; top:calc(7% + 13px); height:37%;
    }
    /* El dibujo ya viene en azul y sin fondo (cartas/azul): un 10 % más
       pequeño, sin filtro ni velo sobre el papel. */
    .bw-destino-grande .bw-carta-grande-img img {
      width:100%; height:100%;
      transform:scale(.9); transform-origin:center center;
    }
    .bw-destino-etiqueta {
      position:absolute; left:6%; right:6%; top:calc(49% + 19px);
      text-align:center; color:#2c4d7d;
    }
    .bw-destino-grande .bw-carta-grande-texto {
      position:absolute; left:9%; right:9%; top:calc(63% - 5px); bottom:4%;
      margin:0; padding:0; gap:2cqw;
    }
    /* Cabe el relato y la regla en el hueco de abajo */
    .bw-destino-grande .bw-carta-grande-desc { font-size:5.2cqw; }
    /* El titular también en azul, no en el rojo de las cartas de búnker, y
       4 px más abajo para que respire respecto a la raya. Dos puntos de letra
       menos: iba enorme. */
    .bw-destino-grande .bw-carta-grande-titulo {
      color:#1a3560;
      /* 11 px = los 4 de antes más 7 que lo baja */
      margin-top:11px;
      font-size:calc(8.5cqw - 3px);
    }
    /* El relato con la MISMA tipografía que la etiqueta «Carta de Destino»:
       la sans del cuerpo (plana, sin serif), en minúsculas normales. */
    .bw-destino-grande .bw-carta-grande-desc {
      /* Azul más oscuro que el del titular: el relato va sobre papel claro y
         necesita más contraste para leerse de un tirón */
      color:#1e3a60; font-weight:400;
      /* La app pinta con antialiased, que en Retina deja la letra fina: aquí
         se vuelve al suavizado normal para que el relato no parezca light. */
      -webkit-font-smoothing:auto;
      font-family:inherit;
      /* El .1em de la etiqueta solo sirve para dos palabras en mayúsculas:
         en un párrafo separa las letras dentro de cada palabra y no se lee. */
      letter-spacing:.02em; text-transform:none;
      font-size:calc(4.8cqw + 0.5px); line-height:1.28;
    }
    /* El tipo de monstruo, en negrita dentro del relato */
    .bw-destino-grande .bw-carta-grande-desc strong { font-weight:800; }

    /* ── Manuscritos ── */
    /* 10 px de aire a cada lado del contenido: sin ellos, los textos y las
       tablas de dos columnas quedaban pegados al borde del panel. */
    .man-sec { margin-bottom:14px; padding:0 10px; }
    .man-sec:last-child { margin-bottom:2px; }
    .man-tit {
      font:700 12px/1.2 ui-serif,serif; color:#e8d9b8;
      letter-spacing:.06em; text-transform:uppercase;
      margin:0 0 6px; padding-bottom:4px;
      border-bottom:1px solid rgba(244,236,221,.14);
    }
    .man-fila {
      display:grid; grid-template-columns:1fr auto auto; gap:10px;
      font-size:12px; line-height:1.35; padding:3px 0; color:#d8cdb8;
    }
    .man-fila:nth-of-type(even) { background:rgba(244,236,221,.05); }
    .man-b { color:#b7a992; font-weight:700; text-align:right; white-space:nowrap; }
    .man-c { color:#8b7e6b; text-align:right; min-width:52px; }
    .man-p { margin:6px 0 0; font-size:11.5px; line-height:1.45; color:#c2b6a0; }
    /* Una fase del turno: el título en negrita y el detalle detrás, en el
       mismo párrafo, para que el texto largo fluya y no se salga del panel. */
    .man-paso {
      font-size:12px; line-height:1.4; color:#d8cdb8;
      padding:3px 0; overflow-wrap:anywhere;
    }
    .man-paso b { color:#f4ecdd; font-weight:700; }

    /* ── Modal de descarte: las cartas de papel del modal de una, en 2×2 ── */
    .bw-desc-modal { width:min(90vw,400px); overflow-x:hidden; }
    .bw-desc-tit {
      font:800 15px/1.2 ui-serif,serif; color:#f4ecdd; text-align:center;
      letter-spacing:.07em; text-transform:uppercase;
      text-shadow:0 2px 10px rgba(0,0,0,.95);
    }
    .bw-desc-grid {
      /* Ancho tope para que las cuatro quepan de alto, y flex en vez de grid:
         si quedan 3 cartas, la tercera se centra en su propia fila. */
      display:flex; flex-wrap:wrap; justify-content:center; align-items:flex-start;
      gap:12px; width:100%; max-width:330px; margin:0 auto;
    }
    .bw-desc-celda {
      display:block; padding:0; border:none; background:none; cursor:pointer;
      position:relative; flex:0 0 calc(50% - 6px);
    }
    .bw-desc-celda .bw-carta-grande {
      /* border-box: sin esto el padding del 9 % se suma al ancho y la carta se
         sale de su hueco del grid. */
      box-sizing:border-box;
      width:100%; pointer-events:none; animation:none;
      box-shadow:0 10px 24px rgba(0,0,0,.72);
    }
    .bw-desc-celda.sel .bw-carta-grande { outline:1px solid #e0a33f; outline-offset:1px; }
    /* La marca de la carta elegida: el check de tinta negra en el círculo
       amarillo de siempre. */
    .bw-desc-celda.sel::after {
      content:"✓"; position:absolute; top:-6px; right:-6px;
      width:20px; height:20px; border-radius:50%;
      background:#e0a33f; color:#12161a;
      border:1px solid #12161a;
      display:grid; place-items:center; font-size:12px; font-weight:900;
      box-shadow:0 1px 4px rgba(0,0,0,.5);
    }
    .bw-desc-celda .bw-carta-coste-grande { top:calc(3.5% - 2px); }
    .bw-desc-nota {
      margin:0; min-height:14px; text-align:center;
      font-size:11px; line-height:1.35; color:#e0a33f;
      text-shadow:0 2px 8px rgba(0,0,0,.9);
    }

    /* ── Modal de lanzadera ── */
    .bw-lz {
      width:min(92vw,420px); max-height:80vh; overflow:auto;
      background-color:#181b1f;
      border:1px solid rgba(244,236,221,.16); border-radius:12px;
      padding:0 14px 26px; color:#f4ecdd;
      display:flex; flex-direction:column; gap:10px;
    }
    /* Las dos pantallas de la lanzadera son hojas inferiores, igual que los
       paneles de jaulas, torres y mapa. */
    #bw-modal-lanzar.lz-inicial,
    #bw-modal-lanzar.lz-detalle,
    #bw-modal-objetivo.lz-inicial,
    #bw-modal-objetivo.lz-detalle {
      background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none;
      align-items:flex-end; padding:0; pointer-events:auto; z-index:9999;
    }
    /* Detrás de la hoja de lanzaderas se ve el tablero, y el repintado de cada
       jugada se notaba como un fogonazo: se atenúa lo de debajo. */
    #bw-modal-lanzar.lz-inicial,
    #bw-modal-lanzar.lz-detalle { background:rgba(6,8,7,.62); }
    /* Mientras se elige lanzadera, el menú inferior no debe abrir cartas ni
       ningún otro panel: se bloquea explícitamente además de la capa. */
    body.bw-lanzando #bw-nav-global,
    body.bw-lanzando #bw-nav-global *,
    body.bw-lanzando .bw-mano-wrap,
    body.bw-lanzando .bw-mano-wrap * {
      pointer-events:none !important;
    }
    /* Lo mismo mientras está abierto el aviso de la caja: sin menú ni cartas
       hasta darle a "Muchas gracias". */
    body.bw-regalo-abierto #bw-nav-global,
    body.bw-regalo-abierto #bw-nav-global *,
    body.bw-regalo-abierto .bw-mano-wrap,
    body.bw-regalo-abierto .bw-mano-wrap * {
      pointer-events:none !important;
    }
    #bw-modal-lanzar.lz-inicial .bw-lz-hoja,
    #bw-modal-lanzar.lz-detalle .bw-lz-hoja,
    #bw-modal-objetivo.lz-inicial .bw-lz-hoja,
    #bw-modal-objetivo.lz-detalle .bw-lz-hoja {
      position:fixed; left:0; right:0;
      /* Las mismas reglas que el panel de Torres: pegado al menú, no a 56 px
         fijos, que en este juego dejaba la hoja demasiado alta. */
      bottom:var(--alto-nav, 34px);
      width:100%; max-height:85vh; margin:0;
      border-radius:16px 16px 0 0; border-bottom:0;
      /* Opaca del todo: con un 3 % de transparencia, el repintado del tablero
         de debajo se veía a través de la hoja y el fondo parecía difuminarse
         y volver cada vez que se enviaba una lanzadera. */
      background-color:#1b1713; border-color:#3b3530;
      pointer-events:auto;
    }
    /* Cabecera igual que la de Torres: título, aire y una línea fina debajo. */
    .bw-lz-head {
      position:relative; display:flex; align-items:center; justify-content:center;
      min-height:34px; padding:0 38px; margin-bottom:30px; text-align:center;
    }
    .bw-lz-head::after {
      content:""; position:absolute; left:0; right:0; bottom:-20px; height:1px;
      background:rgba(244,236,221,.18); pointer-events:none;
    }
    .bw-lz-head .bw-lz-tit { font:700 18px/1.25 ui-serif,Georgia,serif; }
    .bw-lz-tit { font:800 16px/1.2 ui-serif,serif; text-align:center; }
    .bw-lz-sub { margin:0 0 10px; font-size:12px; color:#b7a992; text-align:center; }
    .bw-lz-cab-detalle {
      display:flex; justify-content:space-between; align-items:center; gap:12px;
      padding:0 38px;
    }
    .bw-lz-cab-detalle .bw-lz-tit { text-align:left; }
    .bw-lz-cab-detalle .bw-lz-vida { font-size:13px; white-space:nowrap; }
    /* Lista de rivales: nombre y corazón arriba, y debajo sus tres calles. */
    .bw-lz-lista { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:10px; }
    .bw-lz-lista.solo { display:block; }
    .bw-lz-torres { padding:0 4px; }
    /* La línea de arriba y de abajo del tablero del rival. */
    .bw-lz-tablero {
      border-bottom:1px solid rgba(244,236,221,.18);
      padding:12px 0;
    }
    /* En la vista del rival los huecos libres no llevan aspa ni borde
       punteado: son simplemente huecos vacíos. */
    .bw-lz-torres .bw-box-slot.vacio {
      border-style:solid; border-color:rgba(244,236,221,.14);
      background:rgba(0,0,0,.18);
    }
    /* Torre vacía: una X roja que cruza el hueco. */
    .bw-lz-cuadro { position:relative; }
    .bw-torre-x {
      position:absolute; inset:0; display:block; pointer-events:none;
    }
    .bw-torre-x::before, .bw-torre-x::after {
      content:""; position:absolute; left:50%; top:50%;
      width:82%; height:2px; border-radius:2px; background:#d64a3a;
      transform:translate(-50%,-50%) rotate(45deg);
    }
    .bw-torre-x::after { transform:translate(-50%,-50%) rotate(-45deg); }
    /* Las torres del rival son defensoras: azul, no turquesa. */
    .bw-lz-torres .bw-box-slot.bw-torre-img.lleno {
      border-color:#4f8fd0; background-color:#dbe7f5; background-image:none;
    }
    .bw-lz-torres .bw-box-slot.bw-torre-img.lleno .bw-box-nv {
      background:rgba(57,112,174,.95);
    }
    /* Los atacantes que mando a una fortaleza enemiga van en turquesa. */
    .bw-lz-torres .bw-torre-slot.atacante { border-color:#179494; }
    .bw-lz-torres .bw-torre-slot.atacante .bw-box-nv {
      background:rgba(var(--c-propio),.95);
    }
    .bw-lz-torres .bw-torre-slot.defensor { border-color:#b03a2c; }
    .bw-lz-torres .bw-torre-slot.defensor .bw-box-nv {
      background:rgba(176,58,44,.95);
    }
    .bw-lz-torres .bw-box-slot.vacio { cursor:default; }
    .bw-lz-rival {
      display:block; width:100%; box-sizing:border-box; text-align:left;
      padding:20px; border-radius:9px; cursor:pointer; font:inherit;
      background:rgba(176,58,44,.12); border:1px solid rgba(176,58,44,.62);
      color:#f4ecdd;
    }
    .bw-lz-rival:active { filter:brightness(1.15); }
    /* Rival sin ninguna calle legal: sigue visible, pero apagado. */
    .bw-lz-rival:disabled,
    .bw-lz-rival.bloqueado {
      border-color:rgba(244,236,221,.18);
      background:rgba(244,236,221,.04);
      color:#b7a992; cursor:default;
    }
    /* Ciencia con objetivo: las fichas que la carta puede tocar se encienden
       en ámbar, tanto en el resumen de la fortaleza como en el tablero. */
    .bw-torre-slot.objetivo,
    .bw-lz-cuadro.objetivo {
      cursor:pointer;
      border-color:#e0a33f !important;
      box-shadow:0 0 0 2px rgba(224,163,63,.55), 0 0 14px rgba(224,163,63,.35);
    }
    .bw-torre-slot.objetivo:active { filter:brightness(1.2); }
    .bw-ob-cuenta {
      display:block; margin-top:8px; font-size:11px; line-height:1.35; color:#e0a33f;
    }
    .bw-lz-pie .bw-modal-usar + .bw-modal-usar { margin-top:6px; }
    .bw-lz-rival.bloqueado .bw-lz-rival-nombre { color:#b7a992; }
    .bw-lz-rival.bloqueado .bw-lz-rival-vida { color:#8b7e6b; }
    /* Un rival al que no se le puede lanzar nada se apaga entero: borde y
       cuadrados en gris, para que no parezca que responde al toque. */
    .bw-lz-rival.bloqueado { border-color:rgba(244,236,221,.22); background:rgba(244,236,221,.04); }
    .bw-lz-rival.bloqueado .bw-lz-cuadro {
      border-color:rgba(244,236,221,.16); background:rgba(244,236,221,.05);
    }
    /* Entrada a la que no se puede enviar: el cuadrado va en gris, no en rojo
       (el rojo parecía un error de la mesa). El número del monstruo que la
       ocupa se sigue viendo dentro. */
    .bw-lz-cuadro.lz-sin-envio {
      border:1.5px solid rgba(244,236,221,.30);
      background:rgba(244,236,221,.06);
    }
    /* Cuántos atacantes lleva encima el rival, debajo de sus calles. */
    .bw-lz-rival-atac {
      display:block; margin-top:8px;
      font:700 10px/1.2 ui-sans-serif,system-ui,sans-serif; color:#b7a992;
    }
    .bw-lz-rival.bloqueado .bw-lz-rival-atac { color:#8b7e6b; }
    .bw-lz-rival > * { min-width:0; }
    .bw-lz-rival-cab { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
    .bw-lz-rival-nombre { font:800 13px/1.2 ui-serif,Georgia,serif; }
    .bw-lz-rival-vida { font:700 10px/1.2 ui-sans-serif,system-ui,sans-serif; color:#e0533f; white-space:nowrap; }
    /* Tres calles de cinco huecos: arriba la torre y debajo sus cuatro peldaños. */
    .bw-lz-calles {
      display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
      gap:4px; align-items:start; margin-top:14px;
    }
    .bw-lz-calles.detalle { margin-top:2px; padding:0 4px 2px; }
    .bw-lz-calle { display:flex; flex-direction:column; align-items:center; gap:3px; min-width:0; }
    .bw-lz-cuadro {
      width:26px; height:26px; aspect-ratio:1; border-radius:4px;
      display:grid; place-items:center;
      border:1px solid rgba(244,236,221,.14); background:rgba(0,0,0,.18);
    }
    .bw-lz-calles.detalle .bw-lz-cuadro { width:32px; height:32px; }
    .bw-lz-punto {
      width:18px; height:18px; border-radius:50%;
      display:grid; place-items:center;
      font:800 10px/1 ui-monospace,monospace; font-style:normal;
      color:#8b7e6b; background:transparent;
    }
    .bw-lz-calles.detalle .bw-lz-punto { width:22px; height:22px; font-size:11px; }
    .bw-lz-cuadro.bz-torre.lleno .bw-lz-punto {
      border:1.5px solid #4f8fd0; background:#dbe7f5; color:#1d3f63;
    }
    .bw-lz-cuadro.bz-at.lleno .bw-lz-punto {
      border:1.5px solid #7be5e5; background:#179494; color:#fff;
    }
    .bw-lz-cuadro.bz-def.lleno .bw-lz-punto {
      border:1.5px solid #f0a094; background:#b03a2c; color:#fff;
    }
    .bw-mapa-rival.aliado .bw-lz-cuadro.bz-at.lleno .bw-lz-punto {
      border:1.5px solid #f0a094; background:#b03a2c; color:#fff;
    }
    .bw-mapa-rival.aliado .bw-lz-cuadro.bz-def.lleno .bw-lz-punto {
      border:1.5px solid #7be5e5; background:#179494; color:#fff;
    }
    /* Las lanzaderas que vas a soltar, abajo y fuera de las calles: el mismo
       cuadro de la ficha, con el monstruo y su círculo de nivel. Se arrastran
       a la calle donde quieras mandarlas. */
    /* Cada una bajo el hueco entre dos calles, como pedían: la de la
       lanzadera 1 a un tercio del ancho y la 2 a dos tercios. */
    .bw-lz-mis { display:grid; grid-template-columns:repeat(6,1fr);
                 align-items:center; padding:8px 4px 2px; }
    .bw-lz-mis .bw-lz-mia:nth-child(1) { grid-column:2 / span 2; justify-self:center; }
    .bw-lz-mis .bw-lz-mia:nth-child(2) { grid-column:4 / span 2; justify-self:center; }
    .bw-lz-mis.sola .bw-lz-mia:nth-child(1) { grid-column:1 / -1; justify-self:center; }
    .bw-lz-mia {
      position:relative; width:48px; height:48px; padding:4px; box-sizing:border-box;
      border-radius:8px; border:1.5px solid rgba(244,236,221,.5);
      background:rgba(0,0,0,.3); cursor:grab;
      touch-action:none; user-select:none; -webkit-user-select:none;
    }
    .bw-lz-mia img { width:100%; height:100%; object-fit:contain; display:block; pointer-events:none; }
    .bw-lz-mia-nv {
      position:absolute; right:-5px; top:-5px; width:18px; height:18px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      background:rgba(var(--c-propio),.95); color:#fff; pointer-events:none;
      font:700 10px/1 ui-monospace,monospace; box-shadow:0 0 0 1px rgba(255,255,255,.5);
    }
    .bw-lz-mia-l {
      position:absolute; left:-5px; bottom:-5px; padding:0 3px; border-radius:3px;
      font:800 9px/1.35 ui-monospace,monospace; color:#f4ecdd; pointer-events:none;
      background:rgba(18,22,26,.85);
    }
    .bw-lz-mia-elegida { border-color:#7be5e5; box-shadow:0 0 0 2px rgba(123,229,229,.45); }
    /* Mientras viaja la jugada la hoja se apaga: no hay envío doble. */
    .bw-modal-fondo.enviando .bw-lz-hoja {
      opacity:.65; transition:opacity .12s ease; pointer-events:none;
    }
    .bw-lz-fantasma {
      position:fixed; z-index:99999; pointer-events:none; opacity:.9;
      transform:scale(1.08); filter:drop-shadow(0 6px 10px rgba(0,0,0,.45));
    }
    .bw-lz-ayuda { margin:8px 0 10px; font-size:11px; line-height:1.35;
                   color:#b7a992; text-align:center; }
    /* Calles donde se puede soltar la lanzadera que llevas en la mano. */
    .bw-lz-torres .bw-torre.bw-calle-suelta .bw-torre-slot:last-child {
      border-color:#7be5e5; background:rgba(23,148,148,.28);
    }
    .bw-lz-torres .bw-torre.bw-calle-encima .bw-torre-slot:last-child {
      border-color:#7be5e5; background:rgba(23,148,148,.55);
    }
    .bw-lz-vida { font-size:11px; color:#e0533f; }
    .bw-lz-pie { display:flex; justify-content:center; gap:10px; }
    .bw-lz-pie.con-linea {
      border-top:1px solid rgba(244,236,221,.18);
      padding-top:10px;
    }
    /* «No lanzar» es el botón estándar de la interfaz, a todo el ancho. */
    .bw-lz-pie .bw-modal-usar {
      width:100%; min-height:44px; border-radius:9px; cursor:pointer; border:none;
      font:700 14px/1.2 ui-serif, Georgia, "Times New Roman", serif;
    }
    .bw-lz-atras {
      padding:0 20px; min-height:36px; border-radius:5px; cursor:pointer;
      font:800 13px/1 ui-serif,serif; border:none;
      background:rgba(244,236,221,.14); color:#f4ecdd;
    }

    /* Avanzar monstruo: el mismo velo oscuro de los demás modales de juego, con
       el monstruo en su cuadrado de jaula (el del tablero) y las jugadas en la
       lista de botones grises. Entra por encima del menú, como la lanzadera. */
    /* El panel del monstruo deja 20 px de aire bajo el último botón y no se
       corta con scroll en pantallas cortas (si no, el último quedaba pegado
       al borde inferior como si no hubiera margen). */
    .bw-panel.envio-panel { padding:0 14px 20px; max-height:min(72vh, 460px); }
    .bw-envio-cuerpo { display:flex; flex-direction:column; align-items:center; gap:14px; }
    .bw-envio-cuadro { width:min(84px,24vw); }
    .bw-envio-lista {
      display:flex; flex-direction:column; gap:6px;
      width:100%; max-width:240px;
    }
    /* Un 30 % más estrechos que al principio, con el alto de siempre y todo
       centrado; la moneda, cuando la hay, va debajo del destino. */
    .bw-envio-lista .bw-modal-usar {
      width:100%; box-sizing:border-box; min-height:41px;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:0; padding:6px 14px; border-radius:8px; text-align:center;
      font:700 13px/1.15 ui-serif, Georgia, serif;
    }
    .bw-envio-lista small {
      margin-top:2px;
      font:400 10px/1 ui-sans-serif, system-ui, sans-serif;
      color:#4a555f; white-space:nowrap;
    }
    /* Monstruo propio en mi escalera: la lámina de frente dentro del cuadrado
       del panel, sin la reja de la jaula. */
    .bw-envio-foto { display:block; width:100%; height:100%; object-fit:contain; }

    /* Pie del modal: por qué no se puede usar la carta */
    .bw-modal-nota {
      /* Colgada debajo del modal y fuera del flujo: al salir no empuja la carta
         hacia arriba, simplemente aparece en el hueco de abajo */
      position:absolute; top:calc(100% + 10px); left:50%; transform:translateX(-50%);
      margin:0; padding:9px 12px; border-radius:10px;
      background:rgba(18,16,14,.92); border:1px solid rgba(244,236,221,.12);
      font-size:12.5px; line-height:1.4; text-align:center;
      /* 60 % del ancho de la pantalla: con el tope de 230 px salía estrecho. */
      width:60vw; max-width:none; box-sizing:border-box;
      color:#b7a992;
    }

    /* Lista de opciones en columna con nuestro botón gris de UI */
    .bw-modal-lista {
      display:flex; flex-direction:column; gap:10px;
      width:min(340px,90vw); z-index:3;
      max-height:calc(100vh - 190px); overflow-y:auto; padding:2px;
    }
    .bw-modal-lista .bw-modal-usar {
      width:100%; display:flex; align-items:center; justify-content:space-between;
      gap:10px; padding:11px 16px; text-align:left;
      font-family:ui-serif, serif; font-weight:700; font-size:14px;
    }
    .bw-modal-titulo { font:700 18px/1.2 ui-serif, serif; color:#f4ecdd; text-align:center; }
    .bw-modal-pie {
      margin:0; max-width:min(340px,90vw); text-align:center;
      font:400 11.5px/1.4 ui-sans-serif, system-ui, sans-serif; color:#b7a992;
    }
    /* Criadero: la fila de cuadrados para elegir el monstruo. La jaula no se
       pregunta, porque es la del «+» por el que se abre el modal. */
    /* Los cuatro monstruos del bestiario en una fila de cuatro cuadrados, como
       los peldaños del panel de torres pero un 10 % más grandes: 79 px de lado
       como mucho, y en pantallas más estrechas encogen con la fila, que nunca
       pasa del ancho del modal. */
    .bw-criar-grid {
      display:flex; flex-wrap:wrap; justify-content:center;
      gap:8px; width:min(340px,100%); margin:0 auto;
      padding:0 10px; box-sizing:border-box;
    }
    .bw-criar-grid .bw-criar-item { width:calc(33.33% - 6px); flex-shrink:0; }
    /* Cada monstruo es una columna: su cuadrado y, debajo, lo que cuesta. */
    .bw-criar-item { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .bw-criar-celda { position:relative; width:100%; aspect-ratio:1 / 1; padding:0; cursor:pointer; }
    .bw-criar-celda .bw-box-img { height:84%; max-width:84%; }
    /* El monstruo que el criadero todavía no alcanza: el mismo cuadrado, con
       las esquinas redondeadas, el borde a trazos y sin nada dentro. */
    .bw-criar-hueco {
      width:100%;
      border:1px dashed rgba(244,236,221,.42);
      border-radius:8px;
      background:rgba(0,0,0,.14);
    }
    .bw-criar-nombre {
      position:absolute; left:0; right:0; bottom:0; z-index:2;
      padding:1px 2px 2px; box-sizing:border-box;
      text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      /* Un punto menos que con los cuadrados grandes: en 72 px de ancho los
         nombres largos («Coloso de hielo») tienen que caber enteros. */
      font:700 8.5px/1.2 ui-sans-serif, system-ui, sans-serif;
      color:#12161a; background:rgba(232,221,200,.94);
    }
    /* Lo que cuesta, debajo de su cuadrado y en el oro de las monedas de la
       fortaleza (#e0a33f, el de la pastilla del botín y del reparto). */
    .bw-criar-coste {
      text-align:center; white-space:nowrap;
      font:700 8.5px/1.2 ui-sans-serif, system-ui, sans-serif;
      color:#e0a33f;
    }
    /* La fuerza del monstruo, a la derecha y en el azul de la casa (#1a3560,
       el de los niveles de las jaulas y los recursos de la fortaleza), sin más
       dibujo que la cifra. */
    .bw-criar-fuerza {
      position:absolute; top:3px; right:3px; z-index:2;
      min-width:17px; height:17px; padding:0 3px; box-sizing:border-box;
      display:grid; place-items:center; border-radius:50%;
      background:rgba(26,53,96,.96); color:#fff;
      font:800 10px/1 ui-monospace, monospace;
      box-shadow:0 0 0 1px rgba(255,255,255,.5), 0 1px 2px rgba(0,0,0,.35);
    }
    .bw-criar-celda.sel { outline:2px solid #e0a33f; outline-offset:1px; }
    .bw-criar-celda.sel .bw-criar-nombre { background:#e0a33f; }
    /* El que no se puede criar (sin monedas o jaula llena) queda apagado bajo
       un velo negro, sin transparentar el modal. */
    .bw-criar-celda:disabled { cursor:not-allowed; }
    .bw-criar-celda:disabled::before {
      content:""; position:absolute; inset:0; z-index:1; pointer-events:none;
      border-radius:8px; background:rgba(0,0,0,.55);
    }
    .bw-criar-celda:disabled .bw-box-img { filter:grayscale(.45); }
    /* Velo detrás del criadero: si se abre desde la hoja de Jaulas, la de
       debajo se transparentaba por el borde y se mezclaban las dos. */
    #bw-modal-criadero { background:rgba(8,7,5,.55); }
    /* La cabecera del criadero es la de los paneles (X incluida) y el pie la
       misma línea de botón que el resto de modales. */
    /* El criadero necesita más alto que el 50 % de las otras hojas para que
       la parrilla no se salga por arriba ni por abajo; aun así nunca pasa de
       la pantalla (la hoja acaba justo encima del menú). */
    #bw-modal-criadero .bw-modal {
      width:100%; gap:10px;
      padding-bottom:34px;
      max-height:calc(100vh - var(--alto-nav, 34px) - 12px);
    }
    /* La línea va 20 px por debajo del título; con 30 px de margen más el gap
       de la rejilla, quedan otros 20 px de aire hasta los botones de jaula. */
    #bw-modal-criadero .bw-panel-head { width:100%; margin-bottom:30px; }
    /* La pista va pegada a los cuadrados, en el gris de las notas del panel. */
    .bw-criar-pista {
      margin:0; text-align:center;
      font:400 11px/1.35 ui-sans-serif, system-ui, sans-serif; color:#8b7e6b;
    }
    /* El botón de criar va debajo de la pista con 20 px de aire (10 de margen
       más los 10 del gap) y deja 34 px hasta el borde de la hoja; la nota, si
       está vacía, no ocupa ni su hueco. */
    .bw-criar-ok { min-width:170px; }
    #bw-modal-criadero .bw-modal-acciones { margin-top:10px; }
    #bw-modal-criadero .bw-desc-nota { min-height:0; }
    #bw-modal-criadero .bw-desc-nota:empty { display:none; }
  </style>`;
}

/* ── CSS adicional: el demo completo + overrides de la app ──────────────── */

function cssAdicional() {
  return `<style>
    /* Quién te ataca, debajo del marco de «Es tu turno». No es un <p> porque
       el modal de la jornada pinta los <p> con el marco del pergamino. La
       caja va en el borgoña de la casa (#7a1010, el de la vida y las torres),
       porque son ataques, con el texto en blanco y centrado. */
    .bw-turno-ataques {
      display:grid; gap:6px;
      /* Aire con el marco de arriba y con el botón: 5 px más que antes a
         390 px de pantalla, en vw y con tope para escritorio. */
      margin:min(0.8vw, 5px) 0 min(1.8vw, 9px);
      /* Mismo ancho que el botón del modal para que la caja no baile. */
      width:73.5vw; max-width:549px; box-sizing:border-box;
    }
    /* Una caja por jugador que te ataca: si son dos, dos cajas iguales
       apiladas, cada una con su bicho y su escalera debajo. */
    .bw-turno-ataques-grupo {
      display:grid; gap:2px; box-sizing:border-box;
      padding:8px 12px; border-radius:5px;
      background:#7a1010;
      font-size:13px; line-height:1.35; text-align:center; color:#fff;
    }
    .bw-turno-ataques-tit { font-weight:700; }
    .bw-turno-ataques-det { font-size:12.5px; }
    .bw-turno-ataques b { color:#fff; font-weight:700; }

    /* ── Full-screen takeover ── */
    html:has(body.bw-himalaya), body.bw-himalaya {
      /* Negro puro: es el color que asoma en la franja del safe-area de abajo */
      background: #000 !important; padding:0 !important; margin:0 !important;
      /* Una sola columna a la altura real de la pantalla (dvh sigue a la barra
         del navegador): barra arriba, escenario en medio, menú al final. Nada
         va fixed abajo, así que el menú no puede quedarse flotando. */
      height: 100% !important; overflow: hidden !important;
      overscroll-behavior: none !important;
    }
    body.bw-himalaya {
      display: flex !important;
      flex-direction: column !important;
      /* 100% del documento, no 100dvh: en la PWA instalada el dvh se queda
         corto y por eso quedaba franja negra entre el menú y el borde. */
      height: 100% !important;
      min-height: 100% !important;
    }
    body.bw-himalaya .fondo { display: none !important; }
    body.bw-himalaya .barra {
      position: relative !important; top: auto !important;
      left: auto !important; right: auto !important; bottom: auto !important;
      flex: 0 0 auto !important; width: 100% !important;
      /* Alto fijo: 37 px de barra útil más el notch del móvil, si lo hay. Ni el
         avatar, ni el ribete, ni nada de dentro puede estirarla. */
      height: calc(37px + env(safe-area-inset-top, 0px)) !important;
      min-height: 0 !important;
      padding: 0 12px !important;
      padding-top: env(safe-area-inset-top, 0px) !important;
    }
    /* El ribete de piedra del menú, también debajo de la barra: los dos
       extremos de la pantalla se cierran con el mismo adorno. */
    body.bw-himalaya .barra::after {
      content: "";
      position: absolute; left: 0; right: 0; bottom: -9px;
      height: 10px;
      background: url('${BASE_IMG}/ribete.png') left top / auto 100% repeat-x;
      /* Del revés, como el de la mano, que mira al otro lado. */
      transform: scaleY(-1);
      pointer-events: none;
      z-index: 2;
    }
    body.bw-himalaya #pantalla {
      /* Segunda fila de la columna: ocupa todo el hueco que dejan barra y menú.
         Ya no se calcula con 29/56 ni con safe-areas, así que no puede sobrar
         ni faltar nada (ese sobrante era el negro de abajo). */
      position: relative !important;
      top: auto !important; left: auto !important; right: auto !important; bottom: auto !important;
      flex: 1 1 auto !important;
      min-height: 0 !important;
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: none !important;
      z-index: 1 !important;
      background: transparent !important;
    }
    /* Nada dentro del juego debe quedar acotado a 560px */
    body.bw-himalaya #pantalla * { max-width: none; box-sizing: border-box; }
    /* El aviso de turno de la plataforma deja de empujar la escena hacia abajo:
       pasa a pastilla fija sobre el mapa, como los chips del demo. */
    body.bw-himalaya .turno-aviso {
      position: fixed !important;
      /* Debajo del marco: 33 px del alto + el marco completo */
      top: calc(env(safe-area-inset-top, 0px) + 59px + min(66.1vw, 354px)) !important;
      left: 50% !important; right: auto !important; bottom: auto !important;
      transform: translateX(-50%) !important;
      margin: 0 !important; width: auto !important; max-width: 86vw !important;
      padding: 3px 10px !important; border-radius: 999px !important;
      font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif !important;
      white-space: nowrap !important; overflow: hidden !important;
      text-overflow: ellipsis !important;
      z-index: 15 !important; pointer-events: none !important;
      background: rgba(0,0,0,.62) !important;
      border: 1px solid rgba(255,255,255,.18) !important;
      backdrop-filter: blur(6px) !important; -webkit-backdrop-filter: blur(6px) !important;
      box-shadow: none !important;
    }

    /* El menú ya rellena su safe-area con padding: el ::after que se salía por
       debajo sólo añadía una banda oscura tras el footer. */
    body.bw-himalaya .bw-nav::after { display: none !important; }
    body.bw-himalaya .bw-nav {
      /* Última fila de la columna, en el flujo: pegado al borde inferior por
         construcción, sin safe-area ni ::after que dejen franja negra. */
      position: relative !important;
      bottom: auto !important; left: auto !important; right: auto !important; top: auto !important;
      flex: 0 0 auto !important;
      /* margin-top:auto lo empuja al fondo de la columna aunque el escenario
         venga corto: no depende de que los altos cuadren. */
      margin-top: auto !important;
      width: 100% !important;
      height: 34px !important; min-height: 34px !important;
      padding-bottom: 0 !important;
      /* Negro total, sin transparencia ni desenfoque detrás. */
      background: #000 !important;
      backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
    }
    body.bw-himalaya .bw-nav-tab { padding: 0 !important; gap: 0 !important; font-size: 11px !important; }
    /* 34 px = alto del menú (antes 56, con iconos): si no se mide, la mano se
       queda justo encima de él en vez de flotar 22 px más arriba. */
    body.bw-himalaya .bw-mano-wrap { bottom: var(--alto-nav, 34px) !important; }
    /* Ribete de piedra justo encima del menú: es el borde del que salen las
       cartas. Va dentro del contenedor de la mano (mismo borde inferior) y por
       encima de las cartas, que asoman por detrás. */
    body.bw-himalaya .bw-mano-wrap::after {
      content:"";
      position:absolute; left:0; right:0; bottom:-3px;
      height:10px;
      background:url('${BASE_IMG}/ribete.png') left bottom / auto 100% repeat-x;
      pointer-events:none;
      z-index:3;
    }
    body.bw-himalaya .bw-panel.box-panel, body.bw-himalaya .bw-panel.acciones-panel,
    body.bw-himalaya .bw-panel.manuscritos-panel, body.bw-himalaya .bw-panel.torres-panel,
    body.bw-himalaya .bw-panel.mapa-panel, body.bw-himalaya .bw-panel.aliados-panel,
    body.bw-himalaya .bw-panel.disparo-panel, body.bw-himalaya .bw-panel.envio-panel {
      bottom: var(--alto-nav, 34px) !important;
      /* Mismo negro que la barra del menú */
      background: #000 !important;
    }
    /* Los paneles de jaulas y manuscritos conservan su ribete de piedra
       arriba y abajo, aunque la regla anterior los pegue al menú y los pinte
       de negro. */
    body.bw-himalaya .bw-panel.box-panel,
    body.bw-himalaya .bw-panel.manuscritos-panel,
    body.bw-himalaya .bw-panel.torres-panel,
    body.bw-himalaya .bw-panel.mapa-panel,
    body.bw-himalaya .bw-panel.aliados-panel,
    body.bw-himalaya .bw-panel.disparo-panel,
    body.bw-himalaya .bw-panel.envio-panel {
      bottom: var(--alto-nav, 34px) !important;
      background-color: rgba(27,23,19,.97) !important;
    }

    /* ── Barra de información del turno ──
       Del borde izquierdo (donde empiezan las monedas) hasta la derecha de la
       pantalla, 50 px de alto y el mismo fondo translúcido que los datos. */
    /* Marco de piedra con tejado tibetano: la barra entera es el marco y todo
       lo del turno va dentro del panel de pergamino (ver .bw-hud-caja). */
    .bw-hud {
      /* 3:1 como el arte, al 90 % del ancho y centrado. Va dentro de la escena
         (no fijo): así sube y baja con el castillo al hacer scroll. */
      position: absolute; left: 50%; transform: translateX(-50%);
      width: min(90%, 520px);
      /* 20 px más abajo que el borde de la escena (antes 6). */
      top: 26px;
      z-index: 16; box-sizing: border-box; pointer-events: none;
      /* El marco nuevo: 2172 × 1477, con el pergamino grande abajo y una
         franja de papel arriba para lo que venga. El pequeño (marco.png)
         sigue siendo el del aviso de versión nueva. */
      aspect-ratio: 2172 / 1477;
      background: url('${BASE_IMG}/marco-new.png') center / 100% 100% no-repeat;
      /* Contenedor propio: lo de dentro se mide en cqw (1 % del ancho del
         marco), que es el único ancho honesto aquí — el marco es min(90%,
         520px) y con vw se descuadraría en escritorio al salir la barra. */
      container-type: inline-size;
    }
    /* Banda de papel de arriba del marco (del 16,4 % al 27 % del alto): el
       aviso de turno y, justo debajo, los cuadraditos de la barrita. */
    .bw-hud-aviso {
      position: absolute; left: 23.5cqw; right: 23.3cqw;
      top: 16.5%; height: 10.3%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end;
      gap: .7cqw; pointer-events: none;
      /* Aire dentro de la franja amarilla del turno: 0,3 % arriba y abajo y
         1 % a los lados del propio marco. */
      padding: 0.3% 1%;
    }
    .bw-hud-aviso-texto {
      font: 700 2.6cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #1a3560; letter-spacing: .02em; white-space: nowrap;
      margin-bottom: .4cqw;
      /* 2 px arriba a 390 px de pantalla, en cqw para que suba lo mismo en
         cualquier ancho: 0,6 cqw del ancho del marco. */
      transform: translateY(-0.6cqw);
    }
    .vista-rival-enemigo .bw-hud-aviso-texto,
    .vista-rival-enemigo .bw-hud-pasar { color: #7a1010; }
    .vista-rival-enemigo .bw-turno { border-color: #7a1010; }
    .vista-rival-enemigo .bw-turno.activo { background: #7a1010; }
    .vista-rival-enemigo .fort-plat.vida .fort-nombre { background: rgba(122,16,16,.8); }
    .vista-rival-enemigo .fort-plat.vida .fort-cifra { background: rgba(122,16,16,.9); }
    .vista-rival-enemigo .bw-rec b { color: #7a1010; }
    .vista-rival-enemigo .bw-rec em { color: rgba(122,16,16,.85); }
    .vista-rival-enemigo .bw-hud-vida b { color: #7a1010; }
    .vista-rival-enemigo .bw-hud-fila.medio .bw-edif { background: #7a1010; }
    .vista-rival-enemigo .bw-edif-valor { color: #7a1010; }
    .vista-rival-enemigo .bw-edif-nombre { color: #7a1010; }
    .vista-rival-enemigo .bw-edif-puntos i { border-color: rgba(122,16,16,.55); }
    .vista-rival-enemigo .bw-edif-puntos i.llena { background: #7a1010; border-color: #7a1010; }
    .vista-rival-enemigo .fort-circulo-edif .fort-nivel { background: #7a1010; }
    .vista-rival-enemigo .torre .nivel { background: rgba(122,16,16,.9); }
    .vista-rival-enemigo .ficha.atacante .ficha-nv { background: rgba(var(--c-propio),.85); }
    .vista-rival-enemigo .ficha.mia .ficha-nv { background: rgba(122,16,16,.8); }
    .vista-rival-enemigo .bw-box-nv { background: rgba(122,16,16,.92); }
    .vista-rival-enemigo .lanzadera-nv { background: rgba(122,16,16,.9); }
    .vista-rival-aliado .bw-torre-slot.atacante,
    .vista-rival-enemigo .bw-torre-slot.atacante { border-color: rgb(var(--c-propio)); }
    .vista-rival-aliado .bw-torre-slot.atacante .bw-box-nv,
    .vista-rival-enemigo .bw-torre-slot.atacante .bw-box-nv { background: rgba(var(--c-propio),.95); }
    .vista-rival-aliado .fort-slot-vacio .fort-slot-x,
    .vista-rival-enemigo .fort-slot-vacio .fort-slot-x { display: none; }
    .vista-rival-aliado .bw-torre-x,
    .vista-rival-enemigo .bw-torre-x { display: none; }
    .vista-rival-aliado .hueco-mas,
    .vista-rival-enemigo .hueco-mas { display: none; }
    /* «Finalizar turno», en el mismo aviso de la franja del HUD. */
    .bw-hud-pasar {
      padding: 0; border: 0; background: none; cursor: pointer;
      pointer-events: auto; white-space: nowrap;
      font: inherit; color: #1a3560; text-decoration: underline;
      text-underline-offset: .35cqw;
    }
    .bw-hud-pasar:active { opacity: .65; }
    /* Los cuadraditos del turno, dentro del aviso: más cortos que la franja del
       fondo del pergamino y con el ancho del marco como unidad. */
    .bw-hud-aviso .bw-hud-turnos { width: 100%; height: 1.3cqw; gap: .6cqw; }
    .bw-hud-aviso .bw-turno {
      height: 100%; border-radius: 1cqw; border-width: .45cqw;
    }
    .bw-hud-aviso .bw-turno:not(.activo) { border-width: 1px; }

    /* Hueco interior del marco, en % del propio marco: deja fuera tejado,
       banderines, columnas y peana. */
    .bw-hud-caja {
      position: absolute;
      /* Hueco del pergamino grande medido sobre el marco de 2172 × 1477: el
         papel va del 11,4 % al 88,6 % de ancho y del 40,9 % al 79,4 % de
         alto. La caja se queda dentro: 11,5 % / 11 % de ancho y 40,9 % /
         23,3 % de alto (acaba 2,6 puntos antes del filo de abajo). */
      left: 11.5%; right: 11%; top: 40.9%; bottom: 20.5%;
      display: flex; flex-direction: column;
      justify-content: center; gap: .4cqw;
      padding: 2%; overflow: hidden;
    }

    /* ── La fortaleza de un vistazo ──
       Dos filas: arriba tres huecos iguales —producción, vida y edificios— y
       debajo una entera con la luna y la franja de turnos. */
    .bw-hud-cuerpo {
      display: flex; flex-direction: column; justify-content: flex-start;
      gap: 1.5cqw; min-width: 0;
      /* Ocupa todo el hueco del pergamino: así la fila del escudo puede crecer
         y los slots quedan pegados al padding de abajo. */
      flex: 1 1 auto;
    }
    .bw-hud-caja img { display: block; object-fit: contain; }

    /* Fila de arriba: monedas a la izquierda, vida en el centro y decretos a
       la derecha. */
    .bw-hud-fila { display: grid; align-items: center; min-width: 0; }
    .bw-hud-fila.arriba {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      /* Crece hasta el padding de arriba y empuja armería/ciencia/criadero
         contra el de abajo. */
      flex: 1 1 auto;
    }
    .bw-hud-fila.arriba > .bw-hud-celda.izq  { grid-column: 1; }
    .bw-hud-fila.arriba > .bw-hud-vida       { grid-column: 2 / 4; }
    .bw-hud-fila.arriba > .bw-hud-celda.der  { grid-column: 4; }
    .bw-hud-celda { display: flex; justify-content: center; min-width: 0; }
    /* Fila del medio: cuatro columnas. Armería en la primera, la ciencia
       ocupando las dos del centro y el criadero en la última. */
    /* Fila del medio: cuatro columnas. Armería en la primera, la ciencia
       ocupando las dos del centro y el criadero en la última. La fila se
       hace un 10% más ancha para dar respiro a los puntos y que la
       separación coincida con la de la fortaleza. */
    .bw-hud-fila.medio { grid-template-columns: repeat(4, minmax(0, 1.1fr)); gap: .7cqw; }
    .bw-hud-fila.medio > .bw-edif:nth-child(1) { grid-column: 1; }
    .bw-hud-fila.medio > .bw-edif-ciencia    { grid-column: 2 / 4; }
    .bw-hud-fila.medio > .bw-edif:nth-child(3) { grid-column: 4; }

    /* producción: icono y «6 por luna nueva» */
    .bw-hud-prod { display: flex; flex-direction: column; gap: .6cqw; min-width: 0; }
    /* El recurso va en columna y centrado: icono, la cifra y, debajo, «por
       ciclo» (antes decía «por luna nueva»). */
    .bw-hud-celda .bw-rec {
      flex-direction: column; align-items: center; gap: .2cqw; min-width: 0;
      margin-inline: auto;
    }
    .bw-hud-celda .bw-rec b { display: flex; align-items: baseline; gap: .2cqw; }
    .bw-rec { display: flex; align-items: center; gap: 1.8cqw; min-width: 0; }
    .bw-rec img { width: 5.4cqw; height: 5.4cqw; flex: 0 0 auto; object-fit: contain; }
    .bw-hud-vida img { filter: brightness(0) saturate(100%) invert(17%) sepia(55%) saturate(600%) hue-rotate(190deg) brightness(85%); }
    .vista-rival-enemigo .bw-hud-vida img { filter: none; }
    /* Todo el texto del resumen va en el rojo de los puntos y en la serif de
       las cartas. */
    .bw-rec b {
      font: 700 3cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #1a3560;
    }
    .bw-rec em {
      font-style: normal; color: rgba(26,53,96,.85); white-space: nowrap;
      font: 600 2.4cqw/1 ui-serif, Georgia, "Times New Roman", serif;
    }

    /* vida en el centro */
    .bw-hud-vida { display: flex; flex-direction: column; align-items: center; gap: 1.3cqw; }
    .bw-hud-vida img { width: 5.4cqw; height: 5.4cqw; object-fit: contain; }
    .bw-hud-vida b {
      font: 700 3.5cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #1a3560; white-space: nowrap;
    }

    /* edificios: icono, nombre y puntos de nivel en rojo. En la fila del medio
       son cuatro y van apilados (icono, nombre, puntos) para que quepan. */
    .bw-hud-edif { display: flex; flex-direction: column; gap: .6cqw; min-width: 0; }
    .bw-edif { display: flex; align-items: center; gap: .6cqw; min-width: 0; }
    /* Los cuatro huecos de la fortaleza: sin icono, cada uno en su caja roja
       de esquinas redondeadas con el texto en blanco roto. */
    .bw-hud-fila.medio .bw-edif {
      flex-direction: column; justify-content: center; gap: .8cqw; min-width: 0;
      background: #1a3560; border-radius: 1cqw;
      /* 10 % más alta que antes (1,6 / 1,7 → 1,76 / 1,87). */
      padding: 1.76cqw .6cqw 1.87cqw;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
    }
    .bw-hud-fila.medio .bw-edif-nombre { color: #f4ecdd; }
    /* La ciencia es un botón (abre sus cartas): sin borde ni fuente de sistema. */
    .bw-edif-ciencia {
      font: inherit; color: inherit; -webkit-appearance: none; appearance: none;
      border: 0; cursor: pointer;
    }
    .bw-edif-ciencia:active { filter: brightness(1.18); }
    .bw-hud-fila.medio .bw-edif-valor  { color: #f4ecdd; }
    /* Dentro de la caja roja los puntos van en blanco roto: relleno si el nivel
       está conseguido, solo el aro si no. */
    .bw-hud-fila.medio .bw-edif-puntos { margin-left: 0; }
    .bw-hud-fila.medio .bw-edif-puntos i { border-color: rgba(244, 236, 221, .65); }
    .bw-hud-fila.medio .bw-edif-puntos i.llena {
      background: #f4ecdd; border-color: #f4ecdd;
    }
    .vista-rival-enemigo .bw-hud-fila.medio .bw-edif-puntos i.llena {
      background: #f4ecdd; border-color: #f4ecdd;
    }
    .vista-rival-enemigo .bw-hud-fila.medio .bw-edif-puntos i {
      border-color: rgba(244,236,221,.65);
    }
    .vista-rival-enemigo .bw-lz-cuadro.bz-torre.lleno .bw-lz-punto {
      border-color: #c0392b; background: #7a1010; color: #fff;
    }
    .vista-rival-enemigo .bw-lz-cuadro.bz-at.lleno .bw-lz-punto {
      border-color: rgba(var(--c-propio),.8); background: rgb(var(--c-propio)); color: #fff;
    }
    .bw-edif-valor {
      font: 700 2.2cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #1a3560; white-space: nowrap;
    }
    .bw-edif img { width: 2.5cqw; height: 2.5cqw; flex: 0 0 auto; }
    .bw-edif-nombre {
      font: 600 2.2cqw/1 ui-serif, Georgia, "Times New Roman", serif;
      color: #1a3560; white-space: nowrap;
    }
    /* En cqw (1 % del ancho del marco): antes iba en var(--u) sin calc(), que
       es CSS inválido y dejaba los puntos sin tamaño. */
    .bw-edif-puntos { display: flex; gap: .6cqw; margin-left: .5cqw; }
    .bw-edif-puntos i {
      box-sizing: border-box;
      /* 20 % menos que 2cqw (2 × 0,8 = 1,6cqw). */
      width: 1.6cqw; height: 1.6cqw; border-radius: 50%;
      border: 1px solid rgba(26,53,96,.55); background: transparent;
    }
    .bw-edif-puntos i.llena { background: #1a3560; border-color: #1a3560; }

    /* ── Antes aquí iba el bloque temporal de colores de depuración. fuera. */

    /* fila entera de abajo: la franja de turnos, dentro del padding como el
       resto (los márgenes negativos la sacaban fuera del papel por los lados). */
    .bw-hud-pie {
      grid-column: 1 / -1; flex: 0 0 auto;
      display: flex; align-items: center; gap: 1.2cqw;
      margin: 0;
    }
    .bw-hud-pie .bw-luna { width: 2.3cqw; height: 2.3cqw; flex: 0 0 auto; }
    .bw-hud-pie .bw-hud-turnos { flex: 1; }
    /* Pilas en la fortaleza: media talla (28 px, antes 56) y encogiendo con
       el mapa, para que en un móvil pequeño no se coman la peana. El alto va
       en proporción (height:auto). El desplazamiento vive en la caja para que
       la pila y su nombre suban juntos. */
    /* La pastilla del número va siempre por delante de la pila: con siete
       monedas (o al levantar una torre, que rehace el HUD) la pila es más
       ancha que la bola y, como iba después en el HTML, la tapaba. */
    .fort-pila-caja { position:relative; z-index:1; }
    /* +4 px las monedas y +2 px los decretos sobre lo que había (−22 / −19),
       descontando los 3 px que sube la columna al encoger el círculo. */
    .fort-pila-caja.coins   { transform: translateY(calc(-5.9 * var(--u))); }
    .fort-pila-caja.decrees { transform: translateY(calc(-4.6 * var(--u))); }
    /* Todo en --u (1 % del ancho del mundo) para que pilas, círculos y huecos
       crezcan con la imagen de la fortaleza al girar el móvil. */
    .fort-pila { width: calc(8.6 * var(--u)); height: auto; display: block; margin: calc(.5 * var(--u)) auto 0; filter: drop-shadow(0 6px 12px rgba(0,0,0,.85)); }
    /* El nombre, colgando justo debajo de la pila y en el color de su moneda. */
    .fort-nombre {
      position:absolute; top:100%; left:50%; transform:translateX(-50%);
      /* Bajada desde el borde de la pila: 1 px de aire + 5 px + 10 px. Con
         top:100%, el margen positivo baja el tag; el negativo lo sube. */
      margin-top:calc(4.1 * var(--u)); white-space:nowrap;
      /* La tipografía plana de la carta de Destino: la del cuerpo, sin serif,
         en peso 500 (un punto por encima del normal, sin llegar a la negrita). */
      font-family:inherit; font-weight:500;
      font-size:calc(2.3 * var(--u)); line-height:1; letter-spacing:.02em;
      /* Mismo modelo que los círculos de camino: flex centrado, sin borde, el
         relleno de arriba que corrige la métrica y la misma altura que ellos. */
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; text-align:center;
      min-height:calc(4.95 * var(--u));
      /* El relleno va abajo, no arriba, y a media subida: con el .9u completo
         la letra se pasaba de alta. */
      padding:0 calc(1.8 * var(--u)) calc(.45 * var(--u)); border-radius:999px;
      /* Fondo del color del tipo (rojo / dorado oscuro) al 80 % y texto blanco. */
      color:#fff;
      border:0;
      text-shadow:none;
    }
    /* Pill del nombre: decretos en el rojo corporativo, monedas en dorado
       oscuro. Texto blanco en las dos. */
    .fort-plat.energia .fort-nombre { background:rgba(138,106,26,.8); }  /* monedas: dorado oscuro */
    .fort-plat.vida    .fort-nombre { background:rgba(26,53,96,.8); }  /* decretos: azul oscuro */
    /* La pila de monedas sube 5 px más que la de decretos: el nombre compensa
       esos 5 px para que los dos textos queden a la misma altura. */
    .fort-pila-caja.coins .fort-nombre { margin-top:calc(5.4 * var(--u)); }
    /* Grid de turnos: una barra larga por jugador al fondo del marco. La del
       jugador en curso va rellena de rojo; las demás, solo con el borde. */
    .bw-hud-turnos { display: grid; gap: 3px; height: 6px; }
    .bw-turno {
      box-sizing: border-box; height: 6px; border-radius: 3px;
      padding: 0; background: transparent;
      border: 1.5px solid #1a3560;
    }
    .bw-turno.activo { background: #1a3560; }
    /* Dentro de la barra los datos no llevan pastilla propia: manda el fondo de
       la barra. */
    /* Dentro del pergamino el texto va en tinta oscura: los chips pierden su
       pastilla y su sombra. */
    .bw-hud .bw-hud-chip {
      background: transparent; border: 0; padding: 0;
      color: #2a2018; text-shadow: none;
    }
    .bw-hud-chip {
      display: inline-flex; align-items: baseline; gap: 3px;
      font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; color: #fff;
      background: rgba(0,0,0,.74); border: 1px solid rgba(255,255,255,.22);
      border-radius: 999px; padding: 3px 8px;
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      text-shadow: 0 1px 2px rgba(0,0,0,.75);
    }
    .bw-hud-chip i { font-style: normal; font-weight: 600; opacity: .62 }
    .bw-hud-chip em { font-style: normal; font-weight: 600; letter-spacing: .01em; opacity: .8 }

    /* ── Variables del demo ── */
    :root {
      --tinta:#050b0a;
      --suelo:#1d2c24;
      --losa:#2c3d34;
      --borde:rgba(232,222,200,.14);
      --c-propio: 26,53,96;
      --laton:#b9c3cc;
      --texto:#eae3d3;
      --apagado:rgba(234,227,211,.55);
      --azul:#4a90d9;
      --rojo:#e0533f;
      --morado:#9b59b6;
    }

    /* ── Cielo fijo (el div #bw-cielo-global lleva class="cielo") ── */
    .cielo {
      position:fixed; inset:0; z-index:0; pointer-events:none;
      background:
        radial-gradient(60% 30% at 50% 6%, rgba(140,180,200,.10), transparent 70%),
        linear-gradient(180deg, rgba(5,11,10,.10) 0%, rgba(3,7,7,.34) 55%, rgba(4,9,8,.72) 100%),
        radial-gradient(90% 50% at 50% 0%, #10201a 0%, #081210 55%, #040908 100%);
    }

    /* ── Escena ── */
    .escena {
      position:relative; z-index:1; padding-bottom:0;
      /* El zoom del mundo (hasta 1,15) agranda la caja y el contenedor de
         scroll contaba ese sobrante como scroll de más: se podía bajar hasta
         dejar el mapa cortado y ver el negro por debajo. Recortado aquí, el
         scroll nunca pasa del contenido. */
      overflow:hidden;
    }

    /* ── Claro ── */
    .mundo {
      position:relative;
      width:100%;
      container-type:inline-size;
      /* Todo el mapa (castillo, caminos, círculos y tablero) sube 30 px a 400 px
         de ancho: 7.5u en proporción. */
      margin-top:calc(-7.5 * var(--u));
      /* Vista arriba: el mapa entero se ve un 15 % más grande (--zoom-mapa lo
         pone el parallax). Escala desde arriba, así el castillo se agranda
         hacia abajo sin mover nada de sitio. */
      transform:scale(var(--zoom-mapa, 1));
      transform-origin:50% 0;
      will-change:transform;
      /* Único mando del aire entre el marco y el castillo. Lo usan el bloque
         del mapa y el tablero (fichas, lanzaderas, torres): así los círculos
         de las escaleras se mueven siempre con la imagen. */
      /* El marco, en medidas reutilizables: 90 % del ancho del mundo (el mismo
         ancho que usa su regla: 90 % del contenedor) con tope de 520 px, y su
         alto según el arte 2172 × 1477. Va en --u (1 % del ancho del mundo) y
         no en vw: con barra de scroll el 90 % del contenedor y el 90 vw no
         miden lo mismo —la barra entra en vw y no en el %—, y el marco se
         quedaba más estrecho que su alto calculado: todo se descuadraba al
         cambiar el ancho de la ventana. */
      --ancho-marco: min(90 * var(--u), 520px);
      --alto-marco: calc(var(--ancho-marco) * 1477 / 2172);
      /* Aire hasta el castillo: 26 px de la escena + el marco entero + 43 px de
         aire. Antes eran 276 px en seco y, al ensanchar la pantalla, el marco
         crecía y la fortaleza se le metía debajo: la distancia cambiaba con el
         ancho. De aquí cuelgan el castillo, la escalera, los caminos y el
         tablero. */
      --margen-castillo: calc(26px + var(--alto-marco) + 11 * var(--u));
      /* Solape de la escalera sobre la fortaleza: 253 px cuando el mundo mide
         390 px, o sea el 64,9 % del ancho (bajada de 40 px sobre los 293
         originales). En proporción para que las dos imágenes se hagan
         pequeñas y grandes juntas: con 293 px fijos, al encoger la pantalla la
         escalera subía sola respecto a la fortaleza. */
      --solape-escalera: calc(66.7 * var(--u));
      /* Dónde empieza la imagen de las escaleras (y por tanto el tablero),
         medido en --u (1 % del ancho del mundo) y no en vw: así cuelga de la
         imagen y no del viewport. */
      --tope-castillo: calc(var(--margen-castillo) + 93.47 * var(--u) - var(--solape-escalera));
      /* Hueco de suelo por debajo de la escalera: alarga el scroll sin mover
         el tablero, que descuenta lo mismo por abajo. */
      /* Aire por debajo de la escalera. Eran 50 px que solo estiraban el suelo
         (y el scroll) sin que se viera nada: el tablero y los caminos cuelgan
         de esta misma medida, así que a 0 siguen pegados a la escalera. */
      --aire-escalera: 0px;
    }
    /* --u = 1% del ancho del mundo (1cqw): fallback con vw si container-query no disponible */
    @supports (container-type:inline-size) {
      .mundo { --u:1cqw; }
    }
    @supports not (container-type:inline-size) {
      .mundo { --u:1vw; }
    }

    .suelo {
      position:relative; width:100%; overflow:hidden;
      min-height:calc(93.47 * var(--u) + 100px); /* garantía de altura mínima */
      background:var(--mapa-url, url('${BASE_IMG}/mapas/mapa-selva.webp')) top center / 100% auto no-repeat;
    }
    .capa-himalaya { display:none; position:absolute; left:0; right:0; background-size:cover; background-repeat:no-repeat; }
    body.mapa-himalaya .suelo { background:none !important; }
    body.mapa-himalaya .suelo::after { display:none !important; }
    body.mapa-himalaya .capa-himalaya { display:block; }

    /* bg-clouds: pegada a la escena, como en el demo (si va fixed se queda
       clavada a la pantalla y se despega de la fortaleza al bajar) */
    .capa-bg-clouds {
      position:absolute; top:0; left:0; right:0;
      pointer-events:none;
      /* 300 px más alta que antes (430 + 46,74vw): baja hasta tapar el negro
         que asomaba detrás de la fortaleza al hacer scroll. */
      height:calc(730px + 46.74vw);
      background-image:url('${BASE_IMG}/mapas/nieve/bg-clouds.jpg');
      background-size:cover;
      background-position:top center;
      transform:translateY(var(--py-clouds, 0px));
      will-change:transform;
      z-index:0;
    }

    /* bloque mapa */
    .bloque-mapa {
      position:relative;
      margin-top:var(--margen-castillo);
      width:100%; height:auto;
      display:none;
    }
    body.mapa-himalaya .bloque-mapa { display:block; }
    .bloque-mapa .img-fortress {
      display:block;
      width:96%; margin:0 auto;
      /* El alto se reserva con la proporción del arte antes de que la imagen
         llegue: si no, la escalera y el tablero se colocaban con el hueco a 0
         y las fichas aparecían descolocadas hasta el siguiente repintado. */
      height:auto; aspect-ratio:1178 / 1147;
      position:relative; z-index:1;
    }
    .bloque-mapa .img-stairs {
      display:block;
      width:100%;
      height:auto; aspect-ratio:1214 / 1812;
      /* El solape va en % del ancho (ver --solape-escalera en .mundo): fijo en
         px, la escalera se despegaba de la fortaleza al cambiar el tamaño. */
      margin-top:calc(-1 * var(--solape-escalera));
      /* Aire por debajo de la imagen: alarga el suelo (y el scroll). La misma
         medida se descuenta en caminos y tablero para que no se estiren. */
      margin-bottom:var(--aire-escalera);
    }

    /* fort-ui */
    .fort-ui {
      position:absolute; left:2%; width:96%; top:0;
      aspect-ratio:1178/1147;
      z-index:2; pointer-events:none;
    }
    .fort-ui > * { pointer-events:auto; }
    .fort-plat {
      position:absolute;
      display:flex; flex-direction:column; align-items:center; gap:calc(.77 * var(--u));
      transform:translate(-50%,-50%);
      filter: drop-shadow(0 6px 18px rgba(0,0,0,.7));
    }
    /* El número solo, en un círculo, en el sitio que ocupaba el texto. Va por
       encima de la pila de monedas o decretos (z-index 2 frente al 1). */
    .fort-cifra {
      position:relative; z-index:2;
      display:flex; align-items:center; justify-content:center;
      transform:translateY(calc(-1 * var(--u)));
      box-sizing:border-box;
      width:calc(4.0 * var(--u)); height:calc(4.0 * var(--u));
      border-radius:50%;
      font:800 calc(1.9 * var(--u))/1 ui-monospace, monospace;
      border:0;
      box-shadow:0 0 0 1px rgba(255,255,255,.5), 0 1px 4px rgba(0,0,0,.55);
    }
    .fort-plat.energia .fort-cifra { background:rgba(138,106,26,.9); color:#fff; position:relative; top:calc(-3.82 * var(--u)); left:calc(1.35 * var(--u)); }
    .fort-plat.energia .fort-pila-caja { position:relative; top:calc(-2.25 * var(--u)); left:calc(.9 * var(--u)); }
    .fort-plat.vida    .fort-cifra { background:rgba(26,53,96,.9); color:#fff; position:relative; top:calc(-3.82 * var(--u)); left:calc(-1.35 * var(--u)); }
    .fort-plat.vida    .fort-pila-caja { position:relative; top:calc(-3.15 * var(--u)); left:calc(-.9 * var(--u)); }

    .fort-label {
      font-size:calc(2.56 * var(--u)); font-weight:700; letter-spacing:.01em;
      color:#fff;
      background:rgba(0,0,0,.72);
      border-radius:999px; padding:calc(.77 * var(--u)) calc(2.56 * var(--u));
      border:1px solid rgba(255,255,255,.32);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      white-space:nowrap; line-height:1.3;
      text-shadow:0 1px 3px rgba(0,0,0,.8);
    }
    .fort-circulo {
      position:absolute;
      transform:translate(-50%,-50%);
      display:flex; flex-direction:column; align-items:center; gap:calc(.5 * var(--u));
    }
    /* Sin position aquí: lo pone .fort-circulo (absolute). Con relative, el
       left/top de cada edificio solo lo desplazaba desde donde caía en el
       flujo y las posiciones en % no significaban lo que parecían. */
    .fort-circulo-edif {
      display:inline-block;
      padding:calc(4 * var(--u));
    }
    .fort-circulo-edif .fort-nivel {
      position:absolute;
      top:calc(2.5 * var(--u) + 3px);
      left:50%; transform:translateX(-50%);
      z-index:2;
      background:rgb(var(--c-propio));
      border:0;
      padding:calc(1.4 * var(--u));
      gap:3px;
      white-space:nowrap;
    }
    .fort-circulo-edif .fort-nivel i {
      width:calc(1.4 * var(--u)); height:calc(1.4 * var(--u));
    }
    .fort-edif-img {
      width: calc(22 * var(--u)); height: auto;
      display: block;
    }
    .fort-circulo .fort-label { border-color:rgba(130,160,255,.55); }
    .fort-nivel {
      display:flex; gap:calc(.77 * var(--u)); align-items:center;
      background:rgba(0,0,0,.7); border-radius:999px;
      padding:calc(.51 * var(--u)) calc(1.28 * var(--u));
      border:0;
      box-shadow:0 0 0 1px rgba(255,255,255,.5);
    }
    .fort-nivel i {
      display:block;
      width:calc(1.79 * var(--u)); height:calc(1.79 * var(--u));
      border-radius:50%;
      border:.5px solid rgba(255,255,255,.7);
      background:transparent;
    }
    .fort-nivel i.lleno { background:rgba(255,255,255,.9); }
    .fort-tot { opacity:.62; font-weight:600 }
    /* Huecos en varias filas: pastilla rectangular y puntos algo más pequeños */
    .fort-nivel.filas { flex-direction:column; gap:calc(.51 * var(--u)); border-radius:9px; }
    .fort-fila { display:flex; gap:calc(.9 * var(--u)); justify-content:center; }
    .fort-nivel.filas i { width:calc(1.54 * var(--u)); height:calc(1.54 * var(--u)); }
    .fort-slot {
      position:absolute;
      transform:translate(-50%,-50%);
      width:calc(15.4 * var(--u)); height:calc(15.4 * var(--u));
      border-radius:5px;
      /* Hueco libre: sin marco, solo el círculo borgoña con el + en el centro
         (el mismo de los decretos del HUD). Se toca para criar. */
      background:transparent;
      border:0;
      cursor:pointer;
    }
    /* Círculo de signo: igual que la pastilla de fuerza de un monstruo
       (borgoña, mono, blanco). Lo usan las jaulas vacías y los huecos de torre. */
    .fort-slot-x,
    .hueco-mas {
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:calc(4.4 * var(--u)); aspect-ratio:1; border-radius:50%;
      background:rgba(var(--c-propio),.85); border:0;
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; padding:calc(.5 * var(--u)) 0 0; text-align:center;
      font-weight:700; font-family:ui-monospace,monospace;
      font-size:calc(2.11 * var(--u)); line-height:1; color:#fff;
    }
    [data-edif="criadero"] { cursor:pointer; }
    .fort-slot.fort-slot-lleno {
      /* Con monstruo no hay marco: solo la lámina y su pastilla */
      border:0; background:transparent; box-shadow:none;
      color:#8dc0f0;
    }
    /* El monstruo del box, como en el tablero: lámina de frente y pastilla de
       fuerza a su derecha. */
    .fort-slot-img {
      position:absolute; left:50%; top:50%;
      transform:translate(-50%, calc(-50% - var(--bw-subida-monstruo, 0%)));
      width:calc(12.4 * var(--u)); height:auto; pointer-events:none;
      filter:drop-shadow(0 calc(.4 * var(--u)) calc(.8 * var(--u)) rgba(0,0,0,.55));
    }
    .fort-slot-nv {
      position:absolute; bottom:0; left:50%;
      transform:translate(-50%, calc(50% - 14px));
      width:calc(4.0 * var(--u)); aspect-ratio:1; border-radius:50%;
      background:rgba(var(--c-propio),.9); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font:700 calc(1.9 * var(--u))/1 ui-monospace,monospace;
      box-shadow:0 0 0 1px rgba(255,255,255,.5);
      z-index:3;
    }
    .fort-slot.fort-slot-arriba .fort-slot-nv {
      bottom:auto; top:0;
      transform:translate(-50%, calc(-50% - 5px));
    }

    /* nubes */
    .capa-cloud-l {
      position:absolute; top:100px; left:-200px; width:300px; height:300px;
      pointer-events:none;
      background-image:url('${BASE_IMG}/mapas/nieve/cloud.png');
      background-size:contain;
      background-repeat:no-repeat;
      background-position:top right;
      mix-blend-mode:screen;
      z-index:5;
      transform:translateY(var(--py-cloud-sm, 0px));
      will-change:transform;
    }
    .capa-cloud-r {
      position:absolute; top:calc(300px + 5vw); left:calc(100% - 100px); width:300px; height:300px;
      pointer-events:none;
      background-image:url('${BASE_IMG}/mapas/nieve/cloud.png');
      background-size:contain;
      background-repeat:no-repeat;
      background-position:top left;
      mix-blend-mode:screen;
      z-index:5;
      transform:translateY(var(--py-cloud-sm, 0px));
      will-change:transform;
    }

    /* banderines: fixed, anclados a la zona de la fortaleza */
    /* Los banderines arrancan justo en el borde de abajo del marco: 6 px de la
       escena más el alto del marco (un tercio de su ancho, tope 520). */
    .capa-flags {
      position:absolute;
      /* Todo en % del ancho del mundo: los −50 px de antes se quedaban clavados
         al cambiar el ancho y descuadraban el banderín. −5 % − 50 px a 390 px
         de ancho equivale a −17,8 %, 2 puntos más hacia fuera y 20 px (5,1 %)
         de vuelta hacia dentro. */
      left:calc(-19.8% + 5.1 * var(--u)); width:110%;
      pointer-events:none;
      /* Cuelgan del borde de abajo del marco (26 px de la escena + su alto),
         25 px por encima de ese borde. El alto del marco ya es proporcional, así
         que la distancia se mantiene al cambiar el ancho. */
      /* 30 px más arriba, en --u (7,7 % del ancho: a 390 px son esos 30 px),
         1 punto de subida al abrirse hacia fuera, 20 px (5,1 %) más y 8 px
         (2,05 %) de vuelta abajo: 7,7 + 1 + 5,1 − 2,05. */
      top:calc(26px + var(--alto-marco) - 25px - 11.8 * var(--u));
      height:calc(70 * var(--u));
      background-image:url('${BASE_IMG}/mapas/nieve/flags.png');
      background-size:60% auto;
      /* Los −90 px de subida del dibujo, en --u (1 % del ancho): −23,1 % a
         390 px. En píxeles fijos el banderín no subía igual al cambiar el
         tamaño. */
      background-position:left calc(-23 * var(--u));
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(var(--px-flags, 0px)) translateY(var(--py-flags, 0px));
      will-change:transform;
    }
    .capa-flags-r {
      /* 30 px más a la derecha que el resto del mapa: manda el left porque con
         width:110% el right queda ignorado. Los +23 px van en % (−5 % + 23 px a
         390 px equivale a 0,9 %), 2 puntos más hacia fuera y 20 px (5,1 %) de
         vuelta hacia dentro. */
      position:absolute; left:calc(2.9% - 5.1 * var(--u)); right:-5%; width:110%;
      pointer-events:none;
      /* Mismo borde de abajo del marco y misma subida de 25 px que el otro. */
      top:calc(26px + var(--alto-marco) - 25px - 11.8 * var(--u));
      height:calc(70 * var(--u));
      background-image:url('${BASE_IMG}/mapas/nieve/flags-r.png');
      background-size:60% auto;
      /* Los −80 px, en --u: −20,5 % a 390 px de ancho. */
      background-position:right calc(-20.5 * var(--u));
      background-repeat:no-repeat;
      z-index:2;
      transform:translateX(calc(-1 * var(--px-flags, 0px))) translateY(var(--py-flags, 0px));
      will-change:transform;
    }

    /* Niebla inferior: el 40 % del suelo de siempre, anclada por abajo para que
       crezca hacia arriba. Los 100 px de más la subían hasta la mitad del mapa,
       así que se quedó en su altura original. */
    .capa-bottom-fog {
      /* Alto natural del arte (1214 × 765 = 63,01 u del ancho): entra entera,
         sin recortes. Su borde de arriba es transparente —así que la niebla
         aparece como un degradado, no como una franja cortada— y su borde de
         abajo, que es el opaco, cae justo en el final del mapa, pegado a la
         barra de las cartas. */
      position:absolute; bottom:0; left:0; right:0;
      height:calc(63.01 * var(--u));
      background-image:url('${BASE_IMG}/mapas/nieve/bottom-fog.png');
      background-size:100% auto;
      /* El parallax mueve la foto dentro de su caja, no la caja: así el borde
         de abajo queda siempre tapado por la parte opaca de la niebla y no
         asoma ninguna franja. Al bajar, la niebla sube un poco. */
      background-position:center calc(100% + var(--py-fog, 0px));
      /* Por encima del tablero (z-index 2): así el monstruo que entra aparece
         entre la bruma en vez de por delante de ella. */
      z-index:4;
      /* Pero es solo dibujo: si traga los toques, las fichas y lanzaderas de
         la parte baja no se pueden pulsar (el modal del monstruo no salía). */
      pointer-events:none;
      /* Sin vaivén propio: se mueve solo con el scroll (--py-fog). */
    }

    .suelo::after {
      content:""; position:absolute; inset:0;
      background:
        linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 45%, transparent 100%) top / 100% calc(12 * var(--u)) no-repeat,
        linear-gradient(180deg, rgba(0,0,0,.18) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.35) 100%);
    }

    /* ── Caminos ── */
    .caminos {
      position:absolute; left:0; right:0; bottom:var(--aire-escalera);
      top:var(--tope-castillo);
      width:100%; height:auto; z-index:1; overflow:visible;
      -webkit-mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
      mask-image:linear-gradient(0deg, transparent 0%, rgba(0,0,0,.35) 34%, #000 62%);
    }
    .tablero {
      /* Capa de fichas sobre la fortaleza: no debe tragarse los toques de los
         huecos, edificios ni plataformas de debajo. Solo sus fichas son
         interactivas. */
      pointer-events:none;
      position:absolute; left:0; right:0; bottom:var(--aire-escalera);
      /* Mismo ancla que los caminos: el alto de la escalera, salga el ancho que
         salga. El bottom descuenta el aire de debajo de la escalera para que
         las losas no se muevan al dar más suelo. */
      top:var(--tope-castillo);
      height:auto; z-index:2;
    }
    .tablero > * { pointer-events:auto; }
    .caminos .lecho { fill:none; stroke:transparent; stroke-width:calc(14 * var(--u)); vector-effect:non-scaling-stroke }

    .bw-layer { position:absolute; inset:0; pointer-events:none }
    .bw-layer > * { pointer-events:auto }

    /* losas */
    .losa {
      position:absolute; width:calc(11.2 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-5.6 * var(--u));
      border-radius:50%;
      border:2px dashed rgba(255,255,255,.75);
      background:rgba(255,255,255,.12);
      z-index:2;
    }
    .losa.base-torre { border:none }

    /* fichas: el monstruo es la imagen, apoyado en la losa y centrado; arriba
       lleva una pastilla redonda con su fuerza, como los decretos del HUD. */
    .ficha {
      position:absolute; width:calc(7 * var(--u)); aspect-ratio:1;
      margin:calc(-3.5 * var(--u)) 0 0 calc(-3.5 * var(--u));
      display:grid; place-items:center; cursor:pointer; z-index:5;
    }
    .ficha-img {
      /* Centrada en la caja de la ficha (el div verde) y subida lo mismo que las
         demás láminas de monstruo: esta ficha va por su cuenta, no usa la clase
         bw-box-img, así que necesita la subida de la variable aparte. */
      position:absolute; left:50%; top:50%;
      transform:translate(-50%, calc(-50% - var(--bw-subida-monstruo, 0%)));
      /* Un tercio del tamaño natural de la lámina (121 × 224 px). */
      width:calc(8.5 * var(--u)); height:auto; pointer-events:none;
      filter:drop-shadow(0 calc(.5 * var(--u)) calc(1 * var(--u)) rgba(0,0,0,.5));
    }
    .ficha::after {
      content:""; position:absolute; left:50%; top:100%;
      width:calc(9 * var(--u)); height:calc(2.5 * var(--u));
      transform:translate(-50%,-50%);
      border-radius:50%; z-index:-1;
      background:radial-gradient(closest-side, rgba(0,0,0,.5), transparent);
    }
    .ficha:active { filter:brightness(1.15) }
    /* Atacante en rojo; aliado que defiende tu búnker en turquesa. */
    .ficha.mia .ficha-nv { background:rgba(var(--c-propio),.85); }
    .ficha[data-nivel="1"] .ficha-nv { transform:translate(-50%, calc(-50% - 20px + 5px)); }
    /* Mismo estilo que el número de calle: mono, blanco y sin borde.
       Centrado vertical en la ficha y desplazado a la derecha unos 30 px
       (8,5 * var(--u) a 390 px de ancho de mundo). */
    .ficha-nv {
      position:absolute; left:50%; top:0;
      transform:translate(-50%, calc(-50% - 20px));
      width:calc(4.0 * var(--u)); aspect-ratio:1; border-radius:50%;
      background:rgba(122,16,16,.8); border:0;
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; padding:calc(.5 * var(--u)) 0 0; text-align:center;
      font-weight:700; font-family:ui-monospace,monospace;
      font-size:calc(1.9 * var(--u)); line-height:1; color:#fff;
      /* Filo blanco al 50 %, como los números del tablero. */
      box-shadow:0 0 0 1px rgba(255,255,255,.5);
      /* La pastilla del nivel también abre el modal del monstruo: es el sitio
         natural al que se apunta y, sin esto, el toque se colaba al tablero. */
      pointer-events:auto;
    }
    /* Fantasma del combate: la ficha que cae se queda un momento en el tablero
       (y se desliza hasta el que le planta cara si murió atacando), para que se
       vea el choque en vez de desaparecer de golpe. */
    .ficha.fantasma {
      display:none; z-index:6; pointer-events:none;
    }
    /* El caído se queda a la vista desde el primer repintado: si se enseñaba
       solo al llegar el atacante, el monstruo atacado desaparecía un instante
       y volvía a aparecer (el parpadeo antes del choque). */
    .ficha.fantasma.ver { display:block; }
    /* Copia del atacante que entra en el búnker: no se toca, solo se ve. */
    .ficha.bw-entrando { pointer-events:none; cursor:default; z-index:6 }
    /* Al entrar, la pastilla del nivel se lleva la animación con la ficha:
       no se toca ni abre nada mientras sube. */
    .ficha.bw-entrando .ficha-nv { pointer-events:none }
    .ficha.fantasma .ficha-img {
      filter:drop-shadow(0 calc(.8 * var(--u)) calc(1.4 * var(--u)) rgba(0,0,0,.6));
    }
    /* Nube del combate (el arte de pelea.png): se abre y tiembla encima de los
       dos y se apaga dejando al que ha ganado. */
    .bw-nube {
      position:absolute; z-index:7; pointer-events:none; opacity:0;
      width:calc(13 * var(--u)); height:calc(13 * var(--u));
      /* Centrada en la casilla y subida un poco: la nube apoya en el suelo. */
      margin:calc(-8.6 * var(--u)) 0 0 calc(-6.5 * var(--u));
      transition:opacity .2s ease;
      filter:drop-shadow(0 calc(.6 * var(--u)) calc(1.2 * var(--u)) rgba(0,0,0,.45));
    }
    .bw-nube img { display:block; width:100%; height:100%; }
    .bw-nube.on { opacity:1; animation:bwNube .46s steps(2, end) infinite; }
    .bw-nube.sale { opacity:0; animation:none; transition:opacity .38s ease; }

    /* Disparo de las torres: la capa fija donde vuelan las dos bolas (cada una
       un 3×3 de círculos negros) y sale la nube del impacto. Fuera del tablero
       a propósito: el repintado del turno lo vacía y aquí no se corta nada. */
    .bw-disparo-capa { position:fixed; inset:0; z-index:9400; pointer-events:none; }
    .bw-disparo-fantasma { position:fixed; pointer-events:none; }
    .bw-bola {
      position:fixed; transform:translate(-50%,-50%); pointer-events:none;
      display:grid; grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(3, 1fr);
      gap:1px;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));
    }
    .bw-bola i {
      display:block; border-radius:50%;
      background:radial-gradient(circle at 36% 32%, #55534f, #100f0e 72%);
      box-shadow:0 0 2px rgba(0,0,0,.6);
    }
    .bw-nube-disparo {
      position:fixed; transform:translate(-50%,-52%); opacity:0; pointer-events:none;
      transition:opacity .18s ease;
      filter:drop-shadow(0 4px 9px rgba(0,0,0,.5));
    }
    .bw-nube-disparo img { display:block; width:100%; height:auto; }
    .bw-nube-disparo.on { opacity:1; }
    .bw-nube-disparo.on img { animation:bwNube .46s steps(2, end) infinite; }
    .bw-nube-disparo.sale { opacity:0; transition:opacity .42s ease; }
    @keyframes bwNube {
      0%   { transform:rotate(-3deg) scale(.94); }
      50%  { transform:rotate(3deg)  scale(1.05); }
      100% { transform:rotate(-2deg) scale(.97); }
    }

    /* torres */
    .torre {
      position:absolute; width:calc(9.5 * var(--u)); aspect-ratio:1;
      margin:calc(-9.5 * var(--u)) 0 0 calc(-4.75 * var(--u));
      z-index:3;
      /* Solo .torre-zona recibe toques: la lámina del alzado mide 16,5 u y su
         caja se metía encima de las jaulas de al lado (abrían la torre). */
      pointer-events:none;
    }
    .torre > * { pointer-events:none; }
    /* Área de toque de la torre: el ancho de la peana y el alto del cuerpo. */
    .torre .torre-zona {
      position:absolute; left:0; right:0; bottom:0;
      height:calc(14 * var(--u));
      pointer-events:auto;
    }
    /* La planta de la torre está siempre a opacidad 0 y su arte
       (torre-planta-nvN.png) no existe en el proyecto: dejarla sin fondo evita
       los 404 en cada carga sin cambiar nada de lo que se ve. */
    .torre .planta {
      position:absolute; inset:0;
      z-index:1; opacity:0;
    }
    .torre .alzado {
      position:absolute; left:50%; bottom:0;
      width:calc(16.5 * var(--u)); height:calc(16.5 * var(--u));
      margin-left:calc(-8.25 * var(--u)); transform-origin:50% 100%;
      background:url('${BASE_IMG}/torres/torre-alzado-nv1.png') no-repeat center bottom / contain;
      opacity:1;
    }
    .torre.nv2 .alzado { background-image:url('${BASE_IMG}/torres/torre-alzado-nv2.png') }
    .torre.nv3 .alzado { background-image:url('${BASE_IMG}/torres/torre-alzado-nv3.png') }
    /* Los puntitos del nivel, debajo de la torre y con el mismo look que los de
       armería, laboratorio y criadero (mismo padding, mismo hueco y mismos
       puntos), pero en turquesa para distinguir la torre. */
    .torre .nivel {
      position:absolute; bottom:calc(-2.2 * var(--u)); left:50%;
      transform:translateX(-50%);
      display:flex; gap:3px; align-items:center; z-index:4;
      background:rgba(var(--c-propio),.9); border-radius:999px; border:0;
      padding:calc(1.4 * var(--u));
      white-space:nowrap;
    }
    .torre .nivel i {
      display:block; width:calc(1.4 * var(--u)); height:calc(1.4 * var(--u));
      border-radius:50%; border:.5px solid rgba(255,255,255,.7); background:transparent;
      box-sizing:border-box;
    }
    .torre.nv1 .nivel i:nth-child(1),
    .torre.nv2 .nivel i:nth-child(-n+2),
    .torre.nv3 .nivel i { background:rgba(255,255,255,.9); }
    .torre .bloqueo {
      display:none;
      position:absolute; bottom:calc(1 * var(--u) + 10px); left:50%;
      transform:translateX(-50%);
      z-index:5;
      width:calc(5.4 * var(--u)); height:calc(5.4 * var(--u));
      border-radius:50%;
      background:rgba(0,0,0,.85);
      border:1px solid rgba(224,83,63,.6);
      align-items:center; justify-content:center;
      font-size:calc(3.1 * var(--u)); line-height:1;
      color:var(--rojo); font-weight:900;
    }
    .torre.bloqueada .bloqueo { display:flex; }

    /* hueco de torre: solo el círculo borgoña con el + */
    .hueco {
      position:absolute; width:calc(11.2 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-5.6 * var(--u));
      border:0; background:transparent;
      z-index:3; cursor:pointer;
    }
    .hueco:active .hueco-mas { background:rgba(122,16,16,.95); }

    /* lanzaderas */
    .lanzadera {
      position:absolute; width:calc(14.6 * var(--u)); aspect-ratio:2/1;
      margin:calc(-2.8 * var(--u)) 0 0 calc(-7.3 * var(--u));
      border-radius:50%;
      border:2px dashed rgba(255,255,255,.75);
      background:rgba(255,255,255,.12);
      z-index:2;
    }
    /* Con monstruo: el círculo se cierra y dentro va la ficha, que entra
       deslizándose como si llegara desde su escalera. */
    .lanzadera-llena {
      border-style:solid; border-color:rgba(255,255,255,.3);
      background:rgba(0,0,0,.28);
    }
    .lanzadera-img {
      position:absolute; left:50%; top:50%;
      /* Subida propia de la lanzadera, además de la general de los monstruos:
       las jaulas de aquí quedaban bajas dentro del hueco. */
      transform:translate(-50%, calc(-50% - var(--bw-subida-monstruo, 0%) - var(--bw-subida-lanzadera, 0%)));
      /* La misma escala que una ficha en la calle: antes era más pequeña en la
         lanzadera y parecía otro objeto. */
      width:calc(11.6 * var(--u)); height:auto; pointer-events:none;
      filter:drop-shadow(0 calc(.4 * var(--u)) calc(.8 * var(--u)) rgba(0,0,0,.55));
    }
    /* El nivel de la lanzadera va centrado arriba, sobre la lámina. */
    .lanzadera-nv {
      position:absolute; top:-30px; left:50%;
      transform:translate(-50%,-50%);
      width:calc(4.0 * var(--u)); aspect-ratio:1; border-radius:50%;
      background:rgba(var(--c-propio),.9); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font:700 calc(1.9 * var(--u))/1 ui-monospace,monospace;
      box-shadow:0 0 0 1px rgba(255,255,255,.5);
    }
    /* número de calle */
    /* Mientras las fichas avanzan no responde nada: ni el tablero, ni el box,
       ni la mano, ni la barra. El scroll de #pantalla sigue vivo para poder
       seguir la animación. */
    body.bw-avanzando #pantalla *,
    body.bw-avanzando .bw-mano-wrap,
    body.bw-avanzando .bw-panel,
    body.bw-avanzando #bw-nav-global,
    body.bw-avanzando #barra { pointer-events: none; }
    /* Los modales no se bloquean nunca: el bloqueo del avance es para que no se
       toque el tablero mientras se mueven las fichas, pero un modal es una
       decisión ya tomada y, si se queda sin responder, encierra al jugador
       (pasaba con la carta de Destino y con el de lanzar). */

    /* ── Matar monstruo: desglose de torres ── */
    .bw-disparo { display:flex; flex-direction:column; gap:7px; margin:2px 0 14px; }
    .bw-disparo-cab { font-size:13.5px; color:#cfd8d4; line-height:1.45; }
    .bw-disparo-cab b { color:#fff; }
    .bw-disparo-fila {
      display:flex; align-items:center; gap:9px;
      padding:8px 11px; border-radius:9px;
      background:rgba(255,255,255,.055);
      border:1px solid rgba(255,255,255,.12);
      font-size:13.5px;
    }
    .bw-disparo-fila .bw-disparo-t { flex:1; font-weight:700; }
    .bw-disparo-fila .bw-disparo-t em {
      font-style:normal; font-weight:600; font-size:11.5px;
      color:#9fd2c0; margin-left:5px;
    }
    .bw-disparo-fila .bw-disparo-n { font-size:11.5px; color:#aebcb6; }
    .bw-disparo-fila .bw-disparo-d {
      min-width:22px; text-align:center; font-weight:800;
      font-family:ui-monospace,monospace; color:#ffd88a;
    }
    .bw-disparo-fila.bloqueada { opacity:.55; }
    .bw-disparo-fila.bloqueada .bw-disparo-d { color:#9a9a9a; }
    .bw-disparo-total, .bw-disparo-coste {
      display:flex; justify-content:space-between; align-items:baseline;
      gap:10px; padding:9px 11px 0;
      border-top:1px solid rgba(255,255,255,.12);
      font-size:13px; color:#cfd8d4;
    }
    .bw-disparo-total b, .bw-disparo-coste b { color:#fff; font-size:14.5px; }
    .bw-disparo-aviso {
      margin-top:2px; padding:9px 11px; border-radius:9px;
      background:rgba(224,83,63,.14); border:1px solid rgba(224,83,63,.4);
      color:#ffb4a2; font-size:13px; line-height:1.4;
    }

    /* ── Plantilla común de los modales de monstruo ── */
    .modal.modal-monstruo {
      /* El ribete de piedra va pegado a los bordes; el relleno deja aire para
         que el título y el botón no lo toquen. El pergamino cubre la caja
         entera y el texto pasa a tinta oscura para seguir leyéndose. Un poco
         más ancho que los modales de casa para que quepa la imagen. */
      /* Un tercio menos de aire a los lados (22 → 15). */
      width:min(100%, 460px);
      padding:34px 15px 34px;
      overflow:hidden;
      /* La mitad del radio de los modales de casa. */
      border-radius:10px;
      /* Textura a su tamaño natural y repetida, no estirada. El tamaño de
         verdad lo pone ajustarFondoModal(): el navegador mide la imagen en
         píxeles físicos y hay que dividir por la densidad de la pantalla, o
         en un móvil Retina se ve al triple de grande. */
      background-color:#1c130c;
      background-image:url('${BASE_IMG}/bg-modal.jpg');
      background-position:center;
      background-size:var(--bg-modal-size, 160px auto);
      background-repeat:repeat;
      color:#2a1c14;
    }
    .modal.modal-monstruo::before,
    .modal.modal-monstruo::after {
      content:""; position:absolute; left:0; right:0; height:16px;
      background:url('${BASE_IMG}/ribete.png') left center / auto 100% repeat-x;
      pointer-events:none;
    }
    .modal.modal-monstruo::before { top:0; }
    .modal.modal-monstruo::after { bottom:0; }
    /* Título en el borgoña de las cartas, en negrita y un punto menos, con
       aire a la derecha para la X grande. */
    .modal.modal-monstruo h2 {
      margin-top:2px; padding-right:48px;
      color:#8f1e17; font-weight:700; font-size:20px;
    }
    /* La X, la mitad de grande que antes y del mismo borgoña que el título,
       sin fondo ni borde. */
    .modal.modal-monstruo .cerrar {
      top:14px; right:8px;
      width:56px; height:56px;
      border:0; background:none; box-shadow:none;
      color:#8f1e17; font-size:26px;
    }
    /* Barra de vuelta de la visita a otra fortaleza: abajo y centrada. */
    .bw-volver-barra {
      position:fixed; left:0; right:0; bottom:0; z-index:9500;
      display:flex; align-items:center; justify-content:center;
      padding:10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
      background:linear-gradient(0deg, rgba(10,9,7,.96), rgba(10,9,7,.82));
      border-top:1px solid rgba(232,221,200,.18);
    }
    /* Mismo botón gris de la casa que el resto de modales. */
    .bw-volver {
      display:inline-flex; align-items:center; justify-content:center;
      min-height:38px; padding:9px 26px; border-radius:9px;
      background:linear-gradient(180deg,#d8dfe5,#9daab5 55%,#8595a1);
      color:#12161a; border:1px solid rgba(18,16,14,.25);
      font:700 14px/1.1 ui-serif, Georgia, serif;
      cursor:pointer; box-shadow:0 3px 8px rgba(0,0,0,.35);
    }
    .bw-volver:active { filter:brightness(.94); }

    /* El desglose de disparo sobre el pergamino: tinta oscura y filas claras. */
    .modal.modal-monstruo .bw-disparo-cab { color:#4a3629; }
    .modal.modal-monstruo .bw-disparo-cab b { color:#12100e; }
    .modal.modal-monstruo .bw-disparo-fila {
      background:rgba(255,255,255,.42); border-color:rgba(90,60,35,.28);
    }
    .modal.modal-monstruo .bw-disparo-fila .bw-disparo-t em { color:#7a4b2a; }
    .modal.modal-monstruo .bw-disparo-fila .bw-disparo-n { color:#6b5544; }
    .modal.modal-monstruo .bw-disparo-fila .bw-disparo-d { color:#7a1010; }
    .modal.modal-monstruo .bw-disparo-total,
    .modal.modal-monstruo .bw-disparo-coste {
      color:#4a3629; border-top-color:rgba(90,60,35,.3);
    }
    .modal.modal-monstruo .bw-disparo-total b,
    .modal.modal-monstruo .bw-disparo-coste b { color:#12100e; }
    .modal.modal-monstruo .bw-disparo-aviso {
      background:rgba(166,42,34,.12); border-color:rgba(166,42,34,.4); color:#7a1f18;
    }
    /* El «Cerrar» de siempre, pero en negrita. */
    .modal.modal-monstruo .fila .boton { font-weight:700; }

    /* Matar monstruo: hoja desde abajo, negro y cabecera igual que los paneles. */
    .modal.modal-monstruo.modal-disparo {
      position:fixed; left:0; right:0; bottom:0; top:auto;
      width:100%; max-width:100%; margin:0;
      max-height:80vh; overflow-y:auto;
      padding:0 14px calc(22px + env(safe-area-inset-bottom, 0px));
      border-radius:16px 16px 0 0;
      background-color:#1b1713;
      color:#f4ecdd;
      box-shadow:0 -18px 50px rgba(0,0,0,.5);
      animation:bw-subir .22s ease-out;
    }
    .modal.modal-monstruo.modal-disparo::before,
    .modal.modal-monstruo.modal-disparo::after { display:none; }
    .modal.modal-monstruo.modal-disparo h2 {
      margin:0 0 40px; padding:0 38px; text-align:center;
      color:#f4ecdd; font:700 18px/1.25 ui-serif, Georgia, serif;
      position:relative;
    }
    .modal.modal-monstruo.modal-disparo h2::after {
      content:""; position:absolute; left:0; right:0; bottom:-20px; height:1px;
      background:rgba(244,236,221,.18);
    }
    .modal.modal-monstruo.modal-disparo .cerrar {
      top:18px; right:6px; width:34px; height:34px;
      border:0; background:none; box-shadow:none;
      color:#d9cbb6; font-size:26px; z-index:3;
    }
    .modal.modal-monstruo.modal-disparo .bw-disparo-cab { color:#cfd8d4; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-cab b { color:#fff; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-fila {
      background:rgba(255,255,255,.055); border-color:rgba(255,255,255,.12);
    }
    .modal.modal-monstruo.modal-disparo .bw-disparo-fila .bw-disparo-t em { color:#9fd2c0; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-fila .bw-disparo-n { color:#b7a992; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-fila .bw-disparo-d { color:#ffd88a; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-total,
    .modal.modal-monstruo.modal-disparo .bw-disparo-coste {
      color:#cfd8d4; border-top-color:rgba(255,255,255,.12);
    }
    .modal.modal-monstruo.modal-disparo .bw-disparo-total b,
    .modal.modal-monstruo.modal-disparo .bw-disparo-coste b { color:#fff; }
    .modal.modal-monstruo.modal-disparo .bw-disparo-aviso {
      background:rgba(224,83,63,.14); border-color:rgba(224,83,63,.4); color:#ffb4a2;
    }
    @keyframes bw-subir {
      from { transform:translateY(100%); }
      to { transform:translateY(0); }
    }

    /* Una sola capa de ribete por borde, por encima del contenido que hace
       scroll. La capa de arriba es sticky dentro del panel; la de abajo queda
       fija al borde inferior del panel (encima del menú), no al contenido. */
    .bw-panel::before,
    .bw-modal-fondo.bw-hoja-modal .bw-modal::before,
    body.bw-himalaya #capa .modal.bw-hoja-modal::before,
    .bw-lz::before,
    .modal.modal-monstruo.modal-disparo::before {
      content:"";
      position:sticky;
      top:0;
      display:block;
      align-self:stretch;
      flex:0 0 11px;
      width:calc(100% + 28px);
      height:11px; min-height:11px;
      margin:0 -14px 15px;
      background:url('${BASE_IMG}/ribete.png') left center / auto 100% repeat-x;
      pointer-events:none;
      z-index:30;
    }
    /* En los contenedores flex hay un gap extra: se descuenta para que el
       título no baje respecto a como estaba antes. */
    .bw-modal-fondo.bw-hoja-modal .bw-modal::before { margin-bottom:1px; }
    .bw-lz::before { margin-bottom:5px; }
    .bw-panel::after,
    .bw-modal-fondo.bw-hoja-modal .bw-modal::after,
    body.bw-himalaya #capa .modal.bw-hoja-modal::after,
    .bw-lz::after,
    .modal.modal-monstruo.modal-disparo::after {
      content:"";
      position:fixed;
      display:block;
      left:0; right:0;
      bottom:var(--alto-nav, 34px);
      height:11px;
      background:url('${BASE_IMG}/ribete.png') left center / auto 100% repeat-x;
      pointer-events:none;
      z-index:30;
    }
    .modal.modal-monstruo.modal-disparo::after { bottom:0; }

    .num-calle {
      /* El margen de arriba centraba el círculo; ahora baja 10 px (2.55u) desde
         el centro, así que queda en +0.07u. */
      position:absolute; margin:calc(.07 * var(--u)) 0 0 calc(-2.48 * var(--u));
      /* Círculo un 20 % mayor (4.13 → 4.95u) y letra un punto más. */
      width:calc(4.95 * var(--u)); aspect-ratio:1; border-radius:50%;
      /* Fondo negro y el número blanco a plena opacidad (el monstruo se queda
         con el borgoña de antes). */
      background:rgba(0,0,0,.78); border:0;
      /* Flex y un pelín de relleno arriba: con la métrica mono el dígito
         quedaba un poco alto; el padding lo baja sin mover el círculo. */
      display:flex; align-items:center; justify-content:center;
      box-sizing:border-box; padding:calc(.55 * var(--u)) 0 0; text-align:center;
      font-weight:700; font-family:ui-monospace,monospace;
      font-size:calc(2.11 * var(--u)); line-height:1; color:#fff;
      z-index:3;
    }
  </style>`;
}

