// Heuristic release-type classifier (series name -> type). Used by pipeline and app.
//  m=mainline p=premium th=treasure hunt sth=super treasure hunt rlc=Red Line Club
//  cv=convention/event ex=store exclusive er=error
const RULES = [
  [/super treasure hunt|\bsth\b|\$th\b|\$uper/i, 'sth'],
  [/treasure hunt|\bth\b/i, 'th'],
  [/red ?line club|\brlc\b/i, 'rlc'],
  [/convention|nationals|toy fair|\bhw ?fest|collectors? event/i, 'cv'],
  [/\berror\b|misprint/i, 'er'],
  [/car culture|boulevard|premium|pop culture|team transport|elite 64|silver series|vintage racing|retro entertainment|hw rewards|speed machines|replica entertainment|id cars|fast & furious premium/i, 'p'],
  [/exclusive|walmart|target|kroger|dollar general|mattel creations/i, 'ex'],
];
export function classifyType(text) {
  const s = String(text ?? '');
  for (const [re, t] of RULES) if (re.test(s)) return t;
  return 'm';
}
export const TYPE_ORDER = ['m', 'ex', 'p', 'th', 'cv', 'rlc', 'sth', 'er'];
