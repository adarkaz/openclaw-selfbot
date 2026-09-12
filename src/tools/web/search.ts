import { Type, type Static } from "@sinclair/typebox";

const WebSearchSchema = Type.Object(
  {
    query: Type.String({
      description: "The web search query.",
    }),
    maxResults: Type.Optional(
      Type.Number({
        description: "Maximum number of results to return (default 8).",
      }),
    ),
  },
  { additionalProperties: false },
);

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(href: string): string {
  // DDG wraps result URLs in a redirect; extract the real target.
  const uddg = href.match(/uddg=([^&]+)/);
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch {
      // fall through
    }
  }
  return href;
}

async function searchDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const url =
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
  }
  const html = await res.text();

  const results: WebSearchResult[] = [];
  const blocks = html.split(/<div class="result[^"]*"[^>]*>/).slice(1);
  for (const block of blocks) {
    if (results.length >= maxResults) break;
    const linkMatch = block.match(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!linkMatch) continue;
    const title = decodeEntities(linkMatch[2]);
    if (!title) continue;
    results.push({
      title,
      url: cleanUrl(linkMatch[1]),
      snippet: snippetMatch ? decodeEntities(snippetMatch[1]) : "",
    });
  }
  return results;
}

export function createWebSearchTool() {
  return {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web (DuckDuckGo HTML backend, no API key). Returns the top results as { title, url, snippet } JSON. Use it to research topics, verify facts, or explore anything outside Telegram.",
    parameters: WebSearchSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof WebSearchSchema>,
    ) => {
      const maxResults = Math.min(
        Math.max(1, params.maxResults ?? 8),
        20,
      );
      const results = await searchDuckDuckGo(params.query, maxResults);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
        details: results,
      };
    },
  };
}
