import { describe, expect, it } from "vitest";
import { METAS_T1, metricasDe } from "@/lib/metas-t1";

describe("metas del T1: validación y prueba por separado", () => {
  it("lee la convención nueva (val_*, test_*) y la anterior (accuracy = validación)", () => {
    const nueva = { val_accuracy: 0.74, val_f1_macro: 0.72, test_accuracy: 0.73, test_f1_macro: 0.69 };
    expect(metricasDe(nueva, "val")).toEqual({ accuracy: 0.74, f1: 0.72 });
    expect(metricasDe(nueva, "test")).toEqual({ accuracy: 0.73, f1: 0.69 });

    const anterior = { accuracy: 0.814, f1_macro: 0.763, test_accuracy: 0.687, test_f1_macro: 0.661 };
    expect(metricasDe(anterior, "val")).toEqual({ accuracy: 0.814, f1: 0.763 });
    expect(metricasDe(anterior, "test")).toEqual({ accuracy: 0.687, f1: 0.661 });
    expect(metricasDe({ accuracy: 0.8 }, "test")).toEqual({ accuracy: null, f1: null });
  });

  it("OE1 exige accuracy y F1 a la vez; sin datos no decide", () => {
    const oe1 = METAS_T1["cu1-resnet50-v1"];
    expect(oe1.cumple({ accuracy: 0.81, f1: 0.76 }, {})).toBe(true);
    expect(oe1.cumple({ accuracy: 0.81, f1: 0.74 }, {})).toBe(false);
    expect(oe1.cumple({ accuracy: null, f1: null }, {})).toBeNull();
  });

  it("OE2: BETO debe llegar a 0,85 y además superar a TF-IDF", () => {
    const oe2 = METAS_T1["cu2-beto-v1"];
    const tfidf = { "cu2-tfidf-logreg-v1": { accuracy: 0.9, f1: 0.88 } };
    expect(oe2.cumple({ accuracy: 0.9, f1: 0.86 }, tfidf)).toBe(false);
    expect(oe2.cumple({ accuracy: 0.9, f1: 0.89 }, tfidf)).toBe(true);
    expect(oe2.cumple({ accuracy: 0.9, f1: 0.86 }, {})).toBe(true);
  });
});
