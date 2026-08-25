const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
] as const

export function circledNumber(n: number): string {
  if (n >= 1 && n <= CIRCLED_NUMBERS.length) {
    return CIRCLED_NUMBERS[n - 1]
  }
  return `(${n})`
}
