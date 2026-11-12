import './style.css';
import { AIController } from './ai';
import { SoundManager } from './audio';
import { CHARACTERS } from './data';
import { Game } from './game';
import { randomSeed } from './math';
import { OnlineClient, type OnlineStart, type RoomState } from './online';
import { OrientationController } from './orientation';
import { Renderer } from './renderer';
import type { DragState, GameEvent, GameMode, Snapshot, WeaponId } from './types';
import { UI } from './ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const sound = new SoundManager();
const renderer = new Renderer(canvas);
const ui = new UI(sound);
const ai = new AIController();
const online = new OnlineClient();
const orientation = new OrientationController();

orientation.addChangeListener(() => {
  renderer.resize();
});

let game: Game | null = null;
let menuGame: Game | null = null;
let paused = false;
let resultShown = false;
let resultTimer = 0;
let tutorialShown = false;
let tutorialDismissed = false;
let tutorialTimer = 0;
let drag: DragState | null = null;
let dragPointerId: number | null = null;
let charging = false;
let chargeTimer = 0;
let pendingSnapshot: Snapshot | null = null;
let lastSyncKey = '';
let onlineActive = false;
let onlineRoom: RoomState | null = null;
let leavingOnline = false;

interface LaunchOptions {
  seed?: number;
  names?: string[];
  characters?: string[];
  localIndex?: number;
  maxHp?: number;
  turnTime?: number;
}

function setCursor(): void {
  if (!game || paused || ui.isHelpOpen()) {
    canvas.style.cursor = 'default';
    return;
  }
  if (drag?.active) {
    canvas.style.cursor = 'grabbing';
  } else if (game.canLocalControl() && game.phase === 'aim') {
    canvas.style.cursor = 'crosshair';
  } else {
    canvas.style.cursor = 'default';
  }
}

function clearResultTimer(): void {
  window.clearTimeout(resultTimer);
  resultTimer = 0;
}

function clearTutorialTimer(): void {
  window.clearTimeout(tutorialTimer);
  tutorialTimer = 0;
}

function cancelDrag(): void {
  drag = null;
  dragPointerId = null;
  renderer.drag = null;
}

function cancelCharge(): void {
  charging = false;
  chargeTimer = 0;
}

function makeMenuScene(): void {
  const seed = randomSeed();
  const attract = new Game({
    mode: 'local',
    seed,
    localIndex: -1,
    turnTime: 99,
  });
  attract.start();
  menuGame = attract;
  game = null;
  renderer.reset(attract, true);
  renderer.setMenuMode(true);
  ui.setMenuWind(attract.wind);
}

function showMenu(): void {
  clearResultTimer();
  clearTutorialTimer();
  cancelDrag();
  cancelCharge();
  leavingOnline = true;
  if (online.isOpen) {
    online.leave();
  } else {
    online.close();
  }
  leavingOnline = false;
  onlineActive = false;
  onlineRoom = null;
  pendingSnapshot = null;
  lastSyncKey = '';
  paused = false;
  resultShown = false;
  game = null;
  ai.reset();
  ui.showMenu();
  makeMenuScene();
}

function launchGame(nextMode: GameMode, options: LaunchOptions = {}): void {
  clearResultTimer();
  clearTutorialTimer();
  if (game) game.onEvent = null;
  cancelDrag();
  cancelCharge();
  paused = false;
  resultShown = false;
  pendingSnapshot = null;
  lastSyncKey = '';
  const localIndex = options.localIndex ?? (nextMode === 'local' ? -1 : 0);
  const next = new Game({
    mode: nextMode,
    seed: options.seed ?? randomSeed(),
    localIndex,
    names: options.names,
    characters: options.characters,
    maxHp: options.maxHp ?? (nextMode === 'online' ? 120 : 100),
    turnTime: options.turnTime ?? (nextMode === 'online' ? 35 : 30),
  });
  game = next;
  menuGame = null;
  next.onEvent = (event) => handleGameEvent(next, event);
  renderer.reset(next, false);
  renderer.setMenuMode(false);
  ui.showGame(next);
  ui.hidePause();
  next.start();
  ai.reset();

  if (nextMode !== 'online' && next.canLocalControl() && !tutorialShown) {
    tutorialShown = true;
    tutorialDismissed = false;
    tutorialTimer = window.setTimeout(() => {
      if (
        game === next &&
        next.phase === 'aim' &&
        next.canLocalControl() &&
        !tutorialDismissed &&
        !ui.isHelpOpen()
      ) {
        ui.showTutorial();
      }
    }, 850);
    window.setTimeout(() => {
      if (!tutorialDismissed) ui.hideTutorial();
    }, 14000);
  }
  sound.unlock();
  sound.play('start');
  setCursor();
}

function playEventSound(event: GameEvent): void {
  switch (event.type) {
    case 'fire':
      sound.play('shot');
      break;
    case 'explosion':
      sound.play('explosion');
      break;
    case 'heal':
      sound.play('heal');
      break;
    case 'damage':
      sound.play('hit');
      break;
    case 'death':
      sound.play('death');
      break;
    case 'timeout':
      sound.play('tick');
      break;
    case 'pow':
      sound.play('pow');
      break;
    case 'crateSpawn':
    case 'crateCollect':
      sound.play('crate');
      break;
    case 'teleport':
      sound.play('teleport');
      break;
    case 'shield':
      sound.play('shield');
      break;
    case 'crit':
      sound.play('crit');
      break;
    default:
      break;
  }
}

function handleGameEvent(source: Game, event: GameEvent): void {
  renderer.handleEvent(event);
  playEventSound(event);
  ui.handleGameEvent(event, source);

  if (event.type === 'fire') {
    tutorialDismissed = true;
    window.clearTimeout(tutorialTimer);
    ui.hideTutorial();
    if (game === source && source.mode === 'online' && event.playerId === source.localIndex) {
      const shooter = source.players[event.playerId];
      if (shooter) {
        online.sendPayload({
          kind: 'move',
          playerId: shooter.id,
          x: shooter.x,
          y: shooter.y,
        });
      }
      online.sendPayload({ kind: 'fire', playerId: event.playerId, shot: event.shot });
    }
  } else if (event.type === 'moveEnd') {
    if (game === source && source.mode === 'online' && event.playerId === source.localIndex) {
      online.sendPayload({
        kind: 'move',
        playerId: event.playerId,
        x: event.x,
        y: event.y,
      });
    }
  } else if (event.type === 'sync') {
    if (game === source && source.mode === 'online' && source.localIndex === 0) {
      online.sendPayload({ kind: 'sync', snapshot: event.snapshot });
    }
  } else if (event.type === 'waiting') {
    maybeApplyPending();
  } else if (event.type === 'gameover') {
    clearResultTimer();
    resultTimer = window.setTimeout(() => {
      if (game !== source || resultShown) return;
      resultShown = true;
      paused = false;
      cancelDrag();
      cancelCharge();
      ui.hidePause();
      ui.showResult(source, event.winner);
      setCursor();
    }, 1250);
  }
}

function snapshotKey(snapshot: Snapshot): string {
  return [
    snapshot.activeIndex,
    snapshot.round,
    snapshot.wind,
    snapshot.gameOver ? 1 : 0,
    ...snapshot.players.map((player) => `${player.id}:${player.hp}:${player.alive ? 1 : 0}:${Math.round(player.x)}`),
  ].join('|');
}

function maybeApplyPending(): void {
  if (!game || !pendingSnapshot || game.mode !== 'online' || game.localIndex !== 1) return;
  if (game.phase !== 'waiting' && game.phase !== 'aim') return;
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  const key = snapshotKey(snapshot);
  if (key === lastSyncKey) return;
  lastSyncKey = key;
  game.applySnapshot(snapshot);
}

function handleRelay(payload: unknown): void {
  if (!game || game.mode !== 'online' || resultShown) return;
  if (!payload || typeof payload !== 'object') return;
  const message = payload as Record<string, unknown>;
  if (message.kind === 'fire') {
    const playerId = Number(message.playerId);
    if (playerId === game.localIndex) return;
    const shot = message.shot as
      | { angle: number; power: number; facing: 1 | -1; weapon: WeaponId; x: number; y: number }
      | undefined;
    if (!shot) return;
    game.remoteFire(playerId, shot);
  } else if (message.kind === 'move') {
    const playerId = Number(message.playerId);
    if (playerId === game.localIndex) return;
    game.remoteMove(playerId, Number(message.x), Number(message.y));
  } else if (message.kind === 'sync') {
    if (game.localIndex !== 1) return;
    pendingSnapshot = message.snapshot as Snapshot;
    maybeApplyPending();
  }
}

function createRoom(name: string): void {
  ui.setOnlineStatus('正在创建房间…', 'pending');
  ui.setOnlineBusy(true);
  online
    .connect()
    .then(() => {
      online.createRoom(name);
    })
    .catch(() => {
      ui.setOnlineError('连不上联机服务。请确认游戏是用 npm run dev 启动的完整服务。');
      ui.setOnlineBusy(false);
    });
}

function joinRoom(code: string, name: string): void {
  ui.setOnlineStatus('正在加入房间…', 'pending');
  ui.setOnlineBusy(true);
  online
    .connect()
    .then(() => {
      online.joinRoom(code, name);
    })
    .catch(() => {
      ui.setOnlineError('连不上联机服务。请确认游戏是用 npm run dev 启动的完整服务。');
      ui.setOnlineBusy(false);
    });
}

function startOnlineGame(start: OnlineStart): void {
  onlineActive = true;
  onlineRoom = null;
  ui.hideOnline();
  launchGame('online', {
    seed: start.seed,
    names: [start.names[0], start.names[1]],
    characters: ['tuantuan', 'lanmei'],
    localIndex: start.you,
    maxHp: 120,
    turnTime: 35,
  });
  ui.toast(start.you === 0 ? '你是红队，先手开炮！' : '你是蓝队，等待对手先手…', 2800);
}

function openOnline(): void {
  ui.showOnline();
  ui.setOnlineStatus('正在连接联机服务…', 'pending');
  ui.setOnlineBusy(true);
  online
    .connect()
    .then(() => {
      ui.setOnlineBusy(false);
      if (ui.currentScreenName() === 'online') {
        ui.setOnlineStatus('已连接。创建房间，或输入好友的房间码。', 'ok');
      }
    })
    .catch(() => {
      ui.setOnlineBusy(false);
      ui.setOnlineError('连不上联机服务。请确认游戏是用 npm run dev 启动的完整服务。');
    });
}

function handlePeerLeft(): void {
  if (resultShown) return;
  if (game && game.mode === 'online') {
    if (game.phase === 'gameover') return;
    paused = true;
    ui.toast('对手离开了房间，本局结束。', 2200, 'danger');
    window.setTimeout(() => {
      if (game?.mode === 'online' && !resultShown) showMenu();
    }, 1500);
    return;
  }
  if (onlineRoom?.you === 0) {
    ui.setOnlineStatus('好友离开了房间，等待新的挑战者…', 'pending');
    ui.setOnlineError('');
    return;
  }
  ui.setOnlineError('房主离开了房间，请重新创建或加入一个房间。');
  ui.setOnlineBusy(false);
  onlineRoom = null;
}

function leaveOnlineQuietly(): void {
  if (leavingOnline) return;
  leavingOnline = true;
  if (online.isOpen) {
    online.leave();
  } else {
    online.close();
  }
  leavingOnline = false;
  onlineActive = false;
  onlineRoom = null;
}

ui.onMode = (nextMode) => {
  launchGame(nextMode);
};
ui.onOpenOnline = openOnline;
ui.onSoundToggle = () => {
  const muted = sound.toggleMute();
  ui.setMuted(muted);
  ui.toast(muted ? '音效已关闭' : '音效已开启', 1500);
};
ui.onCreateRoom = createRoom;
ui.onJoinRoom = joinRoom;
ui.onStartOnline = () => {
  if (!online.isOpen) return;
  online.startMatch();
};
ui.onCloseOnline = () => {
  leaveOnlineQuietly();
  showMenu();
};
ui.onPauseToggle = () => {
  if (!game || resultShown) return;
  if (ui.isHelpOpen()) {
    ui.closeHelp();
    return;
  }
  paused = !paused;
  if (paused) {
    cancelDrag();
    cancelCharge();
    game.stopMove(false);
    tutorialDismissed = true;
    ui.hideTutorial();
    ui.showPause(game.mode === 'online');
  } else {
    ui.hidePause();
  }
  setCursor();
};
ui.onResume = () => {
  if (!game) return;
  paused = false;
  ui.hidePause();
  setCursor();
};
ui.onRestart = () => {
  if (!game || game.mode === 'online') return;
  const nextMode = game.mode as 'solo' | 'local';
  ui.hidePause();
  launchGame(nextMode);
};
ui.onQuit = () => {
  showMenu();
};
ui.onRematch = () => {
  if (!game) return;
  if (game.mode === 'online') {
    showMenu();
    return;
  }
  const nextMode = game.mode as 'solo' | 'local';
  launchGame(nextMode);
};
ui.onFire = () => {
  if (!game || paused || resultShown) return;
  cancelCharge();
  if (game.phase === 'aim' && game.canLocalControl()) {
    game.fireCurrent();
  }
};

// 移动端开炮按钮支持长按蓄力 & 松手发射
const fireButtonEl = document.getElementById('btn-fire');
if (fireButtonEl) {
  let isFireCharging = false;
  fireButtonEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (!game || paused || resultShown || ui.isHelpOpen()) return;
    if (!game.canLocalControl() || game.phase !== 'aim') return;
    sound.unlock();
    isFireCharging = true;
    try {
      fireButtonEl.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    beginCharge();
  });

  const finishFireCharge = () => {
    if (!isFireCharging) return;
    isFireCharging = false;
    releaseCharge();
  };

  fireButtonEl.addEventListener('pointerup', finishFireCharge);
  fireButtonEl.addEventListener('pointercancel', () => {
    if (isFireCharging) {
      isFireCharging = false;
      cancelCharge();
    }
  });
  fireButtonEl.addEventListener('lostpointercapture', () => {
    if (isFireCharging) {
      isFireCharging = false;
      releaseCharge();
    }
  });
}
ui.onMove = (direction) => {
  if (!game || paused || resultShown) return;
  if (direction !== 0) {
    cancelCharge();
    cancelDrag();
  }
  game.setMoveDirection(direction);
};
ui.onWeapon = (weapon) => {
  if (!game || paused || resultShown) return;
  if (game.selectWeapon(weapon)) {
    sound.play('tick');
    ui.sync(game, false);
  }
};
ui.onProp = (prop) => {
  if (!game || paused || resultShown) return;
  if (game.useProp(prop)) {
    sound.play(prop === 'shield' ? 'shield' : 'ui');
    ui.sync(game, false);
  }
};
ui.onPowToggle = () => {
  if (!game || paused || resultShown) return;
  if (game.togglePow()) {
    sound.play('pow');
    ui.sync(game, false);
  }
};
ui.onHelpOpen = () => {
  if (!game) return;
  cancelDrag();
  cancelCharge();
  game.stopMove(false);
};
ui.onHelpClose = () => {
  // The simulation resumes automatically; nothing else to restore.
};

online.onRoom = (room) => {
  onlineRoom = room;
  if (ui.currentScreenName() === 'online') {
    ui.showRoom(room);
  }
};
online.onStart = (start) => {
  startOnlineGame(start);
};
online.onRelay = (payload) => {
  handleRelay(payload);
};
online.onPeerLeft = () => {
  handlePeerLeft();
};
online.onError = (message) => {
  if (ui.currentScreenName() === 'online') {
    ui.setOnlineError(message);
  } else {
    ui.toast(message, 2800, 'danger');
  }
};
online.onClose = () => {
  if (leavingOnline) return;
  if (onlineActive || ui.currentScreenName() === 'online') {
    onlineActive = false;
    onlineRoom = null;
    ui.toast('与联机服务的连接断开了。', 2200, 'danger');
    window.setTimeout(() => showMenu(), 1200);
  }
};
online.onStatus = (status) => {
  if (ui.currentScreenName() === 'online' && !online.isOpen) {
    const statusEl = document.getElementById('online-status');
    if (statusEl) statusEl.textContent = status;
  }
};

function pointerPosition(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  if (document.body.classList.contains('force-landscape')) {
    const localX = ((event.clientY - rect.top) / rect.height) * 1280;
    const localY = ((rect.right - event.clientX) / rect.width) * 720;
    return {
      x: Math.max(0, Math.min(1280, localX)),
      y: Math.max(0, Math.min(720, localY)),
    };
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1280,
    y: ((event.clientY - rect.top) / rect.height) * 720,
  };
}

function beginCharge(): void {
  if (!game || !game.canLocalControl() || game.phase !== 'aim') return;
  charging = true;
  chargeTimer = 0;
  const player = game.activePlayer;
  game.setAim(player.angle, 0, player.facing);
  tutorialDismissed = true;
  window.clearTimeout(tutorialTimer);
  ui.hideTutorial();
}

function releaseCharge(): void {
  if (!charging) return;
  charging = false;
  if (!game || resultShown || paused) return;
  if (!game.canLocalControl() || game.phase !== 'aim') return;
  const player = game.activePlayer;
  if (player.power < 8) {
    game.setAim(player.angle, 55, player.facing);
  }
  game.fireCurrent();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!game || paused || resultShown || ui.isHelpOpen()) return;
  if (event.button !== 0) return;
  if (!game.canLocalControl() || game.phase !== 'aim') return;
  sound.unlock();
  const point = pointerPosition(event);
  drag = {
    active: true,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    valid: false,
  };
  dragPointerId = event.pointerId;
  renderer.drag = drag;
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag?.active || event.pointerId !== dragPointerId || !game) return;
  const point = pointerPosition(event);
  drag.currentX = point.x;
  drag.currentY = point.y;
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  const length = Math.hypot(dx, dy);
  if (length > 8) {
    const shotX = -dx;
    const shotY = -dy;
    const facing: 1 | -1 = shotX >= 0 ? 1 : -1;
    const angle = clampAngle((Math.atan2(-shotY, Math.abs(shotX)) * 180) / Math.PI);
    const power = Math.min(100, Math.max(0, ((length - 8) / 190) * 100));
    game.setAim(angle, power, facing);
    drag.valid = length > 18;
  }
  renderer.drag = drag;
  event.preventDefault();
});

function finishDrag(event: PointerEvent, fire: boolean): void {
  if (!drag?.active || event.pointerId !== dragPointerId) return;
  const wasValid = drag.valid;
  const activeGame = game;
  const canFire =
    fire &&
    wasValid &&
    !!activeGame &&
    activeGame.phase === 'aim' &&
    activeGame.canLocalControl() &&
    !paused &&
    !resultShown;
  cancelDrag();
  if (canFire && activeGame) {
    activeGame.fireCurrent();
  }
  event.preventDefault();
}

canvas.addEventListener('pointerup', (event) => finishDrag(event, true));
canvas.addEventListener('pointercancel', (event) => finishDrag(event, false));
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('lostpointercapture', () => {
  if (drag?.active) cancelDrag();
});

function clampAngle(value: number): number {
  return Math.max(-15, Math.min(90, value));
}

document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
document.addEventListener('keydown', () => sound.unlock(), { capture: true });

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  if (event.key === 'Escape') {
    if (ui.isHelpOpen()) {
      ui.closeHelp();
      return;
    }
    if (ui.currentScreenName() === 'online') {
      leaveOnlineQuietly();
      showMenu();
      return;
    }
    if (ui.currentScreenName() === 'over') {
      showMenu();
      return;
    }
    if (game && !resultShown) {
      ui.onPauseToggle?.();
    }
    return;
  }

  if (!game || paused || resultShown || ui.isHelpOpen()) return;
  if (ui.currentScreenName() !== 'game') return;

  const key = event.key.toLowerCase();
  if (['1', '2', '3', '4'].includes(key)) {
    const weapons: WeaponId[] = ['standard', 'triple', 'heavy', 'heal'];
    const weapon = weapons[Number(key) - 1];
    if (weapon && game.selectWeapon(weapon)) {
      sound.play('tick');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }

  if (!game.canLocalControl() || game.phase !== 'aim') return;

  if (key === 'q') {
    if (game.useProp('teleport')) {
      sound.play('ui');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }
  if (key === 'e') {
    if (game.useProp('double')) {
      sound.play('ui');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }
  if (key === 'r') {
    if (game.useProp('boost')) {
      sound.play('ui');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }
  if (key === 't') {
    if (game.useProp('shield')) {
      sound.play('shield');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }
  if (key === 'b' || key === 'p') {
    if (game.togglePow()) {
      sound.play('pow');
      ui.sync(game, false);
    }
    event.preventDefault();
    return;
  }

  if (key === 'a' || event.key === 'ArrowLeft') {
    game.setMoveDirection(-1);
    event.preventDefault();
    return;
  }
  if (key === 'd' || event.key === 'ArrowRight') {
    game.setMoveDirection(1);
    event.preventDefault();
    return;
  }
  if (key === 'w' || event.key === 'ArrowUp') {
    const player = game.activePlayer;
    game.setAim(player.angle + 2, player.power, player.facing);
    event.preventDefault();
    return;
  }
  if (key === 's' || event.key === 'ArrowDown') {
    const player = game.activePlayer;
    game.setAim(player.angle - 2, player.power, player.facing);
    event.preventDefault();
    return;
  }
  if (event.code === 'Space') {
    if (!event.repeat && !charging) beginCharge();
    event.preventDefault();
    return;
  }
  if (key === 'f' || event.key === 'Enter') {
    cancelCharge();
    game.fireCurrent();
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && charging) {
    releaseCharge();
    event.preventDefault();
    return;
  }
  if (!game) return;
  if (['a', 'd', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) {
    game.setMoveDirection(0);
  }
});

window.addEventListener('blur', () => {
  if (!game) return;
  game.setMoveDirection(0);
  if (charging) {
    charging = false;
    chargeTimer = 0;
  }
  cancelDrag();
});

window.addEventListener('resize', () => {
  // CSS keeps the frame at 16:9; the renderer handles its own backing store.
  renderer.resize();
});

let lastFrame = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  const currentGame = game;
  const simulate = !!currentGame && !paused && !ui.isHelpOpen();

  if (currentGame && simulate) {
    if (currentGame.mode === 'solo') {
      ai.update(currentGame, dt);
    }
    if (charging) {
      chargeTimer += dt;
      if (currentGame.canLocalControl() && currentGame.phase === 'aim') {
        const player = currentGame.activePlayer;
        const power = Math.min(100, (chargeTimer / 1.2) * 100);
        currentGame.setAim(player.angle, power, player.facing);
      } else {
        cancelCharge();
      }
    }
    currentGame.update(dt);
    maybeApplyPending();
    if (drag?.active && (currentGame.phase !== 'aim' || !currentGame.canLocalControl())) {
      cancelDrag();
    }
    ui.sync(currentGame, !!drag?.active);
    setCursor();
  } else if (currentGame) {
    ui.sync(currentGame, false);
  }

  const scene = currentGame ?? menuGame;
  if (scene) {
    renderer.render(scene, paused ? 0 : dt, now);
  }
}

window.addEventListener('beforeunload', () => {
  if (online.isOpen) {
    try {
      online.leave();
    } catch {
      // Ignore unload errors.
    }
  }
});

showMenu();

// A small debug handle makes it easier to inspect a match during development.
(window as unknown as { __DDT__: unknown }).__DDT__ = {
  get game() {
    return game;
  },
  get menuGame() {
    return menuGame;
  },
  renderer,
  ui,
  startSolo: () => launchGame('solo'),
  startLocal: () => launchGame('local'),
  showMenu,
  setPaused: (value: boolean) => {
    paused = value;
    setCursor();
  },
  simulateBoom: (x: number, y: number) => {
    renderer.handleEvent({
      type: 'explosion',
      info: {
        x,
        y,
        radius: 100,
        weapon: 'heavy',
        playerId: 0,
        team: 'red',
      },
    });
  },
};

requestAnimationFrame(frame);
