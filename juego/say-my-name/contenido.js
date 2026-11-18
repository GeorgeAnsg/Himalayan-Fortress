/* ================================================================== */
/*  v3 — EL TEMA: el castillo, sus cosas y sus nombres               */
/*                                                                    */
/*  Este archivo es lo único que sabe que existe una Sala del Trono  */
/*  o un cojín. El motor lo recibe como un paquete y no lo lee por   */
/*  dentro: solo pide estancias, conexiones, objetos y nombres.      */
/*                                                                    */
/*  `sirveEn` es la verdad y el motor no la enseña a nadie.          */
/*  `sugiere` son las dos salas que el nombre hace razonables: una  */
/*  vale y dos no. Es lo único con lo que decide un jugador.         */
/* ================================================================== */

export const tema = {
  id: "castillo",

  rasgos: ["collar", "corona", "banda"],

  /* Solo se va a una estancia contigua. La que tiene `puerta` es la salida.
     `entra` es el día en que la estancia existe: sin él, está desde el principio. */
  salas: {
    trono:     { nombre: "la Sala del Trono",   salidas: ["cocinas", "biblioteca", "jardin"], puerta: true },
    cocinas:   { nombre: "las Cocinas",          salidas: ["trono", "armeria", "torre"] },
    armeria:   { nombre: "la Armería",           salidas: ["cocinas", "cripta"], trancada: ["cripta"] },
    cripta:    { nombre: "la Cripta",            salidas: ["armeria", "biblioteca"] },
    biblioteca:{ nombre: "la Biblioteca Prohibida", salidas: ["trono", "cripta"] },
    jardin:    { nombre: "el Jardín de las Ruinas", salidas: ["trono"] },

    /* Estas dos no están al empezar: se abren el día 5. */
    torre:   { nombre: "la Torre del Mago",  salidas: ["cocinas", "capilla"], entra: 5 },
    capilla: { nombre: "la Capilla Oscura",  salidas: ["torre"],             entra: 5 },
  },

  objetos: [
    /* Sala del Trono */
    { nombre: "el cojín del trono",             sirveEn: "trono",     sugiere: ["trono", "biblioteca"] },
    { nombre: "la corona de latón",              sirveEn: "trono",     sugiere: ["trono", "armeria"] },
    { nombre: "el cetro partido",                sirveEn: "trono",     sugiere: ["trono", "cripta"] },
    { nombre: "el estandarte desgarrado",        sirveEn: "trono",     sugiere: ["trono", "armeria"] },
    { nombre: "la campanilla de audiencia",      sirveEn: "trono",     sugiere: ["trono", "biblioteca"] },
    { nombre: "el farol de piedra",              sirveEn: "trono",     sugiere: ["trono", "jardin"] },
    { nombre: "la moneda de bronce",             sirveEn: "trono",     sugiere: ["trono", "cocinas"] },
    { nombre: "el pañuelo bordado",              sirveEn: "trono",     sugiere: ["trono", "biblioteca"] },

    /* Cocinas */
    { nombre: "el cucharón de hierro",           sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "la olla de cobre",                sirveEn: "cocinas",   sugiere: ["cocinas", "cripta"] },
    { nombre: "la llave de la despensa",         sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "el delantal manchado",            sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "el cazo de agua",                 sirveEn: "cocinas",   sugiere: ["cocinas", "jardin"] },
    { nombre: "el pan duro",                     sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "el cuchillo de trinchar",         sirveEn: "cocinas",   sugiere: ["armeria", "cocinas"] },
    { nombre: "la cuchara de plata",             sirveEn: "cocinas",   sugiere: ["trono", "cocinas"] },

    /* Armería */
    { nombre: "la daga mellada",                 sirveEn: "armeria",   sugiere: ["armeria", "cripta"] },
    { nombre: "la ballesta sin cuerda",          sirveEn: "armeria",   sugiere: ["armeria", "trono"] },
    { nombre: "el yelmo abollado",               sirveEn: "armeria",   sugiere: ["armeria", "trono"] },
    { nombre: "el escudo con el emblema borrado",sirveEn: "armeria",   sugiere: ["armeria", "trono"] },
    { nombre: "la piedra de afilar",             sirveEn: "armeria",   sugiere: ["armeria", "cocinas"] },
    { nombre: "el guantelete de hierro",         sirveEn: "armeria",   sugiere: ["armeria", "trono"] },
    { nombre: "la punta de lanza",               sirveEn: "armeria",   sugiere: ["armeria", "cripta"] },
    { nombre: "el cinturón de correajes",        sirveEn: "armeria",   sugiere: ["armeria", "trono"] },

    /* Cripta */
    { nombre: "la lápida rota",                  sirveEn: "cripta",    sugiere: ["cripta", "biblioteca"] },
    { nombre: "el hueso tallado",                sirveEn: "cripta",    sugiere: ["cripta", "armeria"] },
    { nombre: "la calavera",                     sirveEn: "cripta",    sugiere: ["cripta", "armeria"] },
    { nombre: "el sudario doblado",              sirveEn: "cripta",    sugiere: ["cripta", "biblioteca"] },
    { nombre: "el grillete abierto",             sirveEn: "cripta",    sugiere: ["armeria", "cripta"] },
    { nombre: "la tapa de ataúd",                sirveEn: "cripta",    sugiere: ["cripta", "armeria"] },
    { nombre: "el rosario de hueso",             sirveEn: "cripta",    sugiere: ["cripta", "biblioteca"] },
    { nombre: "el anillo del difunto",           sirveEn: "cripta",    sugiere: ["cripta", "trono"] },

    /* Biblioteca Prohibida */
    { nombre: "el libro encadenado",             sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "la pluma negra",                  sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el tintero agrietado",            sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el marcapáginas de cuero",        sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el mapa anotado",                 sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el monóculo",                     sirveEn: "biblioteca",sugiere: ["trono", "biblioteca"] },
    { nombre: "la pluma de grifo",               sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el herbario prensado",            sirveEn: "biblioteca",sugiere: ["jardin", "biblioteca"] },

    /* Jardín de las Ruinas */
    { nombre: "la regadera oxidada",             sirveEn: "jardin",    sugiere: ["jardin", "cocinas"] },
    { nombre: "las tijeras de podar",            sirveEn: "jardin",    sugiere: ["jardin", "armeria"] },
    { nombre: "el tarro de gusanos",             sirveEn: "jardin",    sugiere: ["jardin", "cripta"] },
    { nombre: "la pala corta",                   sirveEn: "jardin",    sugiere: ["jardin", "cripta"] },
    { nombre: "el manojo de hierbas secas",      sirveEn: "jardin",    sugiere: ["jardin", "biblioteca"] },
    { nombre: "la jaula vacía",                  sirveEn: "jardin",    sugiere: ["jardin", "trono"] },
    { nombre: "la cabeza de estatua",            sirveEn: "jardin",    sugiere: ["jardin", "trono"] },
    { nombre: "el trozo de carbón",              sirveEn: "jardin",    sugiere: ["jardin", "cocinas"] },

    /* Situación — antes lista separada; ahora en el pool unificado */
    { nombre: "la carta sellada",                sirveEn: "trono",     sugiere: ["trono", "biblioteca"] },
    { nombre: "el registro de nombres",          sirveEn: "trono",     sugiere: ["biblioteca", "trono"] },
    { nombre: "la nota de la despensa",          sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "la llave de la cámara",           sirveEn: "cocinas",   sugiere: ["cocinas", "trono"] },
    { nombre: "la insignia arrancada",           sirveEn: "armeria",   sugiere: ["armeria", "trono"] },
    { nombre: "el lazo de cuero",                sirveEn: "armeria",   sugiere: ["armeria", "cripta"] },
    { nombre: "la llave de nicho",               sirveEn: "cripta",    sugiere: ["cripta", "armeria"] },
    { nombre: "la soga con nudo",                sirveEn: "cripta",    sugiere: ["cripta", "armeria"] },
    { nombre: "la carta sin terminar",           sirveEn: "biblioteca",sugiere: ["biblioteca", "trono"] },
    { nombre: "el cuervo disecado",              sirveEn: "biblioteca",sugiere: ["biblioteca", "jardin"] },
    { nombre: "el broche de hoja",               sirveEn: "jardin",    sugiere: ["jardin", "trono"] },
    { nombre: "el fragmento de espejo",          sirveEn: "jardin",    sugiere: ["jardin", "trono"] },
  ],

  /* Lo que aparece el día 5 dentro de las dos estancias nuevas.
     Siempre salen al menos 2 de torre y 2 de capilla; el resto del día 5
     puede venir del pool principal. */
  quinta: {
    torre: [
      { nombre: "el alambique de cobre",    sirveEn: "torre",   sugiere: ["torre", "cocinas"] },
      { nombre: "el frasco de veneno",      sirveEn: "torre",   sugiere: ["torre", "jardin"] },
      { nombre: "el mortero de piedra",     sirveEn: "torre",   sugiere: ["torre", "cocinas"] },
      { nombre: "la cuchara dosificadora",  sirveEn: "torre",   sugiere: ["torre", "cocinas"] },
      { nombre: "la botella vacía",         sirveEn: "torre",   sugiere: ["torre", "biblioteca"] },
    ],
    capilla: [
      { nombre: "el candelabro de hierro",  sirveEn: "capilla", sugiere: ["capilla", "trono"] },
      { nombre: "el pañuelo negro",         sirveEn: "capilla", sugiere: ["capilla", "cripta"] },
      { nombre: "el tarro de ojos",         sirveEn: "capilla", sugiere: ["capilla", "cripta"] },
      { nombre: "el sello de lacre",        sirveEn: "capilla", sugiere: ["capilla", "trono"] },
      { nombre: "la vela de sebo",          sirveEn: "capilla", sugiere: ["capilla", "cripta"] },
    ],
  },

  /* Objetos que se cogen, se llevan, se roban y se gastan. */
  /* `oculto` deja el dibujo y la mecánica en el código pero saca el objeto
     de la casa: hoy solo juegan ganzúa, tranca y lupa. El vaso y las manos
     rápidas vuelven poniendo `oculto: false`. */
  /* `veces` = total en partida (mano inicial + pool de respawn).
     `inicial` = puede repartirse en mano al empezar. */
  habilidades: [
    { clase: "ganzua",   nombre: "una ganzúa de hueso",              veces: 2, inicial: true  },
    { clase: "tranca",   nombre: "una tranca de roble",              veces: 2, inicial: true  },
    { clase: "lupa",     nombre: "una lupa de orfebre",              veces: 1, inicial: true  },
    { clase: "vaso",     nombre: "una copa de estaño",               veces: 1, inicial: false },
    { clase: "manos",    nombre: "unos guantes de terciopelo negro",  veces: 1, inicial: true  },
    { clase: "antorcha", nombre: "una antorcha de piedra",           veces: 1, inicial: true  },
    { clase: "cepo",     nombre: "un cepo de hierro",                veces: 1, inicial: true  },
    { clase: "humo",     nombre: "un frasco de humo",                veces: 1, inicial: true  },
    { clase: "cuerda",   nombre: "una cuerda de atar",               veces: 1, inicial: true  },
    { clase: "empujon",  nombre: "un empujón de guardián",           veces: 1, inicial: true  },
    { clase: "capa",     nombre: "una capa de viajero",              veces: 1, inicial: true  },
  ],

  /* Las ocho fichas. Cada apodo es un personaje dibujado **con estas tres
     insignias a la vista** —collar, corona y banda—, y las ocho combinaciones
     están todas: cada insignia parte el grupo en cuatro y cuatro. Las tres son
     rangos de la misma casa —la corona es de la sangre, el collar es el cargo
     y la banda es salir con la guardia—, así que el reparto no se elige por
     los rasgos: se elige por los rangos que tiene una corte. La ficha es
     pública —todos ven los ocho dibujos—; lo que se esconde es qué nombre hay
     detrás de cada uno. */
  apodos: [
    { apodo: "el Bufón Amargo",   rasgos: { collar: false, corona: false, banda:  false } },
    { apodo: "el Caballero Fiel", rasgos: { collar: false, corona: true,  banda:  true  } },
    { apodo: "la Princesa Pálida",rasgos: { collar: false, corona: true,  banda:  false } },
    { apodo: "el Herrero",        rasgos: { collar: false, corona: false, banda:  true  } },
    { apodo: "la Condesa",        rasgos: { collar: true,  corona: false, banda:  false } },
    { apodo: "la Hilandera",      rasgos: { collar: true,  corona: false, banda:  true  } },
    { apodo: "la Reina Malvada",  rasgos: { collar: true,  corona: true,  banda:  false } },
    { apodo: "el Rey Caído",      rasgos: { collar: true,  corona: true,  banda:  true  } },
  ],

  nombres: ["Marcos", "Elena", "Marta", "Javi", "Nuria", "Sergio", "Irene", "Pablo"],
};
