/* La conexión con la mesa.

   Todo lo que se manda al servidor espera acuse (`ack`) y tiene tope de
   tiempo: un botón que se queda girando para siempre es peor que un error.

   El saludo lleva el token y **la versión de la app que está abierta**. Si no
   coincide con la del servidor, la partida no acepta jugadas y la app enseña
   el modal de actualizar. Así no se puede repetir lo de tener dos versiones
   jugando la misma mesa. */

const ESPERA = 9000;

export class Conexion {
  constructor({ token, version, alMesa, alSinMesa, alError, alVersion, alRed, alFuera, alSesionCaida }) {
    this.token = token;
    this.version = version;
    this.alMesa = alMesa ?? (() => {});
    this.alSinMesa = alSinMesa ?? (() => {});
    this.alError = alError ?? (() => {});
    this.alVersion = alVersion ?? (() => {});
    this.alRed = alRed ?? (() => {});
    this.alFuera = alFuera ?? (() => {});
    this.alSesionCaida = alSesionCaida ?? (() => {});
    this.socket = null;
  }

  conectar() {
    if (this.socket) return this.socket;
    /* `io` lo sirve el propio servidor en /socket.io/socket.io.js. */
    const io = window.io;
    if (!io) {
      this.alError("No se pudo cargar el cliente de la mesa.");
      return null;
    }

    const socket = io({
      auth: { token: this.token, v: this.version },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    socket.on("connect", () => this.alRed(true));
    socket.on("disconnect", () => this.alRed(false));
    socket.on("connect_error", (err) => {
      const motivo = String(err?.message ?? "");
      if (motivo === "sin_sesion" || motivo === "sesion_caducada") {
        socket.close();
        this.socket = null;
        this.alSesionCaida(motivo);
        return;
      }
      this.alRed(false);
    });

    socket.on("mesa", (vista) => this.alMesa(vista));
    socket.on("sinMesa", () => this.alSinMesa());
    socket.on("error", (e) => this.alError(e?.texto || "Algo ha ido mal."));
    socket.on("version", (v) => this.alVersion(v?.version));

    return socket;
  }

  pedirMesa() {
    if (!this.socket) return;
    if (this.socket.connected) this.socket.emit("pedirMesa");
    else this.socket.once("connect", () => this.socket.emit("pedirMesa"));
  }

  /* Espera a que el socket esté conectado antes de mandar. Justo después de
     entrar, el socket todavía está abriéndose; sin esta espera, el primer
     «unirse» con una invitación se perdía con un «sin conexión» que no era
     verdad. */
  esperarConexion() {
    const socket = this.socket;
    if (!socket) return Promise.resolve(false);
    if (socket.connected) return Promise.resolve(true);
    return new Promise((resolver) => {
      const tope = setTimeout(() => {
        socket.off("connect", alConectar);
        resolver(false);
      }, ESPERA);
      const alConectar = () => {
        clearTimeout(tope);
        resolver(true);
      };
      socket.once("connect", alConectar);
    });
  }

  async emitir(evento, datos = {}) {
    const socket = this.socket;
    if (!socket) return { error: "No hay conexión con la mesa." };
    const conectado = await this.esperarConexion();
    if (!conectado) return { error: "Sin conexión. Se reintenta solo." };

    return new Promise((resolver) => {
      let hecho = false;
      const tope = setTimeout(() => {
        if (hecho) return;
        hecho = true;
        resolver({ error: "El servidor no responde. Prueba otra vez." });
      }, ESPERA);

      socket.emit(evento, datos, (respuesta) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(tope);
        resolver(respuesta ?? { ok: true });
      });
    });
  }

  crear(juego) { return this.emitir("crear", { juego }); }
  unirse(codigo) { return this.emitir("unirse", { codigo }); }
  listo(valor) { return this.emitir("listo", { valor }); }
  empezar() { return this.emitir("empezar", {}); }
  accion(accion) { return this.emitir("accion", accion); }
  añadirBot() { return this.emitir("añadir-bot", {}); }
  revancha() { return this.emitir("revancha", {}); }
  salir() { return this.emitir("salir", {}); }

  cerrar() {
    try { this.socket?.close(); } catch { /* nada */ }
    this.socket = null;
  }
}
