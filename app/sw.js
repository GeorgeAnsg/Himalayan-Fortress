/* Service worker de Madrigueras.

   Tres reglas, y cada una es una lección de la app anterior:

   1. **Red primero** para la app. Si hay servidor, se juega la versión nueva;
      la caché es solo para que la pantalla abra sin red y no se quede en
      blanco. Nada de servir un JS viejo con una partida nueva.
   2. **Arte cache-first**, en una caché cuyo nombre lleva la huella del arte.
      Cambiar un dibujo cambia el nombre de la caché y el móvil lo vuelve a
      bajar; si no cambia, no se descarga dos veces.
   3. **Nada de recargar a la fuerza.** El aviso de versión nueva lo enseña la
      app y solo recarga cuando el jugador acepta. Aquí, `skipWaiting` espera a
      que le manden `{ tipo: "actualizar" }`.

   Con la app cerrada, el único que puede avisar es el servidor: llega un
   `push` y se pinta la notificación. */

const CACHE_APP = "madrigueras-app-v1";
const CACHE_META = "madrigueras-meta";

const CAPARAZON = [
  "./",
  "./index.html",
  "./estilos.css",
  "./app.js",
  "./ui.js",
  "./api.js",
  "./sesion.js",
  "./socket.js",
  "./avisos.js",
  "./version.js",
  "./vistas/entrada.js",
  "./vistas/inicio.js",
  "./vistas/vestibulo.js",
  "./vistas/juego.js",
  "./vistas/final.js",
  "../juego/cliente/carrera.js",
  "./arte/icono.svg",
  "./arte/icono-maskable.svg",
];

/* La huella del arte se guarda en una caché pequeña: el service worker se
   apaga cuando no hay nada que hacer, y una variable en memoria volvería a
   empezar en 0 —y a llenar el móvil de cachés de arte—. */
let arteMemo = null;

async function huellaArte() {
  if (arteMemo) return arteMemo;
  try {
    const meta = await caches.open(CACHE_META);
    const guardada = await meta.match("/arte-version");
    if (guardada) {
      const texto = await guardada.text();
      /* «0» es «no lo sabía»: si el servidor no estaba al instalar, se vuelve
         a preguntar en vez de quedarse con una caché de arte que no caduca. */
      if (texto && texto !== "0") {
        arteMemo = texto;
        return texto;
      }
    }
  } catch { /* sin meta, se pregunta al servidor */ }

  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    const datos = await res.json();
    if (datos?.arte) {
      await guardarArte(datos.arte);
      return datos.arte;
    }
  } catch { /* sin red: se usa la huella 0 */ }

  return "0";
}

async function guardarArte(huella) {
  arteMemo = huella;
  try {
    const meta = await caches.open(CACHE_META);
    await meta.put("/arte-version", new Response(huella));
  } catch { /* nada */ }

  /* Al cambiar la huella, el arte viejo sobra. Se borra aquí y no solo en
     `activate`, porque el service worker puede vivir días entre versiones. */
  try {
    const claves = await caches.keys();
    await Promise.all(
      claves
        .filter((k) => k.startsWith("madrigueras-arte-") && k !== `madrigueras-arte-${huella}`)
        .map((k) => caches.delete(k))
    );
  } catch { /* nada */ }
}

async function cacheDeArte() {
  return caches.open(`madrigueras-arte-${await huellaArte()}`);
}

/* ── Instalación ───────────────────────────────────────────────────────── */

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    await huellaArte();
    const cache = await caches.open(CACHE_APP);
    /* Uno a uno: si falta un archivo, el service worker no se cae entero. */
    await Promise.all(CAPARAZON.map((url) => cache.add(url).catch(() => {})));
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    const actual = `madrigueras-arte-${await huellaArte()}`;
    const claves = await caches.keys();
    await Promise.all(
      claves
        .filter((k) => k !== CACHE_APP && k !== CACHE_META && k !== actual)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* La app pide tomar el mando cuando el jugador acepta actualizar. */
self.addEventListener("message", (ev) => {
  if (ev.data?.tipo === "actualizar") self.skipWaiting();
  if (ev.data?.tipo === "arte" && ev.data.huella) guardarArte(String(ev.data.huella));
});

/* ── Push ──────────────────────────────────────────────────────────────── */

self.addEventListener("push", (ev) => {
  let datos = {};
  try { datos = ev.data?.json() ?? {}; } catch { datos = {}; }

  const titulo = datos.titulo || "Madrigueras";
  const etiqueta = datos.etiqueta || "madrigueras";

  ev.waitUntil((async () => {
    const reg = self.registration;
    /* Uno por aviso: si la página ya había pintado el suyo, este lo sustituye
       en vez de sumarse. */
    try {
      const viejas = await reg.getNotifications({ tag: etiqueta });
      viejas.forEach((n) => n.close());
    } catch { /* sin poder mirar la bandeja se sigue */ }

    await reg.showNotification(titulo, {
      body: datos.cuerpo || "",
      tag: etiqueta,
      icon: "arte/icono.svg",
      badge: "arte/icono.svg",
      renotify: true,
      data: { url: datos.url || "./" },
    });

    /* Y se le dice a la app: ese aviso ya está en pantalla, que no lo repita. */
    try {
      const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      cs.forEach((c) => c.postMessage({ tipo: "push", etiqueta }));
    } catch { /* sin clientes no hay a quién */ }
  })());
});

self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const destino = ev.notification.data?.url || "./";
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const abierta = cs.find((c) => c.url.startsWith(self.registration.scope));
      if (abierta) {
        abierta.focus();
        abierta.postMessage({ tipo: "traer", url: destino });
        return undefined;
      }
      return self.clients.openWindow(destino);
    })
  );
});

/* ── Red ───────────────────────────────────────────────────────────────── */

function esArte(url) {
  return /\/arte\/.*\.(svg|png|webp|jpg|jpeg|gif|woff2?)(\?|$)/i.test(url);
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  if (!req.url.startsWith(self.location.origin)) return;
  if (req.url.includes("/sw.js")) return;
  if (req.url.includes("/socket.io/")) return;

  /* Arte: primero la caché; si no está, se baja y se guarda. */
  if (esArte(req.url)) {
    ev.respondWith((async () => {
      const cache = await cacheDeArte();
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  /* Todo lo demás: red primero. Sin red, la copia; y solo las navegaciones
     caen al index (servir el HTML de la app cuando falla un .js deja la
     pantalla muerta). */
  ev.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copia = res.clone();
        caches.open(CACHE_APP).then((c) => c.put(req, copia)).catch(() => {});
      }
      return res;
    } catch {
      const cache = await caches.open(CACHE_APP);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const index = await cache.match("./index.html");
        if (index) return index;
      }
      return Response.error();
    }
  })());
});
