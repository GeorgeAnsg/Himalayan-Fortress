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
import { aviso, modal, avatarSVG } from "./ui.js";
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
  pantalla: null,
};

const $pantalla = () => document.getElementById("pantalla");
const $barra = () => document.getElementById("barra");
const $red = () => document.getElementById("red");

/* ── Arranque ──────────────────────────────────────────────────────────── */

async function arrancar() {
  registrarServiceWorker();

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

function alRed(conectado) {
  const red = $red();
  if (red) {
    red.classList.toggle("on", conectado);
    red.classList.toggle("off", !conectado);
  }
  if (!conectado && estado.redAntes) {
    aviso("Se ha cortado la conexión. Se reintenta solo.", { ms: 4000 });
  }
  if (conectado && !estado.redAntes) {
    aviso("Estás dentro otra vez.", { ms: 2200 });
  }
  estado.redAntes = conectado;
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

function alSinMesa() {
  estado.mesa = null;
  sesion.recordarSala(null);
  if (estado.usuario) pintarInicio(null);
}

/* ── Pantallas ─────────────────────────────────────────────────────────── */

function limpiar() {
  $pantalla().innerHTML = "";
}

function pintarEntrada({ codigo = null, error = null } = {}) {
  limpiar();
  $barra().hidden = true;
  pintarCon(vistaEntrada, { alEnviar, codigo, error });
}

function pintarSinServidor() {
  limpiar();
  $barra().hidden = true;
  $pantalla().innerHTML = `
    <section class="entrada centrado">
      <h1 class="entrada-titulo">Himalayan Fortress</h1>
      <p class="entrada-lema" style="margin:14px auto 22px">No se pudo hablar con el servidor. Puede que esté arrancando o que no haya red.</p>
      <button class="boton" id="reintentar" type="button">Reintentar</button>
    </section>`;
  document.getElementById("reintentar").addEventListener("click", () => location.reload());
}

function pintarInicio(sala) {
  limpiar();
  $barra().hidden = false;
  const mia = sala ?? (estado.mesa ? { codigo: estado.mesa.codigo, fase: estado.mesa.fase } : null);
  pintarCon(vistaInicio, {
    usuario: estado.usuario,
    sala: mia,
    juegos: estado.juegos,
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
  limpiar();
  $barra().hidden = false;
  pintarCon(vistaVestibulo, {
    mesa: estado.mesa,
    alListo: (valor) => estado.conexion.listo(valor),
    alEmpezar: async () => {
      const r = await estado.conexion.empezar();
      if (r?.error) aviso(r.error, { error: true });
    },
    alAñadirBot: async () => {
      const r = await estado.conexion.añadirBot();
      if (r?.error) aviso(r.error, { error: true });
    },
    alSalir: salirDeMesa,
  });
}

function pintarMesa() {
  limpiar();
  $barra().hidden = false;
  if (estado.mesa.fase === "final") {
    pintarCon(vistaFinal, {
      mesa: estado.mesa,
      alRevancha: () => estado.conexion.revancha(),
      alSalir: salirDeMesa,
    });
    return;
  }
  pintarCon(vistaJuego, {
    mesa: estado.mesa,
    alAccion: (accion) => estado.conexion.accion(accion),
    alSalir: salirDeMesa,
  });
}

function pintarCon(modulo, props) {
  modulo.pintar($pantalla(), props);
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
  const r = await estado.conexion.salir();
  if (r?.error) aviso(r.error, { error: true });
  else alSinMesa();
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
  const cuenta = document.getElementById("cuenta");
  if (cuenta) cuenta.innerHTML = avatarSVG(estado.usuario.avatar, { tam: 34 });
  const campana = document.getElementById("campana");
  if (campana) {
    campana.classList.toggle("on", avisos.estadoCampana());
    campana.title = avisos.estadoCampana() ? "Avisos encendidos" : "Avisos";
  }
  const red = $red();
  if (red && !red.className.includes("on") && !red.className.includes("off")) {
    red.classList.toggle("on", estado.redAntes);
  }
}

/* Los botones de la barra se atan una sola vez. */
document.getElementById("campana")?.addEventListener("click", () => {
  avisos.abrirPanel();
  setTimeout(actualizarBarra, 100);
});

document.getElementById("cuenta")?.addEventListener("click", async () => {
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
});

/* ── Vamos ─────────────────────────────────────────────────────────────── */

arrancar().catch((err) => {
  console.log("[app] arranque:", err);
  pintarSinServidor();
});
