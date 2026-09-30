export async function generateAIMealPlan({ members, family, days, mealsPerDay }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API Key is missing! Add VITE_GROQ_API_KEY in Vercel settings.');
  }

  const allDiets = Array.from(new Set(members.flatMap(m => m.dietary_preferences || [])));
  const allAllergies = Array.from(new Set(members.flatMap(m => m.allergies || [])));
  const allDislikes = Array.from(new Set(members.flatMap(m => m.dislikes || [])));

  const prompt = `You are an expert chef and family nutritionist. Generate a realistic, varied JSON meal plan.

FAMILY CONTEXT:
- Members: ${members.length || 1}
- Target Budget: $${family.weekly_budget || 150}
- Dietary Preferences: ${allDiets.length ? allDiets.join(', ') : 'None'}
- Allergies (STRICT): ${allAllergies.length ? allAllergies.join(', ') : 'None'}
- Dislikes: ${allDislikes.length ? allDislikes.join(', ') : 'None'}

PLANNING RULES:
1. VARIETY: Do NOT repeat the same recipe across the plan. Every single meal must be unique and distinct.
2. MEAL APPROPRIATENESS:
   - Dinner MUST be a substantial hot meal or main entree (e.g., proteins, roasted meals, casseroles, pastas, hearty soups). NEVER assign smoothies, quick light snacks, or breakfast oats for dinner.
   - Breakfast can include eggs, oats, breakfast bowls, or smoothies.
   - Lunch should be light to moderate (sandwiches, wraps, salads, grain bowls, light warm dishes).
3. EXACT INGREDIENTS WITH QUANTITIES:
   - Every ingredient entry MUST include exact quantities and units (e.g., "1.5 lbs boneless chicken breast", "2 cups rolled oats", "1 tbsp olive oil", "1/2 tsp salt"). Never write plain ingredient names without amounts.

SCHEDULE DETAILS:
- Number of Days: ${days}
- Meals per Day: ${mealsPerDay}

Return ONLY a valid JSON array matching this exact schema, without markdown formatting or code block backticks:
[
  {
    "day": "Monday",
    "type": "Dinner",
    "title": "Garlic Butter Baked Salmon with Roasted Broccoli",
    "displayTitle": "Monday Dinner: Garlic Butter Baked Salmon",
    "price": 14.50,
    "prepTime": "25 mins",
    "servings": "4 servings",
    "ingredients": [
      "1.5 lbs fresh salmon fillets",
      "3 cloves garlic, minced",
      "2 tbsp unsalted butter, melted",
      "1 head fresh broccoli, chopped into florets",
      "1 tbsp olive oil",
      "1/2 tsp salt",
      "1/4 tsp black pepper"
    ],
    "instructions": [
      "Preheat oven to 400°F (200°C).",
      "Toss broccoli florets in olive oil, salt, and pepper on a baking sheet.",
      "Mix melted butter and minced garlic, then brush evenly over salmon fillets.",
      "Place salmon on the sheet alongside broccoli and bake for 12-15 minutes until salmon flakes easily."
    ]
  }
]`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  const rawResult = await response.json();
  if (rawResult.error) {
    throw new Error(rawResult.error.message);
  }

  const parseJsonLenient = (text) => {
    const t = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(t);
    } catch (e) {
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

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 8000,
          response_format: { type: 'json_object' }
        })
      });

      const rawResult = await apiResponse.json();
      if (rawResult.error) {
        throw new Error(rawResult.error.message);
      }

      return normalizePlan(parseJsonLenient(rawResult.choices[0].message.content));
    } catch (err) {
      lastErr = err;
      console.warn(`Meal plan generation attempt ${attempt} failed:`, err.message);
    }
  }
  throw lastErr || new Error('AI returned invalid data after 3 attempts');
}
