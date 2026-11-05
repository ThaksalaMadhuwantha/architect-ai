import { Fragment } from 'react';

// **bold** සහ `code` කොටස් පමණක් handle කරනවා (HTML inject කරන්නේ නැහැ)
const inline = (text) =>
  text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
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
      return <Fragment key={i}>{part}</Fragment>;
    });

export default function Markdown({ text }) {
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-300 break-words">
      {text.split('\n').map((raw, i) => {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) return <div key={i} className="h-1" />;

        // "## Heading" හෝ "**Heading**" පේළියක් පමණක්
        const h = line.match(/^\s*#{1,4}\s+(.*)/) || line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
        if (h) {
          return (
            <p key={i} className="pt-1.5 text-sm font-semibold text-indigo-200">
              {inline(h[1].replace(/\*\*/g, ''))}
            </p>
          );
        }

        // "- item" / "* item" / "• item" (indent එක අනුව ඇතුළට)
        const b = line.match(/^(\s*)[-*•]\s+(.*)/);
        if (b) {
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: Math.min(b[1].length, 6) * 6 }}>
              <span className="text-indigo-400">•</span>
              <span className="min-w-0">{inline(b[2])}</span>
            </div>
          );
        }

        return <p key={i}>{inline(line.trim())}</p>;
      })}
    </div>
  );
}
