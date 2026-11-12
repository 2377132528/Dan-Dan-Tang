import type { CharacterDef, Team, WeaponDef, WeaponId } from './types';

export const CHARACTERS: Record<string, CharacterDef> = {
  tuantuan: {
    id: 'tuantuan',
    name: '团团',
    team: 'red',
    skin: '#ffe1c9',
    hair: '#ef6a70',
    hairDark: '#c94a58',
    outfit: '#ff8b86',
    outfitDark: '#cf535f',
    accent: '#ffd36a',
    style: 'twin',
    accessory: 'ribbon',
    blurb: '红队的小队长，风再大也要往前冲。',
  },
  xiaoyou: {
    id: 'xiaoyou',
    name: '小柚',
    team: 'red',
    skin: '#f7d3b4',
    hair: '#f2a14e',
    hairDark: '#c97635',
    outfit: '#f6c46a',
    outfitDark: '#c38a35',
    accent: '#fff0b8',
    style: 'spiky',
    accessory: 'goggles',
    blurb: '看起来在发呆，其实在偷偷算弹道。',
  },
  lanmei: {
    id: 'lanmei',
    name: '蓝莓',
    team: 'blue',
    skin: '#ffe2cf',
    hair: '#6f9df4',
    hairDark: '#496fbf',
    outfit: '#7fc6f7',
    outfitDark: '#4f8fbf',
    accent: '#c8f0ff',
    style: 'bob',
    accessory: 'star',
    blurb: '蓝队的冷静担当，最喜欢逆风翻盘。',
  },
  ayan: {
    id: 'ayan',
    name: '阿岩',
    team: 'blue',
    skin: '#f3cfb0',
    hair: '#56c9b6',
    hairDark: '#338f84',
    outfit: '#79ddca',
    outfitDark: '#43998c',
    accent: '#ffe08a',
    style: 'short',
    accessory: 'cap',
    blurb: '扛着最重的炮，说着最软的话。',
  },
};

export const TEAM_CHARACTERS: Record<Team, string[]> = {
  red: ['tuantuan', 'xiaoyou'],
  blue: ['lanmei', 'ayan'],
};

export const ORDER_2V2 = [0, 2, 1, 3];
export const ORDER_1V1 = [0, 1];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  standard: {
    id: 'standard',
    name: '标准弹',
    short: '标准',
    description: '可靠的单发炮弹，威力稳定，数量无限。',
    damage: 36,
    radius: 64,
    speedScale: 1,
    count: 1,
    spread: 0,
    ammo: null,
    color: '#ffd166',
    glow: '#fff3b0',
    icon: 'shell',
  },
  triple: {
    id: 'triple',
    name: '三连弹',
    short: '三连',
    description: '一次射出三枚小炮弹，覆盖更宽的范围。',
    damage: 20,
    radius: 42,
    speedScale: 1.02,
    count: 3,
    spread: 5.5,
    ammo: 2,
    color: '#8ee6c8',
    glow: '#d9fff3',
    icon: 'triple',
  },
  heavy: {
    id: 'heavy',
    name: '重锤弹',
    short: '重锤',
    description: '又大又慢的重型炮弹，炸出巨大的坑。',
    damage: 56,
    radius: 100,
    speedScale: 0.9,
    count: 1,
    spread: 0,
    ammo: 2,
    color: '#ff9b54',
    glow: '#ffe0ad',
    icon: 'heavy',
  },
  heal: {
    id: 'heal',
    name: '治愈弹',
    short: '治愈',
    description: '在落点释放治疗波，为范围内的队友恢复生命。',
    damage: 0,
    heal: 32,
    radius: 108,
    speedScale: 0.96,
    count: 1,
    spread: 0,
    ammo: 2,
    color: '#a4e98d',
    glow: '#e8ffd9',
    icon: 'heal',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['standard', 'triple', 'heavy', 'heal'];

export const TEAM_LABEL: Record<Team, string> = {
  red: '红队',
  blue: '蓝队',
};

export const TEAM_COLOR: Record<Team, string> = {
  red: '#ff6b6b',
  blue: '#4dabf7',
};

export const TEAM_DARK: Record<Team, string> = {
  red: '#b9434f',
  blue: '#2f74a8',
};

export const WEAPON_ICON_SVG: Record<string, string> = {
  shell: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="ic-fill" d="M6 21c0-6 5-12 13-13 5-.6 7 1.8 7 5.2C26 20 20 26 13 26c-4 0-7-1.6-7-5z"/><path class="ic-line" d="M6 21c0-6 5-12 13-13 5-.6 7 1.8 7 5.2C26 20 20 26 13 26c-4 0-7-1.6-7-5z"/><path class="ic-line" d="m19 8 3-3 4 4-3 3M7 20l-3 5"/></svg>`,
  triple: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="ic-fill" cx="11" cy="11" r="4"/><circle class="ic-fill" cx="21" cy="14" r="4"/><circle class="ic-fill" cx="14" cy="22" r="4"/><path class="ic-line" d="M11 7v8M17 14h8M14 18v8"/></svg>`,
  heavy: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="ic-fill" cx="16" cy="18" r="9"/><path class="ic-line" d="M16 18c0-5 2-9 6-10M12 9l-3-4M24 13l4-1"/><path class="ic-line" d="m22 4 3-2 2 2-2 3z"/></svg>`,
  heal: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="ic-fill" d="M16 6c6 3 10 7 10 12a10 10 0 0 1-20 0c0-5 4-9 10-12z"/><path class="ic-line" d="M16 11v12M10 17h12"/></svg>`,
};
