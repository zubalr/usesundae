import { WORKER_SECRET_HEADER } from "./worker-protocol";

export function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(provided);
  const right = encoder.encode(expected);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export function requestHasWorkerSecret(request: Request, expected: string): boolean {
  if (!expected) return false;
  return secretsMatch(request.headers.get(WORKER_SECRET_HEADER) ?? "", expected);
}
