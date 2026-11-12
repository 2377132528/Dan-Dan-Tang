import {
  CHARACTERS,
  PROPS,
  PROP_ORDER,
  TEAM_COLOR,
  TEAM_LABEL,
  WEAPONS,
  WEAPON_ICON_SVG,
  WEAPON_ORDER,
} from './data';
import type { Game } from './game';
import type { GameEvent, GameMode, Player, PropId, WeaponId } from './types';
import type { RoomState } from './online';
import type { SoundManager } from './audio';

type ScreenName = 'menu' | 'online' | 'game' | 'over' | 'pause';

interface RosterRow {
  row: HTMLElement;
  hpFill: HTMLElement;
  hpNum: HTMLElement;
  name: HTMLElement;
  badge: HTMLElement;
}

interface WeaponCard {
  card: HTMLElement;
  ammo: HTMLElement;
}

interface PropCard {
  card: HTMLElement;
  badge: HTMLElement;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class UI {
  private sound: SoundManager;
  private game: Game | null = null;
  private rosterRows = new Map<number, RosterRow>();
  private rosterSignature = '';
  private weaponCards = new Map<WeaponId, WeaponCard>();
  private weaponSignature = '';
  private propCards = new Map<PropId, PropCard>();
  private propsBuilt = false;
  private turnBannerTimer = 0;
  private tutorialVisible = false;
  private currentScreen: ScreenName = 'menu';
  private lastToastKey = '';
  private lastToastAt = 0;
  private copyCode = '';

  private cache = new Map<string, string>();
  private allScreens = ['menu', 'online-screen', 'over-screen', 'pause-screen'];

  onMode: ((mode: GameMode) => void) | null = null;
  onSoundToggle: (() => void) | null = null;
  onOpenOnline: (() => void) | null = null;
  onCloseOnline: (() => void) | null = null;
  onCreateRoom: ((name: string) => void) | null = null;
  onJoinRoom: ((code: string, name: string) => void) | null = null;
  onStartOnline: (() => void) | null = null;
  onPauseToggle: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onRematch: (() => void) | null = null;
  onFire: (() => void) | null = null;
  onMove: ((direction: -1 | 0 | 1) => void) | null = null;
  onWeapon: ((weapon: WeaponId) => void) | null = null;
  onProp: ((prop: PropId) => void) | null = null;
  onPowToggle: (() => void) | null = null;
  onHelpOpen: (() => void) | null = null;
  onHelpClose: (() => void) | null = null;

  constructor(sound: SoundManager) {
    this.sound = sound;
    this.buildWeaponHelp();
    this.bindMenu();
    this.bindOnline();
    this.bindGameplay();
    this.bindPauseAndResult();
    this.bindHelp();
    this.setMuted(sound.isMuted);

    const storedNickname = (() => {
      try {
        return localStorage.getItem('ddt-nickname') || '';
      } catch {
        return '';
      }
    })();
    const nickname = byId<HTMLInputElement>('nickname');
    nickname.value = storedNickname || `弹弹${Math.floor(10 + Math.random() * 89)}`;
  }

  private bindMenu(): void {
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode as GameMode | undefined;
        if (!mode) return;
        this.sound.unlock();
        this.sound.play('ui');
        if (mode === 'online') this.onOpenOnline?.();
        else this.onMode?.(mode);
      });
    });
    byId('menu-help-btn').addEventListener('click', () => {
      this.sound.play('ui');
      this.openHelp();
    });
    byId('menu-sound-btn').addEventListener('click', () => this.onSoundToggle?.());
    byId('btn-help').addEventListener('click', () => {
      this.sound.play('ui');
      this.openHelp();
    });
    byId('btn-sound').addEventListener('click', () => this.onSoundToggle?.());
    byId('btn-pause').addEventListener('click', () => {
      this.sound.play('ui');
      this.onPauseToggle?.();
    });
  }

  private bindOnline(): void {
    byId('online-close').addEventListener('click', () => this.onCloseOnline?.());
    byId('online-back').addEventListener('click', () => this.onCloseOnline?.());
    byId('btn-create-room').addEventListener('click', () => {
      this.sound.play('ui');
      const name = this.nickname();
      this.saveNickname(name);
      this.setOnlineError('');
      this.setOnlineStatus('正在创建房间…', 'pending');
      this.setOnlineBusy(true);
      this.onCreateRoom?.(name);
    });
    byId('btn-join-room').addEventListener('click', () => this.tryJoin());
    byId('room-code-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.tryJoin();
    });
    byId('nickname').addEventListener('change', () => this.saveNickname(this.nickname()));
    byId('nickname').addEventListener('focus', (event) => {
      (event.target as HTMLInputElement).select();
    });
    byId('btn-start-online').addEventListener('click', () => {
      this.sound.play('ui');
      this.onStartOnline?.();
    });
    byId('btn-copy-code').addEventListener('click', () => {
      this.copyRoomCode();
    });
    byId('room-code-input').addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  private bindGameplay(): void {
    byId('btn-fire').addEventListener('click', () => {
      this.sound.unlock();
      this.onFire?.();
    });
    const left = byId('move-left');
    const right = byId('move-right');
    const stop = (): void => this.onMove?.(0);
    const start = (button: HTMLElement, direction: -1 | 1, pointerId: number): void => {
      this.sound.unlock();
      try {
        button.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is a nice-to-have, not a requirement.
      }
      this.onMove?.(direction);
    };
    left.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      start(left, -1, event.pointerId);
    });
    right.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      start(right, 1, event.pointerId);
    });
    for (const button of [left, right]) {
      button.addEventListener('pointerup', stop);
      button.addEventListener('pointercancel', stop);
      button.addEventListener('lostpointercapture', stop);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    window.addEventListener('pointerup', () => this.onMove?.(0));

    byId('weapon-bar').addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-weapon]');
      if (!target) return;
      const weapon = target.dataset.weapon as WeaponId | undefined;
      if (!weapon) return;
      this.sound.play('ui');
      this.onWeapon?.(weapon);
    });

    const propsBar = document.getElementById('props-bar');
    propsBar?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-prop]');
      if (!target) return;
      const prop = target.dataset.prop as PropId | undefined;
      if (!prop) return;
      this.sound.unlock();
      this.onProp?.(prop);
    });

    const powBtn = document.getElementById('btn-pow');
    powBtn?.addEventListener('click', () => {
      this.sound.unlock();
      this.onPowToggle?.();
    });
  }

  private bindPauseAndResult(): void {
    byId('btn-resume').addEventListener('click', () => {
      this.sound.play('ui');
      this.onResume?.();
    });
    byId('btn-restart').addEventListener('click', () => {
      this.sound.play('ui');
      this.onRestart?.();
    });
    byId('btn-quit').addEventListener('click', () => {
      this.sound.play('ui');
      this.onQuit?.();
    });
    byId('btn-rematch').addEventListener('click', () => {
      this.sound.play('ui');
      this.onRematch?.();
    });
    byId('btn-result-menu').addEventListener('click', () => {
      this.sound.play('ui');
      this.onQuit?.();
    });
  }

  private bindHelp(): void {
    byId('help-close').addEventListener('click', () => this.closeHelp());
    byId('help-modal').addEventListener('click', (event) => {
      if (event.target === byId('help-modal')) this.closeHelp();
    });
  }

  private buildWeaponHelp(): void {
    const root = byId('weapon-help');
    root.innerHTML = WEAPON_ORDER.map((id) => {
      const weapon = WEAPONS[id];
      const ammo = weapon.ammo === null ? '无限' : `${weapon.ammo} 发`;
      return `<div class="weapon-help-item">
        <span class="weapon-help-icon" style="--weapon-color:${weapon.color}">${WEAPON_ICON_SVG[weapon.icon]}</span>
        <div><strong>${weapon.name} <small>${ammo}</small></strong><p>${weapon.description}</p></div>
      </div>`;
    }).join('');
  }

  openHelp(): void {
    byId('help-modal').classList.remove('hidden');
    this.onHelpOpen?.();
  }

  closeHelp(): void {
    byId('help-modal').classList.add('hidden');
    this.sound.play('ui');
    this.onHelpClose?.();
  }

  isHelpOpen(): boolean {
    return !byId('help-modal').classList.contains('hidden');
  }

  private nickname(): string {
    const input = byId<HTMLInputElement>('nickname');
    const value = input.value.trim().slice(0, 10);
    if (!value) {
      const fallback = `弹弹${Math.floor(10 + Math.random() * 89)}`;
      input.value = fallback;
      return fallback;
    }
    return value;
  }

  private saveNickname(name: string): void {
    try {
      localStorage.setItem('ddt-nickname', name);
    } catch {
      // Ignore.
    }
  }

  private tryJoin(): void {
    this.sound.play('ui');
    const code = byId<HTMLInputElement>('room-code-input').value.replace(/\D/g, '');
    if (code.length !== 4) {
      this.setOnlineError('请输入 4 位房间码。');
      return;
    }
    const name = this.nickname();
    this.saveNickname(name);
    this.setOnlineError('');
    this.setOnlineStatus('正在加入房间…', 'pending');
    this.setOnlineBusy(true);
    this.onJoinRoom?.(code, name);
  }

  private copyRoomCode(): void {
    if (!this.copyCode) return;
    const code = this.copyCode;
    const finish = (): void => this.toast('房间码已复制，发给好友吧！');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(finish).catch(() => this.fallbackCopy(code, finish));
    } else {
      this.fallbackCopy(code, finish);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    } catch {
      // Clipboard access is a nice-to-have.
    }
    done();
  }

  showScreen(screen: ScreenName): void {
    this.currentScreen = screen;
    for (const id of this.allScreens) {
      byId(id).classList.toggle('hidden', id !== this.screenId(screen));
    }
    const hud = byId('hud');
    hud.classList.toggle('hidden', screen === 'menu' || screen === 'online');
    if (screen === 'menu') {
      byId('menu').classList.remove('hidden');
    }
    if (screen !== 'pause') byId('pause-screen').classList.add('hidden');
  }

  private screenId(screen: ScreenName): string {
    if (screen === 'online') return 'online-screen';
    if (screen === 'over') return 'over-screen';
    if (screen === 'pause') return 'pause-screen';
    if (screen === 'game') return '';
    return 'menu';
  }

  showGame(game: Game): void {
    this.game = game;
    this.rebuildForGame(game);
    this.showScreen('game');
    this.hideOverlayScreens();
    this.tutorialVisible = false;
    byId('tutorial-hint').classList.add('hidden');
    this.cache.clear();
  }

  private hideOverlayScreens(): void {
    byId('over-screen').classList.add('hidden');
    byId('pause-screen').classList.add('hidden');
    byId('online-screen').classList.add('hidden');
  }

  showMenu(): void {
    this.showScreen('menu');
    this.game = null;
    this.hideOverlayScreens();
    byId('tutorial-hint').classList.add('hidden');
    byId('kill-feed').innerHTML = '';
    byId('toast-area').innerHTML = '';
  }

  showOnline(): void {
    this.showScreen('online');
    this.resetOnlinePanel();
    this.setOnlineBusy(false);
    this.setOnlineStatus('填写昵称，创建或加入一个房间。', 'idle');
  }

  showPause(online: boolean): void {
    byId('pause-screen').classList.remove('hidden');
    const restart = byId<HTMLButtonElement>('btn-restart');
    restart.disabled = online;
    byId('pause-note').textContent = online
      ? '联机对战无法重新开始；退出会离开当前房间。'
      : '按 Esc 也可以继续';
    this.sound.play('ui');
  }

  hidePause(): void {
    byId('pause-screen').classList.add('hidden');
  }

  openOnline(): void {
    this.onOpenOnline?.();
  }

  setOnlineBusy(busy: boolean): void {
    byId<HTMLButtonElement>('btn-create-room').disabled = busy;
    byId<HTMLButtonElement>('btn-join-room').disabled = busy;
    byId<HTMLInputElement>('room-code-input').disabled = busy;
  }

  setOnlineStatus(text: string, kind: 'idle' | 'pending' | 'ok' | 'error' = 'idle'): void {
    const status = byId('room-status');
    status.textContent = text;
    status.dataset.kind = kind;
    const globalStatus = byId('online-status');
    globalStatus.textContent = text;
    globalStatus.dataset.kind = kind;
  }

  setOnlineError(message: string): void {
    const error = byId('online-error');
    error.textContent = message;
    error.classList.toggle('hidden', !message);
    if (message) this.setOnlineBusy(false);
  }

  resetOnlinePanel(): void {
    byId('online-actions').classList.remove('hidden');
    byId('room-panel').classList.add('hidden');
    byId('nickname-field').classList.remove('hidden');
    byId('online-status').classList.remove('hidden');
    byId<HTMLButtonElement>('btn-start-online').disabled = true;
    byId('online-error').classList.add('hidden');
    byId('room-code').textContent = '----';
    byId('room-name-1').textContent = '等待好友…';
    byId('room-state-1').textContent = '房间码已生成';
    byId('room-player-1').classList.remove('online');
    byId('room-dot-0').className = 'room-dot ready';
    byId('room-dot-1').className = 'room-dot';
    this.copyCode = '';
    this.setOnlineBusy(false);
  }

  showRoom(room: RoomState): void {
    byId('online-actions').classList.add('hidden');
    byId('room-panel').classList.remove('hidden');
    byId('nickname-field').classList.add('hidden');
    byId('online-status').classList.add('hidden');
    byId('room-code').textContent = room.code;
    this.copyCode = room.code;
    const host = room.clients[0];
    const guest = room.clients[1];
    const other = room.clients[room.you === 0 ? 1 : 0];
    const slots = [
      {
        name: host?.name || '等待房主…',
        state: host ? (room.you === 0 ? '你 · 房主' : '房主') : '房间已建立',
        ready: !!host,
      },
      {
        name: guest?.name || '等待好友…',
        state: guest ? (room.you === 1 ? '你 · 挑战者' : '已就位') : '把房间码发给朋友',
        ready: !!guest,
      },
    ];
    slots.forEach((slot, index) => {
      byId(`room-name-${index}`).textContent = slot.name;
      byId(`room-state-${index}`).textContent = slot.state;
      byId(`room-player-${index}`).classList.toggle('online', slot.ready);
      byId(`room-dot-${index}`).className = slot.ready ? 'room-dot ready' : 'room-dot';
    });
    byId('btn-start-online').classList.toggle('hidden', room.you !== 0);
    byId<HTMLButtonElement>('btn-start-online').disabled = !(room.you === 0 && other);
    if (room.you === 0) {
      this.setOnlineStatus(other ? '好友已加入，准备开战！' : '等待好友输入房间码加入…', other ? 'ok' : 'pending');
    } else {
      this.setOnlineStatus('已加入房间，等待房主开始对战…', 'pending');
    }
    this.setOnlineBusy(false);
    this.setOnlineError('');
  }

  hideOnline(): void {
    byId('online-screen').classList.add('hidden');
    this.copyCode = '';
  }

  setMuted(muted: boolean): void {
    document.body.classList.toggle('sound-muted', muted);
    byId('btn-sound').setAttribute('aria-label', muted ? '打开音效' : '关闭音效');
    byId('menu-sound-btn').setAttribute('aria-label', muted ? '打开音效' : '关闭音效');
  }

  setMenuWind(wind: number): void {
    byId('menu-wind-arrow').textContent = wind >= 0 ? '→' : '←';
    byId('menu-wind-value').textContent = Math.abs(wind).toFixed(1);
  }

  private rebuildForGame(game: Game): void {
    const signature = `${game.mode}-${game.localIndex}-${game.players.map((p) => `${p.id}:${p.name}`).join('|')}`;
    if (signature !== this.rosterSignature) {
      this.rosterSignature = signature;
      this.buildRosters(game);
      this.propsBuilt = false;
    }
    this.rebuildWeaponBar(game);
  }

  private buildRosters(game: Game): void {
    this.rosterRows.clear();
    for (const team of ['red', 'blue'] as const) {
      const root = byId(team === 'red' ? 'roster-red' : 'roster-blue');
      const players = game.players.filter((player) => player.team === team);
      root.innerHTML = `
        <div class="roster-head">
          <span class="team-name">${TEAM_LABEL[team]}</span>
          <span class="team-alive" data-team-alive="${team}">${players.filter((p) => p.alive).length}/${players.length}</span>
        </div>
        ${players
          .map((player) => {
            const character = CHARACTERS[player.charId] ?? CHARACTERS.tuantuan;
            const badge = this.playerBadge(game, player);
            return `<div class="roster-row" data-player-row="${player.id}">
              <div class="avatar" style="--hair:${character.hair};--hair-dark:${character.hairDark};--skin:${character.skin};--outfit:${character.outfit}">
                <span class="mini-hair"></span><span class="mini-face"></span>
              </div>
              <div class="roster-info">
                <div class="roster-name-line"><span class="roster-name" data-player-name="${player.id}">${escapeHtml(player.name)}</span><span class="player-badge">${badge}</span></div>
                <div class="hp-track"><div class="hp-fill" data-player-hp="${player.id}"></div></div>
              </div>
              <div class="hp-number" data-player-hpnum="${player.id}">${player.hp}</div>
            </div>`;
          })
          .join('')}`;
      for (const player of players) {
        const row = root.querySelector<HTMLElement>(`[data-player-row="${player.id}"]`);
        const hpFill = root.querySelector<HTMLElement>(`[data-player-hp="${player.id}"]`);
        const hpNum = root.querySelector<HTMLElement>(`[data-player-hpnum="${player.id}"]`);
        const name = root.querySelector<HTMLElement>(`[data-player-name="${player.id}"]`);
        const badge = row?.querySelector<HTMLElement>('.player-badge');
        if (row && hpFill && hpNum && name && badge) {
          this.rosterRows.set(player.id, { row, hpFill, hpNum, name, badge });
        }
      }
    }
  }

  private playerBadge(game: Game, player: Player): string {
    if (game.mode === 'solo') {
      if (player.id === 0) return '你';
      return player.isAI ? 'AI' : '';
    }
    if (game.mode === 'local') return `P${player.id + 1}`;
    return player.id === game.localIndex ? '你' : '对手';
  }

  private rebuildWeaponBar(game: Game): void {
    const player = game.activePlayer;
    const signature = `${game.localIndex}-${game.mode}-${game.players.length}`;
    if (signature !== this.weaponSignature) {
      this.weaponSignature = signature;
      const bar = byId('weapon-bar');
      bar.innerHTML = WEAPON_ORDER.map((id, index) => {
        const weapon = WEAPONS[id];
        return `<button class="weapon-card" data-weapon="${id}" title="${weapon.description}">
          <span class="weapon-key">${index + 1}</span>
          <span class="weapon-icon" style="--weapon-color:${weapon.color};--weapon-glow:${weapon.glow}">${WEAPON_ICON_SVG[weapon.icon]}</span>
          <span class="weapon-text"><strong>${weapon.short}</strong><small data-weapon-ammo="${id}">${this.ammoText(id, player)}</small></span>
        </button>`;
      }).join('');
      this.weaponCards.clear();
      for (const id of WEAPON_ORDER) {
        const card = bar.querySelector<HTMLElement>(`[data-weapon="${id}"]`);
        const ammo = bar.querySelector<HTMLElement>(`[data-weapon-ammo="${id}"]`);
        if (card && ammo) this.weaponCards.set(id, { card, ammo });
      }
    } else {
      for (const id of WEAPON_ORDER) {
        const card = this.weaponCards.get(id);
        const ammo = card?.ammo;
        if (ammo) ammo.textContent = this.ammoText(id, player);
      }
    }
  }

  private ammoText(id: WeaponId, player: Player): string {
    if (WEAPONS[id].ammo === null) return '∞';
    return `${player.ammo[id] ?? 0}`;
  }

  private rebuildPropsBar(game: Game): void {
    const player = game.activePlayer;
    const bar = document.getElementById('props-bar');
    if (!bar) return;
    if (!this.propsBuilt) {
      this.propsBuilt = true;
      bar.innerHTML = PROP_ORDER.map((id) => {
        const def = PROPS[id];
        return `<button class="prop-card" data-prop="${id}" title="${def.name}：${def.description} (消耗${def.fuelCost}体力)">
          <span class="prop-icon" style="--prop-color:${def.color}">${def.iconSvg}</span>
          <span class="prop-name">${def.short}</span>
          <span class="prop-badge" data-prop-count="${id}">${player.props[id] ?? 0}</span>
        </button>`;
      }).join('');
      this.propCards.clear();
      for (const id of PROP_ORDER) {
        const card = bar.querySelector<HTMLElement>(`[data-prop="${id}"]`);
        const badge = bar.querySelector<HTMLElement>(`[data-prop-count="${id}"]`);
        if (card && badge) this.propCards.set(id, { card, badge });
      }
    }

    const isLocalTurn = game.canLocalControl(player);
    const aimPhase = game.phase === 'aim';

    for (const id of PROP_ORDER) {
      const entry = this.propCards.get(id);
      if (!entry) continue;
      const count = player.props[id] ?? 0;
      entry.badge.textContent = `${count}`;
      const def = PROPS[id];
      const canUse = count > 0 && player.fuel >= def.fuelCost && isLocalTurn && aimPhase;
      entry.card.classList.toggle('disabled', !canUse);
      const isActive = player.activeProps.includes(id);
      entry.card.classList.toggle('active', isActive);
    }
  }

  sync(game: Game, dragging: boolean): void {
    this.game = game;
    const player = game.activePlayer;
    const isLocalTurn = game.canLocalControl(player);
    const aimPhase = game.phase === 'aim';

    this.setText('angle-value', `${Math.round(player.angle)}°`);
    this.setText('power-value', `${Math.round(player.power)}`);
    this.setStyle('power-fill', 'width', `${Math.round(player.power)}%`);
    this.setStyle('fuel-fill', 'width', `${Math.round(player.fuel)}%`);
    this.setText('fuel-value', `${Math.round(player.fuel)}`);
    this.setStyle('rage-fill', 'width', `${Math.round(player.rage)}%`);
    this.setText('rage-value', `${Math.round(player.rage)}%`);

    const powBtn = document.getElementById('btn-pow') as HTMLButtonElement | null;
    if (powBtn) {
      const isPowReady = player.rage >= 100;
      powBtn.classList.toggle('ready', isPowReady);
      powBtn.classList.toggle('active', !!player.isPow);
      powBtn.disabled = !isLocalTurn || !aimPhase || !isPowReady;
    }

    this.rebuildPropsBar(game);

    const timerNumber = byId('timer-num');
    const timerRing = byId('timer-ring');
    let timerText = String(Math.ceil(game.timer));
    let timerLabel = '秒';
    if (!aimPhase) {
      timerText = game.phase === 'flying' ? '…' : game.phase === 'waiting' ? '·' : '—';
      timerLabel = '';
    } else if (player.isAI) {
      timerText = 'AI';
      timerLabel = '';
    } else if (game.mode === 'online' && player.id !== game.localIndex) {
      timerText = '对';
      timerLabel = '手';
    }
    this.setText('timer-num', timerText);
    const labelEl = timerRing.querySelector('small');
    if (labelEl) labelEl.textContent = timerLabel;
    const fraction = aimPhase && !player.isAI ? Math.max(0, Math.min(1, game.timer / game.turnTime)) : 0;
    const degrees = fraction * 360;
    timerRing.style.background = `conic-gradient(${fraction <= 0.28 ? '#ff6b6b' : fraction <= 0.55 ? '#ffb454' : '#4dabf7'} ${degrees}deg, rgba(255,250,235,0.22) ${degrees}deg 360deg)`;
    timerRing.classList.toggle('is-muted', !aimPhase || player.isAI || (game.mode === 'online' && player.id !== game.localIndex));
    timerRing.classList.toggle('danger', fraction > 0 && fraction <= 0.2);

    const wind = game.wind;
    byId('wind-arrow').textContent = Math.abs(wind) < 0.1 ? '·' : wind > 0 ? '→' : '←';
    byId('wind-arrow').classList.toggle('strong', Math.abs(wind) > 6);
    this.setText('wind-value', Math.abs(wind).toFixed(1));

    let turnText = `${TEAM_LABEL[player.team]}回合`;
    if (game.mode === 'solo') {
      turnText = player.id === 0 ? '你的回合' : player.isAI ? '对手行动' : '队友行动';
    } else if (game.mode === 'online') {
      turnText = player.id === game.localIndex ? '你的回合' : '对手回合';
    } else {
      turnText = `${TEAM_LABEL[player.team]} · ${player.name}`;
    }
    this.setText('turn-chip-text', turnText);
    byId('turn-chip').dataset.team = player.team;

    const aliveRed = game.players.filter((p) => p.team === 'red' && p.alive).length;
    const aliveBlue = game.players.filter((p) => p.team === 'blue' && p.alive).length;
    const redAlive = document.querySelector<HTMLElement>('[data-team-alive="red"]');
    const blueAlive = document.querySelector<HTMLElement>('[data-team-alive="blue"]');
    const redTotal = game.players.filter((p) => p.team === 'red').length;
    const blueTotal = game.players.filter((p) => p.team === 'blue').length;
    if (redAlive) redAlive.textContent = `${aliveRed}/${redTotal}`;
    if (blueAlive) blueAlive.textContent = `${aliveBlue}/${blueTotal}`;

    for (const rosterPlayer of game.players) {
      const row = this.rosterRows.get(rosterPlayer.id);
      if (!row) continue;
      const ratio = Math.max(0, rosterPlayer.hp / rosterPlayer.maxHp);
      row.hpFill.style.width = `${ratio * 100}%`;
      const shieldText = rosterPlayer.shield > 0 ? ` (+${Math.round(rosterPlayer.shield)}🛡️)` : '';
      row.hpNum.textContent = `${Math.max(0, Math.round(rosterPlayer.hp))}${shieldText}`;
      row.row.classList.toggle('is-active', rosterPlayer.id === game.activeIndex);
      row.row.classList.toggle('is-dead', !rosterPlayer.alive);
      row.name.textContent = rosterPlayer.name;
    }

    for (const id of WEAPON_ORDER) {
      const entry = this.weaponCards.get(id);
      if (!entry) continue;
      const ammo = id === 'standard' ? Infinity : player.ammo[id] ?? 0;
      entry.card.classList.toggle('selected', player.weapon === id);
      entry.card.classList.toggle('empty', ammo <= 0);
      entry.card.classList.toggle('disabled', !isLocalTurn || !aimPhase || ammo <= 0);
      entry.ammo.textContent = this.ammoText(id, player);
    }

    const fireButton = byId<HTMLButtonElement>('btn-fire');
    fireButton.disabled = !isLocalTurn || !aimPhase;
    fireButton.classList.toggle('ready', isLocalTurn && aimPhase);

    const moveLeft = byId<HTMLButtonElement>('move-left');
    const moveRight = byId<HTMLButtonElement>('move-right');
    moveLeft.disabled = !isLocalTurn || !aimPhase || player.fuel <= 0;
    moveRight.disabled = !isLocalTurn || !aimPhase || player.fuel <= 0;

    let hint = '按住向后拖拽 · 松手开炮';
    if (game.phase === 'flying') hint = '炮弹飞行中…';
    else if (game.phase === 'resolving') hint = '计算战果…';
    else if (game.phase === 'waiting') hint = '等待对手同步…';
    else if (game.phase === 'gameover') hint = '对战结束';
    else if (!isLocalTurn) {
      if (game.mode === 'solo') hint = player.isAI ? 'AI 正在计算弹道…' : '等待队友行动…';
      else hint = '等待对手行动…';
    } else if (dragging) hint = '松开手，发射！';
    this.setText('control-hint', hint);

    const syncPill = byId('sync-pill');
    const showSync = game.mode === 'online' && game.phase === 'waiting';
    syncPill.classList.toggle('hidden', !showSync);

    if (this.tutorialVisible && (!isLocalTurn || !aimPhase || game.phase !== 'aim')) {
      this.hideTutorial();
    }
  }

  private setText(id: string, text: string): void {
    const key = `text:${id}`;
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  private setStyle(id: string, property: string, value: string): void {
    const key = `style:${id}:${property}`;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    const element = document.getElementById(id);
    if (element) element.style.setProperty(property, value);
  }

  showTurnBanner(text: string): void {
    const banner = byId('turn-banner');
    byId('turn-banner-text').textContent = text;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    window.clearTimeout(this.turnBannerTimer);
    this.turnBannerTimer = window.setTimeout(() => banner.classList.remove('show'), 1600);
  }

  hideTurnBanner(): void {
    window.clearTimeout(this.turnBannerTimer);
    byId('turn-banner').classList.remove('show');
  }

  toast(text: string, duration = 2600, tone: 'normal' | 'danger' | 'success' = 'normal'): void {
    const now = Date.now();
    const key = `${text}:${tone}`;
    if (key === this.lastToastKey && now - this.lastToastAt < 500) return;
    this.lastToastKey = key;
    this.lastToastAt = now;
    const area = byId('toast-area');
    const node = document.createElement('div');
    node.className = `toast toast-${tone}`;
    node.textContent = text;
    area.appendChild(node);
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 350);
    }, duration);
  }

  addKillFeed(text: string, team: string): void {
    const feed = byId('kill-feed');
    const node = document.createElement('div');
    node.className = 'kill-feed-item';
    node.innerHTML = `<span class="kill-dot" style="background:${TEAM_COLOR[team as 'red' | 'blue'] ?? '#fff'}"></span>${escapeHtml(text)}`;
    feed.appendChild(node);
    while (feed.children.length > 4) feed.firstElementChild?.remove();
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 350);
    }, 4200);
  }

  handleGameEvent(event: GameEvent, game: Game): void {
    if (event.type === 'turn') {
      let text = '';
      if (game.mode === 'solo') {
        text = event.player.id === 0 ? '你的回合' : event.player.isAI ? '对手行动' : '队友行动';
      } else if (game.mode === 'local') {
        text = `${TEAM_LABEL[event.player.team]} · ${event.player.name}`;
      } else {
        text = event.player.id === game.localIndex ? '你的回合' : '对手回合';
      }
      this.showTurnBanner(text);
      if (game.mode !== 'online') this.sound.play('turn');
      if (event.player.id === game.localIndex) this.sound.play('tick');
      this.cache.clear();
    } else if (event.type === 'message') {
      this.toast(event.text);
    } else if (event.type === 'timeout') {
      this.toast('时间到！自动开炮！', 1800, 'danger');
    } else if (event.type === 'waiting') {
      this.toast('正在等待对手同步战场…', 1500);
    } else if (event.type === 'pow') {
      const p = game.players.find((item) => item.id === event.playerId);
      this.toast(`🔥 ${p?.name ?? '角色'} 怒气爆发，必杀技就绪！`, 2000, 'danger');
    } else if (event.type === 'shield') {
      const p = game.players.find((item) => item.id === event.playerId);
      this.toast(`🛡️ ${p?.name ?? '角色'} 开启了能量护盾！`, 1800, 'normal');
    } else if (event.type === 'teleport') {
      const p = game.players.find((item) => item.id === event.playerId);
      this.toast(`✈️ ${p?.name ?? '角色'} 纸飞机精准传送！`, 1800, 'normal');
    } else if (event.type === 'crateSpawn') {
      this.toast('📦 战场上空掉落了神秘补给箱！', 2200, 'success');
    } else if (event.type === 'crateCollect') {
      const p = game.players.find((item) => item.id === event.playerId);
      this.toast(`🎁 ${p?.name ?? '角色'} 拾取了补给箱（${event.text}）！`, 1800, 'success');
    } else if (event.type === 'crit') {
      this.toast('💥 直击靶心！高额暴击！', 1800, 'danger');
    }
  }

  showTutorial(): void {
    this.tutorialVisible = true;
    byId('tutorial-hint').classList.remove('hidden');
  }

  hideTutorial(): void {
    this.tutorialVisible = false;
    byId('tutorial-hint').classList.add('hidden');
  }

  showResult(game: Game, winner: 'red' | 'blue' | null): void {
    const resultScreen = byId('over-screen');
    resultScreen.classList.remove('hidden');
    this.showScreen('over');
    const localTeam = game.mode === 'online' ? (game.localIndex === 0 ? 'red' : 'blue') : 'red';
    let title = '平局！';
    let kicker = 'BATTLE OVER';
    let sub = '山坡被夷为平地，谁也没能站到最后。';
    if (winner) {
      title = `${TEAM_LABEL[winner]}胜利！`;
      kicker = winner === localTeam ? 'VICTORY' : 'DEFEAT';
      if (game.mode === 'solo') {
        if (winner === 'red') {
          title = '红队胜利！';
          sub = '你和队友守住了这片山坡，配合得漂亮。';
        } else {
          title = '蓝队胜利…';
          sub = '别灰心，风向下一局就站在你这边。';
        }
      } else if (game.mode === 'local') {
        title = `${TEAM_LABEL[winner]}胜利！`;
        sub = winner === 'red' ? '红队守住了主场，蓝队下次再来。' : '蓝队逆风翻盘，红队服不服？';
      } else {
        title = winner === localTeam ? '你赢了！' : '惜败…';
        sub = winner === localTeam ? '这一炮，够你吹一整年。' : '差一点点！再来一局找回场子。';
      }
    }
    byId('result-kicker').textContent = kicker;
    byId('result-title').textContent = title;
    byId('result-sub').textContent = sub;

    const stats = [...game.getStats()].sort((a, b) => b.damage - a.damage);
    const mvp = stats[0];
    byId('result-stats').innerHTML = stats
      .map((stat) => {
        const isMvp = stat.id === mvp?.id && stat.damage > 0;
        return `<div class="stat-row ${stat.alive ? '' : 'is-dead'}" style="--team:${TEAM_COLOR[stat.team]}">
          <span class="stat-team-dot"></span>
          <span class="stat-name">${escapeHtml(stat.name)}${isMvp ? '<em>MVP</em>' : ''}${stat.alive ? '' : '<small>已倒下</small>'}</span>
          <span class="stat-metric"><b>${stat.damage}</b><small>伤害</small></span>
          <span class="stat-metric"><b>${stat.kills}</b><small>击倒</small></span>
          <span class="stat-metric"><b>${stat.hits}</b><small>命中</small></span>
        </div>`;
      })
      .join('');

    const rematch = byId<HTMLButtonElement>('btn-rematch');
    if (game.mode === 'online') {
      rematch.textContent = '返回大厅';
    } else {
      rematch.textContent = '再来一局';
    }

    this.spawnConfetti(winner === localTeam);
    this.sound.play(winner === localTeam ? 'victory' : 'defeat');
  }

  private spawnConfetti(celebrate: boolean): void {
    const root = byId('result-confetti');
    root.innerHTML = '';
    if (!celebrate) return;
    const colors = ['#ff6b6b', '#ffd166', '#4dabf7', '#8ee6c8', '#f7a8c4', '#fff3ba'];
    for (let i = 0; i < 34; i += 1) {
      const span = document.createElement('span');
      span.style.left = `${Math.random() * 100}%`;
      span.style.background = colors[i % colors.length];
      span.style.animationDelay = `${Math.random() * 0.9}s`;
      span.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
      span.style.width = `${4 + Math.random() * 6}px`;
      span.style.height = `${7 + Math.random() * 8}px`;
      span.style.transform = `rotate(${Math.random() * 180}deg)`;
      root.appendChild(span);
    }
  }

  setPauseVisible(visible: boolean, online = false): void {
    if (visible) this.showPause(online);
    else this.hidePause();
  }

  currentScreenName(): ScreenName {
    return this.currentScreen;
  }

  clearToast(): void {
    byId('toast-area').innerHTML = '';
    byId('kill-feed').innerHTML = '';
  }
}
