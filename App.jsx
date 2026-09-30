import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('meal_planning');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authSent, setAuthSent] = useState(false);
  const [showShopping, setShowShopping] = useState(false);
  const [shoppingList, setShoppingList] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [allergyWarnings, setAllergyWarnings] = useState([]);
  const [duplicateNotes, setDuplicateNotes] = useState([]);
  const [regeneratingKey, setRegeneratingKey] = useState(null);
  const [shoppingRange, setShoppingRange] = useState('');

  // Family State
  const [family, setFamily] = useState({ name: 'Our Family', weekly_budget: 150 });
  const [members, setMembers] = useState([]);

  // Form State (Member Setup)
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [isManaged, setIsManaged] = useState(true);
  const [selectedDiet, setSelectedDiet] = useState([]);
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [dislikesText, setDislikesText] = useState('');

  // Meal Generator State
  const [days, setDays] = useState(7);
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [generatedMeals, setGeneratedMeals] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Saved Plans State
  const [savedPlans, setSavedPlans] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Preset options
  const dietOptions = ['Keto', 'Gluten-Free', 'Vegetarian', 'Vegan', 'Paleo', 'Dairy-Free', 'Low-Carb'];
  const allergyOptions = ['Peanuts', 'Tree Nuts', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Shellfish'];

  // Auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load existing family and members once signed in
  useEffect(() => {
    if (session) fetchFamilyData();
  }, [session]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!authEmail.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) alert('Sign-in failed: ' + error.message);
    else setAuthSent(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) alert('Google sign-in failed: ' + error.message);
  };

  async function fetchFamilyData() {
    try {
      const { data: familyData, error: famError } = await supabase
        .from('families')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (famError) console.error('Error fetching family:', famError);

      if (familyData) {
        setFamily(familyData);
        fetchSavedPlans(familyData.id);
        const { data: memberData, error: memError } = await supabase
          .from('family_members')
          .select('*')
          .eq('family_id', familyData.id);

        if (memError) console.error('Error fetching members:', memError);
        if (memberData) setMembers(memberData);
      }
    } catch (err) {
      console.error('Database fetch error:', err);
    }
  }

  // Toggle helper for multi-select buttons
  const toggleArrayItem = (list, setList, item) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  // Save Family Profile
  async function handleSaveFamily(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('families')
      .upsert({ id: family.id, name: family.name, weekly_budget: family.weekly_budget, user_id: session?.user?.id })
      .select()
      .single();

    if (error) {
      alert('Error updating family: ' + error.message);
    } else {
      setFamily(data);
      alert('Family settings saved!');
    }
  }

  // Save Family Member
  async function handleSaveMember(e) {
    e.preventDefault();
    if (!memberName.trim()) return alert('Please enter a member name');

    let currentFamilyId = family.id;

    if (!currentFamilyId) {
      const { data: newFam, error: famError } = await supabase
        .from('families')
        .upsert({ name: family.name, weekly_budget: family.weekly_budget, user_id: session?.user?.id })
        .select()
        .single();

      if (famError) {
        return alert('Error creating family profile: ' + famError.message);
      }
      if (newFam) {
        currentFamilyId = newFam.id;
        setFamily(newFam);
      }
    }

    const newMember = {
      family_id: currentFamilyId,
      name: memberName,
      is_managed: isManaged,
      email: isManaged ? null : memberEmail,
      dietary_preferences: selectedDiet,
      allergies: selectedAllergies,
      dislikes: dislikesText.split(',').map(s => s.trim()).filter(Boolean)
    };

    const { data, error } = await supabase
      .from('family_members')
      .insert([newMember])
      .select();

    if (error) {
      console.error('Supabase Error:', error);
      return alert('Failed to save member: ' + error.message);
    }

    if (data && data.length > 0) {
      setMembers([...members, data[0]]);
      setMemberName('');
      setMemberEmail('');
      setSelectedDiet([]);
      setSelectedAllergies([]);
      setDislikesText('');
      alert('Family member added successfully!');
    }
  }

  // Saved meal plans: fetch / save / load / delete
  async function fetchSavedPlans(familyId) {
    if (!familyId) return;
    const { data, error } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching saved plans:', error);
      return;
    }
    setSavedPlans(data || []);
  }

  async function handleSavePlan() {
    if (!generatedMeals.length) return;
    if (!family.id) return alert('Save your household profile first.');
    setIsSaving(true);
    try {
      const { data: plan, error: planError } = await supabase
        .from('meal_plans')
        .insert([{
          family_id: family.id,
          user_id: session?.user?.id,
          name: `Plan ${new Date().toLocaleDateString()}`,
          days,
          meals_per_day: mealsPerDay,
          total_cost: calculateTotalCost()
        }])
        .select()
        .single();
      if (planError) throw planError;

      const mealRows = generatedMeals.map(m => ({
        plan_id: plan.id,
        day: m.day,
        type: m.type,
        title: m.title,
        display_title: m.displayTitle || null,
        price: m.price ?? null,
        prep_time: m.prepTime || null,
        servings: m.servings || null,
        nutrition: m.nutrition || null,
        ratings: m.ratings || {},
        ingredients: m.ingredients || [],
        instructions: m.instructions || []
      }));
      const { error: mealsError } = await supabase.from('meals').insert(mealRows);
      if (mealsError) throw mealsError;

      alert('Meal plan saved!');
      fetchSavedPlans(family.id);
    } catch (err) {
      console.error('Save plan error:', err);
      alert('Failed to save plan: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLoadPlan(planId) {
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true });
    if (error) return alert('Failed to load plan: ' + error.message);
    setGeneratedMeals((data || []).map(m => ({
      day: m.day,
      type: m.type,
      title: m.title,
      displayTitle: m.display_title,
      price: m.price,
      prepTime: m.prep_time,
      servings: m.servings,
      nutrition: m.nutrition || null,
      ratings: m.ratings || {},
      mealId: m.id,
      ingredients: m.ingredients,
      instructions: m.instructions
    })));
    setActiveTab('meal_planning');
  }

  async function handleDeletePlan(planId) {
    if (!confirm('Delete this saved plan?')) return;
    const { error } = await supabase.from('meal_plans').delete().eq('id', planId);
    if (error) return alert('Failed to delete plan: ' + error.message);
    setSavedPlans(savedPlans.filter(p => p.id !== planId));
  }

  // AI-Powered Meal Generator
  const generateAIMealPlan = async () => {
    setIsGenerating(true);
    setAllergyWarnings([]);
    setDuplicateNotes([]);

    // Compile constraints from family roster
    const allDiets = Array.from(new Set(members.flatMap(m => m.dietary_preferences || [])));
    const allAllergies = Array.from(new Set(members.flatMap(m => m.allergies || [])));
    const allDislikes = Array.from(new Set(members.flatMap(m => m.dislikes || [])));

    const prompt = `You are a professional nutritionist and meal planning assistant. Generate a structured JSON meal plan for a family.

Family Profile:
- Total Family Members: ${members.length || 1} - Weekly Grocery Budget Target:$${family.weekly_budget || 150} - Required Diets:${allDiets.length ? allDiets.join(', ') : 'None'}
- CRITICAL ALLERGIES TO STRICTLY AVOID: ${allAllergies.length ? allAllergies.join(', ') : 'None'}
- Disliked Foods to Exclude: ${allDislikes.length ? allDislikes.join(', ') : 'None'}

Meal Schedule Request:
- Number of Days: ${days}
- Meals per day: ${mealsPerDay}

Instructions:
Respond ONLY with a valid JSON array of meal objects.\nCRITICAL: every meal title must be unique across the entire plan - never repeat a recipe, no duplicates across days or meal types.\nSet the servings field to exactly ${members.length || 1} for EVERY meal (this family's size). Include per-serving nutrition estimates in the nutrition object (realistic values for the ingredients and servings). Estimate the price field using realistic 2026 Knoxville, TN supermarket prices (typical US Southeast grocery costs for the listed ingredients and servings) - e.g. \'${members.length || 1} servings\'. Do not include markdown code block backticks (e.g. no \`\`\`json).
Each item in the array MUST strictly follow this JSON schema:
[
  {
    "day": "Monday",
    "type": "Breakfast",
    "title": "Recipe Title",
    "displayTitle": "Monday Breakfast: Recipe Title",
    "price": 8.50,
    "prepTime": "15 mins",
    "servings": "4 servings",
    "nutrition": { "calories": 520, "protein": "32g", "carbs": "45g", "fat": "20g", "fiber": "6g", "sodium": "680mg" },
    "ingredients": [
      "2 cups Almond Milk",
      "1 tsp Garlic Powder"
    ],
    "instructions": [
      "Step 1 instruction...",
      "Step 2 instruction..."
    ]
  }
]`;

    try {
      const parseJsonLenient = (text) => {
        const t = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        try {
          return JSON.parse(t);
        } catch (e) {
          // Repair: slice the largest [...] or {...} block (handles truncation)
          const start = t.search(/[[{]/);
          const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
          if (start !== -1 && end > start) {
            return JSON.parse(t.slice(start, end + 1));
          }
          throw e;
        }
      };

      const normalizePlan = (parsed) => {
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') {
          const arr = Object.values(parsed).find((v) => Array.isArray(v));
          if (arr) return arr;
        }
        throw new Error('AI response was not a meal array');
      };

      let parsedPlan = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3 && !parsedPlan; attempt++) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-meals', {
            body: { prompt },
          });
          if (fnError) throw new Error(fnError.message);
          if (fnData && fnData.error) throw new Error(fnData.error);

          parsedPlan = normalizePlan(parseJsonLenient(fnData.content));
        } catch (err) {
          lastErr = err;
          console.warn(`Meal plan generation attempt ${attempt} failed:`, err.message);
        }
      }
      if (!parsedPlan) {
        throw lastErr || new Error('AI returned invalid data after 3 attempts');
      }
      const familySize = members.length || 1;
      const normalizedPlan = parsedPlan.map((m) => {
        // Enforce family size in code — the model doesn't reliably follow the prompt.
        const aiServings = parseServings(m.servings) || familySize;
        const factor = aiServings === familySize ? 1 : familySize / aiServings;
        const scaledIngredients = (m.ingredients || []).map((i) => scaleIngredient(i, factor));
        return {
          ...m,
          servings: `${familySize} servings`,
          baseServings: familySize,
          baseIngredients: scaledIngredients,
          ingredients: scaledIngredients
        };
      });
      setGeneratedMeals(normalizedPlan);
      setAllergyWarnings(scanAllergies(normalizedPlan, allAllergies));
      setDuplicateNotes(findDuplicateTitles(normalizedPlan));
    } catch (err) {
      console.error('AI Generation Error:', err);
      alert('Failed to generate AI meal plan: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const parseServings = (s) => {
    if (typeof s === 'number') return s;
    const m = String(s || '').match(/(\d*\.?\d+)/);
    return m ? parseFloat(m[1]) : null;
  };

  const scaleIngredient = (item, factor) => {
    const m = String(item).match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)/);
    if (!m) return item;
    const q = m[1].trim();
    let val = 0;
    const parts = q.split(/\s+/);
    for (const p of parts) {
      if (p.includes('/')) {
        const frac = p.split('/');
        val += parseFloat(frac[0]) / parseFloat(frac[1]);
      } else {
        val += parseFloat(p);
      }
    }
    const scaled = val * factor;
    const pretty = Number.isInteger(scaled) ? String(scaled) : String(Math.round(scaled * 4) / 4);
    return item.replace(m[0], pretty);
  };

  const adjustServings = (delta) => {
    const meal = selectedRecipe;
    if (!meal) return;
    const base = meal.baseServings || parseServings(meal.servings) || 1;
    const current = parseServings(meal.servings) || base;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    const factor = next / base;
    const baseIngredients = meal.baseIngredients || meal.ingredients || [];
    const scaledIngredients = baseIngredients.map((i) => scaleIngredient(i, factor));
    const updated = { ...meal, servings: `${next} servings`, ingredients: scaledIngredients };
    setSelectedRecipe(updated);
    setGeneratedMeals((prev) =>
      prev.map((m) =>
        m.day === meal.day && m.type === meal.type && m.title === meal.title
          ? { ...m, servings: `${next} servings`, ingredients: scaledIngredients }
          : m
      )
    );
  };

  const fmtQty = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 4) / 4));

  const KNOWN_UNITS = ['cup','tbsp','tsp','oz','ounce','lb','pound','g','gram','kg','ml','liter','clove','can','slice','piece','stalk','bunch','pinch','dash'];

  const singular = (w) => w.replace(/s$/, '');

  const parseIngredientDetail = (item) => {
    const str = String(item).trim();
    const m = str.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s+(.*)$/);
    if (!m) return { qty: null, unit: '', name: str.toLowerCase() };
    let val = 0;
    const parts = m[1].trim().split(/\s+/);
    for (const p of parts) {
      if (p.includes('/')) {
        const frac = p.split('/');
        val += parseFloat(frac[0]) / parseFloat(frac[1]);
      } else {
        val += parseFloat(p);
      }
    }
    const rest = m[2].trim();
    const words = rest.split(/\s+/);
    const first = words[0].toLowerCase().replace(/[^a-z]/g, '');
    let unit = '';
    let name = rest;
    if (KNOWN_UNITS.includes(first) || KNOWN_UNITS.includes(singular(first))) {
      unit = singular(first);
      name = words.slice(1).join(' ');
    }
    return { qty: val, unit, name: name.toLowerCase() };
  };

  const buildShoppingList = () => {
    const groups = {};
    generatedMeals.forEach((meal) => {
      (meal.ingredients || []).forEach((ing) => {
        const p = parseIngredientDetail(ing);
        const key = p.name + '|' + p.unit;
        if (!groups[key]) {
          groups[key] = { name: p.name, unit: p.unit, qty: 0, hasQty: false, meals: [] };
        }
        const g = groups[key];
        if (p.qty != null) {
          g.qty += p.qty;
          g.hasQty = true;
        }
        const label = `${meal.day} ${meal.type}`;
        if (!g.meals.includes(label)) g.meals.push(label);
      });
    });
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    return Object.values(groups)
      .map((g, i) => ({
        id: i,
        display: g.hasQty
          ? `${cap(g.name)} \u2014 ${fmtQty(Math.round(g.qty * 100) / 100)}${g.unit ? ' ' + g.unit : ''}`
          : cap(g.name),
        meals: g.meals,
      }))
      .sort((a, b) => a.display.localeCompare(b.display));
  };

  const openShopping = () => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + ((days || 7) - 1));
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    setShoppingRange(`${fmt(start)} \u2013 ${fmt(end)}`);
    setShoppingList(null);
    setCheckedItems({});
    setShowShopping(true);
  };

  const copyShoppingList = () => {
    if (!shoppingList) return;
    const text = shoppingList
      .map((i) => `\u2022 ${i.display}`)
      .join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => alert('Shopping list copied!'),
        () => alert('Copy failed - long-press to copy manually.')
      );
    } else {
      alert('Copy not supported on this browser.');
    }
  };

  const avgRating = (meal) => {
    const vals = Object.values(meal.ratings || {});
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const setMealRating = async (memberId, stars) => {
    const meal = selectedRecipe;
    if (!meal) return;
    const ratings = { ...(meal.ratings || {}), [memberId]: stars };
    const updated = { ...meal, ratings };
    setSelectedRecipe(updated);
    setGeneratedMeals((prev) =>
      prev.map((m) =>
        m.day === meal.day && m.type === meal.type && m.title === meal.title ? { ...m, ratings } : m
      )
    );
    if (meal.mealId) {
      const { error } = await supabase.from('meals').update({ ratings }).eq('id', meal.mealId);
      if (error) console.error('Rating save error:', error);
    }
  };

  const ALLERGEN_SYNONYMS = {
    peanut: ['peanut'],
    'tree nut': ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'brazil', 'macadamia'],
    nut: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'peanut'],
    milk: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'dairy', 'whey'],
    dairy: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'dairy', 'whey'],
    egg: ['egg'],
    soy: ['soy', 'tofu', 'miso', 'tamari'],
    wheat: ['wheat', 'flour', 'bread', 'pasta'],
    gluten: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye'],
    fish: ['fish', 'tuna', 'salmon', 'cod', 'tilapia'],
    shellfish: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop'],
    sesame: ['sesame', 'tahini'],
  };

  const wordHit = (text, term) => {
    try {
      return new RegExp('\\b' + term + 's?\\b').test(text);
    } catch (e) {
      return text.includes(term);
    }
  };

  const ingredientHasAllergen = (ingredient, allergy) => {
    const ing = String(ingredient).toLowerCase();
    const a = String(allergy).toLowerCase().trim();
    if (!a) return false;
    if (a.split(/\s+/).some((w) => w.length > 2 && wordHit(ing, w))) return true;
    for (const key of Object.keys(ALLERGEN_SYNONYMS)) {
      if (a.includes(key) && ALLERGEN_SYNONYMS[key].some((s) => wordHit(ing, s))) return true;
    }
    return false;
  };

  const scanAllergies = (meals, allergies) => {
    const hits = [];
    (meals || []).forEach((meal) => {
      (meal.ingredients || []).forEach((ing) => {
        (allergies || []).forEach((allergy) => {
          if (ingredientHasAllergen(ing, allergy)) {
            hits.push({
              key: `${meal.day}|${meal.type}|${meal.title}`,
              day: meal.day,
              type: meal.type,
              title: meal.title,
              ingredient: ing,
              allergy,
            });
          }
        });
      });
    });
    return hits;
  };

  const findDuplicateTitles = (meals) => {
    const seen = {};
    const dupes = [];
    (meals || []).forEach((m) => {
      const key = String(m.title || '').toLowerCase().trim();
      if (!key) return;
      seen[key] = seen[key] || { title: m.title, count: 0 };
      seen[key].count += 1;
    });
    Object.values(seen).forEach((s) => {
      if (s.count > 1) dupes.push({ title: s.title, count: s.count });
    });
    return dupes;
  };

  const regenerateSingleMeal = async (warn) => {
    const key = warn.key;
    setRegeneratingKey(key);
    try {
      const familySize = members.length || 1;
      const allAllergies = Array.from(new Set(members.flatMap((m) => m.allergies || [])));
      const usedTitles = generatedMeals.map((m) => m.title).filter(Boolean).join('; ');
      const singlePrompt = `You are a professional nutritionist and meal planning assistant. Generate EXACTLY ONE replacement meal, returned as a JSON array with a single object.

Requirements:
- Day: ${warn.day}, meal type: ${warn.type}
- Servings: exactly ${familySize} (e.g. "${familySize} servings")
- CRITICAL ALLERGIES TO STRICTLY AVOID: ${allAllergies.length ? allAllergies.join(', ') : 'None'}. The previous recipe was flagged because "${warn.ingredient}" may contain ${warn.allergy} - do NOT use that ingredient or anything containing it.
- Do NOT reuse any of these titles already in the plan: ${usedTitles || 'none yet'}.
- Include per-serving nutrition estimates in a nutrition object {calories, protein, carbs, fat, fiber, sodium}.
- Estimate price using realistic 2026 Knoxville, TN supermarket prices.
- Respond ONLY with the JSON array, no markdown, no backticks. Schema:
[{"day":"${warn.day}","type":"${warn.type}","title":"Recipe Title","displayTitle":"${warn.day} ${warn.type}: Recipe Title","price":8.50,"prepTime":"15 mins","servings":"${familySize} servings","nutrition":{"calories":520,"protein":"32g","carbs":"45g","fat":"20g","fiber":"6g","sodium":"680mg"},"ingredients":["2 cups Almond Milk"],"instructions":["Step 1..."]}]`;

      const parseOne = (text) => {
        const t = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(t);
        } catch (e) {
          const start = t.search(/[[{]/);
          const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
          if (start === -1 || end <= start) throw e;
          parsed = JSON.parse(t.slice(start, end + 1));
        }
        if (Array.isArray(parsed) && parsed.length) return parsed[0];
        if (parsed && typeof parsed === 'object') {
          const arr = Object.values(parsed).find((v) => Array.isArray(v));
          if (arr && arr.length) return arr[0];
        }
        throw new Error('AI did not return a meal');
      };

      let replacement = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3 && !replacement; attempt++) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-meals', {
            body: { prompt: singlePrompt },
          });
          if (fnError) throw new Error(fnError.message);
          if (fnData && fnData.error) throw new Error(fnData.error);
          replacement = parseOne(fnData.content);
        } catch (err) {
          lastErr = err;
        }
      }
      if (!replacement) throw lastErr || new Error('AI returned invalid data');

      const aiServings = parseServings(replacement.servings) || familySize;
      const factor = aiServings === familySize ? 1 : familySize / aiServings;
      const scaledIngredients = (replacement.ingredients || []).map((i) => scaleIngredient(i, factor));
      const newMeal = {
        ...replacement,
        day: warn.day,
        type: warn.type,
        displayTitle: `${warn.day} ${warn.type}: ${replacement.title}`,
        servings: `${familySize} servings`,
        baseServings: familySize,
        baseIngredients: scaledIngredients,
        ingredients: scaledIngredients,
      };
      const updated = generatedMeals.map((m) =>
        m.day === warn.day && m.type === warn.type && m.title === warn.title ? newMeal : m
      );
      setGeneratedMeals(updated);
      setAllergyWarnings(scanAllergies(updated, allAllergies));
      setDuplicateNotes(findDuplicateTitles(updated));
    } catch (err) {
      alert('Failed to regenerate meal: ' + err.message);
    } finally {
      setRegeneratingKey(null);
    }
  };

  const calculateTotalCost = () => {
    return generatedMeals.reduce((acc, curr) => acc + (curr.price || 0), 0);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-800">Family Recipe & Meal Planner</h1>
            <p className="text-xs text-slate-500 mt-1">Sign in to access your family's meal plans</p>
          </div>
          {authSent ? (
            <p className="text-sm text-slate-600 text-center">
              Check your email for the sign-in link — it may take a minute to arrive.
            </p>
          ) : (
            <>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-bold"
              >
                Send sign-in link
              </button>
            </form>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex-1 border-t border-slate-200" />
              or
              <span className="flex-1 border-t border-slate-200" />
            </div>
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white border border-slate-300 text-slate-700 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-50"
            >
              Sign in with Google
            </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-20">
      {/* Top Header */}
      <header className="bg-slate-900 text-white p-4 shadow-md">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="text-center flex-1">
            <h1 className="text-xl font-bold tracking-wide">Family Recipe & Meal Planner</h1>
            <p className="text-xs text-slate-400 mt-0.5">AI-Powered Personalized Nutrition</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-300 hover:text-white border border-slate-600 rounded px-2 py-1 ml-2 shrink-0"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        
        {/* TAB 1: MEAL PLANNING */}
        {activeTab === 'meal_planning' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-base font-bold text-slate-800">Generate Meal Plan</h2>
                <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded">
                  ✨ AI Powered
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Days to Plan</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="14"
                    value={days} 
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="w-full border rounded p-2 text-sm text-center bg-slate-50 focus:outline-emerald-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Meals / Day</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="4"
                    value={mealsPerDay} 
                    onChange={(e) => setMealsPerDay(Number(e.target.value))}
                    className="w-full border rounded p-2 text-sm text-center bg-slate-50 focus:outline-emerald-500" 
                  />
                </div>
              </div>

              {members.length > 0 && (
                <div className="text-[11px] bg-slate-50 p-2 rounded border border-slate-200 text-slate-600">
                  <p className="font-semibold text-slate-700">Accounting for {members.length} member(s):</p>
                  <p className="truncate">
                    Diet/Allergies: {Array.from(new Set(members.flatMap(m => [...(m.dietary_preferences||[]), ...(m.allergies||[])]))).join(', ') || 'None set'}
                  </p>
                </div>
              )}

              <button 
                onClick={generateAIMealPlan}
                disabled={isGenerating}
                className={`w-full text-white py-2.5 rounded-lg font-bold text-sm transition shadow ${isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {isGenerating ? '🤖 Creating Custom Recipes...' : '✨ Generate AI Meal Schedule'}
              </button>
            </div>

            {/* Generated Recipes List */}
            {generatedMeals.length > 0 && (
              <div className="space-y-2">
                {allergyWarnings.length > 0 && (
                  <div className="bg-red-50 border border-red-300 text-red-800 p-3 rounded-lg text-xs space-y-1">
                    <p className="font-bold">⚠️ Allergen alert — {allergyWarnings.length} possible issue{allergyWarnings.length > 1 ? 's' : ''} found:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {allergyWarnings.map((w, i) => (
                        <li key={i} className="flex items-start justify-between gap-2">
                          <span>
                            <strong>{w.day} {w.type}</strong> ({w.title}): “{w.ingredient}” may contain <strong>{w.allergy}</strong>
                          </span>
                          <button
                            onClick={() => regenerateSingleMeal(w)}
                            disabled={regeneratingKey === w.key}
                            className="shrink-0 text-[11px] font-bold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {regeneratingKey === w.key ? 'Regenerating...' : 'Regenerate'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-red-600 font-semibold">Review these meals or regenerate before cooking.</p>
                  </div>
                )}
                {duplicateNotes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-xs">
                    Note: {duplicateNotes.map((d) => `${d.title} (\u00D7${d.count})`).join(', ')} appears more than once — regenerate for more variety if you'd like.
                  </div>
                )}
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-bold text-sm text-slate-700">Weekly Schedule ({generatedMeals.length} Meals)</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Est. total: ${calculateTotalCost().toFixed(2)}
                    </span>
                    {(() => {
                      const budget = Number(family.weekly_budget) || 0;
                      if (!budget) return null;
                      const total = calculateTotalCost();
                      const over = total > budget;
                      return (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${over ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`}>
                          {over
                            ? `Over budget by $${(total - budget).toFixed(2)}`
                            : `$${(budget - total).toFixed(2)} under budget`}
                        </span>
                      );
                    })()}
                    <button
                      onClick={openShopping}
                      className="text-xs font-bold px-3 py-1 rounded bg-sky-600 text-white hover:bg-sky-700"
                    >
                      🛒 List
                    </button>
                    <button
                      onClick={handleSavePlan}
                      disabled={isSaving}
                      className={`text-xs font-bold px-3 py-1 rounded ${isSaving ? 'bg-slate-300 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                      {isSaving ? 'Saving...' : '💾 Save Plan'}
                    </button>
                  </div>
                </div>
                {(() => {
                  const budget = Number(family.weekly_budget) || 0;
                  if (!budget || !generatedMeals.length) return null;
                  const pct = (calculateTotalCost() / budget) * 100;
                  const barColor = pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-400' : 'bg-emerald-500';
                  return (
                    <div className="px-1">
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                        {Math.round(pct)}% of ${budget}/week budget
                      </p>
                    </div>
                  );
                })()}

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {generatedMeals.map((meal, idx) => {
                    const avg = avgRating(meal);
                    const flagged = allergyWarnings.some((w) => w.key === `${meal.day}|${meal.type}|${meal.title}`);
                    return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedRecipe(meal)}
                      className="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center shadow-sm cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/40 transition"
                    >
                      <div>
                        <p className="font-bold text-slate-800">
                          {flagged && <span className="text-red-500 mr-1">⚠️</span>}
                          {meal.displayTitle || `${meal.day} ${meal.type}: ${meal.title}`}
                        </p>
                        <p className="text-slate-500">Tap to view ingredients & steps 📖</p>
                      </div>
                      <span className="text-right ml-2 shrink-0">
                        <span className="font-semibold text-slate-600 block">${meal.price ? meal.price.toFixed(2) : '0.00'} <span className="font-normal text-slate-400">est.</span></span>
                        {avg && <span className="text-amber-500 text-[11px] font-bold">★ {avg.toFixed(1)}</span>}
                      </span>
                    </div>
                    );
                  })}
                </div>

                {/* Saved Plans */}
                {savedPlans.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Saved Plans</h4>
                    <div className="space-y-1.5">
                      {savedPlans.map(plan => (
                        <div key={plan.id} className="flex justify-between items-center text-xs bg-slate-50 border border-slate-200 rounded p-2">
                          <div>
                            <p className="font-bold text-slate-700">{plan.name}</p>
                            <p className="text-slate-500">{plan.days} days · {plan.meals_per_day}/day · ~${Number(plan.total_cost || 0).toFixed(2)} est.</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => handleLoadPlan(plan.id)} className="font-bold text-emerald-700 hover:underline">Load</button>
                            <button onClick={() => handleDeletePlan(plan.id)} className="font-bold text-red-600 hover:underline">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grocery Integration */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 pt-3">
                  <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Export to Grocery Cart</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => alert('Sending ingredients to Walmart OPD Cart...')}
                      className="bg-blue-600 text-white py-2 rounded font-semibold text-xs hover:bg-blue-700 transition"
                    >
                      Order via Walmart
                    </button>
                    <button 
                      onClick={() => alert('Redirecting to Instacart Developer Cart...')}
                      className="bg-orange-600 text-white py-2 rounded font-semibold text-xs hover:bg-orange-700 transition"
                    >
                      Order via Instacart
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SETUP & MEMBER CREATION */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            {/* Household Settings */}
            <form onSubmit={handleSaveFamily} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <h2 className="text-base font-bold text-slate-800 border-b pb-2">Household Profile</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Family Name</label>
                <input 
                  type="text" 
                  value={family.name || ''} 
                  onChange={(e) => setFamily({ ...family, name: e.target.value })}
                  className="w-full border rounded p-2 text-sm bg-slate-50" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Weekly Budget ($)</label>
                <input 
                  type="number" 
                  value={family.weekly_budget || 0} 
                  onChange={(e) => setFamily({ ...family, weekly_budget: Number(e.target.value) })}
                  className="w-full border rounded p-2 text-sm bg-slate-50" 
                />
              </div>
              <button type="submit" className="w-full bg-slate-800 text-white py-2 rounded font-semibold text-xs hover:bg-slate-900">
                Update Household Settings
              </button>
            </form>

            {/* Add Family Member */}
            <form onSubmit={handleSaveMember} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <h2 className="text-base font-bold text-slate-800 border-b pb-2">Add / Configure Family Member</h2>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Member Name</label>
                <input 
                  type="text" 
                  value={memberName} 
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="e.g. Micah"
                  className="w-full border rounded p-2 text-sm bg-slate-50" 
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Member Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setIsManaged(true)}
                    className={`py-2 text-xs rounded font-bold border ${isManaged ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Add Directly (Child/Dependent)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsManaged(false)}
                    className={`py-2 text-xs rounded font-bold border ${!isManaged ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Invite via Email
                  </button>
                </div>
              </div>

              {!isManaged && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={memberEmail} 
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full border rounded p-2 text-sm bg-slate-50" 
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dietary Preferences</label>
                <div className="flex flex-wrap gap-1.5">
                  {dietOptions.map(diet => (
                    <button
                      key={diet}
                      type="button"
                      onClick={() => toggleArrayItem(selectedDiet, setSelectedDiet, diet)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${selectedDiet.includes(diet) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-300'}`}
                    >
                      {diet}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Allergies</label>
                <div className="flex flex-wrap gap-1.5">
                  {allergyOptions.map(allergy => (
                    <button
                      key={allergy}
                      type="button"
                      onClick={() => toggleArrayItem(selectedAllergies, setSelectedAllergies, allergy)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${selectedAllergies.includes(allergy) ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-slate-600 border-slate-300'}`}
                    >
                      {allergy}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dislikes (comma separated)</label>
                <input 
                  type="text" 
                  value={dislikesText} 
                  onChange={(e) => setDislikesText(e.target.value)}
                  placeholder="Mushrooms, Olives, Cilantro"
                  className="w-full border rounded p-2 text-sm bg-slate-50" 
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold text-sm shadow hover:bg-slate-800 transition"
              >
                Save Member & Continue
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: FAMILY ROSTER */}
        {activeTab === 'family' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-base font-bold text-slate-800 border-b pb-2">Family Roster ({members.length})</h2>
            
            {members.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No family members configured yet. Go to Setup to add members.</p>
            ) : (
              <div className="space-y-3">
                {members.map(member => (
                  <div key={member.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-800">{member.name}</h3>
                      <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded ${member.is_managed ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {member.is_managed ? 'Managed' : 'Account Member'}
                      </span>
                    </div>

                    {member.dietary_preferences?.length > 0 && (
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-500">Diet: </span> 
                        {member.dietary_preferences.join(', ')}
                      </p>
                    )}

                    {member.allergies?.length > 0 && (
                      <p className="text-xs text-red-600 font-semibold">
                        <span>Allergies: </span> 
                        {member.allergies.join(', ')}
                      </p>
                    )}

                    {member.dislikes?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        <span>Dislikes: </span> 
                        {member.dislikes.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* SHOPPING LIST MODAL */}
      {showShopping && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-2">
              <div>
                <h3 className="font-bold text-base text-slate-800">🛒 Shopping List · {shoppingRange}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {days} days · {generatedMeals.length} meals · Est. ${calculateTotalCost().toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setShowShopping(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            {!shoppingList ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Here's your plan summary: <strong>{generatedMeals.length} meals</strong> over{' '}
                  <strong>{days} days</strong>, estimated at{' '}
                  <strong>${calculateTotalCost().toFixed(2)}</strong>.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Happy with it? Generate a consolidated shopping list with quantities combined
                  across all meals.
                </p>
                <button
                  onClick={() => setShoppingList(buildShoppingList())}
                  className="w-full bg-sky-600 text-white py-2.5 rounded-lg text-xs font-bold shadow hover:bg-sky-700"
                >
                  Generate Shopping List
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {shoppingList.length} items · tap to check off
                </p>
                <ul className="space-y-1.5">
                  {shoppingList.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => setCheckedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className={`text-xs p-2 rounded-lg border cursor-pointer flex gap-2 items-start ${
                        checkedItems[item.id]
                          ? 'bg-emerald-50 border-emerald-200 text-slate-400 line-through'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="mt-0.5">{checkedItems[item.id] ? '\u2611' : '\u2610'}</span>
                      <span>
                        <span className="font-semibold">{item.display}</span>
                        {item.meals.length > 0 && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {item.meals.join(', ')}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={copyShoppingList}
                  className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-xs font-bold shadow"
                >
                  Copy List
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAILED RECIPE MODAL */}
      {selectedRecipe && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-2">
              <div>
                <h3 className="font-bold text-base text-slate-800">{selectedRecipe.title}</h3>
                <div className="flex gap-2 text-xs font-semibold mt-1">
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ⏱️ {selectedRecipe.prepTime || '15-20 mins'}
                  </span>
                  <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                    🍽️
                    <button onClick={() => adjustServings(-1)} className="px-1.5 font-bold text-slate-500 hover:text-slate-900">−</button>
                    <span>{selectedRecipe.servings || '2-4 servings'}</span>
                    <button onClick={() => adjustServings(1)} className="px-1.5 font-bold text-slate-500 hover:text-slate-900">+</button>
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRecipe(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            {members.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Rate this meal</h4>
                <div className="space-y-1.5">
                  {members.map((member) => {
                    const r = (selectedRecipe.ratings || {})[member.id] || 0;
                    return (
                      <div key={member.id} className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                        <span className="text-xs font-semibold text-slate-700 truncate mr-2">{member.name}</span>
                        <span className="flex gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              onClick={() => setMealRating(member.id, s)}
                              className={`text-lg leading-none ${s <= r ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'}`}
                            >
                              ★
                            </button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedRecipe.nutrition && (
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Nutrition <span className="font-normal normal-case">(per serving, est.)</span></h4>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-center border-b border-slate-200 pb-1.5 mb-1.5">
                    <span className="text-2xl font-extrabold text-slate-800">{selectedRecipe.nutrition.calories || '\u2013'}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">cal</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[
                      ['Protein', selectedRecipe.nutrition.protein],
                      ['Carbs', selectedRecipe.nutrition.carbs],
                      ['Fat', selectedRecipe.nutrition.fat],
                      ['Fiber', selectedRecipe.nutrition.fiber],
                      ['Sodium', selectedRecipe.nutrition.sodium],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-white rounded px-1 py-1 border border-slate-100">
                        <div className="text-xs font-bold text-slate-700">{val || '\u2013'}</div>
                        <div className="text-[10px] text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Ingredients & Quantities</h4>
              <ul className="list-disc list-inside text-xs text-slate-700 space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {selectedRecipe.ingredients?.map((item, i) => (
                  <li key={i} className="leading-snug">{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">Step-By-Step Instructions</h4>
              <ol className="list-decimal list-inside text-xs text-slate-700 space-y-2">
                {selectedRecipe.instructions?.map((step, i) => (
                  <li key={i} className="leading-relaxed border-b border-slate-100 pb-1.5">{step}</li>
                )) || <li>No steps recorded for this recipe.</li>}
              </ol>
            </div>

            <button 
              onClick={() => setSelectedRecipe(null)}
              className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-xs font-bold shadow"
            >
              Close Recipe
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 text-xs font-bold z-40">
        <button 
          onClick={() => setActiveTab('meal_planning')}
          className={`flex flex-col items-center py-1 px-3 rounded ${activeTab === 'meal_planning' ? 'text-emerald-600' : 'text-slate-500'}`}
        >
          <span>🥗</span>
          <span>Meals</span>
        </button>
        <button 
          onClick={() => setActiveTab('setup')}
          className={`flex flex-col items-center py-1 px-3 rounded ${activeTab === 'setup' ? 'text-emerald-600' : 'text-slate-500'}`}
        >
          <span>⚙️</span>
          <span>Setup</span>
        </button>
        <button 
          onClick={() => setActiveTab('family')}
          className={`flex flex-col items-center py-1 px-3 rounded ${activeTab === 'family' ? 'text-emerald-600' : 'text-slate-500'}`}
        >
          <span>👨‍👩‍👧</span>
          <span>Family</span>
        </button>
      </nav>
    </div>
  );
}
