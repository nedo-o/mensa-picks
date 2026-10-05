// Shared between server (image search terms) and browser (taste model).
// Each tag: [id, label, group, pattern, englishImageTerm]. Patterns run on the
// lowercased "name | description | line" text of a dish.

const T = [
  // --- Protein ---
  ['poulet', 'Poulet', 'protein', /poulet|chicken|huhn|hähnchen|hühn|güggeli|pollo|truthahn|trute|turkey|poularde/, 'chicken'],
  ['rind', 'Rind', 'protein', /rind(?!en?\b)|beef|entrec[oô]te|siedfleisch|manzo|ochsen|pastrami|hackfleisch|hacktätschli|hackbraten|bolognese|ghackets|cevapcici/, 'beef'],
  ['kalb', 'Kalb', 'protein', /kalb|veal|vitello/, 'veal'],
  ['schwein', 'Schwein', 'protein', /schwein|pork|speck|schinken|bacon|\bwurst|würst|bratwurst|cervelat|salami|chorizo|prosciutto|pancetta|carbonara|fleischkäse|schnipo|cordon bleu|spare ?ribs|kotelett|wienerli|salsiccia|guanciale|rippli|aargauerbraten/, 'pork'],
  ['lamm', 'Lamm', 'protein', /lamm|lamb|agnello/, 'lamb'],
  ['wild', 'Wild', 'protein', /hirsch|\breh|\bwild\b(?![- ]?reis)|wildschwein|wildpfeffer|wildragout|wildgeschnetzeltes|wildbratwurst/, 'venison'],
  ['ente', 'Ente', 'protein', /\benten?(brust|keule|schenkel|fleisch|leber)?\b|duck/, 'duck'],
  ['fisch', 'Fisch', 'protein', /fisch|lachs|salmon|\btuna|\bthon\b|dorsch|kabeljau|pangasius|forelle|zander|\begli|felchen|sardelle|sardine|anchov|hering|makrele|wolfsbarsch|dorade|\bfish|saibling|scholle|seehecht|rotbarsch|tilapia|seeteufel|heilbutt|sushi|sashimi|kaviar/, 'fish fillet'],
  ['meeresfruechte', 'Meeresfrüchte', 'protein', /crevette|shrimp|garnele|gamba|scampi|calamar|tintenfisch|pulpo|muschel|meeresfr|seafood|prawn|surimi/, 'shrimp'],
  ['tofu', 'Tofu & Tempeh', 'protein', /tofu|tempeh/, 'tofu'],
  ['ersatz', 'Fleischersatz', 'protein', /planted|seitan|quorn|beyond|soja(geschn|schnetzel|hack|streifen)|vegan(e|er|es)? (schnitzel|burger|nuggets|hack|wurst|chicken)|vegi[- ]?(schnitzel|burger|nuggets|hack|wurst)|minced/, 'vegan meat'],
  ['ei', 'Ei', 'protein', /\bei\b|\beier|spiegelei|rührei|omelett|frittata|shakshuka|\begg/, 'egg'],
  ['kaese', 'Käse', 'protein', /käse|cheese|mozzarella|parmesan|feta|ricotta|gorgonzola|raclette|gruy[eè]re|halloumi|burrata|mascarpone|cheddar|formaggi|paneer|fondue|grana|pecorino/, 'cheese'],
  ['huelsen', 'Linsen & Kichererbsen', 'protein', /linsen|kichererbsen|falafel|\bdaa?l\b|dhal|hummus|edamame|kidney|schwarze bohnen|weisse bohnen|chili sin|bohnen eintopf/, 'lentils'],

  // --- Beilage / Basis ---
  ['pasta', 'Pasta', 'beilage', /pasta|penne|spaghetti|tagliatelle|fusilli|rigatoni|ravioli|tortell|lasagne|cannelloni|makkaroni|maccheroni|hörnli|(?<!reis|glas|eier)nudeln|linguine|farfalle|orecchiette|pappardelle|casarecce|conchiglie|teigwaren|magronen|mezzelune|agnolotti|tortiglioni|trofie|paccheri|bucatini|strozzapreti|garganelli|spiralen/, 'pasta'],
  ['gnocchi', 'Gnocchi', 'beilage', /gnocchi/, 'gnocchi'],
  ['spaetzli', 'Spätzli & Knöpfli', 'beilage', /spätzli|spätzle|knöpfli|pizokel|capuns/, 'spaetzle'],
  ['asianudeln', 'Asia-Nudeln', 'beilage', /reisnudeln|ramen|udon|soba|glasnudeln|\bmie\b|bami|pad thai|chow mein|lo mein|noodle|yakisoba|\bpho\b|laksa|eiernudeln/, 'asian noodles'],
  ['reis', 'Reis', 'beilage', /reis\b|\breis(?!nudel)|\brice|pilaw|pilav|pilaf|biryani|paella|nasi|bibimbap|donburi/, 'rice'],
  ['risotto', 'Risotto', 'beilage', /risotto/, 'risotto'],
  ['pommes', 'Pommes & Co.', 'beilage', /pommes|frites|fries|wedges|country cuts|kroketten|kartoffelspalten/, 'french fries'],
  ['kartoffel', 'Kartoffeln', 'beilage', /(?<!süss)kartoffel(?!spalten)|rösti|gschwellti|potato|härdöpfel/, 'potatoes'],
  ['burger', 'Burger', 'beilage', /burger/, 'burger'],
  ['pizza', 'Pizza & Pinsa', 'beilage', /pizza|pinsa|flammkuchen|focaccia|calzone/, 'pizza'],
  ['wrap', 'Wrap, Sandwich & Kebab', 'beilage', /wrap|burrito|taco|quesadilla|sandwich|panini|kebab|döner|dürüm|pita|fajita|hot ?dog|bagel|fladenbrot/, 'wrap'],
  ['getreide', 'Couscous, Bulgur & Quinoa', 'beilage', /couscous|bulgur|quinoa|hirse|ebly|buchweizen|freekeh|tabouleh/, 'couscous'],
  ['polenta', 'Polenta', 'beilage', /polenta/, 'polenta'],
  ['dumplings', 'Knödel & Dumplings', 'beilage', /knödel|dumpling|gyoza|momo|dim sum|wan ?tan|maultaschen/, 'dumplings'],

  // --- Küche / Stil ---
  ['curry', 'Curry', 'stil', /curry/, 'curry'],
  ['indisch', 'Indisch', 'stil', /masala|korma|tikka|vindaloo|madras|\bdaa?l\b|jeera|tandoori|biryani|paneer|naan|chutney|raita|pappadum|indisch|indian/, 'indian food'],
  ['thai', 'Thai & Südostasien', 'stil', /thai|kokos|coconut|satay|zitronengras|panang|massaman|vietnam|bami|nasi|goreng|sambal|rendang|laksa|\bpho\b|indones/, 'thai food'],
  ['ostasien', 'Ostasiatisch', 'stil', /teriyaki|korean|kimchi|bulgogi|bibimbap|sushi|miso|ramen|udon|japan|katsu|gyoza|wasabi|nori|sweet ?(and|&)? ?sour|süss-?sauer|szechuan|sichuan|kung pao|chop suey|chinakohl|chinamix|hoisin|pak ?choi|\bwok|soja ?sauce|\basia|gochujang|yakitori|black pepper/, 'asian stir fry'],
  ['tomatensauce', 'Tomatensauce', 'stil', /tomatensauce|napoli|arrabbiata|pomodoro|sugo|marinara|puttanesca|bolognese|tomatenragout|tomatencauce/, 'tomato sauce'],
  ['pesto', 'Pesto', 'stil', /pesto/, 'pesto'],
  ['orient', 'Orient & Levante', 'stil', /libanes|oriental|arab|marokk|tajine|harissa|ras el hanout|tahin|hummus|falafel|shawarma|kebab|köfte|kofta|baba ?gan|zaatar|sumac|türk|persisch|shakshuka|mezze|tzatziki|griech|gyros|souvlaki|moussaka|ajvar|cevapcic/, 'middle eastern food'],
  ['mexikanisch', 'Mexikanisch', 'stil', /mexi|chili con|chili sin|burrito|taco|quesadilla|fajita|guacamole|nacho|tortilla|jalape|enchilada|tex-?mex|chipotle|mole\b/, 'mexican food'],
  ['hausmannskost', 'Schweizer Hausmannskost', 'stil', /zürcher|züri|geschnetzeltes|rösti|älpler|bratwurst|cordon bleu|schnitzel|hackbraten|braten|gulasch|stroganoff|voressen|spätzli|knöpfli|jägerart|capuns|pizokel|ghackets|hörnli|fleischkäse|kartoffelstock|rotkraut|rotkohl|sauerkraut|aargauer|berner|bündner|appenzeller|engadiner|walliser|landfrauen/, 'roast'],
  ['american', 'American & Fast Food', 'stil', /burger|hot ?dog|bbq|barbecue|pulled|nuggets|mac ?(and|&|n) ?cheese|wings|coleslaw|cajun|\bribs|fried chicken|onion rings/, 'american food'],

  // --- Zubereitung ---
  ['knusprig', 'Knusprig & frittiert', 'art', /frittiert|paniert|crispy|knusprig|schnitzel|nuggets|tempura|katsu|backteig|fried(?! rice)|cordon bleu|panko|kroketten|onion rings|frühlingsrolle|falafel/, 'fried'],
  ['gegrillt', 'Gegrillt', 'art', /grill|bbq|barbecue|spiess|steak|vom rost|plancha/, 'grilled'],
  ['geschmort', 'Geschmort & saucig', 'art', /ragout|gulasch|geschmort|braten\b|stroganoff|voressen|eintopf|stew|geschnetzeltes|pulled|haxe|schmor/, 'stew'],
  ['rahm', 'Rahmsauce & cremig', 'art', /rahm|cream|carbonara|alfredo|cremig|b[eé]chamel|käsesauce|mascarpone|panna|stroganoff/, 'creamy sauce'],
  ['ueberbacken', 'Überbacken', 'art', /gratin|überbacken|al forno|auflauf|lasagne|cannelloni|moussaka/, 'casserole'],
  ['scharf', 'Scharf', 'art', /scharf|spicy|chil+i|jalape|sambal|harissa|arrabbiata|diavol|sriracha|wasabi|kimchi|vindaloo|piri|szechuan|gochujang/, 'spicy'],
  ['bowl', 'Bowl', 'art', /bowl|\bpoke/, 'bowl'],
  ['suppe', 'Suppe & Eintopf', 'art', /suppe|soup|eintopf|minestrone|ramen|\bpho\b/, 'soup'],
  ['suess', 'Süsses Hauptgericht', 'art', /kaiserschmarrn|pfannkuchen|pancake|crêpe|milchreis|griessbrei|vanillesauce|dampfnudel|germknödel|waffel|fotzelschnitte|wähe/, 'sweet pancakes'],

  // --- Gemüse & Zutaten ---
  ['pilze', 'Pilze', 'zutat', /pilz|champignon|eierschwämm|pfifferling|shiitake|funghi|morchel|mushroom|kräuterseitling|portobello/, 'mushrooms'],
  ['aubergine', 'Aubergine', 'zutat', /aubergine|melanzane|eggplant|baba ?gan|badingal|moussaka|caponata/, 'eggplant'],
  ['zucchetti', 'Zucchetti', 'zutat', /zucchetti|zucchini/, 'zucchini'],
  ['spinat', 'Spinat', 'zutat', /spinat|spinach/, 'spinach'],
  ['kuerbis', 'Kürbis', 'zutat', /kürbis(?!kern)|pumpkin|butternut|zucca/, 'pumpkin'],
  ['rosenkohl', 'Rosenkohl', 'zutat', /rosenkohl/, 'brussels sprouts'],
  ['kohl', 'Kohl & Kabis', 'zutat', /kabis|(?<!rosen|blumen|china)kohl(?!rabi|rabe|enhydrat)|kraut|wirz|wirsing|coleslaw|\bkale\b/, 'cabbage'],
  ['broccoli', 'Broccoli', 'zutat', /brokkoli|broccoli|romanesco/, 'broccoli'],
  ['blumenkohl', 'Blumenkohl', 'zutat', /blumenkohl|cauliflower|cavolfiore/, 'cauliflower'],
  ['peperoni', 'Peperoni', 'zutat', /peperoni|paprika|peperonata|bell pepper/, 'bell pepper'],
  ['tomaten', 'Tomaten', 'zutat', /tomate|pomodor/, 'tomato'],
  ['oliven', 'Oliven', 'zutat', /olive(?!nöl)/, 'olives'],
  ['kapern', 'Kapern', 'zutat', /kapern/, 'capers'],
  ['randen', 'Randen', 'zutat', /randen|rote be+te|beetroot/, 'beetroot'],
  ['fenchel', 'Fenchel', 'zutat', /fenchel/, 'fennel'],
  ['lauch', 'Lauch', 'zutat', /lauch|porree/, 'leek'],
  ['karotten', 'Karotten', 'zutat', /karotte|rüebli|möhre|carrot/, 'carrots'],
  ['erbsen', 'Erbsen & Kefen', 'zutat', /(?<!kicher)erbsen|kefen/, 'peas'],
  ['bohnen', 'Grüne Bohnen', 'zutat', /grüne bohnen|kräuterbohnen|\bbohnen\b(?! eintopf)/, 'green beans'],
  ['mais', 'Mais', 'zutat', /\bmais(?!poularde)|sweetcorn|zuckermais/, 'corn'],
  ['avocado', 'Avocado', 'zutat', /avocado|guacamole/, 'avocado'],
  ['suesskartoffel', 'Süsskartoffel', 'zutat', /süsskartoffel|sweet potato/, 'sweet potato'],
  ['zwiebeln', 'Zwiebeln', 'zutat', /zwiebel|onion/, 'onion'],
  ['knoblauch', 'Knoblauch', 'zutat', /knoblauch|garlic|aglio|aioli/, 'garlic'],
  ['koriander', 'Koriander', 'zutat', /koriander|cilantro/, 'cilantro'],
  ['spargel', 'Spargel', 'zutat', /spargel|asparag/, 'asparagus'],
  ['wurzel', 'Wurzelgemüse', 'zutat', /wurzelgemüse|pastinake|topinambur|schwarzwurzel|sellerie|kohlrabi|kohlrabe/, 'root vegetables'],
  ['nuesse', 'Nüsse', 'zutat', /nuss|nüsse|cashew|mandel|peanut|pistazie|pinienkern|satay/, 'nuts'],
  ['fruchtig', 'Frucht im Essen', 'zutat', /ananas|mango|preiselbeer|granatapfel|dörrpflaume|rosine|sultanin|datteln|feige|cranberr|aprikose|zwetschge/, 'fruit'],
  ['joghurt', 'Joghurt & Sauerrahm', 'zutat', /jogh?urt|quark|tzatziki|raita|sour cream|sauerrahm|crème fra[iî]che/, 'yogurt sauce'],
];

export const TAGS = T.map(([id, label, group, re, img]) => ({ id, label, group, re, img }));
export const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

export const DIETS = {
  vegan: 'Vegan',
  vegi: 'Vegetarisch',
  fleisch: 'Fleisch',
  fisch: 'Fisch',
};

export const ALLERGENS = {
  gluten: 'Gluten',
  milch: 'Milch / Laktose',
  eier: 'Eier',
  nuesse: 'Schalenfrüchte (Nüsse)',
  erdnuesse: 'Erdnüsse',
  soja: 'Soja',
  sesam: 'Sesam',
  sellerie: 'Sellerie',
  senf: 'Senf',
  fisch: 'Fisch',
  krebstiere: 'Krebstiere',
  weichtiere: 'Weichtiere',
  sulfite: 'Sulfite',
  lupinen: 'Lupinen',
};

// Everything the mensa says about a dish: title, components, menu line and the
// declared meat/fish origin.
export function dishText(dish) {
  return `${dish.name} | ${dish.description || ''} | ${dish.line || ''} | ${dish.origin || ''}`.toLowerCase();
}

// --- Strict meat / fish detection (for "kein Fleisch" / "kein Fisch") ---

// Where meat and fish are looked for: title, components and declared origin.
// The menu line is left out on purpose – a line called "Meatworks" also serves fish.
export function evidenceText(dish) {
  return `${dish.name} | ${dish.description || ''} | ${dish.origin || ''}`.toLowerCase();
}

export const MEAT_TAGS = ['poulet', 'rind', 'kalb', 'schwein', 'lamm', 'wild', 'ente'];
export const FISH_TAGS = ['fisch', 'meeresfruechte'];

const sources = (ids) => ids.map((id) => TAG_BY_ID[id].re.source).join('|');
// Meat words that name no animal. Kept to unambiguous ones: "Schnitzel", "Steak"
// or "Gulasch" also exist as vegetable dishes.
const MEAT_GENERIC = /(?<!frucht|kokos|kürbis)fleisch(?!tomate|ersatz|los|frei)|\bmeat(?!less|[- ]free)|gehacktes|g[`'’´]hackt|gyros|kebab|kebap|döner|shawarma|souvlaki|meatball|\bribs\b|haxe|saltimbocca|ossobuco|brasato|bulgogi|yakitori|karaage|tonkatsu|bresaola|mortadella|lyoner|landjäger|salsiz|mostbröckli|merguez|chipolata|cipollata|\badrio|\bleber|kutteln|kaninchen|pferde|\bgans\b|wachtel|(?<!sin )\bcarne\b|lardons|\bham\b/;
const FISH_GENERIC = /auster|oyster|hummer|lobster|krebs|krabbe|octopus|moules|vongole|frutti di mare|bottarga/;
const MEAT_RE = new RegExp(`${sources(MEAT_TAGS)}|${MEAT_GENERIC.source}`);
const FISH_RE = new RegExp(`${sources(FISH_TAGS)}|${FISH_GENERIC.source}`);
// Signs that a meat word names a plant-based substitute ("Planted Chicken", "Vegi-Wurst").
const SUBSTITUTE_RE = /vegan|vegi|veggie|vegetar|planted|plant[- ]based|pf?lanz|linsen[- ]?bolognese|lenticchie|soja|soya|tofu|seitan|quorn|tempeh|beyond|jackfruit|erbsenprotein|fleischlos|fleischersatz|minced|no[- ]?(chicken|meat|beef)|sin carne|\bvish|\bvuna/;

// The meat / fish word found in the text, or null.
export const findMeat = (text) => MEAT_RE.exec(text)?.[0] ?? null;
export const findFish = (text) => FISH_RE.exec(text)?.[0] ?? null;
export const hasSubstitute = (text) => SUBSTITUTE_RE.test(text);
export const FISH_ALLERGENS = ['fisch', 'krebstiere', 'weichtiere'];

export function extractTags(dish) {
  const text = dishText(dish);
  return TAGS.filter((t) => t.re.test(text)).map((t) => t.id);
}

// Feature ids used by the taste model: ingredient/style tags plus the diet class.
export function featuresOf(dish) {
  const f = extractTags(dish);
  if (dish.diet) f.push(`d:${dish.diet}`);
  return f;
}

export function featureLabel(f) {
  if (f.startsWith('d:')) return DIETS[f.slice(2)] ?? f;
  return TAG_BY_ID[f]?.label ?? f;
}

export const normName = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
