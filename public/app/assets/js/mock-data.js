/* =========================================================
   CONFIG DE MARCA (marca blanca)
   Todo lo que cambia por cliente vive acá. En una versión
   real esto vendría de un endpoint /config según el dominio
   o el tenant, no hardcodeado en el bundle.
   ========================================================= */
window.APP_CONFIG = {
  // mock: "auto"  -> demo SOLO si la página se abre con doble clic
  //                   (file://), donde no hay backend al que pegarle.
  //                   Servida desde el servidor (Replit), va siempre
  //                   contra /api/app con datos reales del padrón.
  //        true    -> forzar demo siempre.
  //        false   -> forzar datos reales siempre.
  // Para cambiarlo sin tocar el archivo, desde la consola del navegador:
  //   localStorage.setItem("ospan_mock","1")  // demo
  //   localStorage.setItem("ospan_mock","0")  // real
  //   localStorage.removeItem("ospan_mock")   // volver a "auto"
  api: { baseUrl: "/api/app", mock: "auto" },
  brand: {
    nombre: "OSPAN",
    logoIcono: "assets/img/icon-favicon.png", // isotipo cuadrado, para chips/header chico
    logoCompleto: "assets/img/ospan-logo.png", // isologo horizontal, para login/onboarding
    colorPrimario: "#4a90c9",
    colorPrimarioOscuro: "#2e7d8c",
  },
  ayuda: {
    general: {
      titulo: "¿Tenés dudas sobre tu cobertura?",
      telefono: "0800-123-OSPAN",
      horario: "Lun a Vie 9-18hs",
      ctaLabel: "Contactanos",
    },
    urgencia: {
      titulo: "¿Necesitás asistencia veterinaria urgente?",
      telefono: "0800-999-6300",
      disponibilidad: "Las 24 horas, los 365 días",
      ctaLabel: "Llamar ahora",
    },
    // TODO: reemplazar por el número real de soporte de OSPAN.
    whatsapp: {
      numero: "5491112345678",
      mensaje: "Hola, necesito ayuda con mi cuenta de OSPAN.",
    },
  },
  // Nomenclatura del dominio (vertical veterinario, fijo por ahora)
  textos: {
    entidadPlural: "Mis Mascotas",
    entidadSingular: "Mascota",
  },
  credencial: {
    // Base de credencial a usar cuando la mascota no tiene plan conocido.
    planPorDefecto: "100",
  },
  onboarding: {
    imagen: "assets/img/onboarding-app-Ospan.png",
    ctaLabel: "Comenzar",
  },
  login: {
    subtitulo: "Portal del Afiliado",
    inputLabel: "Ingresá tu DNI",
    inputPlaceholder: "Ej: 30123456",
    ctaLabel: "Ingresar",
    notaSeguridad: "Tu información está protegida y segura",
  },
};

/* =========================================================
   MOCK DATA — afiliado logueado
   Nota: cada mascota puede tener un plan DISTINTO (ej. una
   cachorra en un plan más básico y un adulto en uno superior).
   Por eso el plan NO se muestra como pill único en el header,
   sino por entidad (mascota).
   ========================================================= */
window.MOCK_AFILIADO = {
  nombre: "María",
  apellido: "García",
  numeroAfiliado: "100200",
  dni: "30.123.456",
  estadoCuenta: "activo", // activo | suspendido
  telefono: "+54 9 11 1234-5678",
  email: "maria.garcia@example.com",
  mascotas: [
    {
      id: "100200/01",
      idHub: "pet_a1b2c3d4e5f6a7b",
      nombre: "Tila Tekila",
      especie: "Perro",
      raza: "Golden Retriever",
      sexo: "hembra", // hembra | macho
      plan: "300",
      estado: "activo",
      foto: "assets/img/credencial-foto-mascota-39610-Tila.png",
      iniciales: "TI",
      fechaNacimiento: "14/3/2021",
      edad: "5 años",
      cobertura: "100%",
      carencias: "Sin carencias",
      alta: "19/05/2026",
      detalles: "-",
    },
    {
      id: "100200/02",
      idHub: "pet_b2c3d4e5f6a7b8c",
      nombre: "Mojito",
      especie: "Gato",
      raza: "Atigrado",
      sexo: "macho", // hembra | macho
      plan: "400",
      estado: "activo",
      foto: "assets/img/credencial-foto-mascota-48267-Mojito.png",
      iniciales: "MA",
      fechaNacimiento: "2/8/2023",
      edad: "2 años",
      cobertura: "100%",
      carencias: "Sin carencias",
      alta: "19/05/2026",
      detalles: "-",
    },
    {
      id: "100200/03",
      idHub: "pet_c3d4e5f6a7b8c9d",
      nombre: "China",
      especie: "Gato",
      raza: "Atigrado",
      sexo: "hembra", // hembra | macho
      plan: "200",
      estado: "activo",
      foto: "assets/img/credencial-foto-mascota-00267-China.jpg",
      iniciales: "CH",
      fechaNacimiento: "-",
      edad: "-",
      cobertura: "100%",
      carencias: "Sin carencias",
      alta: "3/08/2026",
      detalles: "-",
    },
  ],
};

/* =========================================================
   MOCK DATA — directorio de proveedores de la red
   categoria: "veterinaria" | "peluqueria" | "guarderia" | "adiestrador"
   (define qué ícono y color usa el ítem en el listado)
   ========================================================= */
window.MOCK_VETERINARIAS = [
  {
    nombre: "Vet. Palermo Centro",
    categoria: "veterinaria",
    zona: "Palermo",
    distancia: "0.4 km",
    telefono: "011-4555-2222",
    abierto: true,
    horarioTexto: "Abierto hasta las 20 hs",
  },
  {
    nombre: "Peluquería Canina Wow",
    categoria: "peluqueria",
    zona: "Palermo",
    distancia: "0.9 km",
    telefono: "011-4555-3311",
    abierto: false,
    horarioTexto: "Abre a las 9:00 hs",
  },
  {
    nombre: "Guardería Huellitas",
    categoria: "guarderia",
    zona: "Belgrano",
    distancia: "1.2 km",
    telefono: "011-4555-6677",
    abierto: true,
    horarioTexto: "Abierto hasta las 18 hs",
  },
  {
    nombre: "Adiestramiento K9 Palermo",
    categoria: "adiestrador",
    zona: "Palermo",
    distancia: "1.8 km",
    telefono: "011-4555-9090",
    abierto: true,
    horarioTexto: "Abierto hasta las 17 hs",
  },
  {
    nombre: "Vet. Belgrano Norte",
    categoria: "veterinaria",
    zona: "Belgrano",
    distancia: "2.1 km",
    telefono: "011-4555-4004",
    abierto: true,
    horarioTexto: "Abierto hasta las 19 hs",
  },
  {
    nombre: "Emergencias Vet 24hs",
    categoria: "veterinaria",
    zona: "Recoleta",
    distancia: "3.4 km",
    telefono: "011-4555-4444",
    abierto: true,
    horarioTexto: "Abierto las 24 hs",
  },
  {
    nombre: "Patitas Felices",
    categoria: "veterinaria",
    zona: "Vicente López",
    distancia: "5.1 km",
    telefono: "011-4555-7788",
    abierto: true,
    horarioTexto: "Abierto hasta las 20 hs",
  },
];

/* =========================================================
   MOCK DATA — historial de prestaciones (todas las mascotas)
   ========================================================= */
window.MOCK_HISTORIAL = [
  { prestador: "VetCentro", fecha: "4/5/2026", mascotaId: "100200/01", estado: "auditoria", cubierto: "$2.200" },
  { prestador: "VetCentro", fecha: "4/5/2026", mascotaId: "100200/02", estado: "autorizado", cubierto: "$4.500" },
  { prestador: "Patitas Felices", fecha: "16/2/2026", mascotaId: "100200/02", estado: "autorizado", cubierto: "$2.500" },
  { prestador: "Patitas Felices", fecha: "15/2/2026", mascotaId: "100200/01", estado: "autorizado", cubierto: "$2.000" },
  { prestador: "Patitas Felices", fecha: "14/1/2026", mascotaId: "100200/01", estado: "auditoria", cubierto: "$4.500" },
  { prestador: "Patitas Felices", fecha: "12/1/2026", mascotaId: "100200/02", estado: "autorizado", cubierto: "$3.500" },
];

/* =========================================================
   MOCK DATA — contrato firmado por el afiliado en la app
   (alta / aceptación de términos al momento de asociarse)
   ========================================================= */
window.MOCK_CONTRATO = {
  codigo: "CONT-2026-0031",
  fechaFirma: "19/05/2026",
  vigenciaDesde: "19/05/2026",
  vigenciaHasta: "19/05/2027",
  planesAsociados: ["Plan 300 (Tila Tekila)", "Plan 400 (Mojito)"],
  archivoUrl: null, // TODO: URL real del PDF firmado cuando exista el backend
};

/* =========================================================
   MOCK DATA — Mis Resultados (órdenes médicas de Pegasus)
   Misma forma que devuelve GET /api/app/mascotas/:idHub/ordenes
   y GET /api/app/ordenes/:id. Los estados son los de Pegasus:
   1 Pendiente, 3 Realizada, 5 Realizada informe pendiente, etc.
   ========================================================= */
window.MOCK_ORDENES = [
  {
    id: 36988, idHub: "pet_a1b2c3d4e5f6a7b",
    fecha: "2026-08-21T10:30:00", servicio: "Laboratorio — Hemograma completo",
    estadoCodigo: 3, estadoNombre: "Realizada",
    profesional: "Dra. Laura Méndez", sucursal: "Vet. Palermo Centro",
    diagnostico: "Control anual. Decaimiento leve.",
    solicitudHtml: "<p>Se solicita <strong>hemograma completo</strong> y bioquímica básica.</p>",
    resultadoHtml: "<h4>Detalle</h4><p>Hemograma dentro de parámetros normales. Leve leucocitosis reactiva, sin significancia clínica.</p><p>Se sugiere control en 6 meses.</p>",
    items: [
      { nombre: "Hematocrito", valor: "45", unidad: "%", referencia: "37-55" },
      { nombre: "Leucocitos", valor: "17.800", unidad: "/µL", referencia: "6.000-17.000" },
      { nombre: "Plaquetas", valor: "", unidad: "", referencia: "" },
    ],
    adjuntos: [{ n: 0, nombre: "Informe_Hemograma.pdf", tipo: "application/pdf", url: null }],
  },
  {
    id: 37012, idHub: "pet_a1b2c3d4e5f6a7b",
    fecha: "2026-09-02T16:00:00", servicio: "Diagnóstico por imágenes — Radiografía de cadera",
    estadoCodigo: 5, estadoNombre: "Realizada, informe pendiente",
    profesional: "Dr. Pablo Ferreyra", sucursal: "Vet. Palermo Centro",
    diagnostico: "Displasia de cadera (sospecha).",
    solicitudHtml: "<p>Rx de cadera, proyección ventrodorsal.</p>",
    resultadoHtml: "", items: [],
    adjuntos: [{ n: 0, nombre: "RX_cadera_VD.jpg", tipo: "image/jpeg", url: null }],
  },
  {
    id: 37044, idHub: "pet_a1b2c3d4e5f6a7b",
    fecha: "2026-09-09T09:15:00", servicio: "Laboratorio — Perfil renal",
    estadoCodigo: 1, estadoNombre: "Pendiente de realización",
    profesional: "Dra. Laura Méndez", sucursal: "Vet. Palermo Centro",
    diagnostico: "Control post-tratamiento.",
    solicitudHtml: "<p>Urea, creatinina, SDMA.</p>", resultadoHtml: "", items: [], adjuntos: [],
  },
  {
    id: 36720, idHub: "pet_b2c3d4e5f6a7b8c",
    fecha: "2026-07-14T11:00:00", servicio: "Laboratorio — Test FIV/FeLV",
    estadoCodigo: 3, estadoNombre: "Realizada",
    profesional: "Dra. Carla Sosa", sucursal: "Patitas Felices",
    diagnostico: "Chequeo previo a castración.",
    solicitudHtml: "<p>Test rápido FIV/FeLV.</p>",
    resultadoHtml: "<h4>Detalle</h4><p><strong>FIV: negativo. FeLV: negativo.</strong></p>",
    items: [
      { nombre: "FIV (Ac)", valor: "Negativo", unidad: "", referencia: "Negativo" },
      { nombre: "FeLV (Ag)", valor: "Negativo", unidad: "", referencia: "Negativo" },
    ],
    adjuntos: [],
  },
];
