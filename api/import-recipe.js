// Vercel serverless function: import a recipe from a Mealime public recipe URL.
// Fetches the page server-side (avoids browser CORS), extracts the recipe from
// the page's __NEXT_DATA__ JSON, and returns structured recipe data.
// Only mealime.com URLs are accepted.

export default async function handler(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url=' });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'That does not look like a valid URL.' });
  }
  if (parsed.hostname !== 'www.mealime.com' && parsed.hostname !== 'mealime.com') {
    return res.status(400).json({ error: 'Only mealime.com recipe links can be imported.' });
  }

  let html;
  try {
    const r = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SupperLine recipe importer)' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Could not open that Mealime page.' });
    html = await r.text();
  } catch {
    return res.status(502).json({ error: 'Could not reach mealime.com. Try again in a moment.' });
  }

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) return res.status(422).json({ error: 'No recipe data found on that page.' });

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return res.status(422).json({ error: 'Could not read the recipe data on that page.' });
  }

  const pr = data?.props?.pageProps?.publishedRecipe;
  if (!pr || !pr.name) {
    return res.status(422).json({ error: 'That page does not contain a recipe.' });
  }

  const ingredients = (pr.line_items || []).map((li) => ({
    quantity: li.quantity || '',
    name: li.ingredient_name || '',
  }));
  const steps = (pr.instructions || []).map((ins) => ({
    step: ins.primary_message || '',
    detail: ins.secondary_message || '',
  }));

  return res.status(200).json({
    name: pr.name,
    servings: pr.serving_count || null,
    cookingMinutes: pr.cooking_minutes || null,
    imageUrl: pr.presentation_image_url || pr.thumbnail_image_url || null,
    ingredients,
    steps,
    sourceUrl: parsed.toString(),
  });
}
