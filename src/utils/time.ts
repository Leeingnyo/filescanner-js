export function nowInstant(): string {
  return new Date().toISOString();
}

export function formatInstant(date: Date): string {
  return date.toISOString();
}

export function parseInstant(value: string): Date {
  return new Date(value);
}
