/* Cuentas: que el mismo nombre con acentos o mayúsculas sea la misma cuenta,
   que la contraseña no se pueda leer del hash y que el token guardado no sea
   el token que viaja. */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import * as auth from "../plataforma/auth.mjs";

test("el nombre se normaliza: Aná, ANA y ana son la misma cuenta", () => {
  assert.equal(auth.normalizar("Aná"), "ana");
  assert.equal(auth.normalizar("  ANA  "), "ana");
  assert.equal(auth.normalizar("Jorge  Ruiz"), "jorge ruiz");
});

test("nombres que no valen", () => {
  assert.equal(auth.nombreValido("A"), false);
  assert.equal(auth.nombreValido("<script>"), false);
  assert.equal(auth.nombreValido("ana/../etc"), false);
  assert.equal(auth.nombreValido(""), false);
  assert.equal(auth.nombreValido("María José"), true);
  assert.equal(auth.nombreValido("topo_7"), true);
});

test("la contraseña correcta pasa y la incorrecta no", () => {
  const { hash, sal } = auth.hashear("1234");
  assert.equal(auth.comprobar("1234", sal, hash), true);
  assert.equal(auth.comprobar("1235", sal, hash), false);
  assert.equal(auth.comprobar("", sal, hash), false);
  assert.notEqual(hash, "1234");
  assert.ok(hash.length >= 64);
});

test("el token se guarda hasheado y no se repite", () => {
  const a = auth.nuevoToken();
  const b = auth.nuevoToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40);
  assert.notEqual(auth.hashToken(a), a);
  assert.equal(auth.hashToken(a).length, 64);
  assert.equal(auth.hashToken(a), crypto.createHash("sha256").update(a).digest("hex"));
});

test("el freno corta a los ocho intentos fallidos", () => {
  const ip = "10.0.0.9";
  const nombre = "ana";
  for (let i = 0; i < 8; i++) auth.anotarFallo(ip, nombre);
  assert.equal(auth.frenado(ip, nombre), true);
  assert.equal(auth.frenado("10.0.0.10", nombre), false, "otra IP no está frenada");
});
