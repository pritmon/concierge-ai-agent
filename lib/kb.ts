import { db, type Article } from "./db";

// Lightweight BM25 retrieval over the knowledge base. Good enough for a few
// hundred articles; swap for a vector store (pgvector, Turbopuffer, etc.) when
// the corpus grows.

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the their this to was we what when where which who will with you your".split(
    " ",
  ),
);

function stem(word: string) {
  return word.replace(/(ing|ed|es|s)$/, "") || word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

export interface SearchHit {
  article: Article;
  score: number;
}

export function searchArticles(query: string, limit = 3): SearchHit[] {
  const articles = db().prepare("SELECT * FROM articles").all() as unknown as Article[];
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || articles.length === 0) return [];

  // Title terms count double.
  const docs = articles.map((a) => [...tokenize(a.title), ...tokenize(a.title), ...tokenize(a.body)]);
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const k1 = 1.4;
  const b = 0.75;

  const df = new Map<string, number>();
  for (const term of queryTerms) df.set(term, docs.filter((d) => d.includes(term)).length);

  const hits = docs.map((doc, i) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.filter((t) => t === term).length;
      if (tf === 0) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (articles.length - n + 0.5) / (n + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avgLen)));
    }
    return { article: articles[i], score };
  });

  return hits
    .filter((h) => h.score > 0.5)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
