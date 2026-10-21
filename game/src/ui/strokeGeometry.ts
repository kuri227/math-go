/** A tap (including repeated identical pointer samples) must render as ink. */
export function isPointStroke(points: readonly { x: number; y: number }[]): boolean {
  const first = points[0];
  return !!first && points.every(point => point.x === first.x && point.y === first.y);
}
