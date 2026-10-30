import type { LawSource } from "./api";

export interface CitationPart {
  text: string;
  number?: number;
}

export function citationNumber(source: LawSource, index: number): number {
  const number = source.citation_number;
  return number && Number.isSafeInteger(number) && number > 0 ? number : index + 1;
}

export function findCitation(sources: LawSource[], number: number): LawSource | undefined {
  return sources.find((source, index) => citationNumber(source, index) === number);
}

export function splitCitations(text: string): CitationPart[] {
  const parts: CitationPart[] = [];
  const pattern = /\[Source\s+(\d+)\]/gi;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) parts.push({ text: text.slice(start, match.index) });
    const number = Number(match[1]);
    if (Number.isSafeInteger(number) && number > 0) {
      parts.push({ text: `[${number}]`, number });
    } else {
      parts.push({ text: match[0] });
    }
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}

export function compactCitations(text: string): string {
  return splitCitations(text).map((part) => part.text).join("");
}
