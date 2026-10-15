/** Keep short answers prominent, without making long expressions illegible. */
export function mathFontSize(width: number, height: number, availableWidth: number, availableHeight: number, preferred = 48, minimum = 24): number {
  if (![width, height, availableWidth, availableHeight].every(Number.isFinite) || width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return preferred;
  return Math.max(minimum, Math.min(preferred, preferred * Math.min(availableWidth / width, availableHeight / height)));
}
