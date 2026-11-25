import type { ReactNode } from "react";

/** Asistan yanıtları için küçük, güvenli markdown görüntüleyici (HTML enjekte etmez). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="mono" style={{ fontSize: "0.92em", background: "rgba(19,39,122,.08)", padding: "1px 5px", borderRadius: 5 }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((x, i) => <li key={i} style={{ margin: "3px 0" }}>{inline(x)}</li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} style={{ margin: "4px 0", paddingLeft: 22 }}>{items}</ol>
      : <ul key={blocks.length} style={{ margin: "4px 0", paddingLeft: 20 }}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { blocks.push(<hr key={blocks.length} className="hr" style={{ margin: "10px 0" }} />); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push(<div key={blocks.length} style={{ fontWeight: 700, fontSize: h[1].length <= 2 ? 16 : 14.5, margin: "10px 0 4px" }}>{inline(h[2])}</div>); continue; }
    blocks.push(<p key={blocks.length} style={{ margin: "5px 0" }}>{inline(line)}</p>);
  }
  flush();
  return <div style={{ lineHeight: 1.55 }}>{blocks}</div>;
}
