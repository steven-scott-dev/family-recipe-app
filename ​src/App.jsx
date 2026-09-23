import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [family, setFamily] = useState({ id: null, name: 'My Family', weekly_budget: 150 });
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  
  // Setup Form State
  const [memberName, setMemberName] = useState('');
  const [isManaged, setIsManaged] = useState(true);
  const [memberEmail, setMemberEmail] = useState('');
  const [selectedDiet, setSelectedDiet] = useState([]);
  const [selectedAllergies, setSelectedAllergies] = useState([]);
  const [dislikesText, setDislikesText] = useState('');

  // Meal Planning Toggles
  const [enabledMealTypes, setEnabledMealTypes] = useState({
    breakfast: true,
    lunch: true,
    dinner: true,
    school_lunch: true,
    snack: true
  });
  const [generatedMeals, setGeneratedMeals] = useState([]);

  // Option lists
  const dietOptions = ['Keto', 'High Protein', 'Vegetarian', 'Vegan', 'Low Carb', 'Mediterranean'];
  const allergyOptions = ['Peanuts', 'Tree Nuts', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Shellfish'];

  useEffect(() => {
    fetchFamilyData();
  }, []);

  async function fetchFamilyData() {
    // Fetch default family or first record
    let { data: fams } = await supabase.from('families').select('*').limit(1);
    if (fams && fams.length > 0) {
      setFamily(fams[0]);
      fetchMembers(fams[0].id);
    }
  }

  async function fetchMembers(familyId) {
    let { data: mems } = await supabase.from('family_members').select('*').eq('family_id', familyId);
    if (mems) setMembers(mems);
  }

  // Toggle helpers for preferences/allergies
  const toggleSelection = (item, currentList, setList) => {
    if (currentList.includes(item)) {
      setList(currentList.filter(i => i !== item));
    } else {
      setList([...currentList, item]);
    }
  };

  // 1. Family Creation / Profile Save
  async function handleCreateFamily(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('families')
      .upsert({ name: family.name, weekly_budget: family.weekly_budget })
      .select()
      .single();
    if (data) {
      setFamily(data);
      alert('Family details saved successfully!');
    }
  }

  // 2. Member Setup (Add Direct or Invite)
  async function handleSaveMember(e) {
    e.preventDefault();
    if (!memberName) return alert('Please enter a name');

    const newMember = {
      family_id: family.id,
      name: memberName,
      is_managed: isManaged,
      email: isManaged ? null : memberEmail,
      dietary_preferences: selectedDiet,
      allergies: selectedAllergies,
      dislikes: dislikesText.split(',').map(s => s.trim()).filter(Boolean)
    };

    const { data, error } = await supabase.from('family_members').insert([newMember]).select();
    if (data) {
      setMembers([...members, data[0]]);
      // Reset form
      setMemberName('');
      setMemberEmail('');
      setSelectedDiet([]);
      setSelectedAllergies([]);
      setDislikesText('');
      alert('Family member added!');
    }
  }

  // 3. Weekly Recipe Generator
  const generateWeeklyRecipes = () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const activeTypes = Object.keys(enabledMealTypes).filter(type => enabledMealTypes[type]);

    const dummyRecipes = [
      { title: 'Sheet Pan Chicken & Veggies', price: 12.50, items: ['Chicken Breast', 'Broccoli', 'Olive Oil'] },
      { title: 'Keto Avocado & Egg Bowl', price: 6.00, items: ['Eggs', 'Avocado', 'Spinach'] },
      { title: 'Gluten-Free Turkey Wraps', price: 8.00, items: ['Turkey Breast', 'Gluten-Free Wraps', 'Hummus'] },
      { title: 'Berry Almond Oat Smoothie', price: 4.50, items: ['Almond Milk', 'Frozen Berries', 'Oats'] }
    ];

    let plan = [];
    days.forEach(day => {
      activeTypes.forEach(type => {
        const randomRecipe = dummyRecipes[Math.floor(Math.random() * dummyRecipes.length)];
        plan.push({
          day,
          type,
          title: `${day} ${type.replace('_', ' ')}: ${randomRecipe.title}`,
          price: randomRecipe.price,
          ingredients: randomRecipe.items
        });
      });
    });

    setGeneratedMeals(plan);
  };

  const calculateTotalCost = () => generatedMeals.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans pb-16">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-wide">MealFamily Budget App</h1>
        <span className="text-xs bg-emerald-700 px-2.5 py-1 rounded-full font-medium">
          Budget: ${family.weekly_budget}/wk
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        
        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-1">Welcome back, {family.name}!</h2>
              <p className="text-sm text-slate-500">
                You have {members.length} registered family member profiles.
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-emerald-900">
              <h3 className="font-semibold mb-1">Quick Status</h3>
              <p className="text-sm">Active Meal Plan Cost: <strong>${calculateTotalCost().toFixed(2)}</strong></p>
              <p className="text-sm">
                Budget Status: {calculateTotalCost() <= family.weekly_budget ? 
                  <span className="text-emerald-600 font-bold"> Under Budget</span> : 
                  <span className="text-red-600 font-bold"> Over Budget</span>}
              </p>
            </div>

            <button 
              onClick={() => setActiveTab('meal_planning')} 
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold shadow hover:bg-emerald-700 transition"
            >
              Go to Weekly Meal Planning
            </button>
          </div>
        )}

        {/* TAB 2: SETUP (Member Preferences) */}
        {activeTab === 'setup' && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold border-b pb-2">Add / Configure Family Member</h2>
            
            <form onSubmit={handleSaveMember} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Member Name</label>
                <input 
                  type="text" 
                  value={memberName} 
                  onChange={e => setMemberName(e.target.value)}
                  placeholder="e.g., Micah" 
                  className="w-full border p-2.5 rounded-lg text-slate-800 bg-slate-50 border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                  required 
                />
              </div>

              {/* Onboarding Mode Toggle */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Member Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsManaged(true)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border ${isManaged ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Add Directly (Child/Dependent)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManaged(false)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border ${!isManaged ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Invite via Email
                  </button>
                </div>
              </div>

              {!isManaged && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={memberEmail} 
                    onChange={e => setMemberEmail(e.target.value)}
                    placeholder="relative@example.com" 
                    className="w-full border p-2 rounded-lg bg-slate-50" 
                  />
                </div>
              )}

              {/* Dietary Preferences Chips */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Dietary Preferences</label>
                <div className="flex flex-wrap gap-1.5">
                  {dietOptions.map(option => {
                    const isSelected = selectedDiet.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleSelection(option, selectedDiet, setSelectedDiet)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                          isSelected 
                            ? 'bg-emerald-600 text-white border-emerald-600' 
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {option} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Allergies Chips */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Allergies</label>
                <div className="flex flex-wrap gap-1.5">
                  {allergyOptions.map(option => {
                    const isSelected = selectedAllergies.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleSelection(option, selectedAllergies, setSelectedAllergies)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                          isSelected 
                            ? 'bg-red-600 text-white border-red-600' 
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {option} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dislikes Input */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Dislikes (Comma Separated)</label>
                <input 
                  type="text" 
                  value={dislikesText} 
                  onChange={e => setDislikesText(e.target.value)}
                  placeholder="e.g., Mushrooms, Onions, Olives" 
                  className="w-full border p-2 rounded-lg bg-slate-50 text-sm" 
                />
              </div>

              {/* High Contrast Navigation / Save Button */}
              <button 
                type="submit" 
                className="w-full bg-slate-900 text-white font-bold py-3 rounded-lg shadow hover:bg-slate-800 transition mt-4"
              >
                Save Member & Continue
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: MEAL PLANNING */}
        {activeTab === 'meal_planning' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="font-bold text-base mb-3">Include Meals for the Week:</h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.keys(enabledMealTypes).map(type => (
                  <label key={type} className="flex items-center space-x-2 bg-slate-50 p-2 rounded border cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enabledMealTypes[type]} 
                      onChange={() => setEnabledMealTypes({...enabledMealTypes, [type]: !enabledMealTypes[type]})}
                      className="accent-emerald-600"
                    />
                    <span className="capitalize font-medium text-slate-700">{type.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>

              <button 
                onClick={generateWeeklyRecipes} 
                className="w-full mt-4 bg-emerald-600 text-white font-bold py-2.5 rounded-lg shadow hover:bg-emerald-700 transition"
              >
                Generate Weekly Recipes
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

                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {generatedMeals.map((meal, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-bold text-slate-800">{meal.title}</p>
                        <p className="text-slate-500">Ingredients: {meal.ingredients.join(', ')}</p>
                      </div>
                      <span className="font-semibold text-slate-600">${meal.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Grocery Integration Buttons */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 pt-3">
                  <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Export to Grocery Cart</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => alert('Sending ingredients to Walmart OPD Cart...')}
                      className="bg-blue-600 text-white py-2 rounded font-semibold text-xs hover:bg-blue-700"
                    >
                      Order via Walmart
                    </button>
                    <button 
                      onClick={() => alert('Redirecting to Instacart Developer Cart...')}
                      className="bg-orange-600 text-white py-2 rounded font-semibold text-xs hover:bg-orange-700"
                    >
                      Order via Instacart
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FAMILY MANAGEMENT */}
        {activeTab === 'family' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-base mb-3">Family Profile & Budget</h2>
              <form onSubmit={handleCreateFamily} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Family Name</label>
                  <input 
                    type="text" 
                    value={family.name} 
                    onChange={e => setFamily({...family, name: e.target.value})}
                    className="w-full border p-2 rounded-lg bg-slate-50 text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Weekly Grocery Budget ($)</label>
                  <input 
                    type="number" 
                    value={family.weekly_budget} 
                    onChange={e => setFamily({...family, weekly_budget: Number(e.target.value)})}
                    className="w-full border p-2 rounded-lg bg-slate-50 text-sm" 
                  />
                </div>
                {/* High Contrast Visible Button */}
                <button 
                  type="submit" 
                  className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-lg shadow hover:bg-emerald-700 transition"
                >
                  Save Family Settings
                </button>
              </form>
            </div>

            {/* List of Registered Members */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-sm mb-2 text-slate-700">Family Profiles ({members.length})</h3>
              {members.length === 0 ? (
                <p className="text-xs text-slate-400">No members added yet. Go to Setup tab to add.</p>
              ) : (
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-800">{m.name} {m.is_managed ? '(Child/Managed)' : '(User)'}</p>
                        <p className="text-slate-500">
                          Diets: {m.dietary_preferences?.join(', ') || 'None'} | Allergies: {m.allergies?.join(', ') || 'None'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-2 shadow-lg max-w-md mx-auto">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'home' ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}
        >
          <span>🏠</span> Home
        </button>
        <button 
          onClick={() => setActiveTab('setup')}
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'setup' ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}
        >
          <span>⚙️</span> Setup
        </button>
        <button 
          onClick={() => setActiveTab('meal_planning')}
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'meal_planning' ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}
        >
          <span>🥗</span> Meals
        </button>
        <button 
          onClick={() => setActiveTab('family')}
          className={`flex flex-col items-center text-xs font-medium ${activeTab === 'family' ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}
        >
          <span>👨‍👩‍👧‍👦</span> Family
        </button>
      </nav>
    </div>
  );
}
