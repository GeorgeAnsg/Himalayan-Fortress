/* ================================================================== */
/*  v3 — MECÁNICA                                               */
/*                                                                    */
/*  Aquí no hay ni una palabra del tema: ni salas, ni objetos, ni      */
/*  nombres. Solo la forma del juego y lo que cuesta cada cosa.        */
/*  Todo sale de manual-v3.html y de REGLAS-v3.md; lo que no está en   */
/*  ellos va marcado como DECISIÓN en CONTRATO.md.                     */
/* ================================================================== */

/* Cinco acciones por jornada, no acumulables. */
export const COSTE = {
  mover: 1,
  registrar: 1,
  coger: 0,   /* a la mano no cuesta ficha; a la bolsa sí, ver COSTE_BOLSA */
  usar: 1,
  esconder: 1,
  soltar: 1,   /* deshacerte de lo que llevas: la casa lo vuelve a esconder */
  guardar: 1,
  cambiar: 1,   /* mano por bolsa y bolsa por mano: una sola acción */
  robar: 1,
  reclamar: 1,
  interrogar: 1,
  habilidad: 1,
  salir: 1,
  cotillear: 1,
  tirar: 0,   /* deshacerte de una habilidad no gasta ficha */
};

/* Meter algo en la bolsa cuesta una ficha más, haya o no testigos: la bolsa
   esconde lo que entra y ese gesto se paga siempre. Antes lo abarataba la
   habilidad de manos rápidas, que está oculta; el recargo era el precio de la
   coartada y esa coartada ya no se vende. */
export const COSTE_BOLSA = 1;

export const PA_POR_DIA = 6;
export const JORNADAS = 9999;

/* Un objeto en la mano y uno en la bolsa. Dos sitios, no tres. */
export const MANO = 1;
export const BOLSA = 1;

/* Acarreo: dos jornadas si el objeto es tuyo, tres si es ajeno. Al tercer
   amanecer se suelta donde estés. */
export const ACARREO = 2;
export const ACARREO_AJENO = 3;

/* Huecos por sala: se sortean entre tres y cinco, en todas por igual. */
export const HUECOS = [3, 5];

/* Las estancias que se abren a mitad de partida no sortean: llegan con cosas
   dentro y siempre tienen la capacidad máxima. Con ocho jugadores son cuatro
   objetos por sala, y así ninguno cae al centro el día que se abre. */
export const HUECOS_NUEVAS = HUECOS[1];

/* El día en que entra el tercer objeto y las habilidades. */
export const DIA_HABILIDADES = 3;

/* El día en que se abren las estancias que no existen al empezar. */
export const DIA_SALAS = 5;

/* Lo que se dice hablando puede ser mentira. Tres de cada diez, de base:
   el que habla no está obligado a decir la verdad. Llevar encima un objeto
   de la persona de la que se habla es la única garantía. */
export const MENTIRA_CHARLA = 0.3;
