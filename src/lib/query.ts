export function letterCount(value: string): number {
  return value.match(/\p{L}/gu)?.length ?? 0;
}

export function tooFewLetters(value: string): boolean {
  return letterCount(value) < 2;
}
