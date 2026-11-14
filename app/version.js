/* La versión de la app.

   Antes esta pestaña comparaba su versión con la del servidor cada 40 s y, si
   no coincidían, salía un modal que no se podía cerrar y recargaba. Mientras se
   toca el código la huella cambia en cada arranque del servidor, así que el
   modal saltaba todo el rato: se ha quitado. La app se sirve sin caché, así que
   recargar a mano (o abrir de nuevo) trae siempre lo último.

   Aquí solo queda apuntar qué versión cargó esta pestaña, por si algún día
   hace falta mostrarla. */

let cargada = null;

export function versionCargada() {
  return cargada;
}

export function fijarCargada(v) {
  cargada = v;
}
