# Contrato del juego

La plataforma no sabe a qué se juega. Sabe de cuentas, asientos, turnos,
reconexiones, avisos y resultados. Todo lo demás lo pone un módulo de `juego/`.

Un juego es un objeto con estos campos y funciones, sin estado global:

```js
export default {
  id: "carrera",           // el que se guarda en la sala
  nombre: "La carrera",    // el que se ve en el vestíbulo
  min: 2,                  // jugadores mínimo y máximo para empezar
  max: 8,
  resumen: "…",            // una línea para la pantalla de crear mesa

  // jugadores: [{ id, nombre, avatar }] en orden de asiento
  crear({ jugadores, semilla, opciones }) → estado,

  // Estado serializable (JSON). Es la única verdad: el cliente no lo toca.
  // Lo que devuelve `legales` es exactamente lo que el servidor aceptará.
  legales(estado, jugadorId) → accion[],
  aplicar(estado, jugadorId, accion) → { estado, eventos: [{ tipo, texto, a? }] },

  // Qué ve cada uno. `vista` solo puede leer lo que ese jugador sabe.
  publica(estado) → objeto común (tablero, marcador…),
  vista(estado, jugadorId) → objeto privado,

  // Turno: id del jugador al que le toca, o null si no hay turnos.
  turno(estado) → jugadorId | null,

  // Opcional: alguien ha abandonado la mesa. Quita su ficha y arregla el
  // turno; si la partida ya no tiene sentido, deja `estado.final` puesto.
  quitar(estado, jugadorId) → estado,

  // null mientras se juega; al terminar:
  // { puestos: [{ jugadorId, puntos }] } en orden, del primero al último.
  terminada(estado) → null | { puestos },
};
```

## Reglas de la plataforma

- **El servidor manda.** El cliente manda acciones; la plataforma comprueba que
  están en `legales` antes de llamar a `aplicar`. Una acción inventada no llega
  al juego.
- **Nada de estado en el módulo del juego.** Todo lo que haga falta para
  reanudar la partida va dentro de `estado`, porque es lo único que se guarda.
- **Los eventos son para todos.** Se escriben en la crónica de la mesa y son
  públicos. Lo que sea secreto va en `vista`, nunca en un evento.
- **Eventos con `a`**: si un evento lleva `a: jugadorId`, la plataforma puede
  convertirlo en aviso (y en push si está desconectado). Ejemplo: `{ tipo:
  "turno", texto: "Te toca", a: "…" }`.
- **Un cambio, una acción.** `aplicar` hace una sola jugada y devuelve el estado
  nuevo. La plataforma guarda en SQLite después de cada una.
- **Turnos**: si `turno()` devuelve un id, solo ese puede actuar. Si devuelve
  `null`, la plataforma acepta acciones de cualquiera (juegos simultáneos o sin
  turnos); entonces el propio juego decide cuándo se acaba.

## Lo que la plataforma aporta al juego

- Asientos, código de sala, listo/no listo, anfitrión y traspaso de anfitrión.
- Persistencia y reanudación (vestíbulo y partida) tras un reinicio.
- `vista()` recalculada al reconectar; el cliente nunca guarda la verdad.
- Crónica, final, revancha, avisos y push.
- Rechazo de acciones de un cliente con la app desactualizada.
