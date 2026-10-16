import React, { useState, useEffect, useRef } from 'react';

// Recipe box: browse the Mealime public catalog, one-tap import via /api/import-recipe,
// paste any mealime.com link, and keep imported recipes in the saved_recipes table.
export default function RecipeImporter({ supabase, userId }) {
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [pasteUrls, setPasteUrls] = useState('');
  const [preview, setPreview] = useState(null); // recipe fetched, not yet saved
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());
  const [batch, setBatch] = useState(null); // {done, total, results} for multi-link import
  const myRecipesRef = useRef(null);

  useEffect(() => {
    fetch('/mealime-catalog.json')
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
    loadSaved();
  }, []);

  const loadSaved = async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) {
      setSaved(data);
      setSavedIds(new Set(data.map((r) => r.source_url).filter(Boolean)));
    }
  };

  const importFromUrl = async (url) => {
    setBusy(true);
    setError('');
    setPreview(null);
    setBatch(null);
    try {
      const r = await fetch('/api/import-recipe?url=' + encodeURIComponent(url));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Import failed.');
      setPreview(j);
    } catch (e) {
      setError(e.message || 'Import failed. Check the link and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Batch import: one URL per line, imports + saves each, shows a summary.
  const importBatch = async (urls) => {
    const unique = [...new Set(urls)];
    setBusy(true);
    setError('');
    setPreview(null);
    setBatch({ done: 0, total: unique.length, results: [] });
    const results = [];
    for (const url of unique) {
      if (savedIds.has(url)) {
        results.push({ url, skipped: true });
      } else {
        try {
          const r = await fetch('/api/import-recipe?url=' + encodeURIComponent(url));
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Import failed.');
          const { error } = await supabase.from('saved_recipes').insert([
            {
              user_id: userId,
              name: j.name,
              source_url: j.sourceUrl,
              servings: j.servings,
              cooking_minutes: j.cookingMinutes,
              image_url: j.imageUrl,
              ingredients: j.ingredients,
              steps: j.steps,
            },
          ]);
          if (error) throw new Error('Could not save.');
          results.push({ url, name: j.name });
        } catch (e) {
          results.push({ url, error: e.message || 'Import failed.' });
        }
      }
      setBatch({ done: results.length, total: unique.length, results: [...results] });
    }
    setBusy(false);
    setPasteUrls('');
    loadSaved();
  };

  // Catalog one-tap import: saves straight to My recipes, no preview step.
  // (The old preview panel rendered at the top of the tab, off-screen — looked like nothing happened.)
  const importCatalogRecipe = async (url) => {
    if (!supabase || !userId || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/import-recipe?url=' + encodeURIComponent(url));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Import failed.');
      const { error } = await supabase.from('saved_recipes').insert([
        {
          user_id: userId,
          name: j.name,
          source_url: j.sourceUrl,
          servings: j.servings,
          cooking_minutes: j.cookingMinutes,
          image_url: j.imageUrl,
          ingredients: j.ingredients,
          steps: j.steps,
        },
      ]);
      if (error) throw new Error('Could not save that recipe. Try again in a moment.');
      await loadSaved();
      setTimeout(() => {
        myRecipesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e) {
      setError(e.message || 'Import failed. Check the link and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    const urls = pasteUrls.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    if (urls.length === 1) importFromUrl(urls[0]);
    else importBatch(urls);
  };

  const savePreview = async () => {
    if (!preview || !supabase || !userId) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('saved_recipes').insert([
      {
        user_id: userId,
        name: preview.name,
        source_url: preview.sourceUrl,
        servings: preview.servings,
        cooking_minutes: preview.cookingMinutes,
        image_url: preview.imageUrl,
        ingredients: preview.ingredients,
        steps: preview.steps,
      },
    ]);
    setBusy(false);
    if (error) {
      setError('Could not save that recipe. Try again in a moment.');
      return;
    }
    setPreview(null);
    setPasteUrls('');
    loadSaved();
  };

  const q = query.trim().toLowerCase();
  const results = q
    ? catalog.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 50)
    : catalog.slice(0, 24);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white rounded-xl p-5">
        <h2 className="font-bold text-lg">Switching from Mealime?</h2>
        <p className="text-sm text-slate-300 mt-1">
          Grab your favorites before Oct 21. Tap a recipe below, or paste your mealime.com recipe links —
          one link or a whole list, one per line — and bring them all over at once.
        </p>
        <textarea
          value={pasteUrls}
          onChange={(e) => setPasteUrls(e.target.value)}
          placeholder={"Paste mealime.com recipe links here,\none per line"}
          rows={3}
          className="w-full mt-3 rounded-lg px-3 py-2 text-sm text-slate-800"
        />
        <button
          onClick={handleImport}
          disabled={busy || !pasteUrls.trim()}
          className="mt-2 w-full bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg"
        >
          {busy ? 'Importing…' : 'Import my recipes'}
        </button>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</p>
      )}

      {batch && (
        <div className="bg-white rounded-xl p-5 shadow space-y-2">
          <h3 className="font-bold text-sm">
            {busy ? `Importing… ${batch.done} of ${batch.total}` : `Imported ${batch.results.filter((r) => r.name).length} of ${batch.total}`}
          </h3>
          <ul className="text-sm space-y-1 max-h-56 overflow-y-auto">
            {batch.results.map((r, i) => (
              <li key={i} className={r.error ? 'text-red-600' : r.skipped ? 'text-slate-400' : 'text-slate-700'}>
                {r.error
                  ? `✕ Couldn't import — ${r.error}`
                  : r.skipped
                    ? '– Already in your recipes'
                    : `✓ ${r.name}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="bg-white rounded-xl p-5 shadow space-y-3">
          <h3 className="font-bold">{preview.name}</h3>
          <p className="text-xs text-slate-500">
            {preview.servings ? `Serves ${preview.servings}` : ''}
            {preview.servings && preview.cookingMinutes ? ' · ' : ''}
            {preview.cookingMinutes ? `${preview.cookingMinutes} min` : ''}
          </p>
          <p className="text-sm text-slate-600">
            {preview.ingredients.length} ingredients · {preview.steps.length} steps
          </p>
          <div className="flex gap-2">
            <button
              onClick={savePreview}
              disabled={busy}
              className="flex-1 bg-slate-900 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg"
            >
              {busy ? 'Saving…' : 'Save to my recipes'}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2.5 text-sm font-bold text-slate-500 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewing ? (
        <div className="bg-white rounded-xl p-5 shadow space-y-4">
          <button onClick={() => setViewing(null)} className="text-sm font-bold text-emerald-700">
            ← Back to recipes
          </button>
          {viewing.image_url && (
            <img src={viewing.image_url} alt="" className="w-full rounded-lg" />
          )}
          <div>
            <h3 className="font-bold text-lg">{viewing.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {viewing.servings ? `Serves ${viewing.servings}` : ''}
              {viewing.servings && viewing.cooking_minutes ? ' · ' : ''}
              {viewing.cooking_minutes ? `${viewing.cooking_minutes} min` : ''}
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2">Ingredients</h4>
            <ul className="text-sm text-slate-600 space-y-1">
              {(viewing.ingredients || []).map((ing, i) => (
                <li key={i}>
                  {ing.quantity ? <span className="font-semibold">{ing.quantity} </span> : ''}{ing.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2">Steps</h4>
            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
              {(viewing.steps || []).map((s, i) => (
                <li key={i}>
                  {s.step}
                  {s.detail && <p className="text-xs text-slate-500 mt-0.5 ml-5 whitespace-pre-line">{s.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
          {viewing.source_url && (
            <a href={viewing.source_url} target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline">
              Original on mealime.com
            </a>
          )}
        </div>
      ) : (
        <>
          <div ref={myRecipesRef} className="bg-white rounded-xl p-5 shadow scroll-mt-4">
            <h3 className="font-bold mb-1">My recipes{saved.length > 0 ? ` (${saved.length})` : ''}</h3>
            {saved.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nothing saved yet. Import from the Mealime catalog below, or paste your Mealime links above —
                they'll land here.
              </p>
            ) : (
              <div className="space-y-2 mt-3">
                {saved.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setViewing(r)}
                    className="w-full text-left border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50"
                  >
                    <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {r.servings ? `Serves ${r.servings}` : ''}{r.cooking_minutes ? ` · ${r.cooking_minutes} min` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 shadow">
            <h3 className="font-bold mb-1">Mealime catalog</h3>
            <p className="text-xs text-slate-500 mb-3">
              {catalog.length ? `${catalog.length.toLocaleString()} public Mealime recipes. Search, tap import.` : 'Loading…'}
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes… (try “chicken”)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {results.map((r) => (
                <div key={r.url} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="flex-1 min-w-0 text-sm text-slate-700 truncate">{r.title}</p>
                  {savedIds.has(r.url) ? (
                    <span className="text-xs font-bold text-emerald-700 shrink-0">✓ Saved</span>
                  ) : (
                    <button
                      onClick={() => importCatalogRecipe(r.url)}
                      disabled={busy}
                      className="shrink-0 text-xs font-bold bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
                    >
                      Import
                    </button>
                  )}
                </div>
              ))}
              {q && results.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">No matches. Try a shorter word.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
