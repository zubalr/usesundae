type Pinned<T extends { rect: { x: number; y: number } | null }> = T & {
  rect: NonNullable<T["rect"]>;
};

/**
 * A pin carries the number the finding has on the board, not its position on
 * screen. Sorting pins by geometry made pin 3 point at list item 5, so a reader
 * matched the wrong finding to the wrong element.
 */
export function findingsWithBoardNumbers<T extends { rect: { x: number; y: number } | null }>(
  findings: readonly T[],
): Array<Pinned<T> & { boardNumber: number }> {
  return findings.flatMap((finding, index) =>
    finding.rect === null ? [] : [{ ...(finding as Pinned<T>), boardNumber: index + 1 }],
  );
}
