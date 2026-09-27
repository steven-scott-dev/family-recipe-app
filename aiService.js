export async function generateAIMealPlan({ members, family, days, mealsPerDay }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API Key is missing! Add VITE_GROQ_API_KEY in Vercel settings.');
  }

  const allDiets = Array.from(new Set(members.flatMap(m => m.dietary_preferences || [])));
  const allAllergies = Array.from(new Set(members.flatMap(m => m.allergies || [])));
  const allDislikes = Array.from(new Set(members.flatMap(m => m.dislikes || [])));

  const prompt = `You are a professional nutritionist. Generate a JSON meal plan for a family.

Family Profile:
- Members: ${members.length || 1}
- Weekly Budget Target: $${family.weekly_budget || 150}
- Diets: ${allDiets.length ? allDiets.join(', ') : 'None'}
- Allergies: ${allAllergies.length ? allAllergies.join(', ') : 'None'}
- Dislikes: ${allDislikes.length ? allDislikes.join(', ') : 'None'}

Schedule:
- Days: ${days}
- Meals per day: ${mealsPerDay}

Return ONLY a valid JSON array of objects without markdown block backticks.
Schema:
[
  {
    "day": "Monday",
    "type": "Breakfast",
    "title": "Recipe Title",
    "displayTitle": "Monday Breakfast: Recipe Title",
    "price": 8.50,
    "prepTime": "15 mins",
    "servings": "4 servings",
    "ingredients": ["1 cup ingredient 1"],
    "instructions": ["Step 1..."]
  }
]`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  const rawResult = await response.json();
  if (rawResult.error) {
    throw new Error(rawResult.error.message);
  }

  let content = rawResult.choices[0].message.content.trim();
  content = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  return JSON.parse(content);
}
