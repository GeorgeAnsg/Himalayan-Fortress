/* Página temporal de trabajo: saca la hoja de estilos del propio cliente del
   juego y pinta el HUD dentro del marco para poder medir las capas. */

const MAPA = {
  "${BASE_IMG}": "/app/juegos/bunker-wars/img",
  "${ASSETS_IMG}": "/app/juegos/bunker-wars/img/coins-and-decrees",
  "${CARD_BG}": "/app/juegos/bunker-wars/img/card.png",
};

const src = await fetch("/juego/cliente/bunker-wars.js").then((r) => r.text());
const trozos = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
let css = trozos.join("\n");
for (const [k, v] of Object.entries(MAPA)) css = css.split(k).join(v);
const estilo = document.createElement("style");
estilo.textContent = css;
document.head.append(estilo);

const I = "/app/juegos/bunker-wars/img/iconos";
const hud = document.getElementById("hud");
hud.innerHTML = `
  <div class="bw-hud-caja">
    <div class="bw-hud-cuerpo">
      <div class="bw-hud-prod">
        <div class="bw-rec"><img src="${I}/monedas.png" alt=""><b>6</b><em>por luna nueva</em></div>
        <div class="bw-rec"><img src="${I}/pergaminos.png" alt=""><b>3</b><em>por luna nueva</em></div>
      </div>
      <div class="bw-hud-vida alta"><img src="${I}/escudo.png" alt=""><b>20 de 20</b></div>
      <div class="bw-hud-edif">
        <div class="bw-edif"><img src="${I}/espadas.png" alt=""><span class="bw-edif-nombre">Armería</span>
          <span class="bw-edif-puntos"><i class="llena"></i><i></i><i></i><i></i></span></div>
        <div class="bw-edif"><img src="${I}/calavera.png" alt=""><span class="bw-edif-nombre">Criadero</span>
          <span class="bw-edif-puntos"><i class="llena"></i><i class="llena"></i><i></i><i></i></span></div>
      </div>
      <div class="bw-hud-pie">
        <div class="bw-hud-turnos" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="bw-turno activo"></div><div class="bw-turno"></div><div class="bw-turno"></div>
        </div>
      </div>
    </div>
  </div>`;

const m = (sel) => {
  const n = document.querySelector(sel);
  if (!n) return `${sel}: no existe`;
  const r = n.getBoundingClientRect();
  const hudR = hud.getBoundingClientRect();
  const cs = getComputedStyle(n);
  return `${sel}\n   x ${Math.round(r.left - hudR.left)} → ${Math.round(r.right - hudR.left)} (ancho ${Math.round(r.width)})`
    + ` · y ${Math.round(r.top - hudR.top)} → ${Math.round(r.bottom - hudR.top)} (alto ${Math.round(r.height)})`
    + `\n   padding ${cs.padding} · gap ${cs.gap}`;
};

document.getElementById("medidas").textContent = [
  "En px, medido dentro del marco (390 px de ancho de escena):",
  "",
  m(".bw-hud"), m(".bw-hud-caja"), m(".bw-hud-cuerpo"),
  m(".bw-hud-prod"), m(".bw-hud-vida"), m(".bw-hud-edif"),
  m(".bw-hud-pie"), m(".bw-hud-turnos"), m(".bw-turno"),
].join("\n\n");
