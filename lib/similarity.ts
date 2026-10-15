// Distancia de Levenshtein normalizada a [0, 1]: 1 = nombres idénticos,
// 0 = completamente distintos. Usada para detectar productos de una misma
// marca publicados dos veces con nombres casi iguales (ver
// lib/data/products-repo.ts -> listPossibleDuplicates).
export function similarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1;

  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;
  if (longer.length === 0) return 1;

  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const costs: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let previous = costs[0];
    costs[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = costs[j];
      costs[j] =
        a[i - 1] === b[j - 1]
          ? previous
          : Math.min(previous, current, costs[j - 1]) + 1;
      previous = current;
    }
  }

  return costs[b.length];
}
