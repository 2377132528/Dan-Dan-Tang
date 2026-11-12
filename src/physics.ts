import type { Player, Projectile, WeaponDef } from './types';
import type { Terrain } from './terrain';

export const GRAVITY = 920;
export const MAX_SPEED = 1120;
export const WIND_ACCEL = 11.8;
export const PHYSICS_STEP = 1 / 120;

export function shotVelocity(
  angle: number,
  power: number,
  facing: 1 | -1,
  speedScale = 1,
): { vx: number; vy: number } {
  const rad = (angle * Math.PI) / 180;
  const speed = MAX_SPEED * (power / 100) * speedScale;
  return {
    vx: Math.cos(rad) * speed * facing,
    vy: -Math.sin(rad) * speed,
  };
}

export function shotOrigin(player: Pick<Player, 'x' | 'y' | 'facing'>): { x: number; y: number } {
  return {
    x: player.x + player.facing * 24,
    y: player.y - 41,
  };
}

export function bodyCenter(player: Pick<Player, 'x' | 'y'>): { x: number; y: number } {
  return { x: player.x, y: player.y - 36 };
}

export function bodyRadius(): number {
  return 21;
}

export function projectileStep(p: Projectile, wind: number, dt: number): void {
  p.vy += GRAVITY * dt;
  p.vx += wind * WIND_ACCEL * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life += dt;
  p.trailTimer += dt;
  if (p.trailTimer >= 0.025) {
    p.trailTimer = 0;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 28) p.trail.shift();
  }
}

export interface SimulateOptions {
  x: number;
  y: number;
  angle: number;
  power: number;
  facing: 1 | -1;
  wind: number;
  speedScale?: number;
  terrain: Terrain;
  players?: Player[];
  ownerId?: number;
  step?: number;
  maxTime?: number;
  ignoreTerrain?: boolean;
}

export interface SimulateResult {
  points: { x: number; y: number }[];
  hitX: number;
  hitY: number;
  hitTerrain: boolean;
  hitPlayerId: number | null;
  time: number;
}

/**
 * Shared ballistic preview used by the aiming guide, the AI and the real shot.
 * It intentionally walks in small steps so the dotted line matches the shell.
 */
export function simulateTrajectory(options: SimulateOptions): SimulateResult {
  const {
    terrain,
    players = [],
    ownerId = -1,
    step = 1 / 60,
    maxTime = 6.5,
    ignoreTerrain = false,
    speedScale = 1,
  } = options;
  const vel = shotVelocity(options.angle, options.power, options.facing, speedScale);
  let x = options.x;
  let y = options.y;
  let vx = vel.vx;
  let vy = vel.vy;
  const points: { x: number; y: number }[] = [{ x, y }];
  let time = 0;
  let lastX = x;
  let lastY = y;

  while (time < maxTime) {
    vy += GRAVITY * step;
    vx += options.wind * WIND_ACCEL * step;
    x += vx * step;
    y += vy * step;
    time += step;

    // Player collision, checked before terrain so direct hits feel generous.
    if (time > 0.08) {
      for (const player of players) {
        if (!player.alive || player.id === ownerId) continue;
        const cx = player.x;
        const cy = player.y - 35;
        if (Math.hypot(x - cx, y - cy) < bodyRadius() + 3) {
          points.push({ x, y });
          return { points, hitX: x, hitY: y, hitTerrain: false, hitPlayerId: player.id, time };
        }
      }
    }

    if (!ignoreTerrain && y >= terrain.heightAt(x)) {
      points.push({ x, y });
      return { points, hitX: x, hitY: y, hitTerrain: true, hitPlayerId: null, time };
    }

    if (x < -260 || x > terrain.width + 260 || y > 980) {
      points.push({ x, y });
      return { points, hitX: x, hitY: y, hitTerrain: false, hitPlayerId: null, time };
    }

    if (points.length < 500) points.push({ x, y });
    lastX = x;
    lastY = y;
  }

  return {
    points,
    hitX: lastX,
    hitY: lastY,
    hitTerrain: false,
    hitPlayerId: null,
    time,
  };
}

export function weaponSpeed(weapon: WeaponDef): number {
  return weapon.speedScale;
}
