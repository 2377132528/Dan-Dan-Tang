import { CHARACTERS, TEAM_COLOR, TEAM_DARK, WEAPONS } from './data';
import type { Game } from './game';
import { Rng, clamp, lerp } from './math';
import type { DragState, GameEvent, Player, Projectile, Team, WeaponId } from './types';
import { TERRAIN_MAX } from './terrain';

interface Palette {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  sun: string;
  sunGlow: string;
  cloud: string;
  cloudShade: string;
  farMountain: string;
  midMountain: string;
  nearMountain: string;
  haze: string;
  grass: string;
  grassLight: string;
  grassDark: string;
  dirtTop: string;
  dirtMid: string;
  dirtDeep: string;
  outline: string;
  ambient: string;
}

const PALETTES: Palette[] = [
  {
    skyTop: '#5cc3ef',
    skyMid: '#b7e8fb',
    skyBottom: '#fff2d3',
    sun: '#fff4b4',
    sunGlow: 'rgba(255,244,180,0.55)',
    cloud: '#ffffff',
    cloudShade: '#d9edf7',
    farMountain: '#a9d2e1',
    midMountain: '#7db9c4',
    nearMountain: '#5c9b8d',
    haze: 'rgba(255,248,218,0.42)',
    grass: '#7cc85c',
    grassLight: '#b6e57d',
    grassDark: '#3f8a46',
    dirtTop: '#c8895c',
    dirtMid: '#9a6244',
    dirtDeep: '#684331',
    outline: '#45694e',
    ambient: 'rgba(255,249,222,0.15)',
  },
  {
    skyTop: '#f48d79',
    skyMid: '#ffc99d',
    skyBottom: '#fff0ca',
    sun: '#fff0b5',
    sunGlow: 'rgba(255,211,138,0.6)',
    cloud: '#ffe9d9',
    cloudShade: '#efc6b8',
    farMountain: '#c7a4b2',
    midMountain: '#a5869f',
    nearMountain: '#7f6b82',
    haze: 'rgba(255,206,160,0.35)',
    grass: '#8ec067',
    grassLight: '#c7df83',
    grassDark: '#4e8151',
    dirtTop: '#b97a55',
    dirtMid: '#8b5541',
    dirtDeep: '#5d3931',
    outline: '#584e4b',
    ambient: 'rgba(255,196,140,0.18)',
  },
  {
    skyTop: '#83c4e9',
    skyMid: '#cfeafa',
    skyBottom: '#fbf4d9',
    sun: '#fff7c7',
    sunGlow: 'rgba(255,247,199,0.5)',
    cloud: '#ffffff',
    cloudShade: '#dcecf2',
    farMountain: '#a6c7d3',
    midMountain: '#8bbab8',
    nearMountain: '#689e8c',
    haze: 'rgba(255,251,225,0.45)',
    grass: '#89cd68',
    grassLight: '#c3e98b',
    grassDark: '#4b8b4e',
    dirtTop: '#c28b63',
    dirtMid: '#96664b',
    dirtDeep: '#684737',
    outline: '#4d6953',
    ambient: 'rgba(255,250,220,0.12)',
  },
];

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
  alpha: number;
}

interface MountainLayer {
  points: { x: number; y: number }[];
  color: string;
  base: number;
  alpha: number;
}

interface Speckle {
  x: number;
  depth: number;
  size: number;
  shade: number;
  rotation: number;
}

interface Flower {
  x: number;
  color: string;
  size: number;
  lean: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'circle' | 'smoke' | 'spark' | 'debris' | 'star' | 'plus';
  gravity: number;
  drag: number;
  rotation: number;
  spin: number;
}

interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface Blast {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Ghost {
  x: number;
  y: number;
  team: Team;
  life: number;
  maxLife: number;
}

interface Scorch {
  x: number;
  radius: number;
  seed: number;
}

interface WindLeaf {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

interface PlayerFx {
  hit: number;
  fire: number;
  heal: number;
  blinkOffset: number;
}

const MAX_PARTICLES = 520;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private game: Game | null = null;
  private palette: Palette = PALETTES[0];
  private menuMode = false;

  camera = { x: 0, y: 0, zoom: 1 };
  private shake = 0;
  private shakeSeed = 0;
  private time = 0;

  private clouds: Cloud[] = [];
  private mountains: MountainLayer[] = [];
  private speckles: Speckle[] = [];
  private flowers: Flower[] = [];
  private windLeaves: WindLeaf[] = [];
  private birds: { x: number; y: number; speed: number; phase: number }[] = [];
  private balloon = { x: 900, y: 190, speed: 3 };
  private islands: { x: number; y: number; size: number; flip: number }[] = [];

  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private blasts: Blast[] = [];
  private flash = 0;
  private ghosts: Ghost[] = [];
  private scorches: Scorch[] = [];
  private playerFx = new Map<number, PlayerFx>();
  private lastFocus = { x: 1000, y: 520 };

  drag: DragState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(1280 * this.dpr);
    this.canvas.height = Math.round(720 * this.dpr);
  }

  reset(game: Game, menuMode = false): void {
    this.game = game;
    this.menuMode = menuMode;
    this.palette = PALETTES[game.seed % PALETTES.length];
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.blasts = [];
    this.flash = 0;
    this.ghosts = [];
    this.scorches = [];
    this.playerFx.clear();
    for (const player of game.players) {
      this.playerFx.set(player.id, {
        hit: 0,
        fire: 0,
        heal: 0,
        blinkOffset: Math.random() * 4,
      });
    }
    this.drag = null;
    this.shake = 0;
    this.lastFocus = {
      x: (game.players[0]?.x ?? 400) + 200,
      y: 520,
    };
    this.buildDecor(game.seed);
    this.camera.zoom = menuMode ? 0.78 : 0.84;
    this.camera.x = this.clampCameraX(1000, this.camera.zoom);
    this.camera.y = this.cameraYFor(this.camera.zoom);
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * 1280;
    const sy = ((clientY - rect.top) / rect.height) * 720;
    return {
      x: this.camera.x + sx / this.camera.zoom,
      y: this.camera.y + sy / this.camera.zoom,
    };
  }

  private buildDecor(seed: number): void {
    const rng = new Rng(seed ^ 0x1b873593);
    this.clouds = [];
    for (let i = 0; i < 11; i += 1) {
      this.clouds.push({
        x: rng.float(-100, 1500),
        y: rng.float(35, 265),
        scale: rng.float(0.55, 1.45),
        speed: rng.float(2, 7),
        alpha: rng.float(0.26, 0.7),
      });
    }

    this.mountains = [];
    const layerSpecs = [
      { color: this.palette.farMountain, base: rng.float(385, 415), amp: 72, alpha: 0.75 },
      { color: this.palette.midMountain, base: rng.float(445, 478), amp: 96, alpha: 0.8 },
      { color: this.palette.nearMountain, base: rng.float(505, 535), amp: 78, alpha: 0.65 },
    ];
    for (let layer = 0; layer < layerSpecs.length; layer += 1) {
      const spec = layerSpecs[layer];
      const points: { x: number; y: number }[] = [];
      const offset = rng.float(0, 100);
      for (let x = -260; x <= 2700; x += 85) {
        const wave =
          Math.sin(x * 0.0027 + offset) * spec.amp * 0.55 +
          Math.sin(x * 0.0071 + offset * 1.8) * spec.amp * 0.3 +
          Math.sin(x * 0.019 + offset * 2.4) * spec.amp * 0.15;
        points.push({ x, y: spec.base + wave - rng.float(0, 18) });
      }
      this.mountains.push({
        points,
        color: spec.color,
        base: spec.base + 180,
        alpha: spec.alpha,
      });
    }

    this.islands = [
      { x: rng.float(520, 760), y: rng.float(240, 300), size: rng.float(48, 72), flip: 1 },
      { x: rng.float(1280, 1460), y: rng.float(170, 235), size: rng.float(38, 62), flip: -1 },
    ];

    this.speckles = [];
    for (let i = 0; i < 800; i += 1) {
      this.speckles.push({
        x: rng.float(0, 2000),
        depth: rng.float(6, 320),
        size: rng.float(1.2, 5.4),
        shade: rng.float(0.05, 0.28),
        rotation: rng.float(0, Math.PI),
      });
    }

    const flowerColors = ['#fff3ba', '#ffb3c8', '#d4c2ff', '#fff9e8', '#ffd389'];
    this.flowers = [];
    for (let i = 0; i < 28; i += 1) {
      this.flowers.push({
        x: rng.float(40, 1960),
        color: rng.pick(flowerColors),
        size: rng.float(2.4, 4.4),
        lean: rng.float(-0.3, 0.3),
      });
    }

    this.birds = [];
    for (let i = 0; i < 6; i += 1) {
      this.birds.push({
        x: rng.float(200, 1800),
        y: rng.float(90, 250),
        speed: rng.float(5, 13),
        phase: rng.float(0, 6),
      });
    }

    this.balloon = {
      x: rng.float(700, 1100),
      y: rng.float(130, 220),
      speed: rng.float(2, 5),
    };

    this.windLeaves = [];
    for (let i = 0; i < 22; i += 1) {
      this.windLeaves.push({
        x: rng.float(0, 1320),
        y: rng.float(80, 670),
        size: rng.float(1.6, 3.6),
        phase: rng.float(0, 6),
        speed: rng.float(0.6, 1.7),
      });
    }
  }

  setMenuMode(menu: boolean): void {
    this.menuMode = menu;
  }

  addShake(amount: number): void {
    this.shake = Math.min(22, this.shake + amount);
    this.shakeSeed = Math.random() * 1000;
  }

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'fire': {
        const player = this.game?.players.find((p) => p.id === event.playerId);
        if (player) {
          const fx = this.fxFor(player.id);
          fx.fire = 0.38;
          const origin = { x: event.shot.x, y: event.shot.y };
          this.spawnMuzzle(origin.x, origin.y, player.facing, WEAPONS[event.shot.weapon].color);
        }
        this.addShake(event.shot.weapon === 'heavy' ? 7 : 3.5);
        break;
      }
      case 'explosion': {
        const info = event.info;
        this.explode(info.x, info.y, info.radius, info.weapon, info.team);
        this.lastFocus = { x: info.x, y: Math.min(info.y, 650) };
        break;
      }
      case 'heal': {
        this.spawnHeal(event.x, event.y, event.radius);
        break;
      }
      case 'damage': {
        const color = event.kind === 'fall' ? '#ffe4a1' : '#ff6d6d';
        this.floaters.push({
          x: event.x + (Math.random() * 16 - 8),
          y: event.y,
          vy: -44,
          life: 1.1,
          maxLife: 1.1,
          text: `-${event.amount}`,
          color,
          size: event.amount >= 40 ? 27 : 21,
        });
        const fx = this.fxFor(event.playerId);
        fx.hit = 0.5;
        this.addShake(event.amount >= 30 ? 4 : 1.6);
        break;
      }
      case 'death': {
        this.spawnDeath(event.x, event.y, event.team);
        this.floaters.push({
          x: event.x,
          y: event.y - 90,
          vy: -26,
          life: 1.3,
          maxLife: 1.3,
          text: event.reason === 'fall' ? '坠落！' : 'K.O.!',
          color: '#ffd166',
          size: 34,
        });
        break;
      }
      case 'turn': {
        this.lastFocus = { x: event.player.x, y: event.player.y };
        break;
      }
      case 'gameover': {
        if (event.winner) {
          for (let i = 0; i < 6; i += 1) {
            window.setTimeout(() => {
              if (!this.game) return;
              this.spawnFirework(
                300 + Math.random() * 1400,
                120 + Math.random() * 260,
                i % 2 === 0 ? TEAM_COLOR[event.winner as Team] : '#ffe38f',
              );
            }, i * 260);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private fxFor(playerId: number): PlayerFx {
    let fx = this.playerFx.get(playerId);
    if (!fx) {
      fx = { hit: 0, fire: 0, heal: 0, blinkOffset: Math.random() * 4 };
      this.playerFx.set(playerId, fx);
    }
    return fx;
  }

  render(game: Game, dt: number, nowMs: number): void {
    this.game = game;
    this.time = nowMs / 1000;
    const dtc = Math.min(0.05, dt);
    this.updateEffects(dtc);
    this.updateCamera(game, dtc);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, 1280, 720);
    this.drawSky(nowMs);
    this.drawScreenClouds(nowMs);

    const shakeX = Math.sin(this.time * 91 + this.shakeSeed) * this.shake;
    const shakeY = Math.cos(this.time * 77 + this.shakeSeed * 1.7) * this.shake * 0.7;
    const z = this.camera.zoom;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.scale(z, z);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawMountains();
    this.drawIslands();
    this.drawBalloon();
    this.drawTerrain();
    this.drawScorches();
    if (!this.menuMode) this.drawAimGuide(game);
    this.drawTombstones(game);
    this.drawPlayers(game);
    this.drawProjectiles(game);
    this.drawParticles();
    this.drawBlasts();
    this.drawFloaters();
    this.drawGhosts();
    this.drawGrassFringe(game);
    ctx.restore();

    this.drawBirds(nowMs);
    this.drawWindLeaves(game, dtc);
    this.drawDragTether();
    this.drawScreenAtmosphere(game);
    if (this.flash > 0.005) {
      ctx.fillStyle = `rgba(255, 238, 190, ${this.flash * 0.32})`;
      ctx.fillRect(0, 0, 1280, 720);
    }
  }

  private updateEffects(dt: number): void {
    this.shake *= Math.exp(-dt * 8);
    if (this.shake < 0.2) this.shake = 0;
    this.flash *= Math.exp(-dt * 9);
    if (this.flash < 0.005) this.flash = 0;

    for (const blast of this.blasts) {
      blast.life -= dt;
    }
    this.blasts = this.blasts.filter((blast) => blast.life > 0);

    for (const fx of this.playerFx.values()) {
      fx.hit = Math.max(0, fx.hit - dt);
      fx.fire = Math.max(0, fx.fire - dt);
      fx.heal = Math.max(0, fx.heal - dt);
    }

    for (const particle of this.particles) {
      particle.life -= dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.exp(-particle.drag * dt);
      particle.vy *= Math.exp(-particle.drag * 0.55 * dt);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
      if (particle.type === 'smoke') {
        particle.size += 22 * dt;
      }
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    for (const floater of this.floaters) {
      floater.life -= dt;
      floater.vy += 36 * dt;
      floater.y += floater.vy * dt;
    }
    this.floaters = this.floaters.filter((floater) => floater.life > 0);

    for (const ring of this.rings) {
      ring.life -= dt;
      const progress = 1 - ring.life / ring.maxLife;
      ring.radius = ring.maxRadius * (1 - Math.pow(1 - progress, 2.3));
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);

    for (const ghost of this.ghosts) {
      ghost.life -= dt;
      ghost.y -= 28 * dt;
    }
    this.ghosts = this.ghosts.filter((ghost) => ghost.life > 0);

    for (const scorch of this.scorches) {
      // Scorches persist; the array is capped in explode().
      void scorch;
    }
  }

  private updateCamera(game: Game, dt: number): void {
    let targetX = 1000;
    let targetZoom = 0.84;

    if (this.menuMode) {
      targetX = 1200 + Math.sin(this.time * 0.16) * 28;
      targetZoom = 1.03;
    } else {
      const alive = game.players.filter((player) => player.alive);
      const xs = alive.map((player) => player.x);
      let margin = 330;
      if (game.phase === 'flying' && game.projectiles.length > 0) {
        for (const projectile of game.projectiles) xs.push(projectile.x);
        margin = 380;
      } else if (game.phase === 'resolving') {
        xs.push(this.lastFocus.x);
        margin = 340;
      } else if (game.phase === 'gameover') {
        for (const player of game.players) xs.push(player.x);
        xs.push(this.lastFocus.x);
        margin = 300;
      }
      if (xs.length) {
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const span = maxX - minX;
        targetX = (minX + maxX) / 2;
        targetZoom = clamp(1280 / (span + margin), 0.56, 1);
      } else {
        targetX = game.activePlayer.x;
        targetZoom = 0.9;
      }
    }

    const smoothed = 1 - Math.exp(-dt * 3.4);
    this.camera.zoom = lerp(this.camera.zoom, targetZoom, smoothed);
    const clampedX = this.clampCameraX(targetX, this.camera.zoom);
    this.camera.x = lerp(this.camera.x, clampedX, smoothed);
    this.camera.y = lerp(this.camera.y, this.cameraYFor(this.camera.zoom), smoothed);
  }

  private clampCameraX(x: number, zoom: number): number {
    const viewWidth = 1280 / zoom;
    if (viewWidth >= 2000) return (2000 - viewWidth) / 2;
    return clamp(x - viewWidth / 2, 0, 2000 - viewWidth);
  }

  private cameraYFor(zoom: number): number {
    return 720 - 720 / zoom;
  }

  private drawSky(nowMs: number): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 720);
    gradient.addColorStop(0, this.palette.skyTop);
    gradient.addColorStop(0.52, this.palette.skyMid);
    gradient.addColorStop(0.86, this.palette.skyBottom);
    gradient.addColorStop(1, this.palette.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1280, 720);

    const sunX = 1030 - this.camera.x * 0.04;
    const sunY = 88 + Math.sin(this.time * 0.15) * 2;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 180);
    glow.addColorStop(0, this.palette.sunGlow);
    glow.addColorStop(0.45, this.palette.sunGlow.replace(/[\d.]+\)$/, '0.14)'));
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fillStyle = this.palette.sun;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;

    // A soft horizon haze.
    const haze = ctx.createLinearGradient(0, 330, 0, 600);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.7, this.palette.haze);
    haze.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 330, 1280, 270);
  }

  private drawScreenClouds(nowMs: number): void {
    const ctx = this.ctx;
    for (const cloud of this.clouds) {
      const x = ((cloud.x + nowMs * 0.001 * cloud.speed + 300) % 1800) - 250;
      const y = cloud.y + Math.sin(this.time * 0.18 + cloud.x) * 4;
      this.drawCloud(ctx, x, y, cloud.scale, cloud.alpha);
    }
  }

  private drawCloud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.palette.cloudShade;
    ctx.beginPath();
    ctx.ellipse(0, 14, 62, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.palette.cloud;
    ctx.beginPath();
    ctx.arc(-34, 5, 22, 0, Math.PI * 2);
    ctx.arc(-8, -7, 30, 0, Math.PI * 2);
    ctx.arc(24, 0, 24, 0, Math.PI * 2);
    ctx.arc(48, 9, 17, 0, Math.PI * 2);
    ctx.arc(8, 13, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMountains(): void {
    const ctx = this.ctx;
    for (let index = 0; index < this.mountains.length; index += 1) {
      const layer = this.mountains[index];
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-300, 980);
      ctx.lineTo(-300, layer.points[0].y);
      for (let i = 1; i < layer.points.length; i += 1) {
        const prev = layer.points[i - 1];
        const point = layer.points[i];
        const midX = (prev.x + point.x) / 2;
        const midY = (prev.y + point.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      const last = layer.points[layer.points.length - 1];
      ctx.lineTo(2700, last.y);
      ctx.lineTo(2700, 980);
      ctx.closePath();
      ctx.fill();

      // A crisp sunlit ridge.
      ctx.globalAlpha = Math.min(1, layer.alpha + 0.18);
      ctx.strokeStyle = 'rgba(255,247,220,0.38)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < layer.points.length - 1; i += 1) {
        const point = layer.points[i];
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Mist pooled between the ridges.
    const ctx2 = this.ctx;
    ctx2.save();
    ctx2.globalAlpha = 0.28;
    const mist = ctx2.createLinearGradient(0, 430, 0, 620);
    mist.addColorStop(0, 'rgba(255,255,255,0)');
    mist.addColorStop(0.55, 'rgba(255,252,239,0.75)');
    mist.addColorStop(1, 'rgba(255,255,255,0)');
    ctx2.fillStyle = mist;
    ctx2.fillRect(0, 420, 2300, 230);
    ctx2.restore();
  }

  private drawIslands(): void {
    const ctx = this.ctx;
    for (const island of this.islands) {
      const bob = Math.sin(this.time * 0.35 + island.x) * 4;
      ctx.save();
      ctx.translate(island.x, island.y + bob);
      ctx.scale(island.flip, 1);
      const s = island.size;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(98,137,138,0.72)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0);
      ctx.quadraticCurveTo(-s * 0.25, s * 0.72, 0, s * 0.9);
      ctx.quadraticCurveTo(s * 0.24, s * 0.62, s * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.palette.grass;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.76, s * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.palette.grassDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.05);
      ctx.lineTo(-s * 0.34, -s * 0.45);
      ctx.moveTo(s * 0.26, -s * 0.04);
      ctx.lineTo(s * 0.3, -s * 0.32);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74,130,86,0.85)';
      ctx.beginPath();
      ctx.arc(-s * 0.34, -s * 0.52, s * 0.16, 0, Math.PI * 2);
      ctx.arc(s * 0.3, -s * 0.38, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBalloon(): void {
    const ctx = this.ctx;
    const x = this.balloon.x + Math.sin(this.time * 0.09) * 40;
    const y = this.balloon.y + Math.sin(this.time * 0.42) * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = 'rgba(84,91,112,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, 24);
    ctx.lineTo(-4, 38);
    ctx.moveTo(7, 24);
    ctx.lineTo(4, 38);
    ctx.stroke();
    ctx.fillStyle = '#b98963';
    ctx.fillRect(-7, 36, 14, 10);
    const colors = ['#ffd36e', '#ef7f7f', '#7cc7e8', '#ffd36e'];
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 27, 0, (i / 4) * Math.PI * 2, ((i + 1) / 4) * Math.PI * 2);
      ctx.lineTo(0, 27);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80,64,76,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 27, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTerrain(): void {
    const game = this.game;
    if (!game) return;
    const ctx = this.ctx;
    const terrain = game.terrain;
    const step = terrain.step;

    ctx.beginPath();
    ctx.moveTo(0, 980);
    for (let i = 0; i < terrain.count; i += 1) {
      const x = i * step;
      const y = terrain.heights[i];
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(terrain.width, 980);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 400, 0, 900);
    gradient.addColorStop(0, this.palette.dirtTop);
    gradient.addColorStop(0.45, this.palette.dirtMid);
    gradient.addColorStop(1, this.palette.dirtDeep);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.save();
    ctx.clip();

    // Warm vertical bands of packed earth.
    const bandGradient = ctx.createLinearGradient(0, 450, 0, 820);
    bandGradient.addColorStop(0, 'rgba(255,231,183,0.14)');
    bandGradient.addColorStop(1, 'rgba(48,30,30,0.2)');
    ctx.fillStyle = bandGradient;
    ctx.fillRect(0, 420, 2000, 500);

    for (const speckle of this.speckles) {
      const y = terrain.heightAt(speckle.x) + speckle.depth;
      if (y > 940) continue;
      ctx.save();
      ctx.translate(speckle.x, y);
      ctx.rotate(speckle.rotation);
      ctx.fillStyle =
        speckle.shade > 0.18 ? `rgba(66,42,34,${speckle.shade})` : `rgba(255,222,176,${0.08 + speckle.shade})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, speckle.size * 1.4, speckle.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Stratified bands deepen the cut-away feeling.
    for (let band = 1; band <= 5; band += 1) {
      ctx.beginPath();
      for (let x = 0; x <= 2000; x += 24) {
        const y = terrain.heightAt(x) + 36 + band * 44 + Math.sin(x * 0.014 + band) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(58,36,30,${0.07 + band * 0.018})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // Grassy top band.
    ctx.beginPath();
    for (let i = 0; i < terrain.count; i += 1) {
      const x = i * step;
      const y = terrain.heights[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.palette.grassDark;
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.strokeStyle = this.palette.grass;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = this.palette.grassLight;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Soft inner shadow just below the turf.
    ctx.beginPath();
    for (let i = 0; i < terrain.count; i += 1) {
      const x = i * step;
      const y = terrain.heights[i] + 9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(50,79,50,0.24)';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (const flower of this.flowers) {
      const y = terrain.heightAt(flower.x);
      if (y > 760) continue;
      ctx.save();
      ctx.translate(flower.x, y - 2);
      ctx.strokeStyle = this.palette.grassDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(flower.lean * 8, -5, flower.lean * 10, -9);
      ctx.stroke();
      ctx.fillStyle = flower.color;
      for (let petal = 0; petal < 5; petal += 1) {
        const a = (petal / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(flower.lean * 10 + Math.cos(a) * flower.size, -9 + Math.sin(a) * flower.size, flower.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e9a83d';
      ctx.beginPath();
      ctx.arc(flower.lean * 10, -9, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawGrassFringe(game: Game): void {
    const ctx = this.ctx;
    const terrain = game.terrain;
    const sway = Math.sin(this.time * 1.3) * 1.2;
    ctx.save();
    ctx.strokeStyle = this.palette.grassDark;
    ctx.lineCap = 'round';
    for (let x = 4; x < 2000; x += 13) {
      const y = terrain.heightAt(x);
      if (y > 770) continue;
      const phase = Math.sin(x * 0.13) * 0.5;
      const height = 4 + ((x * 7) % 5);
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.quadraticCurveTo(x + phase * 2 + sway, y - height * 0.3, x + phase * 3 + sway, y - height);
      ctx.stroke();
      if (x % 26 === 0) {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = this.palette.grassLight;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 5);
        ctx.quadraticCurveTo(x + 7 + sway, y - 2, x + 10 + sway, y - height - 2);
        ctx.stroke();
        ctx.strokeStyle = this.palette.grassDark;
      }
    }
    ctx.restore();
  }

  private drawScorches(): void {
    const game = this.game;
    if (!game) return;
    const ctx = this.ctx;
    for (const scorch of this.scorches) {
      const y = game.terrain.heightAt(scorch.x);
      if (y > 780) continue;
      const rng = new Rng(scorch.seed);
      ctx.save();
      ctx.translate(scorch.x, y + 3);
      ctx.scale(1, 0.32);
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, scorch.radius);
      grad.addColorStop(0, 'rgba(30,23,22,0.78)');
      grad.addColorStop(0.55, 'rgba(43,29,25,0.48)');
      grad.addColorStop(0.85, 'rgba(54,36,29,0.22)');
      grad.addColorStop(1, 'rgba(54,36,29,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, scorch.radius, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i += 1) {
        const angle = rng.float(0, Math.PI * 2);
        const distance = rng.float(0, scorch.radius * 0.72);
        ctx.fillStyle = `rgba(29,22,20,${rng.float(0.18, 0.42)})`;
        ctx.beginPath();
        ctx.ellipse(
          Math.cos(angle) * distance,
          Math.sin(angle) * distance * 0.5,
          rng.float(4, scorch.radius * 0.22),
          rng.float(2, scorch.radius * 0.1),
          rng.float(0, Math.PI),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(scorch.x, y + 2);
      ctx.strokeStyle = 'rgba(45,30,25,0.28)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i += 1) {
        const angle = rng.float(0, Math.PI) + (i % 2 === 0 ? 0 : Math.PI);
        const length = scorch.radius * rng.float(0.2, 0.75);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 5, 0);
        ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length * 0.25);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawAimGuide(game: Game): void {
    const player = game.activePlayer;
    if (!game.canLocalControl(player) || game.phase !== 'aim') return;
    const preview = game.getAimPreview();
    if (!preview) return;
    const ctx = this.ctx;
    const color = TEAM_COLOR[player.team];

    ctx.save();
    ctx.globalAlpha = 0.78;
    const points = preview.points;
    const stride = Math.max(2, Math.floor(points.length / 58));
    for (let i = 0; i < points.length; i += stride) {
      const point = points[i];
      const progress = i / points.length;
      const radius = lerp(2.7, 1.2, progress);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = i % (stride * 4) === 0 ? '#fff9e6' : color;
      ctx.globalAlpha = 0.74 * (1 - progress * 0.45);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Landing marker.
    const pulse = 1 + Math.sin(this.time * 7) * 0.06;
    ctx.save();
    ctx.translate(preview.hitX, preview.hitY);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();

    // Angle arc at the character's shoulder.
    const angle = player.angle;
    const facing = player.facing;
    const baseX = player.x + facing * 7;
    const baseY = player.y - 34;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.scale(facing, 1);
    ctx.strokeStyle = 'rgba(255,250,230,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, -(angle * Math.PI) / 180, true);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(43,58,74,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 41, 0, -(angle * Math.PI) / 180, true);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  private drawPlayers(game: Game): void {
    const alive = game.players.filter((player) => player.alive);
    alive.sort((a, b) => a.y - b.y);
    for (const player of alive) {
      this.drawPlayer(player, game);
    }
  }

  private drawTombstones(game: Game): void {
    const ctx = this.ctx;
    for (const player of game.players) {
      if (player.alive) continue;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = 'rgba(36,39,52,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 3, 26, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.palette.grassDark;
      ctx.beginPath();
      ctx.ellipse(0, 1, 19, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c7cccb';
      ctx.strokeStyle = '#5b646c';
      ctx.lineWidth = 2;
      roundRectPath(ctx, -15, -38, 30, 40, 13);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      roundRectPath(ctx, -11, -34, 8, 28, 6);
      ctx.fill();
      ctx.strokeStyle = TEAM_COLOR[player.team];
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -27);
      ctx.lineTo(0, -12);
      ctx.moveTo(-6, -21);
      ctx.lineTo(6, -21);
      ctx.stroke();
      ctx.fillStyle = TEAM_COLOR[player.team];
      ctx.beginPath();
      ctx.moveTo(-12, -37);
      ctx.lineTo(-12, -25);
      ctx.lineTo(-3, -31);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPlayer(player: Player, game: Game): void {
    const char = CHARACTERS[player.charId] ?? CHARACTERS.tuantuan;
    const ctx = this.ctx;
    const fx = this.fxFor(player.id);
    const active =
      game.activePlayer.id === player.id &&
      (game.phase === 'aim' || game.phase === 'waiting') &&
      !this.menuMode;
    const teamColor = TEAM_COLOR[player.team];
    const teamDark = TEAM_DARK[player.team];
    const t = this.time;
    const blinkPhase = (t + fx.blinkOffset) % 4.6;
    const blinking = blinkPhase < 0.11;
    const moving = player.moving && game.phase === 'aim';
    const walk = moving ? Math.sin(t * 15) : 0;
    const bob = moving ? Math.abs(Math.sin(t * 15)) * 2.4 : Math.sin(t * 2.1 + player.id * 1.7) * 1.1;
    const hurt = fx.hit > 0;
    const recoil = fx.fire > 0 ? (fx.fire / 0.38) * 9 : 0;
    const jitterX = hurt ? Math.sin(t * 63 + player.id) * 1.8 : 0;
    const jitterY = hurt ? Math.cos(t * 71 + player.id) * 1.2 : 0;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Ground shadow.
    ctx.fillStyle = 'rgba(28,43,44,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (active) {
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      ctx.strokeStyle = teamColor;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 1, 30 * pulse, 8 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = teamColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.translate(jitterX - player.facing * recoil * 0.5, bob + jitterY);
    ctx.scale(player.facing * 1.12, 1.12);

    // Scarf tails behind the body.
    const flap = Math.sin(t * 4.2 + player.id) * 2.5;
    ctx.fillStyle = char.accent;
    ctx.strokeStyle = teamDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, -41);
    ctx.bezierCurveTo(-22, -47, -31 - flap, -37, -36 - flap, -24);
    ctx.bezierCurveTo(-27, -27, -19, -27, -10, -33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, -39);
    ctx.bezierCurveTo(-18, -36, -29, -29, -31 - flap * 0.7, -16);
    ctx.bezierCurveTo(-23, -21, -15, -23, -7, -30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Legs and shoes.
    const legSwing = walk * 3.2;
    ctx.strokeStyle = '#4a3b4f';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -17);
    ctx.lineTo(-7 - legSwing, -3);
    ctx.moveTo(6, -17);
    ctx.lineTo(7 + legSwing, -3);
    ctx.stroke();
    ctx.fillStyle = char.outfitDark;
    ctx.beginPath();
    ctx.ellipse(-8 - legSwing, -2, 6, 3.4, -0.1, 0, Math.PI * 2);
    ctx.ellipse(8 + legSwing, -2, 6, 3.4, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Torso.
    ctx.beginPath();
    ctx.moveTo(-13, -40);
    ctx.quadraticCurveTo(-17, -28, -13, -15);
    ctx.quadraticCurveTo(0, -9, 13, -15);
    ctx.quadraticCurveTo(17, -28, 13, -40);
    ctx.closePath();
    ctx.fillStyle = hurt ? '#ffffff' : char.outfit;
    ctx.strokeStyle = teamDark;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,249,224,0.62)';
    ctx.beginPath();
    ctx.ellipse(0, -25, 7.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = char.accent;
    ctx.fillRect(-11, -36, 22, 3);
    ctx.fillStyle = teamDark;
    ctx.beginPath();
    ctx.arc(-7, -39, 1.3, 0, Math.PI * 2);
    ctx.arc(7, -39, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Back arm.
    ctx.strokeStyle = char.skin;
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.moveTo(-10, -35);
    ctx.quadraticCurveTo(-17, -30, -16, -22);
    ctx.stroke();

    // Head.
    const headY = -57;
    this.drawHairBack(char, ctx, t, player.id);
    ctx.fillStyle = char.skin;
    ctx.strokeStyle = 'rgba(74,53,61,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, headY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Ears.
    ctx.fillStyle = char.skin;
    ctx.beginPath();
    ctx.arc(-17, headY + 2, 3.4, 0, Math.PI * 2);
    ctx.arc(17, headY + 2, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // Face.
    const eyeY = headY + 1;
    if (hurt) {
      ctx.strokeStyle = '#523c45';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, eyeY - 3);
      ctx.lineTo(-5, eyeY + 1);
      ctx.moveTo(-5, eyeY - 3);
      ctx.lineTo(-10, eyeY + 1);
      ctx.moveTo(5, eyeY - 3);
      ctx.lineTo(10, eyeY + 1);
      ctx.moveTo(10, eyeY - 3);
      ctx.lineTo(5, eyeY + 1);
      ctx.stroke();
      ctx.fillStyle = '#6d4651';
      ctx.beginPath();
      ctx.ellipse(0, headY + 9, 3.4, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (blinking) {
      ctx.strokeStyle = '#4b3844';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, eyeY);
      ctx.quadraticCurveTo(-7, eyeY + 2, -4, eyeY);
      ctx.moveTo(4, eyeY);
      ctx.quadraticCurveTo(7, eyeY + 2, 10, eyeY);
      ctx.stroke();
      ctx.strokeStyle = '#754d58';
      ctx.beginPath();
      ctx.arc(0, headY + 7, 3, 0.1, Math.PI - 0.1);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fffdf6';
      ctx.beginPath();
      ctx.ellipse(-7, eyeY, 4.4, 5.8, 0, 0, Math.PI * 2);
      ctx.ellipse(7, eyeY, 4.4, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const look = player.facing * 0.7;
      ctx.fillStyle = '#3d3346';
      ctx.beginPath();
      ctx.ellipse(-7 + look, eyeY + 0.6, 2.6, 3.8, 0, 0, Math.PI * 2);
      ctx.ellipse(7 + look, eyeY + 0.6, 2.6, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-8.1 + look, eyeY - 1.2, 1.1, 0, Math.PI * 2);
      ctx.arc(5.9 + look, eyeY - 1.2, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#bd6b68';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, headY + 7.4, 3.2, 0.14, Math.PI - 0.14);
      ctx.stroke();
    }

    // Blush.
    ctx.fillStyle = 'rgba(241,126,126,0.35)';
    ctx.beginPath();
    ctx.ellipse(-12, headY + 7, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(12, headY + 7, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawHairFront(char, ctx, headY, player.id);
    this.drawAccessory(char, ctx, headY, teamColor);

    // Front arm + launcher.
    const showCannon = active || game.phase === 'flying' || fx.fire > 0;
    if (showCannon) {
      ctx.save();
      ctx.translate(2, -35);
      ctx.rotate((-player.angle * Math.PI) / 180);
      ctx.strokeStyle = char.skin;
      ctx.lineWidth = 5.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      const weapon = WEAPONS[player.weapon];
      ctx.strokeStyle = '#3f394d';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(29, 0);
      ctx.stroke();
      ctx.strokeStyle = '#5d566e';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(11, -1.5);
      ctx.lineTo(27, -1.5);
      ctx.stroke();
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.roundRect(20, -4.2, 6, 8.4, 2);
      ctx.fill();
      ctx.fillStyle = '#2e2b39';
      ctx.beginPath();
      ctx.ellipse(30, 0, 3.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = weapon.glow;
      ctx.beginPath();
      ctx.arc(30, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = char.skin;
      ctx.beginPath();
      ctx.arc(12.5, -35, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = char.skin;
      ctx.lineWidth = 5.2;
      ctx.beginPath();
      ctx.moveTo(10, -35);
      ctx.quadraticCurveTo(16, -29, 14, -21);
      ctx.stroke();
      // Holstered launcher.
      ctx.save();
      ctx.translate(-9, -27);
      ctx.rotate(0.73);
      ctx.strokeStyle = '#4b4559';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(15, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Muzzle flash.
    if (fx.fire > 0) {
      ctx.save();
      ctx.translate(2, -35);
      ctx.rotate((-player.angle * Math.PI) / 180);
      const flash = fx.fire / 0.38;
      ctx.globalAlpha = flash * 0.9;
      ctx.fillStyle = WEAPONS[player.weapon].glow;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const radius = i % 2 === 0 ? 12 * flash : 4.5 * flash;
        const angle = (i / 8) * Math.PI * 2;
        const x = 32 + Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // Nameplate and HP bar above the character.
    ctx.save();
    ctx.font = "700 12px 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif";
    const plateWidth = Math.max(64, ctx.measureText(player.name).width + 24);
    ctx.translate(player.x, player.y);
    ctx.fillStyle = 'rgba(35,45,57,0.78)';
    roundRectPath(ctx, -plateWidth / 2, -118, plateWidth, 19, 9);
    ctx.fill();
    ctx.fillStyle = teamColor;
    roundRectPath(ctx, -plateWidth / 2 + 3, -115, 5, 13, 3);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff8e7';
    ctx.fillText(player.name, 2, -108);
    if (player.isAI) {
      ctx.font = "700 8px 'Microsoft YaHei UI', sans-serif";
      ctx.fillStyle = teamColor;
      ctx.fillText('AI', plateWidth / 2 - 10, -116);
    }

    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(30,37,48,0.72)';
    roundRectPath(ctx, -31, -96, 62, 6, 3);
    ctx.fill();
    const hpGradient = ctx.createLinearGradient(-31, 0, 31, 0);
    hpGradient.addColorStop(0, teamColor);
    hpGradient.addColorStop(1, player.team === 'red' ? '#ffb06a' : '#8ce2f2');
    ctx.fillStyle = hpGradient;
    if (hpRatio > 0) {
      roundRectPath(ctx, -31, -96, Math.max(3, 62 * hpRatio), 6, 3);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.7;
    roundRectPath(ctx, -31, -96, 62, 6, 3);
    ctx.stroke();

    if (active) {
      const arrowY = -127 + Math.sin(t * 4) * 3;
      ctx.fillStyle = teamColor;
      ctx.strokeStyle = 'rgba(255,250,232,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-6, arrowY);
      ctx.lineTo(6, arrowY);
      ctx.lineTo(0, arrowY + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    if (active && player.isAI && game.phase === 'aim') {
      this.drawThinkingBubble(player);
    }
  }

  private drawHairBack(char: (typeof CHARACTERS)[string], ctx: CanvasRenderingContext2D, t: number, id: number): void {
    const headY = -57;
    const sway = Math.sin(t * 2.2 + id) * 1.2;
    ctx.fillStyle = char.hairDark;
    ctx.strokeStyle = char.hairDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, headY - 1, 19.5, 0, Math.PI * 2);
    ctx.fill();

    if (char.style === 'twin') {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 15, headY - 4);
        ctx.bezierCurveTo(
          side * 28,
          headY - 8 + sway,
          side * 29,
          headY + 16,
          side * 22,
          headY + 22 + sway,
        );
        ctx.bezierCurveTo(side * 17, headY + 12, side * 16, headY + 4, side * 12, headY + 1);
        ctx.closePath();
        ctx.fill();
      }
    } else if (char.style === 'bob') {
      ctx.beginPath();
      ctx.ellipse(-18, headY + 9, 7, 16, 0.18, 0, Math.PI * 2);
      ctx.ellipse(18, headY + 9, 7, 16, -0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.style === 'spiky') {
      for (let i = 0; i < 7; i += 1) {
        const angle = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 12, headY + Math.sin(angle) * 12);
        ctx.lineTo(Math.cos(angle + 0.16) * 27, headY + Math.sin(angle + 0.16) * 25);
        ctx.lineTo(Math.cos(angle - 0.16) * 15, headY + Math.sin(angle - 0.16) * 15);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(-13, headY + 7, 7, 0, Math.PI * 2);
      ctx.arc(13, headY + 7, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHairFront(char: (typeof CHARACTERS)[string], ctx: CanvasRenderingContext2D, headY: number, id: number): void {
    const sway = Math.sin(this.time * 2.2 + id);
    ctx.fillStyle = char.hair;
    ctx.strokeStyle = char.hairDark;
    ctx.lineWidth = 1.1;
    if (char.style === 'twin') {
      ctx.beginPath();
      ctx.arc(0, headY - 3, 18.6, Math.PI * 1.06, Math.PI * 1.94);
      ctx.quadraticCurveTo(11, headY - 10, 9, headY - 12);
      ctx.quadraticCurveTo(4, headY - 8, 0, headY - 4);
      ctx.quadraticCurveTo(-5, headY - 10, -11, headY - 11);
      ctx.quadraticCurveTo(-15, headY - 9, -18, headY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Little fringe strand.
      ctx.beginPath();
      ctx.moveTo(-2, headY - 17);
      ctx.quadraticCurveTo(5, headY - 12, 2, headY - 6);
      ctx.stroke();
    } else if (char.style === 'spiky') {
      const spikes = [
        [-17, -10, -8, -22],
        [-8, -18, 0, -28],
        [2, -20, 10, -26],
        [8, -15, 18, -19],
      ];
      ctx.beginPath();
      ctx.arc(0, headY - 2, 18.5, Math.PI * 1.02, Math.PI * 1.98);
      for (const [x1, y1, x2, y2] of spikes) {
        ctx.lineTo(x2 + sway * 0.6, headY + y2);
        ctx.lineTo(x1, headY + y1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (char.style === 'bob') {
      ctx.beginPath();
      ctx.arc(0, headY - 2, 18.8, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(17, headY - 8, 15, headY + 1);
      ctx.quadraticCurveTo(10, headY - 8, 5, headY - 8);
      ctx.quadraticCurveTo(0, headY - 12, -4, headY - 7);
      ctx.quadraticCurveTo(-10, headY - 9, -15, headY + 1);
      ctx.quadraticCurveTo(-18, headY - 8, -18, headY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, headY - 2, 18.4, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(14, headY - 10, 10, headY - 3);
      ctx.quadraticCurveTo(4, headY - 10, 0, headY - 4);
      ctx.quadraticCurveTo(-6, headY - 10, -12, headY - 3);
      ctx.quadraticCurveTo(-16, headY - 9, -18, headY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawAccessory(
    char: (typeof CHARACTERS)[string],
    ctx: CanvasRenderingContext2D,
    headY: number,
    teamColor: string,
  ): void {
    if (char.accessory === 'ribbon') {
      const x = 15;
      const y = headY - 13;
      ctx.fillStyle = char.accent;
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10, y - 6);
      ctx.lineTo(x + 11, y + 3);
      ctx.closePath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y + 8);
      ctx.lineTo(x + 2, y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff4c8';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.accessory === 'goggles') {
      ctx.strokeStyle = '#5a4e63';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-16, headY - 11);
      ctx.lineTo(16, headY - 11);
      ctx.stroke();
      ctx.fillStyle = 'rgba(127,211,229,0.9)';
      ctx.strokeStyle = '#4b4357';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(-8, headY - 12, 4.4, 0, Math.PI * 2);
      ctx.arc(8, headY - 12, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-9.2, headY - 13.4, 1.2, 0, Math.PI * 2);
      ctx.arc(6.8, headY - 13.4, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (char.accessory === 'star') {
      this.drawStar(ctx, 15.5, headY - 13, 5.6, 2.6, 5, char.accent, '#b5843d');
    } else {
      // Cap.
      ctx.fillStyle = char.accent;
      ctx.strokeStyle = char.outfitDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, headY - 7, 17.5, Math.PI, Math.PI * 2);
      ctx.lineTo(-17, headY - 5);
      ctx.lineTo(17, headY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(11, headY - 4.5, 11, 3.2, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = teamColor;
      ctx.beginPath();
      ctx.arc(0, headY - 8, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawThinkingBubble(player: Player): void {
    const ctx = this.ctx;
    const x = player.x + 28;
    const y = player.y - 129;
    ctx.save();
    ctx.fillStyle = 'rgba(255,250,235,0.94)';
    ctx.strokeStyle = 'rgba(62,73,88,0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y + 8, 3, 0, Math.PI * 2);
    ctx.arc(x - 6, y + 14, 2, 0, Math.PI * 2);
    roundRectPath(ctx, x - 16, y - 13, 40, 23, 10);
    ctx.fill();
    ctx.stroke();
    const dotPhase = Math.floor(this.time * 3) % 3;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i === dotPhase ? '#ef7d6f' : '#9aa3ae';
      ctx.beginPath();
      ctx.arc(x - 8 + i * 8, y - 1, i === dotPhase ? 2.4 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProjectiles(game: Game): void {
    const ctx = this.ctx;
    for (const projectile of game.projectiles) {
      this.drawProjectile(projectile);
    }
  }

  private drawProjectile(projectile: Projectile): void {
    const ctx = this.ctx;
    const weapon = WEAPONS[projectile.weapon];
    // A little heat shimmer beneath the shell.
    if (projectile.weapon !== 'heal') {
      const glow = ctx.createRadialGradient(
        projectile.x,
        projectile.y,
        0,
        projectile.x,
        projectile.y,
        22,
      );
      glow.addColorStop(0, 'rgba(255,236,168,0.28)');
      glow.addColorStop(1, 'rgba(255,236,168,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trail.
    for (let i = 0; i < projectile.trail.length; i += 1) {
      const point = projectile.trail[i];
      const progress = i / projectile.trail.length;
      const alpha = progress * 0.55;
      ctx.fillStyle = i % 4 === 0 ? weapon.color : weapon.glow;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.4 + progress * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (projectile.trail.length > 4) {
      const tail = projectile.trail[0];
      ctx.strokeStyle = weapon.glow;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      for (const point of projectile.trail) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    const angle = Math.atan2(projectile.vy, projectile.vx);
    ctx.rotate(angle);
    ctx.shadowColor = weapon.glow;
    ctx.shadowBlur = 9;

    if (projectile.weapon === 'heal') {
      const pulse = 1 + Math.sin(this.time * 8 + projectile.id) * 0.12;
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.arc(0, 0, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4ffe8';
      ctx.beginPath();
      ctx.arc(-2, -2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a9d55';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.moveTo(0, -4);
      ctx.lineTo(0, 4);
      ctx.stroke();
    } else if (projectile.weapon === 'heavy') {
      ctx.fillStyle = '#45404e';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.arc(0, 0, 8.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#39343f';
      ctx.fillRect(-4, -12, 8, 6);
      ctx.strokeStyle = '#ffca6e';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(3, -18, 7, -16);
      ctx.stroke();
      ctx.fillStyle = '#ffe7a8';
      ctx.beginPath();
      ctx.arc(7.5, -16, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const radius = projectile.weapon === 'triple' ? 7.2 : 9.2;
      ctx.fillStyle = '#403b4b';
      ctx.beginPath();
      ctx.ellipse(0, 0, radius + 1.6, radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = weapon.color;
      ctx.beginPath();
      ctx.ellipse(0.6, 0, radius, radius - 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff2bd';
      ctx.beginPath();
      ctx.arc(-1.6, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBlasts(): void {
    const ctx = this.ctx;
    for (const blast of this.blasts) {
      const progress = 1 - blast.life / blast.maxLife;
      const alpha = Math.pow(1 - progress, 1.25);
      const radius = blast.radius * (0.72 + progress * 1.05);
      ctx.save();
      ctx.globalAlpha = alpha;
      const fire = ctx.createRadialGradient(
        blast.x,
        blast.y,
        radius * 0.06,
        blast.x,
        blast.y,
        radius,
      );
      fire.addColorStop(0, 'rgba(255,250,214,0.98)');
      fire.addColorStop(0.2, 'rgba(255,219,118,0.96)');
      fire.addColorStop(0.45, 'rgba(255,155,75,0.9)');
      fire.addColorStop(0.7, 'rgba(241,98,56,0.62)');
      fire.addColorStop(0.9, 'rgba(190,60,38,0.18)');
      fire.addColorStop(1, 'rgba(150,44,32,0)');
      ctx.fillStyle = fire;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.85;
      const core = ctx.createRadialGradient(
        blast.x,
        blast.y,
        0,
        blast.x,
        blast.y,
        radius * 0.52,
      );
      core.addColorStop(0, 'rgba(255,255,240,0.95)');
      core.addColorStop(0.45, 'rgba(255,239,160,0.6)');
      core.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, radius * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      if (particle.type === 'smoke') {
        ctx.globalAlpha = alpha * 0.28;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.type === 'spark') {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(
          particle.x - particle.vx * 0.025,
          particle.y - particle.vy * 0.025,
        );
        ctx.stroke();
      } else if (particle.type === 'debris') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.7);
        ctx.restore();
      } else if (particle.type === 'star') {
        ctx.globalAlpha = alpha;
        this.drawStar(
          ctx,
          particle.x,
          particle.y,
          particle.size,
          particle.size * 0.42,
          5,
          particle.color,
          'rgba(255,244,201,0.86)',
          particle.rotation,
        );
      } else if (particle.type === 'plus') {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(particle.x - particle.size, particle.y);
        ctx.lineTo(particle.x + particle.size, particle.y);
        ctx.moveTo(particle.x, particle.y - particle.size);
        ctx.lineTo(particle.x, particle.y + particle.size);
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const ring of this.rings) {
      const alpha = clamp(ring.life / ring.maxLife, 0, 1);
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const floater of this.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, alpha * 1.6);
      ctx.font = `900 ${floater.size}px 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(41,35,50,0.72)';
      ctx.strokeText(floater.text, floater.x, floater.y);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawGhosts(): void {
    const ctx = this.ctx;
    for (const ghost of this.ghosts) {
      const alpha = clamp(ghost.life / ghost.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.translate(ghost.x, ghost.y);
      ctx.fillStyle = '#f9fbff';
      ctx.beginPath();
      ctx.arc(0, 0, 14, Math.PI, 0);
      ctx.lineTo(14, 16);
      ctx.quadraticCurveTo(7, 10, 0, 16);
      ctx.quadraticCurveTo(-7, 10, -14, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#445066';
      ctx.beginPath();
      ctx.arc(-5, -3, 1.6, 0, Math.PI * 2);
      ctx.arc(5, -3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = TEAM_COLOR[ghost.team];
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -18, 9, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawWindLeaves(game: Game, dt: number): void {
    const ctx = this.ctx;
    const wind = game.wind;
    for (const leaf of this.windLeaves) {
      leaf.x += (8 + wind * 8) * dt * leaf.speed;
      leaf.y += Math.sin(this.time * 1.4 + leaf.phase) * 7 * dt;
      if (leaf.x > 1330) leaf.x = -30;
      if (leaf.x < -40) leaf.x = 1320;
      if (leaf.y > 700) leaf.y = 70;
      if (leaf.y < 60) leaf.y = 690;
      const alpha = 0.24 + Math.sin(this.time + leaf.phase) * 0.12;
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(this.time * 0.8 + leaf.phase + wind * 0.1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.palette.grassLight;
      ctx.beginPath();
      ctx.ellipse(0, 0, leaf.size * 1.8, leaf.size * 0.75, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawBirds(nowMs: number): void {
    const ctx = this.ctx;
    for (const bird of this.birds) {
      const x = ((bird.x + nowMs * 0.001 * bird.speed) % 1900) - 200;
      const y = bird.y + Math.sin(this.time * 0.8 + bird.phase) * 8;
      const flap = Math.sin(this.time * 5 + bird.phase) * 4;
      ctx.strokeStyle = 'rgba(58,76,92,0.36)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 7, y + flap);
      ctx.quadraticCurveTo(x - 3, y - 2, x, y);
      ctx.quadraticCurveTo(x + 3, y - 2, x + 7, y + flap);
      ctx.stroke();
    }
  }

  private drawDragTether(): void {
    if (!this.drag?.active) return;
    const dx = this.drag.currentX - this.drag.startX;
    const dy = this.drag.currentY - this.drag.startY;
    const length = Math.hypot(dx, dy);
    if (length < 5) return;
    const ctx = this.ctx;
    const opacity = clamp(length / 80, 0.15, 0.75);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(this.drag.startX, this.drag.startY);
    ctx.lineTo(this.drag.currentX, this.drag.currentY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(43,58,74,0.45)';
    ctx.beginPath();
    ctx.arc(this.drag.startX, this.drag.startY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,240,0.85)';
    ctx.beginPath();
    ctx.arc(this.drag.startX, this.drag.startY, 8, 0, Math.PI * 2);
    ctx.stroke();
    const angle = Math.atan2(dy, dx);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.moveTo(this.drag.currentX, this.drag.currentY);
    ctx.lineTo(
      this.drag.currentX - Math.cos(angle - 0.45) * 12,
      this.drag.currentY - Math.sin(angle - 0.45) * 12,
    );
    ctx.lineTo(
      this.drag.currentX - Math.cos(angle + 0.45) * 12,
      this.drag.currentY - Math.sin(angle + 0.45) * 12,
    );
    ctx.closePath();
    ctx.fill();

    const power = Math.round(clamp(length / 200, 0, 1) * 100);
    ctx.font = "700 12px 'Microsoft YaHei UI', sans-serif";
    const label = `力度 ${power}%`;
    const labelWidth = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(37,49,64,0.78)';
    roundRectPath(
      ctx,
      this.drag.currentX + 14,
      this.drag.currentY - 14,
      labelWidth,
      24,
      12,
    );
    ctx.fill();
    ctx.fillStyle = '#fff7df';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, this.drag.currentX + 14 + labelWidth / 2, this.drag.currentY - 1);
    ctx.restore();
  }

  private drawScreenAtmosphere(game: Game): void {
    const ctx = this.ctx;
    // Warm light from the top right.
    const light = ctx.createRadialGradient(1080, 90, 20, 1080, 90, 640);
    light.addColorStop(0, 'rgba(255,250,219,0.16)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 1280, 720);

    if (game.phase === 'flying') {
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      const offset = (this.time * 120) % 40;
      for (let i = -2; i < 20; i += 1) {
        const y = i * 42 + offset;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1280, y - 60);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private spawnMuzzle(x: number, y: number, facing: 1 | -1, color: string): void {
    for (let i = 0; i < 14; i += 1) {
      const angle = (Math.random() * 0.8 - 0.4) * Math.PI;
      const speed = 80 + Math.random() * 250;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed * facing,
        vy: Math.sin(angle) * speed - 25,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.5,
        size: 2 + Math.random() * 3.5,
        color: Math.random() < 0.45 ? '#fff5cc' : color,
        type: 'spark',
        gravity: 380,
        drag: 1.2,
        rotation: 0,
        spin: 0,
      });
    }
    this.rings.push({
      x,
      y,
      radius: 4,
      maxRadius: 26,
      life: 0.3,
      maxLife: 0.3,
      color,
      width: 2.5,
    });
  }

  private explode(x: number, y: number, radius: number, weapon: WeaponId, team: Team): void {
    const color = WEAPONS[weapon].color;
    this.addShake(Math.min(18, radius * 0.14));
    this.flash = Math.min(0.9, 0.3 + radius / 220);
    this.blasts.push({
      x,
      y,
      radius: radius * 0.95,
      life: 0.66,
      maxLife: 0.66,
      color,
    });
    this.rings.push({
      x,
      y,
      radius: 8,
      maxRadius: radius * 1.05,
      life: 0.55,
      maxLife: 0.55,
      color: 'rgba(255,206,126,0.9)',
      width: 3,
    });
    this.rings.push({
      x,
      y,
      radius: 4,
      maxRadius: radius * 0.8,
      life: 0.4,
      maxLife: 0.4,
      color,
      width: 2,
    });
    if (weapon !== 'heal') {
      this.scorches.push({ x, radius: radius * 0.95, seed: Math.floor(Math.random() * 99999) });
      if (this.scorches.length > 24) this.scorches.shift();
    }

    const smokeCount = Math.round(radius * 0.28);
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 110;
      this.addParticle({
        x: x + Math.random() * 18 - 9,
        y: y + Math.random() * 12 - 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        life: 0.8 + Math.random() * 0.8,
        maxLife: 1.6,
        size: 8 + Math.random() * radius * 0.22,
        color: i % 3 === 0 ? '#f3d5aa' : '#6f635f',
        type: 'smoke',
        gravity: -24,
        drag: 1.1,
        rotation: 0,
        spin: 0,
      });
    }
    const sparkCount = Math.round(radius * 0.34);
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 420;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.3 + Math.random() * 0.45,
        maxLife: 0.7,
        size: 1.5 + Math.random() * 2.4,
        color: Math.random() < 0.5 ? color : '#fff4c4',
        type: 'spark',
        gravity: 760,
        drag: 0.4,
        rotation: 0,
        spin: 0,
      });
    }
    for (let i = 0; i < 14; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 180;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        life: 0.26 + Math.random() * 0.28,
        maxLife: 0.54,
        size: 5 + Math.random() * 8,
        color: i % 3 === 0 ? '#fff3b0' : i % 3 === 1 ? '#ffb056' : '#ff7a4f',
        type: 'circle',
        gravity: -20,
        drag: 1.4,
        rotation: 0,
        spin: 0,
      });
    }
    const debrisCount = Math.round(radius * 0.2);
    for (let i = 0; i < debrisCount; i += 1) {
      const angle = -Math.PI + Math.random() * Math.PI;
      const speed = 120 + Math.random() * 280;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        life: 0.6 + Math.random() * 0.7,
        maxLife: 1.3,
        size: 2 + Math.random() * 4,
        color: Math.random() < 0.5 ? '#7a5139' : '#a7714b',
        type: 'debris',
        gravity: 900,
        drag: 0.2,
        rotation: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
      });
    }
    for (let i = 0; i < 5; i += 1) {
      this.addParticle({
        x: x + (Math.random() * 40 - 20),
        y: y - 10 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 60,
        vy: -30 - Math.random() * 50,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 5 + Math.random() * 4,
        color: i % 2 === 0 ? '#ffe28a' : '#fff6d1',
        type: 'star',
        gravity: 110,
        drag: 0.6,
        rotation: Math.random() * 6,
        spin: (Math.random() - 0.5) * 8,
      });
    }
    void team;
  }

  private spawnHeal(x: number, y: number, radius: number): void {
    this.rings.push({
      x,
      y,
      radius: 6,
      maxRadius: radius,
      life: 0.75,
      maxLife: 0.75,
      color: '#c7ffad',
      width: 3,
    });
    for (let i = 0; i < Math.round(radius * 0.25); i += 1) {
      this.addParticle({
        x: x + (Math.random() * 2 - 1) * radius * 0.55,
        y: y + Math.random() * 20,
        vx: (Math.random() - 0.5) * 26,
        vy: -40 - Math.random() * 70,
        life: 0.7 + Math.random() * 0.7,
        maxLife: 1.4,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#dcffb9' : '#91e88a',
        type: Math.random() < 0.32 ? 'plus' : 'star',
        gravity: -34,
        drag: 0.5,
        rotation: Math.random() * 6,
        spin: (Math.random() - 0.5) * 3,
      });
    }
    this.floaters.push({
      x,
      y: y - 18,
      vy: -36,
      life: 1.15,
      maxLife: 1.15,
      text: '+ 治疗',
      color: '#d8ffb1',
      size: 20,
    });
  }

  private spawnDeath(x: number, y: number, team: Team): void {
    this.ghosts.push({ x, y: y - 48, team, life: 2, maxLife: 2 });
    for (let i = 0; i < 15; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;
      this.addParticle({
        x,
        y: y - 45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life: 0.5 + Math.random() * 0.6,
        maxLife: 1.1,
        size: 3 + Math.random() * 4,
        color: Math.random() < 0.5 ? TEAM_COLOR[team] : '#fff3b0',
        type: 'star',
        gravity: 260,
        drag: 0.7,
        rotation: Math.random() * 6,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnFirework(x: number, y: number, color: string): void {
    this.rings.push({
      x,
      y,
      radius: 4,
      maxRadius: 90,
      life: 0.7,
      maxLife: 0.7,
      color,
      width: 3,
    });
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const speed = 130 + Math.random() * 140;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.9 + Math.random() * 0.6,
        maxLife: 1.5,
        size: 2 + Math.random() * 2.5,
        color,
        type: 'star',
        gravity: 150,
        drag: 0.45,
        rotation: Math.random() * 6,
        spin: 2,
      });
    }
  }

  private addParticle(particle: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(particle);
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    outer: number,
    inner: number,
    points: number,
    fill: string,
    stroke: string,
    rotation = 0,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
