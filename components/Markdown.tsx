import { Fragment, type ReactNode } from "react";

// Minimal, safe renderer for the subset of Markdown the agent writes:
// paragraphs, bullet/numbered lists, **bold**, `code` and [links](https://...).

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      parts.push(
        <code key={key} className="rounded bg-black/5 px-1 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    else {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      parts.push(
        <a key={key} href={href} target="_blank" rel="noreferrer" className="underline">
          {label}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isBullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const isNumbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (isBullets || isNumbered) {
          const Tag = isNumbered ? "ol" : "ul";
          return (
            <Tag key={bi} className={`${isNumbered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#+\s+/, ""), `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
