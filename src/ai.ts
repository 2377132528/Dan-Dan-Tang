import { WEAPONS } from './data';
import type { Game } from './game';
import { bodyCenter, shotOrigin, simulateTrajectory } from './physics';
import { clamp } from './math';
import type { Player, WeaponId } from './types';

interface ShotPlan {
  angle: number;
  power: number;
  facing: 1 | -1;
  weapon: WeaponId;
  targetId: number;
  distance: number;
}

interface SolveResult {
  angle: number;
  power: number;
  distance: number;
  facing: 1 | -1;
}

const AI_ERROR: Record<string, { angle: number; power: number }> = {
  tuantuan: { angle: 3.2, power: 4 },
  xiaoyou: { angle: 2.4, power: 3.5 },
  lanmei: { angle: 3.4, power: 4.2 },
  ayan: { angle: 4.2, power: 5 },
};

/**
 * Small, readable AI that physically simulates candidate shots instead of
 * cheating with a formula. It searches coarse and fine grids, then adds a
 * human-like error so every match is winnable but not trivial.
 */
export class AIController {
  private activeId = -1;
  private stage: 'idle' | 'wait' | 'move' | 'think' | 'aim' = 'idle';
  private stageTime = 0;
  private plan: ShotPlan | null = null;
  private aimStart = { angle: 45, power: 0 };
  private moveDir: -1 | 0 | 1 = 0;
  private moveDuration = 0;
  private fired = false;

  reset(): void {
    this.activeId = -1;
    this.stage = 'idle';
    this.stageTime = 0;
    this.plan = null;
    this.moveDir = 0;
    this.moveDuration = 0;
    this.fired = false;
  }

  update(game: Game, dt: number): void {
    if (game.mode !== 'solo' || game.phase !== 'aim') {
      if (this.stage !== 'idle') this.reset();
      return;
    }
    const player = game.activePlayer;
    if (!player.alive || !player.isAI) {
      if (this.stage !== 'idle') this.reset();
      return;
    }
    if (this.activeId !== player.id) {
      this.activeId = player.id;
      this.stage = 'wait';
      this.stageTime = 0;
      this.plan = null;
      this.fired = false;
      this.moveDir = 0;
      this.moveDuration = 0;
    }

    this.stageTime += dt;

    if (this.stage === 'wait') {
      if (this.stageTime > 0.55) {
        this.chooseMovement(game, player);
        this.stage = 'move';
        this.stageTime = 0;
      }
      return;
    }

    if (this.stage === 'move') {
      if (this.stageTime < this.moveDuration && player.fuel > 0) {
        game.moveWithAI(this.moveDir, dt);
      } else {
        if (this.moveDir !== 0) game.moveWithAI(0, dt);
        this.moveDir = 0;
        this.stage = 'think';
        this.stageTime = 0;
        game.stopMove(false);
      }
      return;
    }

    if (this.stage === 'think') {
      if (this.stageTime > 0.34) {
        this.plan = this.makePlan(game, player);
        this.aimStart = { angle: player.angle, power: player.power };
        this.stage = 'aim';
        this.stageTime = 0;
      }
      return;
    }

    if (this.stage === 'aim') {
      if (!this.plan) {
        this.stage = 'think';
        return;
      }
      const t = clamp(this.stageTime / 0.85, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const angle = this.aimStart.angle + (this.plan.angle - this.aimStart.angle) * eased;
      const power = this.aimStart.power + (this.plan.power - this.aimStart.power) * eased;
      game.setAim(angle, power, this.plan.facing, true);
      if ((player.ammo[this.plan.weapon] ?? 0) <= 0) {
        this.plan.weapon = 'standard';
      }
      game.selectWeapon(this.plan.weapon, true);
      if (t >= 1) {
        this.fired = true;
        game.fireByAI();
        this.stage = 'idle';
        this.stageTime = 0;
      }
    }
  }

  get isBusy(): boolean {
    return this.stage !== 'idle';
  }

  private chooseMovement(game: Game, player: Player): void {
    const target = game.getNearestEnemy(player);
    this.moveDir = 0;
    this.moveDuration = 0;
    if (!target || player.fuel <= 0) return;
    const dx = target.x - player.x;
    const distance = Math.abs(dx);
    const away = game.players[game.activeIndex]?.team === 'red' ? 1 : -1;

    if (distance > 1110) {
      this.moveDir = dx > 0 ? 1 : -1;
      this.moveDuration = 0.52;
    } else if (distance < 320) {
      this.moveDir = away === 1 ? -1 : 1;
      this.moveDuration = 0.38;
    } else if (Math.random() < 0.42) {
      this.moveDir = Math.random() < 0.5 ? -1 : 1;
      this.moveDuration = 0.3 + Math.random() * 0.22;
    }
    if (this.moveDir === 0) this.moveDuration = 0;
  }

  private makePlan(game: Game, player: Player): ShotPlan {
    const enemies = game.getAliveEnemies(player);
    const allies = game.getAliveAllies(player);
    if (!enemies.length) {
      return { angle: 45, power: 60, facing: player.facing, weapon: 'standard', targetId: -1, distance: 0 };
    }

    let weapon: WeaponId = 'standard';
    let target: Player | null = null;

    const hurtAlly = allies
      .filter((ally) => ally.hp / ally.maxHp < 0.46)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (player.ammo.heal > 0 && hurtAlly && Math.random() < 0.62) {
      weapon = 'heal';
      target = hurtAlly;
    } else {
      const nearest = game.getNearestEnemy(player);
      const sortedByHp = [...enemies].sort((a, b) => a.hp - b.hp);
      target = nearest;
      if (sortedByHp[0] && sortedByHp[0].hp < 32 && Math.random() < 0.55) {
        target = sortedByHp[0];
      }
      if (!target) target = enemies[0];

      const clustered = enemies.some((enemy) => {
        return enemies.some(
          (other) => other.id !== enemy.id && Math.abs(other.x - enemy.x) < 150,
        );
      });
      if (player.ammo.triple > 0 && clustered && Math.random() < 0.62) {
        weapon = 'triple';
      } else if (player.ammo.heavy > 0 && Math.random() < 0.4) {
        weapon = 'heavy';
      }
    }

    if (!target) target = enemies[0];
    const facing: 1 | -1 = target.x >= player.x ? 1 : -1;
    const solved = this.solve(game, player, target, weapon, facing);

    // If a limited heavy/triple shot has a terrible solution, save it.
    if (solved.distance > WEAPONS[weapon].radius * 2.5 && weapon !== 'standard') {
      const fallback = this.solve(game, player, target, 'standard', facing);
      if (fallback.distance < solved.distance) {
        return {
          angle: fallback.angle,
          power: fallback.power,
          facing,
          weapon: 'standard',
          targetId: target.id,
          distance: fallback.distance,
        };
      }
    }

    const error = AI_ERROR[player.charId] ?? { angle: 3.4, power: 4.2 };
    const angleError = (Math.random() * 2 - 1) * error.angle;
    const powerError = (Math.random() * 2 - 1) * error.power;
    return {
      angle: clamp(solved.angle + angleError, -8, 88),
      power: clamp(solved.power + powerError, 18, 100),
      facing,
      weapon,
      targetId: target.id,
      distance: solved.distance,
    };
  }

  private solve(
    game: Game,
    player: Player,
    target: Player,
    weapon: WeaponId,
    facing: 1 | -1,
  ): SolveResult {
    const center = bodyCenter(target);
    const origin = shotOrigin(player);
    const weaponDef = WEAPONS[weapon];
    let best: SolveResult = { angle: 45, power: 65, distance: Infinity, facing };
    const evaluate = (angle: number, power: number): void => {
      const result = simulateTrajectory({
        x: origin.x,
        y: origin.y,
        angle,
        power,
        facing,
        wind: game.wind,
        speedScale: weaponDef.speedScale,
        terrain: game.terrain,
        players: game.players,
        ownerId: player.id,
        step: 1 / 26,
        maxTime: 8,
      });
      const d = Math.hypot(center.x - result.hitX, center.y - result.hitY);
      if (d < best.distance) {
        best = { angle, power, distance: d, facing };
      }
    };

    for (let angle = 16; angle <= 82; angle += 4) {
      for (let power = 28; power <= 100; power += 5) {
        evaluate(angle, power);
      }
    }
    const coarseAngle = best.angle;
    const coarsePower = best.power;
    for (let angle = coarseAngle - 4; angle <= coarseAngle + 4; angle += 1) {
      for (let power = coarsePower - 5; power <= coarsePower + 5; power += 1) {
        evaluate(clamp(angle, 8, 89), clamp(power, 20, 100));
      }
    }
    return best;
  }
}
