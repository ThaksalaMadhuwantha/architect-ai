import { Fragment } from 'react';

// **bold**, *italic*, `code` පමණක් (HTML inject කරන්නේ නැහැ)
const inline = (text) =>
  text
    .split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={i} className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-200 text-[11px] break-all">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={i} className="italic text-slate-200">{part.slice(1, -1)}</em>;
      }
      return <Fragment key={i}>{part}</Fragment>;
    });

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isSeparator = (line) => cells(line).every((c) => /^:?-{2,}:?$/.test(c));

export default function Markdown({ text }) {
  const lines = text.split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');

    if (!line.trim()) {
      out.push(<div key={i} className="h-1" />);
      continue;
    }

    // --- (horizontal rule)
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(<hr key={i} className="my-2 border-slate-700/60" />);
      continue;
    }

    // | table | rows |
    if (line.trim().startsWith('|')) {
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        if (!isSeparator(lines[j])) rows.push(cells(lines[j]));
        j++;
      }
      out.push(
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-slate-900/70 font-semibold text-slate-200' : ''}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-slate-700/70 px-2 py-1 align-top break-words">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
      continue;
    }

    // "## Heading" හෝ "**Heading**" පේළියක් පමණක්
    const h = line.match(/^\s*#{1,4}\s+(.*)/) || line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (h) {
      out.push(
        <p key={i} className="pt-1.5 text-sm font-semibold text-indigo-200">
          {inline(h[1].replace(/\*\*/g, ''))}
        </p>
      );
      continue;
    }

    // "- item" / "* item" / "• item" (indent එක අනුව ඇතුළට)
    const b = line.match(/^(\s*)[-*•]\s+(.*)/);
    if (b) {
      out.push(
        <div key={i} className="flex gap-2" style={{ paddingLeft: Math.min(b[1].length, 6) * 6 }}>
          <span className="text-indigo-400">•</span>
          <span className="min-w-0">{inline(b[2])}</span>
        </div>
      );
      continue;
    }

    out.push(<p key={i}>{inline(line.trim())}</p>);
  }

  return <div className="space-y-1.5 text-xs leading-relaxed text-slate-300 break-words">{out}</div>;
}
