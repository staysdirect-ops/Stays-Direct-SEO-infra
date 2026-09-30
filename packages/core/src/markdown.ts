import { escapeHtml } from "./text.ts";

/**
 * Small, safe Markdown subset renderer for model-written copy: headings (##-####), paragraphs,
 * "-"/"*"/"1." lists, blockquotes, pipe tables, **bold**, *italic*, `code` and [links](...).
 * All text is HTML-escaped; only http(s), root-relative, mailto: and tel: links are kept.
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{2,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s{0,3}#\s+/.test(line)) {
      out.push(`<h2>${inline(line.replace(/^\s*#\s+/, ""))}</h2>`);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }
    if (isTableStart(lines, i)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? "")) {
        rows.push(lines[i] ?? "");
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !startsBlock(lines, i)) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i] ?? "";
  return (
    /^\s{0,3}#{1,4}\s+/.test(l) ||
    /^\s*>/.test(l) ||
    /^\s*[-*+]\s+/.test(l) ||
    /^\s*\d+[.)]\s+/.test(l) ||
    isTableStart(lines, i)
  );
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    /^\s*\|.*\|\s*$/.test(lines[i] ?? "") &&
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? "")
  );
}

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderTable(rows: string[]): string {
  const [head, , ...body] = rows;
  const th = splitRow(head ?? "")
    .map((c) => `<th scope="col">${inline(c)}</th>`)
    .join("");
  const trs = body
    .map(
      (r) =>
        `<tr>${splitRow(r)
          .map((c) => `<td>${inline(c)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

export function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(u)) return u;
  if (/^mailto:[^\s"'<>]+$/i.test(u)) return u;
  if (/^tel:[+\d\s()-]+$/i.test(u)) return u.replace(/\s/g, "");
  if (/^#[\w-]+$/.test(u)) return u;
  return null;
}

function inline(text: string): string {
  const tokens: string[] = [];
  const stash = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`)
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label: string, href: string) => {
    const safe = safeHref(href);
    const inner = formatEmphasis(escapeHtml(label));
    if (!safe) return stash(inner);
    const external =
      /^https?:/i.test(safe) && !/^https?:\/\/(www\.)?staysdirect\.co\.uk/i.test(safe);
    return stash(
      `<a href="${escapeHtml(safe)}"${external ? ' rel="noopener" target="_blank"' : ""}>${inner}</a>`
    );
  });
  s = formatEmphasis(escapeHtml(s));
  // eslint-disable-next-line no-control-regex -- NUL-delimited placeholders cannot occur in escaped text
  return s.replace(/\u0000(\d+)\u0000/g, (_, n: string) => tokens[Number(n)] ?? "");
}

function formatEmphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
}
