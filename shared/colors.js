// Colour palette used for swatches, duplicate checks and statistics.
export const PALETTE = {
  yellow: '#f5c518', orange: '#f26a1b', red: '#d42a2a', maroon: '#7d1a2a', pink: '#e85a9c',
  purple: '#7d4cc9', blue: '#2a62d4', lightblue: '#7fb7e8', teal: '#1fb5b0', green: '#2e9e4a',
  lime: '#9ccf2a', white: '#f4f4f4', silver: '#b9bcc2', grey: '#6e7177', black: '#1b1b1d',
  brown: '#7a4b2a', gold: '#c9a23a',
};
export const FAMILIES = Object.keys(PALETTE);

// Order matters: the first matching rule wins.
const RULES = [
  [/maroon|burgundy|wine|cherry|oxblood/, 'maroon'],
  [/light blue|sky|baby blue|ice blue|powder|cyan|aqua blue/, 'lightblue'],
  [/teal|turquoise|aqua|mint/, 'teal'],
  [/lime|neon green|chartreuse|yellow green/, 'lime'],
  [/gold|champagne|bronze/, 'gold'],
  [/silver|chrome|zamac|spectraflame silver|metal|aluminum|aluminium/, 'silver'],
  [/gr[ae]y|charcoal|gunmetal|graphite|anthracite/, 'grey'],
  [/black/, 'black'],
  [/white|cream|ivory|pearl/, 'white'],
  [/pink|magenta|rose|fuchsia/, 'pink'],
  [/purple|violet|plum|lavender|mauve/, 'purple'],
  [/orange|copper|amber|salmon/, 'orange'],
  [/yellow|sand|tan|beige|khaki/, 'yellow'],
  [/brown|chocolate|coffee|rust/, 'brown'],
  [/green|olive|emerald|army/, 'green'],
  [/blue|navy|indigo|cobalt|sapphire/, 'blue'],
  [/red|crimson|scarlet|ruby|candy apple/, 'red'],
];

export function colorFamily(name) {
  const s = String(name ?? '').toLowerCase();
  if (!s.trim()) return '';
  if (FAMILIES.includes(s.trim())) return s.trim();
  for (const [re, fam] of RULES) if (re.test(s)) return fam;
  return '';
}

// Romanian labels used by the old prototype backups.
export const RO_COLORS = {
  galben: 'yellow', portocaliu: 'orange', rosu: 'red', visiniu: 'maroon', roz: 'pink', mov: 'purple',
  albastru: 'blue', bleu: 'lightblue', turcoaz: 'teal', verde: 'green', 'verde lime': 'lime', alb: 'white',
  argintiu: 'silver', gri: 'grey', negru: 'black', maro: 'brown', auriu: 'gold',
};
