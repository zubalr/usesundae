type Pinned<T extends { rect: { x: number; y: number } | null }> = T & {
  rect: NonNullable<T["rect"]>;
};

export function findingsInReadingOrder<T extends { rect: { x: number; y: number } | null }>(
  findings: readonly T[],
): Array<Pinned<T>> {
  return findings
    .filter((finding): finding is Pinned<T> => finding.rect !== null)
    .toSorted((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x);
}
