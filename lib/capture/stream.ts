/**
 * Read a fetch body without ever buffering more than the configured byte cap.
 * A provider-controlled chunk can still be allocated by the fetch runtime, but
 * we stop before appending it to our own buffer and cancel the stream.
 */
export async function readTextUpTo(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string | null> {
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel("body exceeds the capture size limit");
        } catch {
          // The response is already over the limit; cancellation is best effort.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
