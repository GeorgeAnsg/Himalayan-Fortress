/* El tablero del juego de prueba, en el navegador.

   Este archivo es lo único del juego que ve el cliente: recibe la vista pública
   y la privada y pinta. No calcula reglas ni guarda estado; si lo hiciera, dos
   pantallas podrían creerse cosas distintas. */

import { avatarSVG, esc } from "../../app/ui.js";

export function pintar(contenedor, { publica, privada, jugadores, tu }) {
  const meta = publica?.meta ?? 15;
  const pistas = publica?.pistas ?? [];

  contenedor.innerHTML = pistas
    .map((p) => {
      const jugador = jugadores.find((j) => j.id === p.id);
      const soy = p.id === tu;
      const porcentaje = Math.max(0, Math.min(100, (p.pos / meta) * 100));
      return `
        <div class="pista${soy ? "" : " apagada"}">
          <span class="avatar" style="width:36px;height:36px">${avatarSVG(jugador?.avatar ?? 0)}</span>
          <div>
            <div class="pista-cabeza">
              <span class="nombre">${esc(p.nombre)}</span>
              ${soy ? `<span class="marca-tu">tú</span>` : ""}
              <span class="marcador" style="margin-left:auto">${p.pos}<span class="apagado"> / ${meta}</span></span>
            </div>
            <div class="carril">
              <div class="avance" style="width:${porcentaje}%"></div>
              <div class="meta-punto"></div>
            </div>
          </div>
        </div>`;
    })
    .join("");

  if (pistas.length && privada?.teToca) {
    const resto = meta - (privada.pos ?? 0);
    const pista = document.createElement("p");
    pista.className = "nota";
    pista.style.margin = "10px 0 0";
    pista.textContent = resto > 0
      ? `Te quedan ${resto} túneles. Correr avanza 1 a 3; empujar frena a otro.`
      : "Estás en la meta.";
    contenedor.append(pista);
  }
}
