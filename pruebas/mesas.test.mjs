/* Lo que se prueba aquí es la plataforma, no el juego: que se pueda abrir una
   mesa, sentarse, empezar, jugar por turnos, terminar, pedir revancha y
   recuperarlo todo después de un reinicio. El juego de prueba hace de conejillo.

   Cada archivo de `pruebas/` corre en su propio proceso, así que puede usar su
   propia base temporal sin pisar la de nadie. */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "madrigueras-pruebas-"));
process.env.MADRIGUERAS_DB = path.join(carpeta, "prueba.db");

const almacen = await import("../plataforma/almacen.mjs");
const auth = await import("../plataforma/auth.mjs");
const { Mesas, emparejarLegal } = await import("../plataforma/salas.mjs");
const carrera = (await import("../juego/carrera.js")).default;

let contador = 0;

function usuario(nombre) {
  const id = auth.nuevoId();
  const { hash, sal } = auth.hashear("1234");
  almacen.crearUsuario({
    id,
    nombre,
    nombreClave: auth.normalizar(`${nombre}${contador++}`),
    hash,
    sal,
    avatar: "3",
  });
  return { id, nombre, avatar: "3" };
}

function mesasNuevas() {
  return new Mesas({ difundir() {}, avisar() {}, version: "prueba" });
}

test("abrir, unirse y no poder empezar con la mesa a medias", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");

  const { sala } = mesas.crear(ana, "carrera");
  assert.match(sala.codigo, /^[A-Z]{5}$/);
  assert.equal(sala.fase, "vestibulo");

  assert.ok(mesas.unirse(bruno, "ZZZZZ").error, "un código que no existe no sienta a nadie");

  const r = mesas.unirse(bruno, sala.codigo.toLowerCase());
  assert.equal(r.sala.codigo, sala.codigo);
  assert.equal(r.sala.datos.jugadores.length, 2);

  assert.ok(mesas.empezar(ana.id).error.includes("listo"), "sin listos no se empieza");

  mesas.listo(ana.id, true);
  mesas.listo(bruno.id, true);
  const e = mesas.empezar(ana.id);
  assert.equal(e.sala.fase, "jugando");
  assert.ok(e.sala.datos.estado, "el juego ha creado su estado");
});

test("solo el anfitrión empieza y solo el que tiene el turno juega", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");
  const { sala } = mesas.crear(ana, "carrera");
  mesas.unirse(bruno, sala.codigo);
  mesas.listo(ana.id, true);
  mesas.listo(bruno.id, true);

  assert.ok(mesas.empezar(bruno.id).error.includes("anfitrión"));

  mesas.empezar(ana.id);
  const actual = mesas.porCodigo(sala.codigo);
  assert.equal(carrera.turno(actual.datos.estado), ana.id);

  assert.equal(mesas.accion(bruno.id, { tipo: "correr" }).error, "No es tu turno.");
  assert.ok(mesas.accion(ana.id, { tipo: "volar" }).error, "una jugada inventada no pasa");

  const r = mesas.accion(ana.id, { tipo: "correr" });
  assert.equal(r.error, undefined);
  assert.equal(carrera.turno(r.sala.datos.estado), bruno.id);
});

test("una partida entera acaba con puestos y la revancha vuelve al vestíbulo", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");
  const { sala } = mesas.crear(ana, "carrera");
  mesas.unirse(bruno, sala.codigo);
  mesas.listo(ana.id, true);
  mesas.listo(bruno.id, true);
  mesas.empezar(ana.id);

  let actual = sala;
  let guardia = 300;
  while (actual.fase === "jugando" && guardia-- > 0) {
    const turno = carrera.turno(actual.datos.estado);
    const r = mesas.accion(turno, { tipo: "correr" });
    assert.equal(r.error, undefined, r.error);
    actual = r.sala;
  }

  assert.equal(actual.fase, "final", "la partida termina sola al llegar a la meta");
  assert.equal(guardia > 0, true, "no se ha quedado dando vueltas");
  assert.equal(actual.datos.final.puestos.length, 2);
  assert.equal(actual.datos.final.puestos[0].puntos >= actual.datos.final.puestos[1].puntos, true);

  assert.ok(mesas.revancha(bruno.id).error.includes("anfitrión"), "la revancha la pide el anfitrión");
  const v = mesas.revancha(ana.id);
  assert.equal(v.sala.fase, "vestibulo");
  assert.equal(v.sala.datos.estado, null);
  assert.equal(v.sala.datos.jugadores.every((j) => !j.listo), true);
});

test("abandonar en partida libera el asiento y cierra si queda uno", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");
  const { sala } = mesas.crear(ana, "carrera");
  mesas.unirse(bruno, sala.codigo);
  mesas.listo(ana.id, true);
  mesas.listo(bruno.id, true);
  mesas.empezar(ana.id);

  const r = mesas.abandonar(bruno.id);
  assert.equal(r.sala.fase, "final", "con uno solo, la partida no puede seguir");
  assert.equal(r.sala.datos.jugadores.length, 1);
  assert.equal(mesas.deUsuario(bruno.id), null, "su asiento queda libre");
});

test("una mesa se recupera del disco con su estado y sus listos", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");
  const { sala } = mesas.crear(ana, "carrera");
  mesas.unirse(bruno, sala.codigo);
  mesas.listo(ana.id, true);
  mesas.listo(bruno.id, true);
  mesas.empezar(ana.id);
  mesas.accion(ana.id, { tipo: "correr" });

  const antes = mesas.porCodigo(sala.codigo);
  const turnoAntes = carrera.turno(antes.datos.estado);
  const posAntes = antes.datos.estado.jugadores[ana.id].pos;

  /* Otro proceso, misma base: es lo que pasa al reiniciar el contenedor. */
  const despues = mesasNuevas();
  const recuperada = despues.porCodigo(sala.codigo);

  assert.ok(recuperada, "la mesa sigue ahí tras el reinicio");
  assert.equal(recuperada.fase, "jugando");
  assert.equal(recuperada.datos.jugadores.length, 2);
  assert.equal(carrera.turno(recuperada.datos.estado), turnoAntes);
  assert.equal(recuperada.datos.estado.jugadores[ana.id].pos, posAntes);
});

test("un vestíbulo también sobrevive al reinicio (la lección de Say My Name)", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const { sala } = mesas.crear(ana, "carrera");

  const despues = mesasNuevas();
  const recuperada = despues.porCodigo(sala.codigo);
  assert.ok(recuperada, "el vestíbulo no se evapora con el reinicio");
  assert.equal(recuperada.fase, "vestibulo");
  assert.equal(recuperada.anfitrion, ana.id);
  assert.equal(recuperada.datos.jugadores.length, 1);
});

test("la mesa vacía se borra y la inactiva caduca a las dos horas", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const { sala } = mesas.crear(ana, "carrera");

  mesas.sacar(ana.id);
  assert.equal(mesas.porCodigo(sala.codigo), null, "sin nadie, no hay mesa");

  const otra = mesas.crear(ana, "carrera").sala;
  mesas.porCodigo(otra.codigo).actualizado = Date.now() - 3 * 60 * 60 * 1000;
  mesas.purgar();
  assert.equal(mesas.porCodigo(otra.codigo), null, "tres horas sin actividad: fuera");
});

test("si el anfitrión se cae, el mando pasa al siguiente conectado", () => {
  const mesas = mesasNuevas();
  const ana = usuario("Ana");
  const bruno = usuario("Bruno");
  const { sala } = mesas.crear(ana, "carrera");
  mesas.unirse(bruno, sala.codigo);
  mesas.conectar(ana.id, "s1");
  mesas.conectar(bruno.id, "s2");

  mesas.desconectar(ana.id, "s1");
  /* `heredar` es lo que llama el temporizador de 20 s; aquí se llama a mano
     para no hacer esperar a la prueba. */
  mesas.heredar(mesas.porCodigo(sala.codigo));
  assert.equal(mesas.porCodigo(sala.codigo).anfitrion, bruno.id);
});

/* Hubo un día en que jugar «RECURSOS 2» jugaba la primera carta de la mano:
   la mesa emparejaba la acción pedida solo por `tipo`. */
test("la acción aplicada es la que se pidió, no la primera del mismo tipo", () => {
  const legales = [
    { tipo: "mejorar_bunker", cartaId: "cb9", texto: "Jugar laboratorio 4" },
    { tipo: "mejorar_bunker", cartaId: "cb2", texto: "Jugar recursos 2" },
    { tipo: "crear_monstruo", nivel: 1, texto: "Crear monstruo 1 (0e)" },
    { tipo: "crear_monstruo", nivel: 5, texto: "Crear monstruo 5 (3e)" },
    { tipo: "pasar", texto: "Terminar decretos" },
  ];

  assert.deepEqual(emparejarLegal(legales, { tipo: "mejorar_bunker", cartaId: "cb2" }), legales[1]);
  assert.deepEqual(emparejarLegal(legales, { tipo: "crear_monstruo", nivel: 5 }), legales[3]);
  assert.deepEqual(emparejarLegal(legales, { tipo: "pasar", texto: "Terminar decretos" }), legales[4]);
  assert.equal(emparejarLegal(legales, { tipo: "mejorar_bunker", cartaId: "nope" }), undefined);
  assert.equal(emparejarLegal(legales, { tipo: "crear_monstruo", nivel: 4 }), undefined);
});
