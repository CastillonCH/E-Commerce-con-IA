import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// v_dataset_entrenamiento ya trae exactamente las columnas que pide la
// Fase 5 del T1 para reentrenar: producto_id, imagen_url, titulo,
// descripcion, marca, departamento, categoria, etiqueta (indice_clase).
const COLUMNAS = [
  "producto_id",
  "imagen_url",
  "titulo",
  "descripcion",
  "marca",
  "departamento",
  "categoria",
  "etiqueta",
] as const;

function escaparCampoCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export async function GET() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ detail: "No autorizado." }, { status: 403 });
  }

  const filas = await query<Record<(typeof COLUMNAS)[number], unknown>>(
    `SELECT * FROM v_dataset_entrenamiento ORDER BY producto_id`,
  );

  const lineas = [
    COLUMNAS.join(","),
    ...filas.map((fila) => COLUMNAS.map((columna) => escaparCampoCsv(fila[columna])).join(",")),
  ];

  return new NextResponse(lineas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dataset_entrenamiento_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
