// 背景色(HEX)に対して読みやすい文字色(黒/白)を返す
export function readableTextColor(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#1F2937" : "#FFFFFF";
}
