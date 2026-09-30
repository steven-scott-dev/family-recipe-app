// supabase/functions/generate-meals/index.ts
// Secure proxy for Groq meal-plan generation. The GROQ_API_KEY lives here as a
// Supabase secret — never exposed to the client. JWT verification is enabled by
// default, so only signed-in users can invoke this function.

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GROQ_API_KEY) {
      return json({ error: "Server misconfigured: GROQ_API_KEY secret not set" }, 500);
    }

    let body: { prompt?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const prompt = body?.prompt;
    if (!prompt || typeof prompt !== "string" || prompt.length < 10) {
      return json({ error: "Missing prompt" }, 400);
    }
    if (prompt.length > 12000) {
      return json({ error: "Prompt too large" }, 400);
    }

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    const data = await groqRes.json();
    if (data?.error) {
      return json({ error: data.error.message || "Groq error" }, 502);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: "Empty model response" }, 502);
    }
    return json({ content });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
