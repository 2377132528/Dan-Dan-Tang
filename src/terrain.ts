import { clamp, Rng } from './math';

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 720;
export const TERRAIN_STEP = 2;
export const TERRAIN_MIN = 420;
export const TERRAIN_MAX = 880;

export class Terrain {
  readonly width = WORLD_WIDTH;
  readonly step = TERRAIN_STEP;
  heights: Float32Array;
  readonly count: number;
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.count = Math.floor(this.width / this.step) + 1;
    this.heights = new Float32Array(this.count);
    this.generate(seed);
  }

  private generate(seed: number): void {
    const rng = new Rng(seed ^ 0x9e3779b9);
    const p1 = rng.float(0, Math.PI * 2);
    const p2 = rng.float(0, Math.PI * 2);
    const p3 = rng.float(0, Math.PI * 2);
    const p4 = rng.float(0, Math.PI * 2);
    const base = rng.float(552, 585);
    const hillLeft = rng.float(80, 130);
    const hillRight = rng.float(70, 120);
    const leftX = rng.float(300, 400);
    const rightX = rng.float(1570, 1690);

    for (let i = 0; i < this.count; i += 1) {
      const x = i * this.step;
      const t = x / this.width;
      let y = base;
      y += 48 * Math.sin(x * 0.0034 + p1);
      y += 27 * Math.sin(x * 0.0077 + p2);
      y += 13 * Math.sin(x * 0.016 + p3);
      y += 7 * Math.sin(x * 0.035 + p4);

      // Raised home hills for both teams.
      y -= hillLeft * Math.exp(-Math.pow((x - leftX) / 205, 2));
      y -= hillRight * Math.exp(-Math.pow((x - rightX) / 220, 2));

      // A soft valley in the middle makes the map easier to read.
      y += 34 * Math.exp(-Math.pow((x - this.width * 0.5) / 280, 2));

      // Gentle rim at the far edges.
      const edge = Math.min(x, this.width - x);
      if (edge < 110) {
        y -= (110 - edge) * 0.55;
      }

      y += rng.float(-2.4, 2.4);
      this.heights[i] = clamp(y, TERRAIN_MIN, 700);

      // Keep the very beginning/end continuous.
      if (i === 0) {
        this.heights[i] = clamp(y, TERRAIN_MIN, 700);
      }
    }

    // A tiny smoothing pass to remove single-sample spikes.
    const copy = this.heights.slice();
    for (let i = 1; i < this.count - 1; i += 1) {
      this.heights[i] = copy[i - 1] * 0.2 + copy[i] * 0.6 + copy[i + 1] * 0.2;
    }
  }

  heightAt(x: number): number {
    if (x <= 0) return this.heights[0];
    if (x >= this.width) return this.heights[this.count - 1];
    const index = x / this.step;
    const i = Math.floor(index);
    const f = index - i;
    return this.heights[i] * (1 - f) + this.heights[i + 1] * f;
  }

  slopeAt(x: number): number {
    const a = this.heightAt(x - 8);
    const b = this.heightAt(x + 8);
    return (b - a) / 16;
  }

  carve(cx: number, cy: number, radius: number): void {
    const from = Math.max(0, Math.floor((cx - radius) / this.step));
    const to = Math.min(this.count - 1, Math.ceil((cx + radius) / this.step));
    for (let i = from; i <= to; i += 1) {
      const x = i * this.step;
      const dx = x - cx;
      const inner = radius * radius - dx * dx;
      if (inner <= 0) continue;
      const bottom = cy + Math.sqrt(inner);
      if (bottom > this.heights[i]) {
        // A soft rim near the edge; the center is allowed to fall away.
        const rim = 1 - Math.pow(Math.abs(dx) / radius, 3) * 0.16;
        const depth = (bottom - this.heights[i]) * rim;
        this.heights[i] = Math.min(TERRAIN_MAX, this.heights[i] + depth);
      }
    }
  }

  toArray(): number[] {
    const result: number[] = new Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      result[i] = Math.round(this.heights[i] * 100) / 100;
    }
    return result;
  }

  fromArray(values: number[]): void {
    const n = Math.min(values.length, this.count);
    for (let i = 0; i < n; i += 1) {
      const value = Number(values[i]);
      if (Number.isFinite(value)) {
        this.heights[i] = clamp(value, TERRAIN_MIN, TERRAIN_MAX);
      }
    }
  }

  randomSpots(rng: Rng, count: number): { x: number; y: number }[] {
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = rng.float(30, this.width - 30);
      spots.push({ x, y: this.heightAt(x) });
    }
    return spots;
  }
}
