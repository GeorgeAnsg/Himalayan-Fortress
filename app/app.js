/* Madrigueras — el pegamento.

   Una sola idea: el servidor manda una `mesa` (vestíbulo, vista de partida o
   final) y aquí se pinta la pantalla que toque. Recargar, perder la red o
   cambiar de móvil no cambia nada: al conectar, el servidor vuelve a mandar la
   mesa y cada uno aparece en su asiento.

   Lo que NO hace este archivo: reglas del juego (viven en `juego/`), verdad del
   estado (vive en el servidor) ni cuentas (viven en SQLite). */

import * as api from "./api.js";
import * as sesion from "./sesion.js";
import * as avisos from "./avisos.js";
import * as versionMod from "./version.js";
import { Conexion } from "./socket.js";
import { aviso, modal, cerrarModal, avatarSVG, esc } from "./ui.js";
import * as vistaEntrada from "./vistas/entrada.js";
import * as vistaInicio from "./vistas/inicio.js";
import * as vistaVestibulo from "./vistas/vestibulo.js";
import * as vistaJuego from "./vistas/juego.js";
import * as vistaFinal from "./vistas/final.js";

const estado = {
  usuario: null,
  version: null,
  juegos: [],
  mesa: null,
  conexion: null,
  redAntes: true,
  relojRed: null,
  pantalla: null,
};

const $pantalla = () => document.getElementById("pantalla");
const $barra = () => document.getElementById("barra");
const $red = () => document.getElementById("red");

/* ── Arranque ──────────────────────────────────────────────────────────── */

async function arrancar() {
  registrarServiceWorker();
  bloquearOrientacion();

  const v = await api.version();
  if (!v.datos?.version) {
    pintarSinServidor();
    return;
  }
  estado.version = v.datos.version;
  versionMod.fijarCargada(estado.version);
  versionMod.vigilar();

  const juegos = await api.juegos();
  estado.juegos = juegos.datos?.juegos ?? [];

  /* Una invitación por enlace: `?sala=ABCDE`. Se guarda hasta que haya sesión
     y se limpia de la barra de direcciones para que recargar no reentre. */
  const params = new URLSearchParams(location.search);
  const invitacion = String(params.get("sala") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (invitacion) {
    sesion.dejarPendiente(invitacion);
    try { history.replaceState({}, "", location.pathname); } catch { /* nada */ }
  }

  const guardada = sesion.leer();
  if (!guardada) {
    pintarEntrada({ codigo: invitacion || null });
    return;
  }

  const yo = await api.yo();
  if (yo.error) {
    sesion.borrar();
    pintarEntrada({ codigo: invitacion || null, error: "Tu sesión ha caducado. Entra otra vez." });
    return;
  }

  estado.usuario = yo.datos.usuario;
  actualizarBarra();
  conectar();
  pintarInicio(yo.datos.sala ?? guardada.sala);

  if (invitacion) intentarUnirse(invitacion);
  else {
    const pendiente = sesion.tomarPendiente();
    if (pendiente) intentarUnirse(pendiente);
  }
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.log("[sw] no se pudo registrar:", err?.message ?? err);
  });
}

/* La PWA se instala en vertical. El manifest ya lo pide; esto lo reintenta en
   los navegadores que permiten bloquear la orientación desde la app. Si el
   navegador no lo soporta, se ignora y se queda el comportamiento del sistema. */
function bloquearOrientacion() {
  try {
    screen.orientation?.lock?.("portrait").catch(() => {});
  } catch { /* navegador sin Screen Orientation API */ }
}

/* ── Conexión ──────────────────────────────────────────────────────────── */

function conectar() {
  if (estado.conexion) estado.conexion.cerrar();
  estado.conexion = new Conexion({
    token: sesion.token(),
    version: estado.version,
    alMesa,
    alSinMesa,
    alError: (texto) => aviso(texto, { error: true }),
    alVersion: (v) => versionMod.avisarNueva(v),
    alRed,
    alSesionCaida: () => {
      sesion.borrar();
      estado.usuario = null;
      estado.mesa = null;
      estado.conexion?.cerrar();
      estado.conexion = null;
      actualizarBarra();
      pintarEntrada({ error: "Tu sesión ha caducado. Entra otra vez." });
    },
  });
  estado.conexion.conectar();
}

/* Aviso de red. Un corte de un momento —entrar o salir de una mesa, el móvil
   en segundo plano, el servidor que se reengancha— se arregla solo y no dice
   nada. Solo si la caída dura se pone el aviso, y entonces se queda fijo en
   pantalla hasta que vuelve la conexión. */
const MS_AVISO_SIN_RED = 2500;
let avisoRed = null;

function alRed(conectado) {
  const red = $red();
  if (red) {
    red.classList.toggle("on", conectado);
    red.classList.toggle("off", !conectado);
  }
  clearTimeout(estado.relojRed);
  if (conectado) {
    estado.redAntes = true;
    quitarAvisoRed();
    return;
  }
  if (!estado.redAntes) return;
  estado.redAntes = false;
  estado.relojRed = setTimeout(() => {
    if (estado.redAntes) return;
    avisoRed ??= aviso("Sin conexión. Se reintenta solo.", { error: true, ms: 0 });
  }, MS_AVISO_SIN_RED);
}

function quitarAvisoRed() {
  avisoRed?.remove();
  avisoRed = null;
}

function alMesa(vista) {
  const antes = estado.mesa;
  estado.mesa = vista;
  sesion.recordarSala({ codigo: vista.codigo, fase: vista.fase });
  actualizarBarra();

  /* Avisos que salen de la mesa, no de la jugada: turno, empieza, final. */
  if (antes) {
    if (vista.fase === "jugando" && antes.fase !== "jugando") {
      avisos.avisarLocal("Empieza la partida", `Madriguera ${vista.codigo}`, `empieza-${vista.codigo}`);
    }
    if (vista.fase === "final" && antes.fase !== "final") {
      avisos.avisarLocal("Se acabó", "Ya están los resultados.", `fin-${vista.codigo}`);
    }
    if (vista.esMiTurno && !antes.esMiTurno) {
      avisos.avisarLocal("Te toca", "Elige tu jugada.", `turno-${vista.codigo}`);
    }
  }

  if (vista.fase === "vestibulo") pintarVestibulo();
  else pintarMesa();
}

function alSinMesa(juegoId = null) {
  const id = juegoId ?? estado.mesa?.juego?.id ?? null;
  estado.mesa = null;
  sesion.recordarSala(null);
  /* La barra puede seguir (es la cuenta), pero el ciclo y los recursos de la
     partida se apagan aquí: si no, al salir de la mesa se quedaban colgados
     arriba a la derecha. */
  actualizarBarra();
  if (estado.usuario) pintarInicio(null, id);
}

/* ── Pantallas ─────────────────────────────────────────────────────────── */

/* Dónde miraba el jugador antes de vaciar la pantalla. El tablero se borra y se
   vuelve a pintar en la misma tacada; sin esto, cualquier repintado (una
   acción, un empujón de la mesa) devolvía la vista al principio. */
let scrollRecordado = 0;

function limpiar() {
  const p = $pantalla();
  scrollRecordado = p.scrollTop || 0;
  p.innerHTML = "";
}

function pintarEntrada({ codigo = null, error = null } = {}) {
  vistaJuego.limpiar();
  limpiar();
  $barra().hidden = true;
  pintarCon(vistaEntrada, { alEnviar, codigo, error });
}

function pintarSinServidor() {
  limpiar();
  $barra().hidden = true;
  $pantalla().innerHTML = `
    <section class="entrada centrado">
      <h1 class="entrada-titulo">PYMALS</h1>
      <p class="entrada-lema" style="margin:14px auto 22px">No se pudo hablar con el servidor. Puede que esté arrancando o que no haya red.</p>
      <button class="boton" id="reintentar" type="button">Reintentar</button>
    </section>`;
  document.getElementById("reintentar").addEventListener("click", () => location.reload());
}

function pintarInicio(sala, juegoInicial = null) {
  /* Al volver de una mesa, el menú inferior, la mano, los paneles y el cielo
     del juego son nodos de <body>, no de #pantalla: hay que retirarlos a mano
     o se quedan encima del inicio. */
  vistaJuego.limpiar();
  limpiar();
  $barra().hidden = false;
  actualizarBarra();
  const mia = sala ?? (estado.mesa ? { codigo: estado.mesa.codigo, fase: estado.mesa.fase } : null);
  pintarCon(vistaInicio, {
    usuario: estado.usuario,
    sala: mia,
    juegos: estado.juegos,
    juegoInicial,
    alCrear,
    alUnirse,
    alVolver: () => {
      if (estado.mesa) alMesa(estado.mesa);
      else {
        estado.conexion?.pedirMesa();
        aviso("Buscando tu mesa…");
      }
    },
    alSalir: cerrarSesion,
  });
}

function pintarVestibulo() {
  vistaJuego.limpiar();
  limpiar();
  $barra().hidden = false;
  vistaJuego.precargar(estado.mesa.juego?.id);

  const props = {
    mesa: estado.mesa,
    alListo: (valor) => estado.conexion.listo(valor),
    alPersonalizar: (datos) => estado.conexion.personalizar(datos),
    alEmpezar: async () => {
      const r = await estado.conexion.empezar();
      if (r?.error) aviso(r.error, { error: true });
    },
    alAñadirBot: async () => {
      const r = await estado.conexion.añadirBot();
      if (r?.error) aviso(r.error, { error: true });
    },
    alSalir: salirDeMesa,
  };

  const id = estado.mesa.juego?.id;
  const vestibulo = vistaJuego.getVestibulo(id);
  if (vestibulo) {
    const raiz = $pantalla();
    vestibulo(raiz, props);
  } else if (id) {
    /* El módulo puede no estar cargado aún en el primer render: lo esperamos y repintamos. */
    pintarCon(vistaVestibulo, props);
    vistaJuego.esperarVestibulo(id).then((fn) => {
      if (fn && estado.mesa?.fase === "vestibulo") pintarVestibulo();
    });
  } else {
    pintarCon(vistaVestibulo, props);
  }
}

function pintarMesa() {
  $barra().hidden = false;
  if (estado.mesa.fase === "final") {
    vistaJuego.limpiar();
    limpiar();
    pintarCon(vistaFinal, {
      mesa: estado.mesa,
      alRevancha: () => estado.conexion.revancha(),
      alSalir: salirDeMesa,
    });
    return;
  }
  limpiar();
  pintarCon(vistaJuego, {
    mesa: estado.mesa,
    alAccion: (accion) => estado.conexion.accion(accion),
    alCuaderno: (datos) => estado.conexion.cuaderno(datos),
    alSalir: salirDeMesa,
  });
}

function pintarCon(modulo, props) {
  /* El juego recibe dónde estaba la vista para devolverla tras repintar. */
  modulo.pintar($pantalla(), { ...props, scroll: scrollRecordado });
}

/* ── Acciones de cuenta y mesa ─────────────────────────────────────────── */

async function alEnviar({ modo, nombre, contrasena }) {
  const r = modo === "crear"
    ? await api.crearCuenta(nombre, contrasena)
    : await api.entrar(nombre, contrasena);
  if (r.error) return { error: r.error };

  sesion.guardar(r.datos.token, r.datos.usuario, r.datos.sala ?? null);
  estado.usuario = r.datos.usuario;
  actualizarBarra();
  conectar();
  pintarInicio(r.datos.sala ?? null);

  const pendiente = sesion.tomarPendiente();
  if (pendiente) intentarUnirse(pendiente);

  return { ok: true };
}

async function alCrear(juegoId) {
  const id = juegoId ?? estado.juegos[0]?.id;
  if (!id) return aviso("No hay ningún juego instalado.", { error: true });
  const r = await estado.conexion.crear(id);
  if (r?.error) aviso(r.error, { error: true });
}

async function alUnirse(codigo) {
  return estado.conexion.unirse(codigo);
}

async function intentarUnirse(codigo) {
  const r = await alUnirse(codigo);
  if (r?.error) {
    aviso(r.error, { error: true });
    pintarInicio(null);
  }
}

async function salirDeMesa() {
  const juegoId = estado.mesa?.juego?.id ?? null;
  const r = await estado.conexion.salir();
  if (r?.error) aviso(r.error, { error: true });
  else alSinMesa(juegoId);
}

async function cerrarSesion() {
  const r = await modal({
    titulo: "¿Cerrar la sesión?",
    texto: "Volverás a la pantalla de entrada. Tu cuenta y tus mesas siguen en el servidor.",
    botones: [
      { texto: "Seguir aquí", estilo: "secundario", valor: null },
      { texto: "Cerrar sesión", estilo: "peligro", valor: "salir" },
    ],
  });
  if (r !== "salir") return;
  await api.salir();
  sesion.borrar();
  estado.conexion?.cerrar();
  estado.conexion = null;
  estado.usuario = null;
  estado.mesa = null;
  actualizarBarra();
  pintarEntrada();
}

/* ── Barra ─────────────────────────────────────────────────────────────── */

function actualizarBarra() {
  const barra = $barra();
  if (!barra) return;
  barra.hidden = !estado.usuario;
  if (!estado.usuario) return;
  const red = $red();
  if (red && !red.className.includes("on") && !red.className.includes("off")) {
    red.classList.toggle("on", estado.redAntes);
  }
  /* Avatar del centro: el del usuario, en su círculo. Solo se repinta si
     cambia, para no rehacer el SVG en cada empujón del servidor. */
  const yo = document.getElementById("yo-avatar");
  if (yo) {
    const avatar = String(estado.usuario.avatar ?? 0);
    if (yo.dataset.avatar !== avatar) {
      yo.dataset.avatar = avatar;
      yo.innerHTML = avatarSVG(estado.usuario.avatar, { tam: 22 });
    }
  }
  pintarCabeceraJuego();
}

/* La cabecera de la partida: el ciclo a la izquierda y las monedas y decretos
   que te quedan a la derecha, en números. La barra no se mueve con el scroll
   del tablero, así que esos datos siguen a la vista aunque estés abajo. El
   juego los manda en `privada.cabecera`; si no vienen, la barra se queda como
   estaba (nombre de la app y nada más). */
function pintarCabeceraJuego() {
  /* El ciclo y los recursos solo existen dentro de una partida. En el inicio,
     el vestíbulo y los resultados la barra se queda con la cuenta y nada más. */
  const enPartida = estado.mesa?.fase === "jugando";
  const cab = enPartida ? (estado.mesa?.privada?.cabecera ?? null) : null;
  const juegoId = enPartida ? (estado.mesa?.juego?.id ?? null) : null;

  const ciclo = document.getElementById("ciclo");
  if (ciclo) {
    const n = cab?.ciclo;
    ciclo.hidden = !n;
    ciclo.textContent = n ? (cab.ciclos ? `Ciclo ${n} de ${cab.ciclos}` : `Ciclo ${n}`) : "";
  }
  const rec = document.getElementById("recursos");
  if (rec) {
    const lista = cab?.recursos ?? [];
    rec.hidden = !lista.length;
    rec.innerHTML = lista.map((r) => {
      const icono = r.icono && juegoId
        ? `<img src="/app/juegos/${encodeURIComponent(juegoId)}/img/iconos/${encodeURIComponent(r.icono)}.png" alt="">`
        : "";
      return `<span class="barra-rec" title="${esc(r.etiqueta ?? "")}: ${esc(String(r.valor ?? 0))}">${icono}<b>${esc(String(r.valor ?? 0))}</b></span>`;
    }).join("");
  }
}

/* Ajustes: un solo botón en la barra con la conexión, los avisos y la cuenta
   dentro del mismo modal. */
function abrirAjustes() {
  if (!estado.usuario) return;
  const conectado = estado.redAntes;
  const avisosOn = avisos.estadoCampana();

  const cerrado = modal({
    sinX: true,
    titulo: "Ajustes",
    html: `
      <div class="ajustes">
        <div class="ajustes-fila">
          <span class="ajustes-etq">Conexión</span>
          <span class="ajustes-val ${conectado ? "bien" : "mal"}">${conectado ? "Conectado" : "Sin conexión"}</span>
        </div>
        <button class="ajustes-boton" id="aj-avisos" type="button">
          ${avisosOn ? "Desactivar notificaciones" : "Activar notificaciones"}
        </button>
        <div class="ajustes-fila">
          <span class="ajustes-etq">Cuenta</span>
          <span class="ajustes-val">${esc(estado.usuario.nombre)}</span>
        </div>
        ${estado.mesa ? `<button class="ajustes-boton peligro" id="aj-salir-partida" type="button">
          ${estado.mesa.fase === "jugando" ? "Salir de la partida" : "Salir de la mesa"}
        </button>` : ""}
      </div>`,
    botones: [
      { texto: "Tu cuenta", valor: "cuenta" },
      { texto: "Cerrar", valor: null, estilo: "secundario" },
    ],
  });

  /* Los controles se atan en cuanto el modal está en el DOM (modal() lo pinta
     antes de devolver la promesa). */
  const caja = document.getElementById("capa");
  caja?.querySelector("#aj-salir-partida")?.addEventListener("click", () => {
    cerrarModal();
    salirDeMesa();
  });

  caja?.querySelector("#aj-avisos")?.addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    /* Solo dos cosas: encender o apagar. Encender pide permiso al navegador
       si hace falta; apagar no pide nada. */
    if (avisos.estadoCampana()) {
      avisos.activar(false);
      boton.textContent = "Activar notificaciones";
      actualizarBarra();
      return;
    }
    if (avisos.permiso() !== "granted") {
      const dado = typeof Notification === "undefined" ? "denied" : await Notification.requestPermission();
      if (dado !== "granted") {
        aviso("Este navegador no permite activar las notificaciones.", { error: true });
        return;
      }
    }
    avisos.activar(true);
    boton.textContent = "Desactivar notificaciones";
    actualizarBarra();
    aviso("Listo: te avisaremos del turno y del final.");
  });

  cerrado.then((r) => { if (r === "cuenta") abrirCuenta(); });
}

/* El avatar del centro es el botón de ajustes: conexión, notificaciones y
   cuenta, todo en su modal. */
document.getElementById("yo")?.addEventListener("click", abrirAjustes);

async function abrirCuenta() {
  if (!estado.usuario) return;
  const r = await modal({
    titulo: estado.usuario.nombre,
    html: `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <span class="avatar" style="width:44px;height:44px">${avatarSVG(estado.usuario.avatar)}</span>
        <span class="apagado" style="font-size:13.5px">Cuenta con nombre y contraseña.<br/>Sin correo asociado.</span>
      </div>`,
    botones: [
      { texto: "Cerrar sesión", estilo: "peligro", valor: "salir" },
      { texto: "Vale", estilo: "secundario", valor: null },
    ],
  });
  if (r === "salir") cerrarSesion();
}

/* ── Vamos ─────────────────────────────────────────────────────────────── */

arrancar().catch((err) => {
  console.log("[app] arranque:", err);
  pintarSinServidor();
});
