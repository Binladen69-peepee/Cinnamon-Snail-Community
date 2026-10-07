/**
 * The arithmetic the dashboard's charts share. Pure, so it is tested without
 * drawing anything.
 */

/**
 * The step between four even gridlines, rounded to a number a person would
 * say out loud — 1, 2, 4, 5, 10, 20, 25, 40, 50… — and never a fraction, since
 * everything charted here is a count.
 */
export function niceStep(max: number): number {
  const raw = Math.max(max / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factors = magnitude === 1 ? [1, 2, 4, 5, 10] : [1, 2, 2.5, 4, 5, 10];
  for (const factor of factors) {
    if (magnitude * factor >= raw) return magnitude * factor;
  }
  return magnitude * 10;
}

/** The axis: zero and four even steps above it, the top one at or over `max`. */
export function axisTicks(max: number): number[] {
  const step = niceStep(max);
  return [0, 1, 2, 3, 4].map((index) => index * step);
}

export function formatTick(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

/**
 * A smooth line through the points that never overshoots them (monotone
 * cubic, Fritsch–Carlson): a quiet day stays at zero instead of dipping below
 * the axis, and a peak is not drawn higher than it was.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  const n = points.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1]![0] - points[i]![0]);
    slope.push((points[i + 1]![1] - points[i]![1]) / dx[i]!);
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i += 1) {
    const before = slope[i - 1]!;
    const after = slope[i]!;
    tangent.push(
      before * after <= 0
        ? 0
        : (3 * (dx[i - 1]! + dx[i]!)) /
            ((2 * dx[i]! + dx[i - 1]!) / before + (dx[i]! + 2 * dx[i - 1]!) / after),
    );
  }
  tangent.push(slope[n - 2]!);

  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const third = dx[i]! / 3;
    d += ` C${x0 + third},${y0 + tangent[i]! * third} ${x1 - third},${y1 - tangent[i + 1]! * third} ${x1},${y1}`;
  }
  return d;
}
