import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('meal_planning');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

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

  // Preset options
  const dietOptions = ['Keto', 'Gluten-Free', 'Vegetarian', 'Vegan', 'Paleo', 'Dairy-Free', 'Low-Carb'];
  const allergyOptions = ['Peanuts', 'Tree Nuts', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Shellfish'];

  // Load existing family and members from Supabase on mount
  useEffect(() => {
    fetchFamilyData();
  }, []);

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
      .upsert({ id: family.id, name: family.name, weekly_budget: family.weekly_budget })
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
        .upsert({ name: family.name, weekly_budget: family.weekly_budget })
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

  // AI-Powered Meal Generator
  const generateAIMealPlan = async () => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      return alert('Groq API Key is missing! Add VITE_GROQ_API_KEY in Vercel settings.');
    }

    setIsGenerating(true);

    // Compile constraints from family roster
    const allDiets = Array.from(new Set(members.flatMap(m => m.dietary_preferences || [])));
    const allAllergies = Array.from(new Set(members.flatMap(m => m.allergies || [])));
    const allDislikes = Array.from(new Set(members.flatMap(m => m.dislikes || [])));

    const prompt = `You are a professional nutritionist and meal planning assistant. Generate a structured JSON meal plan for a family.

Family Profile:
- Total Family Members: ${members.length \vert{}\vert{} 1} - Weekly Grocery Budget Target:$${family.weekly_budget \vert{}\vert{} 150} - Required Diets:${allDiets.length ? allDiets.join(', ') : 'None'}
- CRITICAL ALLERGIES TO STRICTLY AVOID: ${allAllergies.length ? allAllergies.join(', ') : 'None'}
- Disliked Foods to Exclude: ${allDislikes.length ? allDislikes.join(', ') : 'None'}

Meal Schedule Request:
- Number of Days: ${days}
- Meals per day: ${mealsPerDay}

Instructions:
Respond ONLY with a valid JSON array of meal objects. Do not include markdown code block backticks (e.g. no \`\`\`json).
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
      // Clean potential backticks from markdown responses
      content = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

      const parsedPlan = JSON.parse(content);
      setGeneratedMeals(parsedPlan);
    } catch (err) {
      console.error('AI Generation Error:', err);
      alert('Failed to generate AI meal plan: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateTotalCost = () => {
    return generatedMeals.reduce((acc, curr) => acc + (curr.price || 0), 0);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-20">
      {/* Top Header */}
      <header className="bg-slate-900 text-white p-4 text-center shadow-md">
        <h1 className="text-xl font-bold tracking-wide">Family Recipe & Meal Planner</h1>
        <p className="text-xs text-slate-400 mt-0.5">AI-Powered Personalized Nutrition</p>
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
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-bold text-sm text-slate-700">Weekly Schedule ({generatedMeals.length} Meals)</h3>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Total: ${calculateTotalCost().toFixed(2)}
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {generatedMeals.map((meal, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedRecipe(meal)}
                      className="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center shadow-sm cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/40 transition"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{meal.displayTitle || `${meal.day} ${meal.type}: ${meal.title}`}</p>
                        <p className="text-slate-500">Tap to view ingredients & steps 📖</p>
                      </div>
                      <span className="font-semibold text-slate-600 ml-2">${meal.price ? meal.price.toFixed(2) : '0.00'}</span>
                    </div>
                  ))}
                </div>

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
                  <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    🍽️ {selectedRecipe.servings || '2-4 servings'}
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
