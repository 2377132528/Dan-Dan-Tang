export type Team = 'red' | 'blue';
export type WeaponId = 'standard' | 'triple' | 'heavy' | 'heal';
export type PropId = 'teleport' | 'double' | 'boost' | 'shield';
export type GameMode = 'solo' | 'local' | 'online';
export type Phase = 'aim' | 'flying' | 'resolving' | 'waiting' | 'gameover';

export interface Crate {
  id: number;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  kind: 'heal' | 'rage' | 'ammo' | 'prop';
}

export interface CharacterDef {
  id: string;
  name: string;
  team: Team;
  skin: string;
  hair: string;
  hairDark: string;
  outfit: string;
  outfitDark: string;
  accent: string;
  style: 'twin' | 'spiky' | 'bob' | 'short';
  accessory: 'ribbon' | 'goggles' | 'star' | 'cap';
  blurb: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  description: string;
  damage: number;
  heal?: number;
  radius: number;
  speedScale: number;
  count: number;
  spread: number;
  ammo: number | null;
  color: string;
  glow: string;
  icon: string;
}

export interface Player {
  id: number;
  charId: string;
  name: string;
  team: Team;
  isAI: boolean;
  local: boolean;
  x: number;
  y: number;
  vy: number;
  onGround: boolean;
  fallStart: number;
  hp: number;
  maxHp: number;
  shield: number;
  rage: number;
  fuel: number;
  alive: boolean;
  angle: number;
  power: number;
  facing: 1 | -1;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  props: Record<PropId, number>;
  activeProps: PropId[];
  isPow: boolean;
  damageDealt: number;
  shots: number;
  hits: number;
  falls: number;
  kills: number;
  moving: boolean;
}

export interface Shot {
  angle: number;
  power: number;
  facing: 1 | -1;
  weapon: WeaponId;
  x: number;
  y: number;
  isPow?: boolean;
  isTeleport?: boolean;
  isBoosted?: boolean;
}

export interface Projectile {
  id: number;
  ownerId: number;
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  trail: { x: number; y: number }[];
  trailTimer: number;
  dead: boolean;
  isPow?: boolean;
  isTeleport?: boolean;
  isBoosted?: boolean;
}

export interface ExplosionInfo {
  x: number;
  y: number;
  radius: number;
  weapon: WeaponId;
  playerId: number;
  team: Team;
  isPow?: boolean;
}

export type GameEvent =
  | { type: 'turn'; playerId: number; player: Player; round: number; synced?: boolean }
  | { type: 'wind'; value: number }
  | { type: 'fire'; playerId: number; shot: Shot }
  | { type: 'explosion'; info: ExplosionInfo }
  | { type: 'heal'; x: number; y: number; radius: number; playerId: number; team: Team }
  | { type: 'damage'; playerId: number; amount: number; x: number; y: number; kind: 'damage' | 'fall'; sourceId?: number; absorbed?: number }
  | { type: 'death'; playerId: number; x: number; y: number; team: Team; reason: 'damage' | 'fall' }
  | { type: 'moved'; playerId: number; x: number; y: number }
  | { type: 'moveStart'; playerId: number }
  | { type: 'moveEnd'; playerId: number; x: number; y: number }
  | { type: 'turnEnd'; playerId: number }
  | { type: 'sync'; snapshot: Snapshot }
  | { type: 'gameover'; winner: Team | null; stats: PlayerStats[] }
  | { type: 'timeout'; playerId: number }
  | { type: 'message'; text: string }
  | { type: 'waiting'; reason: 'sync' | 'opponent' }
  | { type: 'pow'; playerId: number }
  | { type: 'shield'; playerId: number; amount: number }
  | { type: 'teleport'; playerId: number; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'crateSpawn'; crate: Crate }
  | { type: 'crateCollect'; crateId: number; playerId: number; text: string; kind: string }
  | { type: 'crit'; x: number; y: number; text: string; bonus: number };

export interface PlayerStats {
  id: number;
  name: string;
  team: Team;
  damage: number;
  shots: number;
  hits: number;
  kills: number;
  alive: boolean;
}

export interface Snapshot {
  seed: number;
  heights: number[];
  players: {
    id: number;
    x: number;
    y: number;
    hp: number;
    shield?: number;
    rage?: number;
    alive: boolean;
    ammo: Record<WeaponId, number>;
    damageDealt: number;
    shots: number;
    hits: number;
    kills: number;
  }[];
  activeIndex: number;
  round: number;
  wind: number;
  winner?: Team | null;
  gameOver?: boolean;
}

export interface GameOptions {
  mode: GameMode;
  seed: number;
  localIndex: number;
  names?: string[];
  characters?: string[];
  maxHp?: number;
  turnTime?: number;
  onlineRole?: 'host' | 'guest';
}

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  valid: boolean;
}

export interface GameHandlers {
  onEvent?: (event: GameEvent) => void;
}
