const explicitScheme = /^([a-z][a-z0-9+.-]*):/i;

export function withDefaultScheme(value: string, scheme: "http:" | "https:") {
  const candidate = value.trim();
  const matchedScheme = candidate.match(explicitScheme)?.[1];
  const hasExplicitScheme = Boolean(matchedScheme && !matchedScheme.includes("."));
  return candidate && !hasExplicitScheme ? `${scheme}//${candidate}` : candidate;
}

export function withDefaultHttps(value: string) {
  return withDefaultScheme(value, "https:");
}
