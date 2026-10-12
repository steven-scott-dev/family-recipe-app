import React, { useState, useEffect } from 'react';

// Recipe box: browse the Mealime public catalog, one-tap import via /api/import-recipe,
// paste any mealime.com link, and keep imported recipes in the saved_recipes table.
export default function RecipeImporter({ supabase, userId }) {
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [preview, setPreview] = useState(null); // recipe fetched, not yet saved
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

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
    setPasteUrl('');
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
          Grab your favorites before Oct 21. Tap a recipe below, or paste any mealime.com recipe link.
        </p>
        <div className="flex gap-2 mt-3">
          <input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="Paste mealime.com recipe link"
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm text-slate-800"
          />
          <button
            onClick={() => pasteUrl.trim() && importFromUrl(pasteUrl.trim())}
            disabled={busy || !pasteUrl.trim()}
            className="bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg"
          >
            Import
          </button>
        </div>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</p>
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
          {saved.length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow">
              <h3 className="font-bold mb-3">My recipes ({saved.length})</h3>
              <div className="space-y-2">
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
            </div>
          )}

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
                      onClick={() => importFromUrl(r.url)}
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
