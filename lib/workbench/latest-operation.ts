export class LatestOperation {
  private current = 0;

  begin() {
    this.current += 1;
    return this.current;
  }

  assertCurrent(operation: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (operation !== this.current) {
      throw new DOMException("A newer visible action replaced this capture.", "AbortError");
    }
  }
}
