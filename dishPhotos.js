// Bundled dish-photo library for meal cards.
// A family's own snapped photo (meal_photos in Supabase) always wins; this
// library is the fallback so a planned dish still shows food, not just text.
// Images live in /public/dish and ship with the app build — adding a dish
// means adding a file there plus one line below.
//
// Matching: titles are normalized to a sorted token key (stopwords dropped,
// veggie -> vegetable, crude plurals folded), so an AI plan title like
// "One-Pot Chicken & Veggie Stew" finds the library's "Chicken Vegetable Stew".

const STOPWORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'style', 'easy', 'homemade',
  'classic', 'best', 'my', 'in', 'on', 'for', 'one', 'pot',
]);

const SYNONYMS = { veggie: 'vegetable', veggies: 'vegetable', veg: 'vegetable' };

function foldPlural(token) {
  if (token.endsWith('oes')) return token.slice(0, -2); // potatoes -> potato
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
  return token;
}

export function dishMatchKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => SYNONYMS[t] || foldPlural(t))
    .sort()
    .join('-');
}

// Canonical dish title -> file in /public/dish
const LIBRARY = [
  ['Chicken Vegetable Stew', 'chicken-veggie-stew.jpg'],
  ['Turkey Black Bean Chili', 'turkey-black-bean-chili.jpg'],
  ['Lentil Vegetable Curry', 'lentil-veggie-curry.jpg'],
  ['Chicken Tacos', 'chicken-tacos.jpg'],
  ['Spaghetti with Meat Sauce', 'spaghetti-meat-sauce.jpg'],
  ['Beef Vegetable Stir Fry', 'beef-veggie-stir-fry.jpg'],
  ['Sheet Pan Sausage Potatoes and Peppers', 'sheet-pan-sausage-potatoes.jpg'],
  ['Chicken Noodle Soup', 'chicken-noodle-soup.jpg'],
  ['Baked Chicken Thighs with Rice', 'chicken-thighs-rice.jpg'],
  ['Cheese Quesadillas', 'cheese-quesadillas.jpg'],
  ['Tuna Pasta Bake', 'tuna-pasta-bake.jpg'],
  ['Egg Fried Rice with Vegetables', 'egg-fried-rice.jpg'],
  ['Egg Fried Rice', 'egg-fried-rice.jpg'],
];

const BY_KEY = {};
LIBRARY.forEach(([title, file]) => { BY_KEY[dishMatchKey(title)] = '/dish/' + file; });

export function libraryPhotoFor(title) {
  return BY_KEY[dishMatchKey(title)] || null;
}
