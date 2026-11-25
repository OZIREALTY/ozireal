import * as React from "react";

/**
 * Inline formatting in blog text (2026-11-25): **bold** and [words](/page) links, the
 * only two the editor offers. Rendered as React nodes, never as HTML, so post text can
 * never inject markup. A link must be a path on this site or an https address; anything
 * else stays plain text. Links off the site open in a new tab and carry rel="noopener".
 */
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function inlineText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else {
      const href = m[3];
      const internal = /^\/(?!\/)/.test(href);
      if (internal || /^https:\/\//.test(href))
        out.push(
          <a key={k++} href={href} {...(internal ? {} : { target: "_blank", rel: "noopener" })}>
            {m[2]}
          </a>,
        );
      else out.push(m[0]);
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Plain text, for descriptions, word counts and the search snippet. */
export const plainText = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
