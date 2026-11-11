/* Los juegos que esta instalación sabe jugar.

   Para meter el juego bueno: se copia su módulo aquí, se importa y se añade al
   mapa. La plataforma no cambia; el vestíbulo lo ofrece en la lista. Si hay un
   solo juego, la app no pregunta: crea la mesa de ese. */

import carrera from "./carrera.js";
import bunkerWars from "./bunker-wars.js";

export const JUEGOS = new Map([
  [carrera.id,    carrera],
  [bunkerWars.id, bunkerWars],
]);

export function juego(id) {
  return JUEGOS.get(id) ?? null;
}

export function listaJuegos() {
  return [...JUEGOS.values()].map(({ id, nombre, min, max, resumen }) => ({ id, nombre, min, max, resumen }));
}
