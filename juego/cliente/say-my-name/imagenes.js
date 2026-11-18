/* Los nombres del contenido llevan artículo («una ganzúa de hueso») y los
   archivos no («ganzua-de-hueso.webp»): se quita el artículo, incluidos un y
   una, que en el original no hacía falta porque los archivos lo llevaban. */
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^(el|la|los|las|un|una|unos|unas)\s+/, "").replace(/\s+/g, "-");

export const objetoDe = (nombre) => `/app/juegos/say-my-name/img/objetos/${slug(nombre)}.webp`;
export const retratoDe = (apodo) => `/app/juegos/say-my-name/img/personajes/${slug(apodo)}-retrato.webp`;
export const peonDe = (apodo) => `/app/juegos/say-my-name/img/personajes/${slug(apodo)}-peon.webp`;
export const RETRATO_PLACEHOLDER = "/app/juegos/say-my-name/img/personajes/placeholder-retrato.webp";
export const PEON_PLACEHOLDER = "/app/juegos/say-my-name/img/personajes/placeholder-peon.webp";
