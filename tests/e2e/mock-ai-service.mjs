// Servidor mock del microservicio de IA para los tests E2E — reemplaza a
// ai-service real (Python) para no depender de un entorno con PyTorch
// instalado solo para correr Playwright. Responde siempre en modo "demo",
// con una forma de respuesta idéntica a ai-service/app/esquemas.py —
// alcanza para probar la integración del lado de Next.js (F4.10: "el
// servicio de IA en modo demo se levanta en webServer o se reemplaza por
// un servidor mock").
import { createServer } from "node:http";

const PUERTO = Number(process.env.MOCK_AI_PORT ?? 8099);

const RESPUESTA_CLASIFICAR = {
  modo: "demo",
  latencia_ms: 5,
  resultado: {
    indice_clase: 0,
    categoria: "Audio y audífonos",
    confianza: 0.4,
    top_k: [
      { indice_clase: 0, categoria: "Audio y audífonos", prob: 0.4 },
      { indice_clase: 1, categoria: "Laptops y computadoras", prob: 0.2 },
    ],
  },
  por_modelo: [
    {
      codigo_modelo: "demo",
      tipo: "texto",
      indice_clase: 0,
      categoria: "Audio y audífonos",
      confianza: 0.4,
      top_k: [{ indice_clase: 0, categoria: "Audio y audífonos", prob: 0.4 }],
    },
  ],
  embeddings: [],
};

// Permite que un test simule el servicio caído (F4.10: "un caso en que el
// servicio está caído y el producto queda pendiente") sin reiniciar el
// webServer — POST /mock-control/caida {"caida": true|false}.
let forzarCaida = false;

const servidor = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ estado: "ok", modo: "demo", modelos_cargados: [] }));
    return;
  }

  if (req.method === "POST" && req.url === "/mock-control/caida") {
    let cuerpo = "";
    req.on("data", (trozo) => (cuerpo += trozo));
    req.on("end", () => {
      try {
        forzarCaida = Boolean(JSON.parse(cuerpo).caida);
      } catch {
        // ignorar cuerpo mal formado
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === "POST" && req.url === "/clasificar") {
    req.resume();
    req.on("end", () => {
      if (forzarCaida) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Servicio caído a propósito (prueba E2E)." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(RESPUESTA_CLASIFICAR));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

servidor.listen(PUERTO, () => {
  console.log(`mock-ai-service escuchando en http://localhost:${PUERTO}`);
});
