# Bunker Wars — especificación del juego

Fuente de verdad antes de escribir código.
Cualquier duda sobre mecánica se resuelve aquí primero.

---

## Principios de implementación

1. **Estado = única verdad.** Todo lo necesario para reanudar la partida está
   en `estado`. Si no está en `estado`, no existe.
2. **Lógica = funciones puras.** `legales` y `aplicar` reciben estado y
   devuelven estado nuevo. Sin efectos secundarios, sin estado global.
3. **Vista = solo lectura.** `cliente/bunker-wars.js` solo lee `publica` y
   `vista`. No toca el estado directamente.
4. **Acciones = datos.** Cada jugada es un objeto `{ tipo, ...params }`.
   Lo que devuelve `legales` es exactamente lo que acepta `aplicar`.

---

## Resumen del juego

- **2–6 jugadores, competitivo.** Cada jugador tiene su propio búnker.
- **25 rondas (lunas).** Gana el último búnker en pie.
- **Derrota:** la suma de puntos de los monstruos que han entrado en tu búnker supera 20.
- **Si varios sobreviven las 25 rondas:** gana quien menos puntos de monstruo tenga acumulados. Empate si están igualados.
- **Monstruos atacantes** llegan por dos vías: cartas de Destino y lanzamientos de los rivales.

---

## Estado global

```js
estado = {
  luna: 1,                    // ronda actual (1–25)
  fase: "avance",             // avance | lanzar | carta | energia (monedas) | acciones (decretos) | descartar | fin
  orden: ["id1", "id2"],      // orden de turno
  turnoIdx: 0,                // índice en orden del jugador activo
  mazoDestino: [],            // mazo compartido barajado (objetos carta)
  descarteDestino: [],
  nivelEnemigo: 1,            // 1 con luna blanca, 2 desde la luna 5
  jugadores: {
    "id1": { /* ver abajo */ },
    "id2": { /* … */ },
  },
  rng: 0,
  final: null,
  // { puestos: [{ jugadorId, puntos }] } — menor puntos = mejor resultado
}
```

## Estado por jugador

```js
jugador = {
  puntosMonsters: 0,          // puntos acumulados; derrota cuando > 20
  vivo: true,

  bunker: {
    armeria: 1,               // nivel 1–3
    laboratorio: 1,           // nivel 1–4
    recursos: [],             // cartas de recursos activas (máx 4, pueden repetirse)
    ciencia: [],              // cartas de ciencia permanentes (sin duplicados)
  },

  energia: 0,                 // monedas disponibles este turno (el campo sigue llamándose energia)
  accionesRestantes: 0,       // decretos disponibles (el campo sigue llamándose accionesRestantes)

  // Convención de nombres en la interfaz y en el habla:
  //   caminos 1, 2, 3 · lanzaderas 1 y 2 · casillas del camino 1–4
  //   casilla 1 = I(1), el inicio (junto a la lanzadera) · casilla 4 = junto al búnker
  senderos: [
    {
      id: 1,
      posiciones: [null, null, null, null],
      // pos 0 = entrada / inicio (más lejos del búnker) = casilla 1 (I)
      // pos 3 = junto al búnker = casilla 4
      // ficha: { tipo:"atacante"|"monstruo", nivel:1|2|3|5|7, id }
      torreta: null,
      // { nivel:1|2|3, id, inhabilitada:false }
    },
    { id: 2, posiciones: [null,null,null,null], torreta: null },
    { id: 3, posiciones: [null,null,null,null], torreta: null },
  ],

  // 2 cajas de BOX, 3 huecos cada una (6 en total)
  // caja 1 → caminos 1 y 2 · caja 2 → caminos 2 y 3
  box: [null, null, null,  null, null, null],
  // cada slot: null | { id, nivel }

  lanzaderas: [null, null],
  // una por box: la 1 recibe del box 1 y la 2 del box 2
  // { id, nivel } cada una — listas para lanzar al inicio del siguiente turno

  mano: [],                   // máx 4 cartas al final del turno
  mazoBunker: [],             // mazo individual de búnker
  descarteBunker: [],
}
```

---

## Niveles de monstruo

| Nivel | Puntos/daño | Coste crear (laboratorio) | Fichas en juego |
|-------|-------------|-------------------|-----------------|
| 1     | 1           | 0 monedas         | 20              |
| 2     | 2           | 1 moneda          | 16              |
| 3     | 3           | 2 monedas         | 20              |
| 5     | 5           | 3 monedas         | 10              |
| 7     | 7           | 3 monedas         | 4               |

Nivel máximo que se puede crear = nivel de laboratorio:
Lab 1 → hasta nivel 1 · Lab 2 → hasta nivel 2 · Lab 3 → hasta nivel 3 · Lab 4 → hasta nivel 5

El nivel 7 nunca se crea en el laboratorio: solo llega por el mazo de Destino o subiendo de rango un monstruo.

---

## Torres

| Nivel | Coste construir | Daño máximo | Coste por punto de daño |
|-------|-----------------|-------------|-------------------------|
| 1     | 1 moneda        | 1           | 1 moneda/punto          |
| 2     | 2 monedas       | 2           | 1 moneda/punto          |
| 3     | 3 monedas       | 3           | 1 moneda/punto          |

- **Las torres se construyen en las posiciones de torre del BÚNKER** (3 posiciones,
  una por calle: la posición N es del camino N). No van sobre el sendero.
- Una torre puede defender **cualquier** sendero, independientemente de su posición,
  pero hace **1 menos de daño** en las calles que no son la suya: nivel 3 → 3 de daño
  en su calle y 2 en las demás (nivel 1 → 0 en las demás).
- Daño máximo = nivel de la torre; puede disparar menos.
- **Coste de ataque = daño ocasionado** (1 moneda por punto). Ej.: torre nivel 3
  haciendo 2 de daño paga 2 monedas.
- Coste de evolución = diferencia entre el coste del nivel nuevo y el actual.
- **Inhabilitada** mientras la casilla 4 (posición 3) de **su** camino esté ocupada
  por un monstruo atacante; se reactiva sola al liberarse la casilla.
- Requiere armería: Arm 1 → nivel 1 · Arm 2 → nivel 2 · Arm 3 → nivel 3.

---

## Combate — reglas de aniquilación

**Con torres** (acción: atacar monstruo):
- Se suman los daños de las torres del búnker contra ese camino (cada una hace
  su nivel si es su calle, nivel − 1 en las demás).
- Para destruir un atacante hay que hacer su nivel en daño; se paga ese daño.

**Entre monstruos** (acción: avanzar / atacar, o lanzar desde el box):
- Por categorías y sin desgaste: **el que se mueve a la casilla del otro ataca
  primero** y gana los empates.
- Atacante nivel ≥ defensor → el defensor muere y el atacante sobrevive, ocupando
  su casilla.
- Atacante nivel < defensor → muere el atacante y el defensor se queda intacto.
- Nadie se debilita nunca y las torres no intervienen en el choque.
- Si el monstruo termina en posición 0 → pasa a la lanzadera de al lado,
  bloqueado hasta el turno siguiente (camino 1 → L1 · camino 3 → L2 · camino 2
  → la primera libre).

---

## Movimiento de monstruos

Desde BOX (2 cajas de 3 huecos: la 1 toca los caminos 1 y 2 · la 2, los caminos 2 y 3):
- **BOX → lanzadera:** 1 decreto, sin monedas. Cualquier nivel, y solo a la
  lanzadera de su propio box: del box 1 a la lanzadera 1, del box 2 a la 2.
- **BOX → casilla 4 del camino:** 1 decreto + 1 moneda. Sale a la casilla 4
  (posición 3), la que toca al búnker, de cara a los atacantes, y solo a los dos
  caminos adyacentes a la caja del monstruo (box 1 → C1-4 o C2-4 · box 2 → C2-4 o
  C3-4); nunca a mitad de camino. Nivel máximo 5 (nivel 7 no puede).
- Si la casilla 4 está ocupada por un **atacante**, el lanzamiento es un ataque
  directo: se resuelve el combate por categorías (el que llega ataca) y el
  ganador se queda en la casilla 4. No se puede lanzar sobre un monstruo propio.

En sendero propio:
- Avanzan 1 posición por turno en la fase LANZAR, de la base al inicio (4→3→2→1),
  sin gastar decreto ni monedas. Si el hueco de delante tiene un atacante, atacan:
  se resuelve por categorías como en la acción avanzar monstruo (el que se mueve
  ataca y gana los empates). Si tiene otro monstruo propio, esperan sin atacarse.
- **Avanzar monstruo:** 1 decreto + 1 moneda. Mueve un monstruo las casillas
  que quieras hacia la casilla 1 (hacia los atacantes). Si el destino tiene un
  atacante, la acción es un ataque y se resuelve por categorías.
- Si llega a posición 0 → pasa a lanzadera adyacente, bloqueado hasta el siguiente turno.

Desde lanzadera (hay dos, una por box):
- Fase LANZAR: se envía al sendero elegido de un rival (jugador elige a quién y
  por qué sendero). Cada lanzadera se manda por separado, así que en la misma
  fase se pueden hacer uno o dos lanzamientos.

---

## Monstruos atacantes

- Llegan por cartas de Destino o lanzados por rivales (entran por posición 0). Los que manda otro jugador desde su lanzadera o con vuelo seguro son atacantes normales en todo: avanzan, combaten, entran al búnker y suman puntos. Solo cambia el color: se pintan en morado para saber que no vienen de una carta de Destino.
- Cada ficha guarda su dueño en `dueno`: un monstruo es del jugador de su tablero (ahí defiende), y en cuanto sale a otro tablero pasa a `atacante` conservando el dueño. Los atacantes de carta de Destino no tienen dueño: son del juego. Una partida vieja sin dueño se rellena al cargar (los monstruos son del dueño del tablero).
- Si posición 0 está ocupada, no puede entrar (se descarta).
- Avanzan 1 posición por ronda (fase AVANCE). Si en la casilla de delante hay un
  monstruo tuyo, el atacante le ataca con las reglas de combate (el que se mueve
  ataca y gana los empates) y ocupa su casilla si gana.
- En posición 3: en el siguiente turno entran al búnker.
  - Se acumula su nivel en `puntosMonsters`. Si > 20 → derrota.
- El Destino «Miedo» hace retroceder una casilla a todos los atacantes de la mesa. El que tiene un monstruo detrás no puede recular y pelea (gana los empates el atacante, que ocupa la casilla si vence); el de la casilla 1 se queda. El aviso cuenta los atacantes vivos en ese momento.
  - La torreta de ese sendero queda inhabilitada.
- Nivel real: el de la carta, pero con luna blanca (rondas 1-4) → nivel 1 forzado.
  La mesa manda ese nivel real en `cartaDestino.nivelReal` y el cartel del turno
  lo muestra, para no anunciar un nivel que no entra. En los caminos cada ficha
  se pinta como `M<nivel>` (monstruo + nivel).

---

## Cartas de búnker (mazo individual por jugador)

**Permanentes — mejoras del búnker:**

| Tipo         | Nivel | Efecto                                        | Coste |
|--------------|-------|-----------------------------------------------|-------|
| recursos     | 1     | +1 moneda/turno                               | 1     |
| recursos     | 2     | +2 monedas y +1 decreto/turno                 | 2     |
| recursos     | 3     | +3 monedas y +1 decreto/turno                 | 3     |
| recursos     | 4     | +4 monedas y +2 decretos/turno                | 4     |
| armeria      | 2     | torres hasta nivel 2                          | 2     |
| armeria      | 3     | torres hasta nivel 3                          | 2     |
| laboratorio  | 2     | monstruos hasta nivel 2                       | 2     |
| laboratorio  | 3     | monstruos hasta nivel 3                       | 2     |
| laboratorio  | 4     | monstruos hasta nivel 5                       | 2     |
| ciencia      | *     | ver tabla de ciencia permanente                | 8     |

**Inmediatas — descartar tras usar:**

| Efecto                                                                           | Coste |
|----------------------------------------------------------------------------------|-------|
| (I) Avanza 1 casilla a un monstruo nivel ≤3 atacando a un rival (permite entrada) | 2   |
| (I) Sube un rango a un monstruo nivel ≤5 (tuyo o rival en ataque)               | 2     |
| (I) Convierte un monstruo atacante nivel ≤5 en monstruo tuyo (gíralo)          | 2     |
| (I) Baja un rango a un monstruo atacante en tus senderos                         | 2     |
| (I) Evoluciona una torre al siguiente nivel                                      | 2     |
| (I) Vuelo seguro: envía un monstruo nivel ≤3 a la entrada de un sendero rival   | 2     |
| (I) Construye una torre nivel 2 sin necesitar Armería 3                          | 3     |
| (I) Crea un monstruo nivel 3 en un BOX sin necesitar Laboratorio 3              | 3     |
| (I) Sube un nivel la armería al instante (tope 3)                               | 3     |
| (I) Sube un nivel el laboratorio al instante (tope 4)                            | 3     |
| (I) Sube un nivel los recursos al instante: la carta más floja sube uno (tope 4) | 4     |
| (I) Sube un nivel laboratorio O armería al instante (se elige cuál)              | 4     |
| (I) Purga: aniquila los monstruos de las casillas 3 y 4 de todos tus caminos, tuyos y atacantes | 8 |

**Ciencia permanente — máximo 2 huecos:**

| Efecto                                                                 | Coste |
|------------------------------------------------------------------------|-------|
| Disparar torretas cuesta 1 moneda menos                                | 8     |
| Crear monstruos cuesta 1 moneda menos del valor del monstruo           | 8     |
| Tus torres hacen su daño de nivel en cualquier sendero                 | 8     |

Notas de ciencia:
- Subir rango pide elegir monstruo: valen los tuyos que defienden tus caminos y los que lanzaste a un rival (el atacante guarda quién lo mandó), nunca por encima de nivel 5. Sin objetivo no se gasta la carta.
- Todas las ciencias que eligen objetivo (avanzar al rival, convertir, bajar rango, evolucionar torre, vuelo seguro, torre de nivel 2, monstruo nivel 3) muestran una opción por objetivo legal y no se cobran si no la reciben.
- Avanzar al rival: solo monstruos nivel ≤3 que lanzaste tú. Si están en la casilla 4 del rival entran al búnker y suman sus puntos como un atacante normal.
- Vuelo seguro: saca el monstruo del box (nivel ≤3) y lo deja en la entrada de un camino rival; no se ofrecen caminos con la entrada ocupada.
- Bajar rango / convertir: solo atacantes que estén en tus senderos (el que te ataca), nivel ≤5. Bajar salta la escalera 3→2→1, nunca pasa por un nivel inexistente.
- Torre de nivel 2: sirve para una posición vacía o para subir una torre de nivel 1; nunca baja ni repite una torre que ya es 2 o más.
- Las inmediatas de subida de nivel no buscan nada en el mazo ni barajan: el nivel sube en el acto y la carta va al descarte. No se pueden jugar si el edificio ya está al tope.
- Solo caben 2 ciencias permanentes. La tercera se puede pagar, pero al instalarla se descarta una de las dos que ya estaban (la carta vieja va al descarte).
- No se puede tener dos veces la misma ciencia.
- Purga es instantánea: no ocupa hueco.

Notas:
- Máx 4 cartas de recursos acumuladas (pueden repetirse).
- Armería y laboratorio necesitan nivel previo (no puedes poner nivel 3 sin nivel 2).
- Se puede descartar una carta de recursos/armería/laboratorio pagando el precio de la nueva.
- El mazo de búnker es infinito: al agotarse se baraja el descarte y, si tampoco queda, se vuelve a montar con las cartas que aún sirven (recursos mientras haya hueco, armería/laboratorio por encima del nivel actual). La mano solo deja de rellenarse cuando el búnker está al máximo.

---

## Cartas de Destino (mazo compartido de 53 cartas)

No hay carta roja en el mazo: **la luna se vuelve roja al empezar la ronda 5** (cuatro rondas de robo con los búnkeres flojos), y desde ese turno los monstruos que entren llegan con el nivel de su carta. Nadie pierde su carta de Destino por el cambio; se avisa en la crónica y el contador de la luna pasa a rojo.

**Cartas de amenaza (atacantes llegan al jugador activo):**

| Efecto                                              | Priorización |
|-----------------------------------------------------|--------------|
| Monstruo nivel 1                                    | 1,2,3        |
| Monstruo nivel 1                                    | 2,1,3        |
| Monstruo nivel 1                                    | 3,2,1        |
| 3 monstruos nivel 1 (uno en cada sendero)           | —            |
| Monstruo nivel 2                                    | 1,2,3        |
| Monstruo nivel 2                                    | 2,1,3        |
| Monstruo nivel 2                                    | 3,2,1        |
| 3 monstruos nivel 2 (uno en cada sendero)           | —            |
| Monstruo nivel 3                                    | 1,2,3        |
| Monstruo nivel 3                                    | 2,1,3        |
| Monstruo nivel 3                                    | 3,2,1        |
| 3 monstruos nivel 3 (uno en cada sendero)           | —            |
| Monstruo nivel 5                                    | 1,2,3        |
| Monstruo nivel 5                                    | 2,1,3        |
| Monstruo nivel 5                                    | 3,2,1        |
| 2 monstruos nivel 2 en 2 senderos                   | 2,1,3        |
| Monstruo nivel 7                                    | 1,2,3        |
| Monstruo nivel 7                                    | 2,1,3        |
| Monstruo nivel 7                                    | 3,2,1        |

**Cartas de evento (afectan a todos o al jugador activo):**

| Efecto                                                                 |
|------------------------------------------------------------------------|
| Todos los monstruos en posición de entrada son aniquilados             |
| Calma — no hay monstruos nuevos                                        |
| Busca en el mazo una carta de búnker que necesites                     |
| Todos los monstruos nivel ≤3 de senderos mueren                        |
| El monstruo de más nivel que ataca tu búnker muere                     |
| Monstruo nivel 2 en 1 sendero de cada rival (priorización 2,3,1)      |
| Convierte un monstruo atacante en monstruo tuyo (gíralo)               |
| Todos los monstruos atacantes avanzan un paso más este turno           |
| Miedo: todos los atacantes de la mesa retroceden una casilla; los de la entrada se quedan y, si detrás hay un defensor, pelean con las reglas de siempre |
| Tus monstruos de nivel ≤5 en tus senderos suben un rango                |
| Tus monstruos de nivel ≥2 en tus senderos bajan un rango                |
| Coloca 3 monstruos nivel 3 saliendo de tu búnker                       |
| Coloca 3 monstruos nivel 2 saliendo de tu búnker                       |

La distribución exacta de repeticiones en las 60 cartas se decidirá en el balance final.

---

## Fichas físicas (referencia para IDs en el estado)

| Ficha    | Cantidad |
|----------|----------|
| M1       | 20       |
| M2       | 16       |
| M3       | 20       |
| M5       | 10       |
| M7       | 4        |
| T1       | ~17      |
| T2       | ~15      |
| T3       | ~10      |
| Monedas  | 40       |

---

## Secuencia de turno (por jugador, en orden)

Las fases 1, 3 y 4 no piden decisión: el motor las resuelve seguidas y el turno
aterriza en DECRETOS. La fase 2 se resuelve sola salvo que haya un monstruo en
la lanzadera y algún camino rival libre: ahí el jugador elige a qué camino del
rival se lanza (o "No lanzar").

```
1. AVANCE
   — Los monstruos que estaban en posición 3 entran al búnker:
     sumar nivel a puntosMonsters. Al liberarse la casilla 4, la torre de ese
     camino vuelve a estar habilitada.
     Si puntosMonsters > 20: jugador eliminado.
   — Cada monstruo atacante en senderos avanza 1 posición.
     El que llega a la casilla 4 NO entra ese mismo turno: entra en el AVANCE del
     turno siguiente, así que pasa un turno entero a tiro de las torres.

2. LANZAR
   — Una lanzadera con monstruo: lanzar a un sendero de un rival elegido.
     Queda la otra lanzadera: se puede lanzar también en la misma fase.
   — Todos los monstruos en senderos propios avanzan 1 posición.
   — Los que llegan a posición 0 pasan a la lanzadera de al lado (bloqueados).

3. CARTA
   — Robar 1 carta de Destino del mazo compartido.
   — Resolver su efecto (si antes de esta fase la luna cambió a roja,
     nivelEnemigo ya es 2 y la carta entra con su nivel real).

4. MONEDAS
   — Recibir monedas base (3) + suma de bonus de cartas de recursos en búnker.
   — Restaurar decretos (2 base + bonus de recursos).

5. DECRETOS
   El jugador gasta decretos (y monedas) en cualquier orden:
   a) mejorar_bunker: jugar carta de mano en la zona correspondiente del búnker.
   b) crear_monstruo: colocar ficha en el BOX que elija el jugador (1 o 2) si tiene
      hueco libre: 1 decreto + las monedas del nivel (0, 1, 2 o 3). Un decreto por box.
   c) construir_torreta: torre nivel 1 en una posición de torre del búnker
      (1 decreto, 1 moneda).
   d) evolucionar_torreta: subir nivel de una torre (pagar diferencia de coste).
   e) avanzar_monstruo: 1 decreto + 1 moneda, mueve el monstruo las casillas
      deseadas (ataca si el destino es un atacante).
   f) atacar_monstruo: disparar con las torres del búnker a un atacante de
      cualquier camino (pagar el daño en monedas).
   g) mover_a_lanzadera: BOX → lanzadera (1 decreto, sin monedas).
   h) mover_a_sendero: BOX → casilla 4 del sendero (1 decreto + 1 moneda, no nivel 7).

6. DESCARTAR
   — Si se han jugado cartas ese turno: descartar hasta 2 (o ninguna).
   — Si no se han jugado cartas: descartar 1 obligatoriamente.

7. ROBAR
   — Robar cartas de búnker hasta tener 4 en mano.
   — Si el mazo se acaba: barajar el descarte.
```

---

## Acciones (tipos para `legales` / `aplicar`)

```js
// Acciones del jugador:
{ tipo: "mejorar_bunker",      cartaId: "c1" }
{ tipo: "crear_monstruo",      nivel: 2, boxIdx: 0 }
{ tipo: "construir_torreta",   posicion: 1 }   // posición de torre del búnker (1–3)
{ tipo: "evolucionar_torreta", posicion: 1 }
{ tipo: "avanzar_monstruo",    monstruoId: "m1", sendero: 1, posicion: 2 }
  // si hay atacante en destino, el combate se resuelve automáticamente
{ tipo: "atacar_monstruo",     sendero: 1, posicion: 3 }   // dispara la torre del búnker
{ tipo: "mover_a_lanzadera",   monstruoId: "m1" }
{ tipo: "mover_a_sendero",     monstruoId: "m1", sendero: 2, posicion: 3 }
{ tipo: "pasar" }              // terminar los decretos del turno

// Acciones automáticas del sistema (no las elige el jugador):
{ tipo: "_entrar_monstruo",    enemigoId: "e3" }
{ tipo: "_avanzar_atacantes" }
{ tipo: "_avanzar_monstruos" }
{ tipo: "_lanzar_lanzadera",   rivalId: "id2", sendero: 1 }
{ tipo: "_resolver_destino",   carta: { ... } }
```

---

## Condición de fin

- **Derrota individual:** `puntosMonsters > 20`. El jugador queda eliminado.
- **Fin de partida:** queda 1 jugador vivo, o se completan las 25 lunas.
- `terminada` devuelve `{ puestos: [{ jugadorId, puntos }] }` ordenados de menos a más puntos.

---

## Pendiente (no bloquea empezar)

- [ ] Distribución exacta de las 60 cartas de Destino.
- [ ] Coste 8 de las cartas de Ciencia permanente — ¿es en monedas o en puntos de victoria?
