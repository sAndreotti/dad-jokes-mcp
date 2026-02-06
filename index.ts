import { MCPServer, object } from "mcp-use/server";
import { config } from "dotenv";

config();
import { z } from "zod";
import { widget, text } from "mcp-use/server";


const server = new MCPServer({
  name: "dad-jokes-mcp",
  title: "dad-jokes-mcp", // display name
  version: "1.0.0",
  description: "MCP server with OpenAI Apps SDK integration",
  baseUrl: process.env.MCP_URL || "http://localhost:3000", // Full base URL (e.g., https://myserver.com)
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com", // Can be customized later
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

/**
 * AUTOMATIC UI WIDGET REGISTRATION
 * All React components in the `resources/` folder are automatically registered as MCP tools and resources.
 * Just export widgetMetadata with description and Zod schema, and mcp-use handles the rest!
 *
 * It will automatically add to your MCP server:
 * - server.tool('get-brand-info')
 * - server.resource('ui://widget/get-brand-info')
 *
 * See docs: https://mcp-use.com/docs/typescript/server/ui-widgets
 */

/**
 * Add here your standard MCP tools, resources and prompts
 */
const dadJokeOutputSchema = z.object({
  id: z.string(),
  joke: z.string(),
});

const RAPID_API_BASE_URL = "https://musclewiki-api.p.rapidapi.com";
const RAPID_API_HOST = "musclewiki-api.p.rapidapi.com";

const musclewikiGroupsOutputSchema = z.object({
  groups: z.array(z.string()),
});

const musclewikiSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

const musclewikiSearchOutputSchema = z.object({
  results: z.array(z.record(z.string(), z.unknown())),
  debug: z
    .object({
      url: z.string(),
      status: z.number(),
      raw: z.string(),
    })
    .optional(),
});

const getRapidApiHeaders = () => {
  const key =
    process.env.RAPIDAPI_KEY
  if (!key) {
    throw new Error(
      "Missing RapidAPI key. Set RAPIDAPI_KEY (or MUSCLEWIKI_API_KEY)."
    );
  }

  return {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": RAPID_API_HOST,
    "Accept": "application/json",
  };
};

const toArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
};

server.tool(
  {
    name: "get-dad-joke",
    description: "Fetch a random dad joke from icanhazdadjoke.com",
    widget: {
      name: "get-dad-jokes",
      invoking: "Fetching a dad joke...",
      invoked: "Dad joke ready",
    },
  },
  async () => {
    const response = await fetch("https://icanhazdadjoke.com/", {
      headers: {
        Accept: "application/json",
        "User-Agent": "dad-jokes-mcp",
      },
    });

    const data = await response.json();
    const id = data.id;
    const joke = data.joke;
    return widget({
      props: { id, joke },
      output: text(joke),
    });
  }
);

server.tool(
  {
    name: "musclewiki-list-groups",
    description: "List available muscle groups from the MuscleWiki API",
    inputSchema: z.object({}),
    outputSchema: musclewikiGroupsOutputSchema,
  },
  async () => {
    const headers = getRapidApiHeaders();
    const response = await fetch(`${RAPID_API_BASE_URL}/muscles`, { headers });

    if (!response.ok) {
      throw new Error(`MuscleWiki API error (${response.status})`);
    }

    const payload = await response.json();
    const groupSet = new Set<string>();

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (typeof item === "string") {
          groupSet.add(item);
          continue;
        }
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const candidate =
          record.name ?? record.group ?? record.muscle_group ?? record.category;
        for (const entry of toArray(candidate)) {
          const trimmed = entry.trim();
          if (trimmed) groupSet.add(trimmed);
        }
      }
    }

    return object({
      groups: Array.from(groupSet).sort((a, b) => a.localeCompare(b)),
    });
  }
);

server.tool(
  {
    name: "musclewiki-search-v3",
    description: "Search exercises from MuscleWiki by query",
    schema: z.object({
      query: z.string(),
      limit: z.number().optional(),
    }),
    outputSchema: musclewikiSearchOutputSchema,
    widget: {
      name: "musclewiki-exercises",
      invoking: "Searching exercises...",
      invoked: "Search complete",
    },
  },
  async (input: any) => {
    console.log("[musclewiki-v3] Received input:", input);

    // Validate API Key
    if (!process.env.RAPIDAPI_KEY && !process.env.MUSCLEWIKI_API_KEY) {
      throw new Error("Missing RapidAPI key. Set RAPIDAPI_KEY (or MUSCLEWIKI_API_KEY).");
    }

    // Safety fallback
    // Robust query extraction
    const safeInput = input || {};
    let query = "";

    if (typeof safeInput === "string") {
      query = safeInput;
    } else if (typeof safeInput === "object") {
      query =
        safeInput.query ||
        safeInput.exercise ||
        safeInput.exercise_name ||
        safeInput.term ||
        safeInput.q ||
        "";

      // Fallback: Check if there's a lone string property if query still empty
      if (!query) {
        const values = Object.values(safeInput);
        const stringValues = values.filter(v => typeof v === 'string');
        if (stringValues.length === 1) {
          query = stringValues[0] as string;
        }
      }
    }

    const limit = typeof safeInput.limit === 'number' ? safeInput.limit : 10;
    const normalizedQuery = query.trim();

    console.log(`[musclewiki-v3] Extracted query: "${normalizedQuery}" from input keys:`, Object.keys(safeInput));

    if (!normalizedQuery) {
      console.log("[musclewiki-v3] Query is empty/missing after fallback checks.");
      // Don't return empty immediately if we want to default to 'curl' as a test?
      // But user complained about empty input. 
      // Let's default to a popular exercise if empty, OR return empty as before.
      // User request implies they want it to WORK. 
      // "takes from UI input a query"
      console.log("[musclewiki-v3] Returning empty results for empty query.");
      return object({ results: [] });
    }

    const headers = getRapidApiHeaders();
    const searchUrl = new URL(`${RAPID_API_BASE_URL}/search`);
    searchUrl.searchParams.set("q", normalizedQuery);
    searchUrl.searchParams.set("limit", String(limit));

    const response = await fetch(searchUrl.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[musclewiki-v3] API error (${response.status}):`, errorText);
      throw new Error(`MuscleWiki API error (${response.status}): ${errorText.substring(0, 100)}`);
    }

    const rawText = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawText);
    } catch {
      console.error("[musclewiki-search] Failed to parse response");
    }

    const results = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any)?.results)
        ? (payload as any).results
        : [];

    return object({
      results,
      debug: {
        url: searchUrl.toString(),
        status: response.status,
        raw: rawText.slice(0, 500), // Should satisfy 'raw' requirement
      },
    });
  }
);



// Fruits data for the API
const fruits = [
  { fruit: "mango", color: "bg-[#FBF1E1] dark:bg-[#FBF1E1]/10" },
  { fruit: "pineapple", color: "bg-[#f8f0d9] dark:bg-[#f8f0d9]/10" },
  { fruit: "cherries", color: "bg-[#E2EDDC] dark:bg-[#E2EDDC]/10" },
  { fruit: "coconut", color: "bg-[#fbedd3] dark:bg-[#fbedd3]/10" },
  { fruit: "apricot", color: "bg-[#fee6ca] dark:bg-[#fee6ca]/10" },
  { fruit: "blueberry", color: "bg-[#e0e6e6] dark:bg-[#e0e6e6]/10" },
  { fruit: "grapes", color: "bg-[#f4ebe2] dark:bg-[#f4ebe2]/10" },
  { fruit: "watermelon", color: "bg-[#e6eddb] dark:bg-[#e6eddb]/10" },
  { fruit: "orange", color: "bg-[#fdebdf] dark:bg-[#fdebdf]/10" },
  { fruit: "avocado", color: "bg-[#ecefda] dark:bg-[#ecefda]/10" },
  { fruit: "apple", color: "bg-[#F9E7E4] dark:bg-[#F9E7E4]/10" },
  { fruit: "pear", color: "bg-[#f1f1cf] dark:bg-[#f1f1cf]/10" },
  { fruit: "plum", color: "bg-[#ece5ec] dark:bg-[#ece5ec]/10" },
  { fruit: "banana", color: "bg-[#fdf0dd] dark:bg-[#fdf0dd]/10" },
  { fruit: "strawberry", color: "bg-[#f7e6df] dark:bg-[#f7e6df]/10" },
  { fruit: "lemon", color: "bg-[#feeecd] dark:bg-[#feeecd]/10" },
];

// API endpoint for fruits data
server.get("/api/fruits", (c) => {
  return c.json(fruits);
});

// Proxy endpoint for authenticated images
server.get("/api/image-proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.text("Missing url parameter", 400);
  }

  try {
    const headers = getRapidApiHeaders();
    // Start fetching
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return c.text(`Failed to fetch image: ${response.status}`, response.status as any);
    }

    // Pass through relevant headers
    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    const responseHeaders: Record<string, string> = {
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    };

    if (contentType) responseHeaders["Content-Type"] = contentType;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    // Return the body as a stream (or arrayBuffer if stream not supported directly)
    // Hono/Standard Request/Response usually supports passing the body directly
    return c.body(response.body as any, {
      status: response.status,
      headers: responseHeaders,
    } as any);
  } catch (error) {
    console.error("Proxy error:", error);
    return c.text("Internal Server Error", 500);
  }
});

// Brand Info Tool - Returns brand information
server.tool(
  {
    name: "get-brand-info",
    description:
      "Get information about the brand, including company details, mission, and values",
  },
  async () => {
    return object({
      name: "mcp-use",
      tagline: "Build MCP servers with UI widgets in minutes",
      description:
        "mcp-use is a modern framework for building Model Context Protocol (MCP) servers with automatic UI widget registration, making it easy to create interactive AI tools and resources.",
      founded: "2025",
      mission:
        "To simplify the development of MCP servers and make AI integration accessible for developers",
      values: [
        "Developer Experience",
        "Simplicity",
        "Performance",
        "Open Source",
        "Innovation",
      ],
      contact: {
        website: "https://mcp-use.com",
        docs: "https://mcp-use.com/docs",
        github: "https://github.com/mcp-use/mcp-use",
      },
      features: [
        "Automatic UI widget registration",
        "React component support",
        "Full TypeScript support",
        "Built-in HTTP server",
        "MCP protocol compliance",
      ],
    });
  }
);

server.listen().then(() => {
  console.log(`Server running`);
});
