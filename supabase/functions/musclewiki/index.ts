import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RAPID_API_BASE_URL = "https://musclewiki-api.p.rapidapi.com";
const RAPID_API_HOST = "musclewiki-api.p.rapidapi.com";

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
    const limit = url.searchParams.get("limit") || "10";

    const apiKey = Deno.env.get("RAPIDAPI_KEY") || Deno.env.get("MUSCLEWIKI_API_KEY");

    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: "Missing RapidAPI key. Set RAPIDAPI_KEY secret." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    if (!query.trim()) {
        return new Response(
            JSON.stringify({ error: "Missing 'q' or 'query' parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const searchUrl = new URL(`${RAPID_API_BASE_URL}/search`);
        searchUrl.searchParams.set("q", query.trim());
        searchUrl.searchParams.set("limit", limit);

        const response = await fetch(searchUrl.toString(), {
            headers: {
                "X-RapidAPI-Key": apiKey,
                "X-RapidAPI-Host": RAPID_API_HOST,
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(
                JSON.stringify({ error: `MuscleWiki API error (${response.status})`, details: errorText.substring(0, 200) }),
                { status: response.status, headers: { "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();

        return new Response(
            JSON.stringify({ results: Array.isArray(data) ? data : data.results || [] }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: "Internal server error", message: String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
