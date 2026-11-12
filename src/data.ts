import type { CharacterDef, PropId, Team, WeaponDef, WeaponId } from './types';

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

export interface PropDef {
  id: PropId;
  name: string;
  short: string;
  description: string;
  count: number;
  fuelCost: number;
  color: string;
  iconSvg: string;
}

export const PROPS: Record<PropId, PropDef> = {
  teleport: {
    id: 'teleport',
    name: '传送飞机',
    short: '飞机',
    description: '射出一架纸飞机，瞬间传送到落点，绝地脱困必备。',
    count: 2,
    fuelCost: 20,
    color: '#4dabf7',
    iconSvg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="m2.01 21 20.99-9L2.01 3 2 10l15 2-15 2z"/></svg>`,
  },
  double: {
    id: 'double',
    name: '双发连击',
    short: '双发',
    description: '本回合连续打出两枚炮弹，火力瞬间翻倍！',
    count: 2,
    fuelCost: 25,
    color: '#ffd166',
    iconSvg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 4 14h6v8l8-12h-6z"/></svg>`,
  },
  boost: {
    id: 'boost',
    name: '威力+50%',
    short: '强击',
    description: '为下一次发射注入超能火药，威力增加50%，炸坑更大。',
    count: 2,
    fuelCost: 25,
    color: '#ff6b6b',
    iconSvg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
  },
  shield: {
    id: 'shield',
    name: '能量护盾',
    short: '护盾',
    description: '生成一层抵御35点伤害的光能球形护盾。',
    count: 2,
    fuelCost: 20,
    color: '#8ee6c8',
    iconSvg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18 7 3.12v4.7c0 4.67-3.13 8.96-7 10.02-3.87-1.06-7-5.35-7-10.02V6.3l7-3.12z"/></svg>`,
  },
};

export const PROP_ORDER: PropId[] = ['teleport', 'double', 'boost', 'shield'];
