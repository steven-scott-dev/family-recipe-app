// supabase/functions/dish-photo/index.ts
// Shared dish-photo cache filler for SupperLine meal cards.
//
// POST { titles: string[] } -> { photos: { [dishMatchKey]: imageUrl | null } }
//
// For each title: normalize to the same match key the app uses
// (dishPhotos.js), check the public.dish_images cache, and on a miss find a
// photo ONCE and store it (Storage bucket "dish-photos" + dish_images row) so
// every future plan with that dish — any family — gets it instantly.
//
// Source order (hybrid, per Clay 2026-11-10): real stock photos first
// (Pexels if PEXELS_API_KEY is set, then Openverse, which needs no key),
// AI-generated (Pollinations, no key) only when stock has nothing.
// Failures are NOT cached — a later plan view retries the dish.
// JWT verification stays ON (the default): only signed-in users can invoke.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY") || "";
const BUCKET = "dish-photos";

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

// ---- Title normalization — MUST match dishPhotos.js dishMatchKey() ----
const STOPWORDS = new Set([
  "with", "and", "the", "a", "an", "of", "style", "easy", "homemade",
  "classic", "best", "my", "in", "on", "for", "one", "pot",
]);
const SYNONYMS: Record<string, string> = {
  veggie: "vegetable",
  veggies: "vegetable",
  veg: "vegetable",
};
function foldPlural(token: string): string {
  if (token.endsWith("oes")) return token.slice(0, -2);
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}
function dishMatchKey(title: string): string {
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => SYNONYMS[t] || foldPlural(t))
    .sort()
    .join("-");
}

function searchQuery(title: string): string {
  return String(title || "").replace(/[^a-zA-Z0-9 &]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---- Cache (PostgREST + Storage REST with the service role key) ----
const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function cacheGet(key: string): Promise<string | null> {
  const res = await fetchTimeout(
    `${SUPABASE_URL}/rest/v1/dish_images?dish_key=eq.${encodeURIComponent(key)}&select=image_url`,
    { headers: svcHeaders },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows?.[0]?.image_url || null;
}

async function cachePut(
  key: string,
  title: string,
  bytes: Uint8Array,
  contentType: string,
  source: string,
  attribution: string,
): Promise<string | null> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `${key}.${ext}`;
  const up = await fetchTimeout(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: { ...svcHeaders, "Content-Type": contentType, "x-upsert": "true" },
      body: bytes,
    },
    15000,
  );
  if (!up.ok) return null;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const ins = await fetchTimeout(`${SUPABASE_URL}/rest/v1/dish_images`, {
    method: "POST",
    headers: {
      ...svcHeaders,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      dish_key: key,
      title,
      image_url: publicUrl,
      source,
      attribution,
    }),
  });
  if (!ins.ok) return null;
  return publicUrl;
}

// ---- Photo sources: each returns { bytes, contentType, attribution } ----
type Found = { bytes: Uint8Array; contentType: string; source: string; attribution: string };

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await fetchTimeout(url, {}, 12000);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.startsWith("image/") || ct.includes("svg")) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 4000 || buf.length > 5_000_000) return null; // junk or huge
  return { bytes: buf, contentType: ct.split(";")[0] };
}

async function fromPexels(query: string): Promise<Found | null> {
  if (!PEXELS_API_KEY) return null;
  const res = await fetchTimeout(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
    { headers: { Authorization: PEXELS_API_KEY } },
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  for (const p of data?.photos || []) {
    const url = p?.src?.large || p?.src?.medium;
    if (!url) continue;
    const img = await downloadImage(url);
    if (img) {
      return {
        ...img,
        source: "pexels",
        attribution: `Photo by ${p.photographer || "unknown"} on Pexels`,
      };
    }
  }
  return null;
}

async function openverseSearch(query: string): Promise<Found | null> {
  const res = await fetchTimeout(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=6&filter_dead=false`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  for (const r of data?.results || []) {
    if (!r?.url) continue;
    const img = await downloadImage(r.url);
    if (img) {
      const who = r.creator ? ` by ${r.creator}` : "";
      const lic = r.license ? ` (${String(r.license).toUpperCase()})` : "";
      return { ...img, source: "openverse", attribution: `${r.title || "Photo"}${who}${lic} via Openverse` };
    }
  }
  return null;
}

async function fromOpenverse(query: string): Promise<Found | null> {
  const direct = await openverseSearch(query);
  if (direct) return direct;
  // Long AI-generated titles often match nothing — retry with the core words.
  const words = query.split(" ").filter((w) => w.length > 2);
  if (words.length > 3) {
    return await openverseSearch(words.slice(-3).join(" "));
  }
  return null;
}

async function fromAI(title: string): Promise<Found | null> {
  const prompt =
    `Overhead photo of ${title}, a home-cooked weeknight dinner served on a plain plate, ` +
    `natural window light, realistic casual food photography, no text, no people`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true`;
  // Pollinations rate-limits bursts and 503s intermittently — one retry
  // after a pause rescues most transient failures.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const img = await downloadImage(url).catch(() => null);
    if (img) return { ...img, source: "ai", attribution: "AI-generated" };
  }
  return null;
}

async function resolveDish(key: string, title: string): Promise<string | null> {
  const hit = await cacheGet(key).catch(() => null);
  if (hit) return hit;
  const q = searchQuery(title);
  const found =
    (await fromPexels(q).catch(() => null)) ||
    (await fromOpenverse(q).catch(() => null)) ||
    (await fromAI(title).catch(() => null));
  if (!found) return null;
  return await cachePut(key, title, found.bytes, found.contentType, found.source, found.attribution)
    .catch(() => null);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let titles: string[] = [];
  try {
    const body = await req.json();
    titles = Array.isArray(body?.titles) ? body.titles.filter((t: unknown) => typeof t === "string") : [];
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const byKey = new Map<string, string>();
  for (const t of titles.slice(0, 24)) {
    const key = dishMatchKey(t);
    if (key && !byKey.has(key)) byKey.set(key, t);
  }
  const photos: Record<string, string | null> = {};
  // Small batches, not one big burst: the AI source rate-limits parallel
  // calls, which is how whole plans ended up half-filled (2026-11-10).
  const entries = [...byKey.entries()];
  const BATCH = 3;
  for (let i = 0; i < entries.length; i += BATCH) {
    await Promise.all(
      entries.slice(i, i + BATCH).map(async ([key, title]) => {
        photos[key] = await resolveDish(key, title);
      }),
    );
  }
  return json({ photos });
});
