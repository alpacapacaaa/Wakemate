/**
 * Design tokens — "여명 / Daybreak".
 *
 * Subject: a room of friends who share one wake-up time and are woken by each other's recorded
 * voices. What the app produces is the morning log — who got up, when, and whose voice did it.
 *
 * The cream ground and pastel card deck are the direction the user pinned from their reference and
 * are kept as given. What is this app's own is the rule below:
 *
 * A card's colour identifies which room it is and renders at full strength — an earlier pass
 * tinted it by how much of the room was awake, which drained the saturation this layout depends
 * on. Wake state is carried by the count, not the hue.
 *
 * Black is the only accent. It marks the one action on a screen and nothing else.
 */

export const colors = {
  /** Page ground. */
  paper: '#f7f2e6',
  /** The tab bar and the ↗ buttons sit a shade lighter than the page. */
  paperLight: '#fdfaf3',
  /** Recessed ground — behind a raised card, a pressed row, an inactive chip. */
  paperDeep: '#ede8d8',
  /** Text and the primary button. Warm-biased toward the paper, not a neutral grey. */
  ink: '#171612',
  inkSoft: '#57554f',
  /** On top of ink. */
  onInk: '#f6f2e5',
  line: 'rgba(23,22,18,0.10)',
  lineStrong: 'rgba(23,22,18,0.22)',
  /** A day with no alarm: pale, grey, unmistakably not one of the seven colours. */
  cardOff: '#e5e3dc',
  /** `cardOff` deepened — today's outline on a day that is switched off. */
  cardOffDeep: '#a09f9a',
  alert: '#b3402f',
  alertSoft: '#f4e0da',
} as const;

/**
 * The reference's seven card colours, sampled in order (Monday → Sunday). `tint` fills pills
 * sitting on a card, `deep` is text that must read against `tint` — and it doubles as today's
 * outline on a card of the same colour, where it lands 2.2–3.1 contrast against `base`: plainly a
 * darker version of that card rather than a new colour.
 */
export const CARD_COLORS = [
  { name: 'olive', base: '#8fa96c', tint: '#bccbA5', deep: '#586b3c' },
  { name: 'slate', base: '#8598b0', tint: '#b8c4d2', deep: '#4c5e73' },
  { name: 'powder', base: '#afc3e3', tint: '#d6e0f3', deep: '#61759a' },
  { name: 'sage', base: '#a9c7b8', tint: '#d3e5dc', deep: '#5d8071' },
  { name: 'brown', base: '#9c7c5c', tint: '#c4ada0', deep: '#63472c' },
  { name: 'butter', base: '#f1d05b', tint: '#f9e9ae', deep: '#8a7318' },
  { name: 'pink', base: '#f0a7bf', tint: '#f8d3de', deep: '#a35c74' },
] as const;

export type CardColor = (typeof CARD_COLORS)[number];

function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable colour for an id, so a room or a person keeps its colour everywhere it appears. */
export function cardColorFor(seed: string): CardColor {
  return CARD_COLORS[hashOf(seed) % CARD_COLORS.length];
}

/** Colour by position — for a deck where neighbouring cards must not repeat. */
export function cardColorAt(index: number): CardColor {
  return CARD_COLORS[index % CARD_COLORS.length];
}



export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 44,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  pillRow: 22,
  card: 28,
  sheet: 34,
  pill: 999,
} as const;

/**
 * Gothic A1 covers Hangul and Latin in one family, which is why it is the display face here: the
 * previous pass set headlines in a Latin-only face, so Korean silently fell back to the system
 * font at a regular weight and the headlines were only heavy in English.
 *
 * Clock digits stay in Figtree — Latin numerals only, and its figures are better proportioned for
 * the large time readouts.
 */
export const fonts = {
  display: 'GothicA1_900Black',
  displayMd: 'GothicA1_800ExtraBold',
  strong: 'GothicA1_700Bold',
  body: 'GothicA1_500Medium',
  bodyRegular: 'GothicA1_400Regular',
  numeric: 'Figtree_700Bold',
  latin: 'Figtree_900Black',
} as const;

export const type = {
  display: { fontFamily: fonts.latin, fontSize: 40, letterSpacing: -1.4, lineHeight: 46 },
  displaySm: { fontFamily: fonts.display, fontSize: 27, letterSpacing: -0.9, lineHeight: 34 },
  heading: { fontFamily: fonts.latin, fontSize: 22, letterSpacing: -0.4 },
  /** Clock numerals. Pair with fontVariant: ['tabular-nums'] wherever digits stack in a column. */
  time: { fontFamily: fonts.numeric, fontSize: 34, letterSpacing: -1 },
  timeLg: { fontFamily: fonts.numeric, fontSize: 56, letterSpacing: -2 },
  label: { fontFamily: fonts.strong, fontSize: 15, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  eyebrow: { fontFamily: fonts.latin, fontSize: 13, letterSpacing: -0.1 },
} as const;

/** Digits that line up in columns. */
export const tabular = { fontVariant: ['tabular-nums' as const] };
