// Heuristic release-type classifier (series name -> type). Used by pipeline and app.
//  m=mainline p=premium th=treasure hunt sth=super treasure hunt rlc=Red Line Club
//  cv=convention/event ex=store exclusive er=error
const RULES = [
  [/super treasure hunt|\bsth\b|\$th\b|\$uper/i, 'sth'],
  [/treasure hunt|\bth\b/i, 'th'],
  [/red ?line club|\brlc\b/i, 'rlc'],
  [/convention|nationals|toy fair|\bhw ?fest|collectors? event/i, 'cv'],
  [/\berror\b|misprint/i, 'er'],
  [/car culture|boulevard|premium|pop culture|team transport|formula one collection|elite 64|silver series|vintage racing|retro entertainment|hw rewards|speed machines|replica entertainment|id cars|fast & furious premium/i, 'p'],
  [/exclusive|walmart|target|kroger|dollar general|mattel creations/i, 'ex'],
];
/**
 * @param text  series name, casting name, notes - whatever names the line
 * @param wheels wheel type, when known. Real Riders (rubber) wheels are fitted to premium cars
 *   and almost never to mainline ones, so they catch the expensive lines whose series name is
 *   not in the list above - otherwise those score as mainline.
 */
export function classifyType(text, wheels = '') {
  const s = String(text ?? '');
  for (const [re, t] of RULES) if (re.test(s)) return t;
  return /\bRR[A-Z0-9]*\b|real ?riders?/i.test(String(wheels ?? '')) ? 'p' : 'm';
}
export const TYPE_ORDER = ['m', 'ex', 'p', 'th', 'cv', 'rlc', 'sth', 'er'];
