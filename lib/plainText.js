// Turning stored prose into plain text.
//
// Descriptions can carry Markdown links ("[Hoover Dam](/poi/hoover-dam)"),
// headings and emphasis. That's right on the page, where it renders, but
// wrong anywhere the text is reused as plain words: search snippets (meta
// description), Open Graph cards, JSON-LD and short card teasers. Those
// places should go through toPlainText() or snippet().

export function toPlainText(md) {
  return String(md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links keep their words
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A short teaser that ends on a whole sentence when one fits, otherwise on a
// word break with "…". Never cuts mid-word.
const ABBREV = /^(?:[A-Z]|St|Ste|Mt|Ft|Pt|Dr|Mr|Mrs|Ms|Jr|Sr|Gen|Col|Capt|Lt|Sgt|Rev|Co|Bros|Inc|No|Vol|ca|vs|U\.S|[A-Z]\.[A-Z])$/;

export function snippet(md, max = 180) {
  const clean = toPlainText(md);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  // Last sentence end in the cut, not counting abbreviations ("St. George",
  // "Ft. Davis", "U.S. Army", "J. Smith").
  let lastStop = -1;
  const re = /[.!?] /g;
  let m;
  while ((m = re.exec(cut))) {
    if (cut[m.index] === '.') {
      const word = cut.slice(0, m.index).split(/\s/).pop();
      if (ABBREV.test(word)) continue;
    }
    lastStop = m.index;
  }
  if (lastStop >= max * 0.5) return cut.slice(0, lastStop + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—-]+$/, '')}…`;
}
