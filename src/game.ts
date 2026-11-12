import { CHARACTERS, ORDER_1V1, ORDER_2V2, WEAPONS } from './data';
import { Rng, clamp, dist } from './math';
import {
  GRAVITY,
  PHYSICS_STEP,
  bodyCenter,
  bodyRadius,
  projectileStep,
  shotOrigin,
  shotVelocity,
  simulateTrajectory,
  type SimulateResult,
} from './physics';
import { TERRAIN_MAX, Terrain } from './terrain';
import type {
  ExplosionInfo,
  GameEvent,
  GameMode,
  GameOptions,
  Phase,
  Player,
  PlayerStats,
  Projectile,
  Shot,
  Snapshot,
  Team,
  WeaponId,
} from './types';

const BODY_HIT_RADIUS = bodyRadius();
const STANDARD_AMMO = 999;

export class Game {
  readonly mode: GameMode;
  readonly seed: number;
  readonly localIndex: number;
  readonly onlineRole: 'host' | 'guest' | null;
  readonly turnTime: number;
  readonly terrain: Terrain;
  readonly players: Player[];
  readonly order: number[];

  phase: Phase = 'aim';
  activeIndex = 0;
  round = 1;
  wind = 0;
  timer = 30;
  winner: Team | null = null;
  projectiles: Projectile[] = [];
  onEvent: ((event: GameEvent) => void) | null = null;

  private rng: Rng;
  private projectileSeq = 1;
  private moveDir: -1 | 0 | 1 = 0;
  private physicsAcc = 0;
  private settleTimer = 0;
  private gameOverEmitted = false;
  private timeoutEmitted = false;

  constructor(options: GameOptions) {
    this.mode = options.mode;
    this.seed = options.seed >>> 0;
    this.localIndex = options.localIndex;
    this.onlineRole =
      options.mode === 'online' ? (options.localIndex === 0 ? 'host' : 'guest') : null;
    this.turnTime = options.turnTime ?? (options.mode === 'online' ? 35 : 30);
    this.terrain = new Terrain(this.seed);
    this.rng = new Rng((this.seed ^ 0x85ebca6b) >>> 0);

    const hasFour = options.mode !== 'online';
    const defaultChars = hasFour
      ? ['tuantuan', 'xiaoyou', 'lanmei', 'ayan']
      : ['tuantuan', 'lanmei'];
    const chars = options.characters ?? defaultChars;
    const names = options.names ?? [];
    const maxHp = options.maxHp ?? (options.mode === 'online' ? 120 : 100);
    const xs = hasFour ? [345, 485, 1660, 1520] : [405, 1595];
    const teamOf = (index: number): Team =>
      hasFour ? (index < 2 ? 'red' : 'blue') : index === 0 ? 'red' : 'blue';

    this.players = chars.map((charId, index) => {
      const character = CHARACTERS[charId] ?? CHARACTERS.tuantuan;
      const x = xs[index] ?? 400 + index * 300;
      const team = teamOf(index);
      const ammo: Record<WeaponId, number> = {
        standard: STANDARD_AMMO,
        triple: WEAPONS.triple.ammo ?? 0,
        heavy: WEAPONS.heavy.ammo ?? 0,
        heal: WEAPONS.heal.ammo ?? 0,
      };
      return {
        id: index,
        charId: character.id,
        name: names[index]?.trim() || character.name,
        team,
        isAI: options.mode === 'solo' && index !== 0,
        local: options.mode === 'local' || index === options.localIndex,
        x,
        y: this.terrain.heightAt(x),
        vy: 0,
        onGround: true,
        fallStart: this.terrain.heightAt(x),
        hp: maxHp,
        maxHp,
        fuel: 100,
        alive: true,
        angle: 45,
        power: 65,
        facing: team === 'red' ? 1 : -1,
        weapon: 'standard',
        ammo,
        damageDealt: 0,
        shots: 0,
        hits: 0,
        falls: 0,
        kills: 0,
        moving: false,
      } satisfies Player;
    });

    this.order = hasFour ? [...ORDER_2V2] : [...ORDER_1V1];
    this.activeIndex = this.order[0];
    this.wind = this.rollWind();
    this.timer = this.turnTime;
  }

  get activePlayer(): Player {
    return this.players[this.activeIndex];
  }

  get isOnline(): boolean {
    return this.mode === 'online';
  }

  get isHost(): boolean {
    return this.mode === 'online' && this.localIndex === 0;
  }

  get isGuest(): boolean {
    return this.mode === 'online' && this.localIndex === 1;
  }

  start(): void {
    this.emit({ type: 'wind', value: this.wind });
    this.beginTurn(this.activeIndex, false, true);
  }

  private emit(event: GameEvent): void {
    this.onEvent?.(event);
  }

  private rollWind(): number {
    const value = this.rng.float(-9.6, 9.6);
    return Math.round(value * 10) / 10;
  }

  private teamAlive(team: Team): boolean {
    return this.players.some((player) => player.team === team && player.alive);
  }

  private getPlayer(id: number): Player | undefined {
    return this.players.find((player) => player.id === id);
  }

  canLocalControl(player = this.activePlayer): boolean {
    if (!player.alive || this.phase !== 'aim') return false;
    if (this.mode === 'local') return !player.isAI;
    return !player.isAI && player.id === this.localIndex;
  }

  private canAIControl(player: Player): boolean {
    return player.isAI && player.id === this.activeIndex && this.phase === 'aim';
  }

  beginTurn(playerId: number, randomizeWind = true, announce = true): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    this.activeIndex = playerId;
    player.fuel = 100;
    player.moving = false;
    this.moveDir = 0;
    this.timer = this.turnTime;
    this.phase = 'aim';
    this.timeoutEmitted = false;
    if (randomizeWind) {
      this.wind = this.rollWind();
      this.emit({ type: 'wind', value: this.wind });
    }
    if (announce) {
      this.emit({
        type: 'turn',
        playerId,
        player,
        round: this.round,
      });
    }
  }

  setAim(angle: number, power: number, facing: 1 | -1, force = false): void {
    const player = this.activePlayer;
    if (!force && !this.canLocalControl(player)) return;
    if (this.phase !== 'aim') return;
    player.angle = clamp(angle, -15, 90);
    player.power = clamp(power, 0, 100);
    player.facing = facing;
  }

  selectWeapon(weapon: WeaponId, force = false): boolean {
    const player = this.activePlayer;
    if (!force && !this.canLocalControl(player)) return false;
    if (this.phase !== 'aim') return false;
    if ((player.ammo[weapon] ?? 0) <= 0) return false;
    player.weapon = weapon;
    return true;
  }

  setMoveDirection(direction: -1 | 0 | 1): void {
    const player = this.activePlayer;
    if (!this.canLocalControl(player)) {
      this.moveDir = 0;
      return;
    }
    if (this.phase !== 'aim' || (direction !== 0 && player.fuel <= 0)) {
      this.moveDir = 0;
      player.moving = false;
      return;
    }
    if (direction !== 0 && this.moveDir === 0) {
      this.emit({ type: 'moveStart', playerId: player.id });
    }
    if (direction === 0 && this.moveDir !== 0) {
      this.emit({ type: 'moveEnd', playerId: player.id, x: player.x, y: player.y });
    }
    this.moveDir = direction;
    player.moving = direction !== 0;
  }

  stopMove(announce = true): void {
    if (this.moveDir !== 0) {
      this.moveDir = 0;
      this.activePlayer.moving = false;
      if (announce) {
        this.emit({
          type: 'moveEnd',
          playerId: this.activePlayer.id,
          x: this.activePlayer.x,
          y: this.activePlayer.y,
        });
      }
    }
  }

  moveWithAI(direction: -1 | 0 | 1, dt: number): void {
    const player = this.activePlayer;
    if (!this.canAIControl(player)) return;
    if (direction === 0) {
      if (player.moving) {
        player.moving = false;
        this.emit({ type: 'moveEnd', playerId: player.id, x: player.x, y: player.y });
      }
      return;
    }
    this.movePlayer(player, direction, dt);
    if (!player.moving) {
      this.emit({ type: 'moveEnd', playerId: player.id, x: player.x, y: player.y });
    }
  }

  private movePlayer(player: Player, direction: -1 | 0 | 1, dt: number): void {
    if (direction === 0 || player.fuel <= 0 || !player.alive) {
      player.moving = false;
      return;
    }
    player.moving = true;
    player.fuel = clamp(player.fuel - 36 * dt, 0, 100);
    player.x = clamp(player.x + direction * 92 * dt, 48, this.terrain.width - 48);
    player.y = this.terrain.heightAt(player.x);
    player.facing = direction;
    if (player.fuel <= 0) {
      player.moving = false;
      this.emit({ type: 'moveEnd', playerId: player.id, x: player.x, y: player.y });
    }
  }

  update(dt: number): void {
    if (this.phase === 'gameover') {
      this.updateFalling(dt);
      return;
    }

    if (this.phase === 'aim') {
      if (this.moveDir !== 0 && this.canLocalControl()) {
        if (this.activePlayer.fuel <= 0) {
          this.moveDir = 0;
          this.activePlayer.moving = false;
        } else {
          this.movePlayer(this.activePlayer, this.moveDir, dt);
        }
      }
      this.updateTimer(dt);
      this.updateFalling(dt);
      return;
    }

    if (this.phase === 'flying') {
      this.updateFalling(dt);
      this.updateProjectiles(dt);
      return;
    }

    if (this.phase === 'resolving') {
      this.updateFalling(dt);
      this.settleTimer -= dt;
      if (this.settleTimer <= 0) {
        this.finishTurn();
      }
      return;
    }
  }

  private updateTimer(dt: number): void {
    const player = this.activePlayer;
    if (!player.alive || player.isAI) return;
    const isLocallyTimed =
      this.mode === 'local' || player.id === this.localIndex;
    if (!isLocallyTimed) return;
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer <= 0 && !this.timeoutEmitted) {
      this.timeoutEmitted = true;
      this.emit({ type: 'timeout', playerId: player.id });
      this.stopMove(false);
      if (this.canLocalControl(player)) {
        if (player.power < 18) player.power = 58;
        this.fireCurrent(true);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    this.physicsAcc = Math.min(this.physicsAcc + dt, 0.2);
    let guard = 0;
    while (this.physicsAcc >= PHYSICS_STEP && guard < 24) {
      this.physicsAcc -= PHYSICS_STEP;
      guard += 1;
      for (const projectile of this.projectiles) {
        if (projectile.dead) continue;
        projectileStep(projectile, this.wind, PHYSICS_STEP);

        // Character collision.
        if (projectile.life > 0.09) {
          let hitPlayer: Player | null = null;
          for (const player of this.players) {
            if (!player.alive) continue;
            if (player.id === projectile.ownerId && projectile.life < 0.16) continue;
            const center = bodyCenter(player);
            if (dist(projectile.x, projectile.y, center.x, center.y) < BODY_HIT_RADIUS + 3) {
              hitPlayer = player;
              break;
            }
          }
          if (hitPlayer) {
            projectile.dead = true;
            this.explode(projectile.x, projectile.y, projectile.weapon, projectile.ownerId, true);
            continue;
          }
        }

        // Terrain collision.
        if (projectile.y >= this.terrain.heightAt(projectile.x)) {
          projectile.dead = true;
          this.explode(projectile.x, projectile.y - 2, projectile.weapon, projectile.ownerId, false);
          continue;
        }

        if (
          projectile.x < -240 ||
          projectile.x > this.terrain.width + 240 ||
          projectile.y > 960
        ) {
          projectile.dead = true;
        }
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
    if (this.projectiles.length === 0) {
      this.phase = 'resolving';
      this.settleTimer = this.winner ? 1.4 : 1.05;
    }
  }

  private updateFalling(dt: number): void {
    for (const player of this.players) {
      if (!player.alive) continue;
      const ground = this.terrain.heightAt(player.x);
      if (player.y < ground - 1.2) {
        if (player.onGround) {
          player.onGround = false;
          player.vy = 0;
          player.fallStart = player.y;
        }
        player.vy += GRAVITY * 1.35 * dt;
        player.y += player.vy * dt;
        if (player.y >= ground) {
          this.landPlayer(player, ground);
        }
        if (player.y > 900) {
          this.killPlayer(player, null, 'fall');
        }
      } else {
        player.y = ground;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  private landPlayer(player: Player, ground: number): void {
    const fall = ground - player.fallStart;
    player.y = ground;
    player.vy = 0;
    player.onGround = true;
    if (fall > 92 && player.alive) {
      player.falls += 1;
      const damage = Math.round(clamp((fall - 80) * 0.16, 4, 26));
      this.applyDamage(player, damage, null, 'fall', false);
    }
  }

  fireCurrent(auto = false): void {
    const player = this.activePlayer;
    if (this.phase !== 'aim' || !player.alive) return;
    if (!auto && !this.canLocalControl(player)) return;
    if (!auto && this.mode === 'online' && player.id !== this.localIndex) return;
    this.stopMove(false);
    let weapon = player.weapon;
    if ((player.ammo[weapon] ?? 0) <= 0) {
      weapon = 'standard';
      player.weapon = 'standard';
    }
    const power = player.power < 8 ? 58 : player.power;
    player.power = power;
    const origin = shotOrigin(player);
    const shot: Shot = {
      angle: player.angle,
      power,
      facing: player.facing,
      weapon,
      x: origin.x,
      y: origin.y,
    };
    this.launchShot(player, shot);
  }

  fireByAI(): void {
    this.fireCurrent(true);
  }

  remoteFire(playerId: number, shot: Shot): void {
    if (!this.isOnline) return;
    const player = this.getPlayer(playerId);
    if (!player || !player.alive) return;
    if (this.phase !== 'aim' || player.id !== this.activeIndex) return;
    if ((player.ammo[shot.weapon] ?? 0) <= 0) return;
    this.stopMove(false);
    player.angle = clamp(shot.angle, -15, 90);
    player.power = clamp(shot.power, 0, 100);
    player.facing = shot.facing;
    player.weapon = shot.weapon;
    this.launchShot(player, {
      ...shot,
      angle: player.angle,
      power: player.power,
      x: shotOrigin(player).x,
      y: shotOrigin(player).y,
    });
  }

  private launchShot(player: Player, shot: Shot): void {
    const weapon = WEAPONS[shot.weapon];
    const ammo = player.ammo[shot.weapon];
    if (ammo !== undefined && ammo <= 0) return;
    if (ammo !== null && ammo !== undefined && ammo < STANDARD_AMMO) {
      player.ammo[shot.weapon] = Math.max(0, ammo - 1);
    }
    player.shots += 1;
    this.phase = 'flying';
    this.timer = this.turnTime;
    this.physicsAcc = 0;

    const count = weapon.count;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * weapon.spread;
      const angle = clamp(shot.angle + offset, -30, 90);
      const vel = shotVelocity(angle, shot.power, shot.facing, weapon.speedScale);
      this.projectiles.push({
        id: this.projectileSeq++,
        ownerId: player.id,
        weapon: shot.weapon,
        x: shot.x,
        y: shot.y - (count > 1 ? Math.abs(offset) * 0.18 : 0),
        vx: vel.vx,
        vy: vel.vy,
        life: 0,
        trail: [],
        trailTimer: 0,
        dead: false,
      });
    }

    this.emit({ type: 'fire', playerId: player.id, shot });
  }

  private explode(
    x: number,
    y: number,
    weaponId: WeaponId,
    ownerId: number,
    directHit: boolean,
  ): void {
    const weapon = WEAPONS[weaponId];
    const owner = this.getPlayer(ownerId);
    if (!owner) return;
    const info: ExplosionInfo = {
      x,
      y,
      radius: weapon.radius,
      weapon: weaponId,
      playerId: ownerId,
      team: owner.team,
    };
    this.emit({ type: 'explosion', info });

    if (weapon.heal && weapon.heal > 0) {
      this.emit({ type: 'heal', x, y, radius: weapon.radius, playerId: ownerId, team: owner.team });
      for (const player of this.players) {
        if (!player.alive || player.team !== owner.team) continue;
        const center = bodyCenter(player);
        const d = dist(x, y, center.x, center.y);
        if (d <= weapon.radius + 12) {
          const falloff = 1 - 0.35 * clamp(d / weapon.radius, 0, 1);
          const amount = Math.round(weapon.heal * falloff);
          const before = player.hp;
          player.hp = clamp(player.hp + amount, 0, player.maxHp);
          const healed = player.hp - before;
          if (healed > 0) {
            this.emit({
              type: 'message',
              text: `${player.name} 恢复了 ${healed} 点生命`,
            });
          }
        }
      }
      return;
    }

    // Explosions on a character still tear up the ground beneath them, so
    // direct hits leave the same satisfying crater as a ground hit.
    const carveY = Math.max(y, this.terrain.heightAt(x) - 12);
    this.terrain.carve(x, carveY, weapon.radius);
    for (const player of this.players) {
      if (!player.alive) continue;
      const center = bodyCenter(player);
      const d = dist(x, y, center.x, center.y);
      if (d > weapon.radius + 14) continue;
      const falloff = 1 - 0.58 * clamp(d / weapon.radius, 0, 1);
      let amount = weapon.damage * falloff;
      if (player.team === owner.team) {
        amount *= player.id === owner.id ? 0.7 : 0.56;
      }
      if (directHit && player.id !== owner.id) {
        amount *= 1.08;
      }
      const damage = Math.max(2, Math.round(amount));
      const actual = this.applyDamage(
        player,
        damage,
        owner,
        'damage',
        player.team !== owner.team,
      );
      if (player.team !== owner.team) {
        owner.hits += 1;
        owner.damageDealt += actual;
      }
      // A tiny nudge makes the physical comedy land.
      if (player.alive) {
        const kick = ((player.x >= x ? 1 : -1) * (1 - d / (weapon.radius + 14)) * 14) | 0;
        player.x = clamp(player.x + kick, 40, this.terrain.width - 40);
        const ground = this.terrain.heightAt(player.x);
        if (player.y < ground - 1) player.onGround = false;
      }
    }
  }

  private applyDamage(
    player: Player,
    amount: number,
    source: Player | null,
    kind: 'damage' | 'fall',
    countKill: boolean,
  ): number {
    if (!player.alive || amount <= 0) return 0;
    const actual = Math.min(player.hp, Math.round(amount));
    player.hp = Math.max(0, player.hp - actual);
    const center = bodyCenter(player);
    this.emit({
      type: 'damage',
      playerId: player.id,
      amount: actual,
      x: center.x,
      y: center.y - 24,
      kind,
      sourceId: source?.id,
    });
    if (player.hp <= 0) {
      if (countKill && source && source.team !== player.team) source.kills += 1;
      this.killPlayer(player, source, kind);
    }
    return actual;
  }

  private killPlayer(player: Player, source: Player | null, reason: 'damage' | 'fall'): void {
    if (!player.alive) return;
    player.alive = false;
    player.hp = 0;
    player.moving = false;
    this.emit({
      type: 'death',
      playerId: player.id,
      x: player.x,
      y: player.y,
      team: player.team,
      reason,
    });
    if (source && source.team !== player.team) {
      this.emit({ type: 'message', text: `${source.name} 击倒了 ${player.name}！` });
    } else if (reason === 'fall') {
      this.emit({ type: 'message', text: `${player.name} 掉进了深渊…` });
    }
    this.checkWinner();
  }

  private checkWinner(): Team | null {
    const red = this.teamAlive('red');
    const blue = this.teamAlive('blue');
    if (!red && !blue) return null;
    if (!red) return 'blue';
    if (!blue) return 'red';
    return null;
  }

  private updateWinner(): void {
    const red = this.teamAlive('red');
    const blue = this.teamAlive('blue');
    if (!red || !blue) {
      this.winner = !red && !blue ? null : !red ? 'blue' : 'red';
    }
  }

  private finishTurn(): void {
    const player = this.activePlayer;
    this.projectiles = [];
    this.moveDir = 0;
    player.moving = false;
    this.updateWinner();
    this.emit({ type: 'turnEnd', playerId: player.id });

    if (this.winner || !this.teamAlive('red') || !this.teamAlive('blue')) {
      this.endGame(this.winner);
      return;
    }

    if (this.isOnline && this.localIndex !== 0) {
      this.phase = 'waiting';
      this.emit({ type: 'waiting', reason: 'sync' });
      return;
    }

    this.advanceTurn();
  }

  private advanceTurn(): void {
    const currentOrderIndex = this.order.indexOf(this.activeIndex);
    let nextOrderIndex = currentOrderIndex;
    let nextPlayer: Player | null = null;
    for (let step = 1; step <= this.order.length; step += 1) {
      const candidateIndex = (currentOrderIndex + step) % this.order.length;
      const candidate = this.players[this.order[candidateIndex]];
      if (candidate.alive) {
        nextOrderIndex = candidateIndex;
        nextPlayer = candidate;
        break;
      }
    }
    if (!nextPlayer) {
      this.endGame(this.checkWinner());
      return;
    }
    if (nextOrderIndex <= currentOrderIndex) {
      this.round += 1;
    }
    this.beginTurn(nextPlayer.id, true, true);
    if (this.isOnline && this.localIndex === 0) {
      this.emit({ type: 'sync', snapshot: this.createSnapshot() });
    }
  }

  endGame(winner: Team | null): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.winner = winner;
    this.stopMove(false);
    if (!this.gameOverEmitted) {
      this.gameOverEmitted = true;
      this.emit({ type: 'gameover', winner, stats: this.getStats() });
    }
    if (this.isOnline && this.localIndex === 0) {
      this.emit({ type: 'sync', snapshot: this.createSnapshot() });
    }
  }

  getStats(): PlayerStats[] {
    return this.players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      damage: player.damageDealt,
      shots: player.shots,
      hits: player.hits,
      kills: player.kills,
      alive: player.alive,
    }));
  }

  getAliveEnemies(player: Player): Player[] {
    return this.players.filter((other) => other.alive && other.team !== player.team);
  }

  getAliveAllies(player: Player): Player[] {
    return this.players.filter((other) => other.alive && other.team === player.team);
  }

  getNearestEnemy(player: Player): Player | null {
    const enemies = this.getAliveEnemies(player);
    if (!enemies.length) return null;
    return enemies.reduce((best, current) =>
      Math.abs(current.x - player.x) < Math.abs(best.x - player.x) ? current : best,
    );
  }

  getAimPreview(): SimulateResult | null {
    const player = this.activePlayer;
    if (this.phase !== 'aim' || !this.canLocalControl(player)) return null;
    const origin = shotOrigin(player);
    return simulateTrajectory({
      x: origin.x,
      y: origin.y,
      angle: player.angle,
      power: player.power,
      facing: player.facing,
      wind: this.wind,
      speedScale: WEAPONS[player.weapon].speedScale,
      terrain: this.terrain,
      players: this.players,
      ownerId: player.id,
      step: 1 / 70,
      maxTime: 6.5,
    });
  }

  simulateShot(
    player: Player,
    angle: number,
    power: number,
    weapon: WeaponId,
    step = 1 / 26,
  ): SimulateResult {
    const origin = shotOrigin(player);
    return simulateTrajectory({
      x: origin.x,
      y: origin.y,
      angle,
      power,
      facing: player.facing,
      wind: this.wind,
      speedScale: WEAPONS[weapon].speedScale,
      terrain: this.terrain,
      players: this.players,
      ownerId: player.id,
      step,
      maxTime: 8,
    });
  }

  createSnapshot(): Snapshot {
    return {
      seed: this.seed,
      heights: this.terrain.toArray(),
      players: this.players.map((player) => ({
        id: player.id,
        x: Math.round(player.x * 100) / 100,
        y: Math.round(player.y * 100) / 100,
        hp: player.hp,
        alive: player.alive,
        ammo: { ...player.ammo },
        damageDealt: player.damageDealt,
        shots: player.shots,
        hits: player.hits,
        kills: player.kills,
      })),
      activeIndex: this.activeIndex,
      round: this.round,
      wind: this.wind,
      winner: this.winner,
      gameOver: this.phase === 'gameover',
    };
  }

  applySnapshot(snapshot: Snapshot): void {
    if (!this.isOnline) return;
    this.terrain.fromArray(snapshot.heights);
    for (const data of snapshot.players) {
      const player = this.getPlayer(data.id);
      if (!player) continue;
      player.x = clamp(data.x, 0, this.terrain.width);
      player.y = clamp(data.y, 0, TERRAIN_MAX);
      player.hp = clamp(data.hp, 0, player.maxHp);
      player.alive = data.alive && player.hp > 0;
      player.ammo = { ...data.ammo };
      player.damageDealt = data.damageDealt;
      player.shots = data.shots;
      player.hits = data.hits;
      player.kills = data.kills;
      player.vy = 0;
      player.onGround = true;
      player.fallStart = player.y;
      player.fuel = 100;
      player.moving = false;
    }
    this.wind = snapshot.wind;
    this.activeIndex = snapshot.activeIndex;
    this.round = snapshot.round;
    this.projectiles = [];
    this.physicsAcc = 0;
    this.moveDir = 0;
    this.emit({ type: 'wind', value: this.wind });
    this.gameOverEmitted = false;
    if (snapshot.gameOver) {
      this.phase = 'gameover';
      this.winner = snapshot.winner ?? null;
      if (!this.gameOverEmitted) {
        this.gameOverEmitted = true;
        this.emit({ type: 'gameover', winner: this.winner, stats: this.getStats() });
      }
      return;
    }
    this.timer = this.turnTime;
    this.phase = 'aim';
    this.timeoutEmitted = false;
    this.emit({
      type: 'turn',
      playerId: this.activeIndex,
      player: this.activePlayer,
      round: this.round,
      synced: true,
    });
  }

  remoteMove(playerId: number, x: number, y: number): void {
    if (!this.isOnline) return;
    const player = this.getPlayer(playerId);
    if (!player || !player.alive) return;
    player.x = clamp(x, 48, this.terrain.width - 48);
    player.y = this.terrain.heightAt(player.x);
    player.onGround = true;
    this.emit({ type: 'moved', playerId, x: player.x, y: player.y });
  }

}
