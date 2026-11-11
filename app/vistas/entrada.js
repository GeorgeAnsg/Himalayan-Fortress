/* La entrada: nombre y contraseña.

   Sin correo y sin invitado. La cuenta es lo que permite volver a tu asiento
   desde otro móvil y lo que impide que alguien entre con tu nombre. */

import { h, esc } from "../ui.js";

export function pintar(raiz, { alEnviar, codigo = null, error = null }) {
  let modo = "entrar";

  const nodo = h(`
    <section class="entrada">
      <p class="subtitulo">Juego por turnos</p>
      <h1 class="entrada-titulo">Madrigueras</h1>
      <p class="entrada-lema">Abre una madriguera, pasa el código y jugad desde el móvil. Cada uno en el suyo.</p>

      ${codigo ? `<div class="panel" style="border-color:rgba(227,164,85,.3);background:rgba(227,164,85,.07);margin-bottom:16px">
        <p class="nota" style="margin:0">Te han invitado a la madriguera <strong class="mono">${esc(codigo)}</strong>. Entra o crea tu cuenta y te sentamos.</p>
      </div>` : ""}

      <div class="pestanas" role="tablist">
        <button type="button" data-modo="entrar" class="on" role="tab">Entrar</button>
        <button type="button" data-modo="crear" role="tab">Crear cuenta</button>
      </div>

      <form class="panel" novalidate>
        <div class="campo">
          <label for="nombre">Tu nombre</label>
          <input id="nombre" name="nombre" type="text" autocomplete="username" autocapitalize="words"
                 spellcheck="false" maxlength="18" placeholder="Cómo te llamas" required />
        </div>
        <div class="campo">
          <label for="clave">Contraseña</label>
          <input id="clave" name="clave" type="password" autocomplete="current-password"
                 maxlength="200" placeholder="Al menos 4 caracteres" required />
        </div>
        <p class="error" role="alert"></p>
        <button class="boton" type="submit">Entrar</button>
      </form>

      <p class="sello">
        <span>◔</span>
        <span>Tu cuenta y tus mesas viven en este servidor, no en el móvil.</span>
      </p>
    </section>
  `);

  const formulario = nodo.querySelector("form");
  const boton = formulario.querySelector("button[type=submit]");
  const cajaError = formulario.querySelector(".error");
  const nombre = formulario.querySelector("#nombre");
  const clave = formulario.querySelector("#clave");

  const ponerError = (texto) => {
    cajaError.textContent = texto || "";
  };
  if (error) ponerError(error);
  setTimeout(() => nombre.focus(), 60);

  for (const botonPestana of nodo.querySelectorAll(".pestanas button")) {
    botonPestana.addEventListener("click", () => {
      modo = botonPestana.dataset.modo;
      for (const b of nodo.querySelectorAll(".pestanas button")) b.classList.toggle("on", b === botonPestana);
      boton.textContent = modo === "entrar" ? "Entrar" : "Crear cuenta y entrar";
      clave.autocomplete = modo === "entrar" ? "current-password" : "new-password";
      ponerError("");
    });
  }

  formulario.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    ponerError("");
    const n = nombre.value.trim();
    const c = clave.value;
    if (n.length < 2) return ponerError("Escribe tu nombre (2 letras o más).");
    if (c.length < 4) return ponerError("La contraseña necesita 4 caracteres o más.");

    boton.disabled = true;
    const antes = boton.textContent;
    boton.innerHTML = '<span class="girando"></span>';
    const r = await alEnviar({ modo, nombre: n, contrasena: c });
    boton.disabled = false;
    boton.textContent = antes;

    if (r?.error) {
      ponerError(r.error);
      clave.select();
      return;
    }
    /* Si va bien, la app cambia de pantalla; no hay nada que hacer aquí. */
  });

  raiz.append(nodo);
  return nodo;
}
