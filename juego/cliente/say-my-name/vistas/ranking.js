import { h } from "../ui.js";

/* El ranking de la mesa, como en la app original: salen **todos** los nombres
   desde el primer día, agrupados por cuántos definitivos lleva cada uno, y se
   recolocan según la mesa los va rellenando. Nunca hay un estado vacío: si
   nadie ha puesto ninguno, todos comparten el primer puesto.

   Los definitivos los cuenta el servidor (`ctx.ranking`, que es lo único del
   cuaderno que sale del móvil); el nombre de personaje sale de la vista, que
   es donde el motor manda los apodos de la mesa. */
export function pintarRanking(v, ctx) {
  const yo = v?.yo ?? null;
  const cuentas = new Map((ctx?.ranking ?? v?.ranking ?? []).map((f) => [f.id, f]));

  /* La mesa entera, con sus apodos: `v.todos` son los demás, así que te
     agregas tú delante. Si la vista no trae la lista, se usan los nombres que
     haya mandado el servidor en el ranking. */
  const mesa = [
    ...(yo?.id ? [{ id: yo.id, apodo: yo.apodo }] : []),
    ...(v?.todos ?? []),
  ];
  const lista = mesa.length ? mesa : (ctx?.ranking ?? []);
  const vistos = new Set();
  const gente = lista
    .filter((p) => p?.id && !vistos.has(p.id) && vistos.add(p.id))
    .map((p) => {
      const cuenta = cuentas.get(p.id) ?? {};
      return {
        id: p.id,
        nombre: p.apodo ?? p.nombre ?? "alguien",
        definitivos: cuenta.definitivos ?? 0,
        total: cuenta.total ?? 0,
        tu: p.id === yo?.id,
      };
    });

  const wrap = h("div", { class: "ranking-wrap" });
  if (!gente.length) return wrap;

  wrap.append(h("p", { class: "inicio-label", text: "Ranking" }));

  /* De más definitivos a menos. Los empates van en el mismo grupo y en el
     orden en que llegaron (sort estable), como en el original. */
  const orden = [...gente].sort((a, b) => b.definitivos - a.definitivos);
  const grupos = [];
  for (const f of orden) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo[0] === f.definitivos) ultimo[1].push(f);
    else grupos.push([f.definitivos, [f]]);
  }

  grupos.forEach(([definitivos, miembros], gi) => {
    const lleno = miembros[0].total > 0 && definitivos >= miembros[0].total;
    wrap.append(
      h("div", { class: "ranking-cabecera" + (lleno ? " lleno" : "") },
        h("span", { class: "ranking-ordinal", text: `${gi + 1}º` }),
        h("div", { class: "ranking-linea" })
      )
    );
    for (const { nombre, tu } of miembros) {
      wrap.append(
        h("div", { class: "ranking-fila" + (lleno ? " lleno" : "") },
          h("span", {
            class: "ranking-nombre" + (tu ? " tuyo" : "") + (lleno ? " lleno" : ""),
            text: nombre + (tu ? " (tú)" : ""),
          })
        )
      );
    }
  });

  return wrap;
}
