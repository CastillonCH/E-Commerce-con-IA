// Metas del T1 (Tabla 10) y lectura de las métricas guardadas en
// modelos_ia.metricas, separando VALIDACIÓN y PRUEBA.
//
// Convención (ml/registrar_metricas.py): val_accuracy / val_f1_macro y
// test_accuracy / test_f1_macro. Las filas anteriores usaban accuracy /
// f1_macro para validación y test_* para prueba: también se leen.

export type Conjunto = "val" | "test";

export interface MetricasConjunto {
  accuracy: number | null;
  f1: number | null;
}

export const NOMBRE_CONJUNTO: Record<Conjunto, string> = {
  val: "Validación",
  test: "Prueba (productos nuevos)",
};

const numero = (valor: unknown): number | null => (typeof valor === "number" ? valor : null);

export function metricasDe(metricas: Record<string, unknown>, conjunto: Conjunto): MetricasConjunto {
  if (conjunto === "val") {
    return {
      accuracy: numero(metricas.val_accuracy) ?? numero(metricas.accuracy),
      f1: numero(metricas.val_f1_macro) ?? numero(metricas.f1_macro),
    };
  }
  return { accuracy: numero(metricas.test_accuracy), f1: numero(metricas.test_f1_macro) };
}

export interface MetaT1 {
  etiqueta: string;
  /** null = sin datos para decidir; `todos` sirve para comparar con la línea base. */
  cumple: (m: MetricasConjunto, todos: Record<string, MetricasConjunto>) => boolean | null;
}

const OE1: MetaT1 = {
  etiqueta: "OE1: accuracy ≥ 80% y F1-macro ≥ 0,75",
  cumple: (m) => (m.accuracy === null || m.f1 === null ? null : m.accuracy >= 0.8 && m.f1 >= 0.75),
};

export const METAS_T1: Record<string, MetaT1> = {
  "cu1-resnet50-v1": OE1,
  "cu1-efficientnet-b0-v1": OE1,
  "cu2-beto-v1": {
    etiqueta: "OE2: F1-macro ≥ 0,85 y mayor que TF-IDF",
    cumple: (m, todos) => {
      if (m.f1 === null) return null;
      const base = todos["cu2-tfidf-logreg-v1"]?.f1 ?? null;
      return m.f1 >= 0.85 && (base === null || m.f1 > base);
    },
  },
};

export const SIN_META: Record<string, string> = {
  "cu2-tfidf-logreg-v1": "Línea base que BETO debe superar (sin meta propia)",
  "cu3-fusion-multimodal-v1": "Sin meta propia: es la sugerencia que usa la tienda",
};
