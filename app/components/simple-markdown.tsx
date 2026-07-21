"use client";

import Link from "next/link";
import { ElementType, Fragment, ReactNode } from "react";

type SimpleMarkdownProps = {
  content: string;
};

type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

type ListBlock = {
  type: "list";
  ordered: boolean;
  items: string[];
};

type HeadingBlock = {
  type: "heading";
  level: number;
  text: string;
};

type ParagraphBlock = {
  type: "paragraph";
  text: string;
};

type Block = TableBlock | ListBlock | HeadingBlock | ParagraphBlock;

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = pattern.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <Link
            key={`${match.index}-link`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
          >
            {linkMatch[1]}
          </Link>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("http://") || token.startsWith("https://")) {
      nodes.push(
        <Link
          key={`${match.index}-url`}
          href={token}
          target="_blank"
          rel="noreferrer"
        >
          {token}
        </Link>,
      );
    } else {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>);
    }

    lastIndex = match.index + token.length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1]?.trim() ?? "";
    if (line.includes("|") && nextLine.includes("|") && isTableSeparator(nextLine)) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine || !rowLine.includes("|")) {
          break;
        }

        rows.push(splitTableRow(rowLine));
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentOrdered = current.match(/^(\d+)\.\s+(.*)$/);
        const currentUnordered = current.match(/^[-*]\s+(.*)$/);

        if (ordered && currentOrdered) {
          items.push(currentOrdered[2]);
          index += 1;
          continue;
        }

        if (!ordered && currentUnordered) {
          items.push(currentUnordered[1]);
          index += 1;
          continue;
        }

        break;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (index < lines.length) {
      const current = lines[index].trim();
      const currentNext = lines[index + 1]?.trim() ?? "";

      if (!current) {
        index += 1;
        break;
      }

      if (
        current.match(/^(\d+)\.\s+/) ||
        current.match(/^[-*]\s+/) ||
        current.match(/^(#{1,6})\s+/) ||
        (current.includes("|") && currentNext.includes("|") && isTableSeparator(currentNext))
      ) {
        break;
      }

      paragraphLines.push(current);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

export function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="markdown-content">
      {blocks.map((block, blockIndex) => {
        if (block.type === "table") {
          return (
            <div key={`table-${blockIndex}`} className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`header-${blockIndex}-${headerIndex}`}>
                        {parseInline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${blockIndex}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${blockIndex}-${rowIndex}-${cellIndex}`}>
                          {parseInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";

          return (
            <ListTag key={`list-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${blockIndex}-${itemIndex}`}>{parseInline(item)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "heading") {
          const HeadingTag = `h${Math.min(block.level + 1, 6)}` as ElementType;

          return <HeadingTag key={`heading-${blockIndex}`}>{parseInline(block.text)}</HeadingTag>;
        }

        return (
          <p key={`paragraph-${blockIndex}`}>
            {block.text.split("\n").map((part, partIndex) => (
              <Fragment key={`paragraph-part-${blockIndex}-${partIndex}`}>
                {partIndex > 0 ? <br /> : null}
                {parseInline(part)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
