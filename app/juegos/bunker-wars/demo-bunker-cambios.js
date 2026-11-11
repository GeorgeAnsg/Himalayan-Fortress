/* Los tres cambios de vista, sin cámara ni perspectiva.
   ?modo=2  dos pantallas: el búnker entra a pantalla completa
   ?modo=3  partido por un tirador que se arrastra
   ?modo=4  franja de mando que se despliega

   Todo se gobierna con una sola variable, --alto, que es lo que mide el búnker
   desde su borde de abajo. El CSS hace el resto. */
(() => {
  const body = document.body;
  const modo = body.dataset.modo || "2";

  const raiz = document.documentElement;
  const boton = document.getElementById("boton-vista");
  const barra = document.getElementById("barra");
  const tirador = document.getElementById("tirador");
  const version = document.getElementById("version");

  const vh = () => window.innerHeight;

  /* Lo que ocupa la mano abajo (cartas + su margen). El búnker nunca baja de
     ahí: se apoya justo encima de las cartas. */
  const MANO = 84;

  version.textContent = "D" + modo;

  /* Los atajos 2/3/4 conservan lo que se esté mirando: el arte de verdad o el
     plano, para no cambiar de demo y de arte de golpe. */
  const vista = ["arte", "solo"].find(x => location.search.includes(x));
  const extra = vista ? "&" + vista : "";
  document.querySelectorAll("#modos a").forEach(a => {
    const href = a.getAttribute("href") + extra;
    a.setAttribute("href", href);
    a.classList.toggle("activo", href === "?modo=" + modo + extra);
  });

  /* ── Los topes de altura ─────────────────────────────────────────── */
  const topes = () => ({
    min: modo === "4" ? 36 : 64,
    // deja siempre el campo, la mano y algo de aire
    max: Math.round(Math.min(vh() * 0.68, vh() - MANO - 170))
  });

  let alto = 0;

  function ponerAlto(px) {
    const { min, max } = topes();
    alto = Math.round(Math.max(min, Math.min(max, px)));
    raiz.style.setProperty("--alto", alto + "px");
    pintar();
  }

  const estaAbierto = () => {
    if (modo === "2") return body.classList.contains("bunker");
    return alto > topes().min + 4;
  };

  function pintar() {
    const ab = estaAbierto();
    // .bunker es el estado "abierto" en los modos 2 y 4 (el 3 va por altura)
    body.classList.toggle("bunker", ab);
    boton.textContent = ab ? "CAMPO ⌃" : "BÚNKER ⌄";
  }

  /* Abrir y cerrar. Cada modo entiende "abierto" a su manera. */
  function alternar() {
    if (modo === "2") {
      body.classList.toggle("bunker");
    } else if (modo === "4") {
      ponerAlto(estaAbierto() ? topes().min : Math.min(topes().max, vh() * 0.5));
    } else {
      ponerAlto(estaAbierto() ? topes().min : Math.min(topes().max, vh() * 0.44));
    }
    pintar();
  }

  boton.addEventListener("click", alternar);
  if (barra) barra.addEventListener("click", alternar);

  /* ── Modo 3: arrastrar la línea de corte ─────────────────────────── */
  let arrastre = null;

  tirador.addEventListener("pointerdown", ev => {
    if (ev.button) return;
    arrastre = { y: ev.clientY, alto };
    // el puntero puede ser sintético: capturar no siempre es posible
    try { tirador.setPointerCapture(ev.pointerId); } catch (e) {}
    ev.preventDefault();
  }, { passive: false });

  tirador.addEventListener("pointermove", ev => {
    if (!arrastre) return;
    // subir el dedo sube el búnker: el tirador va pegado a su borde de arriba
    ponerAlto(arrastre.alto + (arrastre.y - ev.clientY));
  });

  const soltar = ev => {
    if (!arrastre) return;
    try { tirador.releasePointerCapture(ev.pointerId); } catch (e) {}
    arrastre = null;
    // si se queda a medias, se pega arriba o abajo
    const { min, max } = topes();
    if (alto > min && alto < min + 40) ponerAlto(min);
    else if (alto < max && alto > max - 40) ponerAlto(max);
  };
  tirador.addEventListener("pointerup", soltar);
  tirador.addEventListener("pointercancel", soltar);

  /* ── Arranque ────────────────────────────────────────────────────── */
  if (modo === "3") ponerAlto(vh() * 0.38);
  if (modo === "4") ponerAlto(topes().min);
  pintar();

  addEventListener("resize", () => {
    if (!alto) return;
    ponerAlto(alto);
  }, { passive: true });
})();
