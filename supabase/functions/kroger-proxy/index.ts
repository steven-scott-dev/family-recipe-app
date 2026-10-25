// supabase/functions/kroger-proxy/index.ts
// Server-side Kroger client for SupperLine's "Send to Kroger cart" feature.
// KROGER_CLIENT_ID / KROGER_CLIENT_SECRET live here as Supabase secrets —
// never exposed to the browser. The browser only ever holds the shopper's own
// OAuth access/refresh tokens (in localStorage on their device).
// JWT verification stays ON (the default): only signed-in users can invoke this.
// Kroger has NO checkout endpoint — this ends at a populated cart; the shopper
// always completes purchase in Kroger's app/website.

const KROGER_CLIENT_ID = Deno.env.get("KROGER_CLIENT_ID");
const KROGER_CLIENT_SECRET = Deno.env.get("KROGER_CLIENT_SECRET");
const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const API_BASE = "https://api.kroger.com/v1";

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

function basicAuth(): string {
  return "Basic " + btoa(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`);
}

// POST to Kroger's token endpoint (form-encoded, Basic auth). Throws an Error
// with a numeric `status` property on failure so the handler can map it.
async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": basicAuth(),
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error_description?: string; error?: string }).error_description
      || (data as { error?: string }).error
      || "Kroger token error";
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data as Record<string, unknown>;
}

// GET against the Kroger API. Returns { __expired: true } on 401 so the
// browser knows to refresh instead of surfacing a generic failure.
async function krogerGet(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(API_BASE + path, {
    headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" },
  });
  if (res.status === 401) return { __expired: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { errors?: { reason?: string }[] }).errors?.[0]?.reason
      || (data as { error?: string }).error
      || `Kroger API error (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!KROGER_CLIENT_ID || !KROGER_CLIENT_SECRET) {
      return json({ error: "Server misconfigured: Kroger secrets not set" }, 500);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const action = body?.action;
    if (typeof action !== "string") return json({ error: "Missing action" }, 400);

    switch (action) {
      case "exchange": {
        // Authorization-code -> tokens. The code is single-use and bound to the
        // registered redirect URI; the secret never leaves this function.
        if (!body.code || !body.redirectUri) return json({ error: "Missing code" }, 400);
        const t = await tokenRequest({
          grant_type: "authorization_code",
          code: String(body.code),
          redirect_uri: String(body.redirectUri),
        });
        return json({
          access_token: t.access_token,
          refresh_token: t.refresh_token,
          expires_in: t.expires_in,
        });
      }

      case "refresh": {
        if (!body.refreshToken) return json({ error: "Missing refresh token" }, 400);
        const t = await tokenRequest({
          grant_type: "refresh_token",
          refresh_token: String(body.refreshToken),
        });
        return json({
          access_token: t.access_token,
          // Kroger may omit a new refresh token; keep the old one in that case.
          refresh_token: t.refresh_token || body.refreshToken,
          expires_in: t.expires_in,
        });
      }

      case "locations": {
        // Store lookup needs no shopper token: client-credentials grant.
        const zip = String(body.zip || "");
        if (!/^\d{5}$/.test(zip)) return json({ error: "Valid ZIP required" }, 400);
        const cc = await tokenRequest({ grant_type: "client_credentials" });
        const data = await krogerGet(
          `/locations?filter.zipCode.near=${zip}&filter.limit=10`,
          String(cc.access_token),
        );
        if (data.__expired) return json({ error: "token_expired" }, 401);
        const stores = ((data.data as Array<Record<string, Record<string, string>>>) || []).map((s) => ({
          locationId: s.locationId,
          name: s.name,
          address: [s.address?.addressLine1, s.address?.city, s.address?.state, s.address?.zipCode]
            .filter(Boolean)
            .join(", "),
        }));
        return json({ stores });
      }

      case "search": {
        // Best-match product search at the shopper's store. Returns one product.
        if (!body.query || !body.locationId || !body.accessToken) {
          return json({ error: "Missing search params" }, 400);
        }
        const data = await krogerGet(
          `/products?filter.term=${encodeURIComponent(String(body.query))}`
            + `&filter.locationId=${encodeURIComponent(String(body.locationId))}&filter.limit=1`,
          String(body.accessToken),
        );
        if (data.__expired) return json({ error: "token_expired" }, 401);
        const p = (data.data as Array<Record<string, string>>)?.[0];
        if (!p) return json({ product: null });
        return json({
          product: { upc: p.upc, productId: p.productId, description: p.description || "" },
        });
      }

      case "add": {
        // Bulk-add to the shopper's cart (PICKUP). No checkout exists in this API.
        const items = body.items as Array<{ upc?: string; quantity?: number }> | undefined;
        if (!Array.isArray(items) || !items.length || !body.accessToken) {
          return json({ error: "Missing cart items" }, 400);
        }
        const res = await fetch(API_BASE + "/cart/add", {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${String(body.accessToken)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: items
              .filter((i) => i && i.upc)
              .map((i) => ({ upc: i.upc, quantity: i.quantity || 1, modality: "PICKUP" })),
          }),
        });
        if (res.status === 401) return json({ error: "token_expired" }, 401);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data as { errors?: { reason?: string }[] }).errors?.[0]?.reason
            || `Kroger cart error (${res.status})`;
          throw Object.assign(new Error(msg), { status: res.status });
        }
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const status = (e as { status?: unknown }).status;
    const code = typeof status === "number" && Number.isInteger(status) ? status : 500;
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, code);
  }
});
