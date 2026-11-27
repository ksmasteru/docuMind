// Reads a spec sheet's text into what SpecSheetCard shows (plan_pump_manuals.md §7): the title, « Label : valeur. »
// lines as a table, a section whose heading says « à compléter » as missing values, the rest as paragraphs.

// « Débit : jusqu’à 1250 m3/h. » -> { label: "Débit", value: "jusqu’à 1250 m3/h" }; a sentence that merely holds a
// colon (« … la ligne d'arbre : c'est ce qui … ») has too long a label to be one
const pairOf = (line) => {
  const found = line.match(/^([^:]{1,60}?)\s+:\s+(.+?)\.?$/);
  return found ? { label: found[1], value: found[2] } : null;
};

export function parseSheet(text) {
  const blocks = (text ?? "")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0);
  if (!blocks.length) return null;
  const [head, ...rest] = blocks;
  const title = head[0].replace(/\.$/, "");
  const meta = head.slice(1).map((line) => pairOf(line) ?? { label: null, value: line });
  const sections = rest.map((lines) => {
    const [first, ...others] = lines;
    const heading = others.length > 0 && !pairOf(first) && first.length <= 90 ? first.replace(/\.$/, "") : null;
    const body = heading ? others : lines;
    if (heading && /compl[ée]ter/i.test(heading))
      return { heading, missing: body.map((line) => line.replace(/\.$/, "")) };
    const rows = body.map(pairOf);
    if (rows.every(Boolean)) return { heading, rows };
    return { heading, paragraphs: body };
  });
  return { title, meta, sections };
}
