/* La versión del servidor, calculada al arrancar a partir de los ficheros que
   se sirven a la app.

   Por qué así y no con un número a mano: lo que importa es que **cambie cuando
   cambie el código**, sin acordarse de subir nada. El servidor hashea el
   contenido de `app/` y de `juego/`; editar un archivo y reiniciar cambia la
   huella, y eso es exactamente lo que la app compara para enseñar el aviso de
   «hay una versión nueva».

   El arte va aparte (`arte`) porque se cachea para siempre en el móvil: si no
   cambia el arte, no se vuelve a descargar; si cambia, la caché nueva se llama
   distinto y la vieja se tira. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

/* Carpetas que se quedan fuera de la huella. `app/data` es el volumen: ahí
   viven la base SQLite y las claves de push, y el fichero cambia en cada
   guardado. Si entrara en el hash, la app vería una «versión nueva» cada vez
   que alguien juega una carta y el aviso de actualizar no pararía nunca. */
const EXCLUIDAS = new Set([path.join("app", "data")]);

function ficheros(dir) {
  const out = [];
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entradas) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (EXCLUIDAS.has(path.relative(RAIZ, p))) continue;
    if (e.isDirectory()) out.push(...ficheros(p));
    else out.push(p);
  }
  return out.sort();
}

function huella(dirs) {
  const h = crypto.createHash("sha256");
  for (const dir of dirs) {
    for (const f of ficheros(path.join(RAIZ, dir))) {
      h.update(path.relative(RAIZ, f));
      h.update(fs.readFileSync(f));
    }
  }
  return h.digest("hex").slice(0, 10);
}

/* Las carpetas de arte: la común y la `img` de cada juego. Así cambiar un
   dibujo de cualquier juego invalida su caché sin listar los juegos a mano. */
function dirsArte() {
  const salida = ["app/arte"];
  try {
    const base = path.join(RAIZ, "app", "juegos");
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (e.isDirectory()) salida.push(`app/juegos/${e.name}/img`);
    }
  } catch { /* sin juegos instalados */ }
  return salida;
}

/* Lo último que se tocó en esos directorios. Si cambia, se vuelve a calcular
   la huella: así la app se entera de una actualización sin reiniciar el
   servidor (antes la versión se quedaba clavada en el arranque y, si se
   editaba el código con el servidor vivo, el aviso no salía nunca). */
function ultimaEscritura(dirs) {
  let t = 0;
  for (const dir of dirs) {
    for (const f of ficheros(path.join(RAIZ, dir))) {
      try { t = Math.max(t, fs.statSync(f).mtimeMs); } catch { /* borrado a medias */ }
    }
  }
  return t;
}

const VIGILADOS = ["app", "juego", "plataforma"];
let sello = null;
let visto = 0;

export function versiones() {
  const t = ultimaEscritura(VIGILADOS);
  if (!sello || t > visto) {
    visto = t;
    /* El motor y la app juntos: si cambia el servidor pero no la app, no hace
       falta recargar la pestaña; si cambia la app, sí. */
    sello = {
      version: huella(["app", "juego"]),
      arte: huella(dirsArte()),
      /* La huella completa incluye la plataforma: cambia con cualquier
         despliegue, aunque la app sea igual. Sirve para el log, no para el
         modal. */
      servidor: huella(["plataforma", "app", "juego"]),
      arrancado: new Date().toISOString(),
    };
  }
  return sello;
}
