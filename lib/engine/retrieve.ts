import MiniSearch from "minisearch";
import type { Source } from "@/lib/types";

const DEFAULT_LIMIT = 20;

/**
 * Rank sources that share terms with the question.
 * WHY the cap is generous: this corpus is a dozen documents, and dropping a
 * conflicting source would hide a critical objection.
 */
export function retrieve(sources: readonly Source[], question: string, limit = DEFAULT_LIMIT): Source[] {
  if (sources.length === 0 || question.trim().length === 0) return [];

  const mini = new MiniSearch<{ id: string; title: string; text: string }>({
    idField: "id",
    fields: ["title", "text"],
    storeFields: ["id"],
    searchOptions: {
      boost: { title: 2 },
      prefix: true,
      combineWith: "OR",
    },
  });

  mini.addAll(sources.map((source) => ({ id: source.id, title: source.title, text: source.text })));
  const hits = mini.search(question);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const ranked: Source[] = [];

  for (const hit of hits) {
    const source = byId.get(String(hit.id));
    if (!source) continue;
    ranked.push(source);
    if (ranked.length >= limit) break;
  }

  return ranked;
}
