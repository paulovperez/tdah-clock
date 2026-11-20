import type { StoreKind } from '../store/types'
import { rx } from './rx'

export const STORES: { id: StoreKind; label: string; emoji: string }[] = [
  { id: 'mercado', label: 'Mercado', emoji: '🛒' },
  { id: 'farmacia', label: 'Farmácia', emoji: '💊' },
  { id: 'petshop', label: 'Pet shop', emoji: '🐾' },
  { id: 'construcao', label: 'Construção', emoji: '🔧' },
  { id: 'outros', label: 'Outros', emoji: '🛍️' },
]

/** Place words → store. Used by the parser for "when I go to the X". */
export const PLACE_WORDS: [RegExp, StoreKind, string][] = [
  [rx(String.raw`\b(super ?mercados?|mercados?|supermarkets?|grocery( store)?|groceries|atacad[ãa]o|hortifruti|feira)\b`), 'mercado', 'mercado'],
  [rx(String.raw`\b(farm[áa]cias?|drogarias?|pharmacy|pharmacies|drug ?store|chemist)\b`), 'farmacia', 'farmácia'],
  [rx(String.raw`\b(pet ?shops?|pet ?stores?|veterin[áa]ri[oa])\b`), 'petshop', 'pet shop'],
  [rx(String.raw`\b(loja de constru[çc][ãa]o|constru[çc][ãa]o|hardware( store)?|home ?center|leroy|ferragens?)\b`), 'construcao', 'loja de construção'],
  [rx(String.raw`\b(padaria|bakery)\b`), 'mercado', 'padaria'],
  [rx(String.raw`\b(shopping|mall)\b`), 'outros', 'shopping'],
]

type Entry = [RegExp, string, StoreKind]

/** item keywords → aisle + default store */
const ITEMS: Entry[] = [
  [rx(String.raw`\b(ra[çc][ãa]o|dog food|cat food|petisco|areia (de|do) gato|cat litter|coleira)\b`), 'Pet', 'petshop'],
  [rx(String.raw`\b(rem[ée]dio|medicamento|medicine|medication|pills?|vitamina|vitamin|dipirona|paracetamol|ibuprofeno|ibuprofen|band-?aid|curativo|term[ôo]metro|protetor solar|sunscreen|receita)\b`), 'Farmácia', 'farmacia'],
  [rx(String.raw`\b(parafusos?|screws?|pregos?|nails|l[âa]mpadas?|light ?bulbs?|fita (isolante|silver)|tape|tinta|paint|furadeira|drill|cola|glue|pilhas?|batter(y|ies)|tomada|extens[ãa]o)\b`), 'Ferramentas', 'construcao'],
  [rx(String.raw`\b(shampoo|xampu|condicionador|conditioner|pasta de dente|creme dental|toothpaste|escova de dente|toothbrush|sabonete|soap|desodorante|deodorant|fio dental|floss|papel higi[êe]nico|toilet paper|absorvente|barbeador|razor|cotonete)\b`), 'Higiene', 'mercado'],
  [rx(String.raw`\b(detergente|detergent|sab[ãa]o( em p[óo])?|amaciante|softener|desinfetante|disinfectant|[áa]gua sanit[áa]ria|bleach|esponja|sponge|saco de lixo|trash bags?|multiuso|limpador|vassoura)\b`), 'Limpeza', 'mercado'],
  [rx(String.raw`\b(leite|milk|queijo|cheese|iogurte|yogurt|manteiga|butter|requeij[ãa]o|creme de leite|cream|ovos?|eggs?)\b`), 'Frios e laticínios', 'mercado'],
  [rx(String.raw`\b(p[ãa]o|bread|bolo|cake|biscoitos?|cookies?|torradas?)\b`), 'Padaria', 'mercado'],
  [rx(String.raw`\b(carne|meat|frango|chicken|peixe|fish|bacon|lingui[çc]a|sausage|presunto|ham|carne mo[íi]da)\b`), 'Carnes', 'mercado'],
  [rx(String.raw`\b(banana|ma[çc][ãa]|apple|laranja|orange|tomate|tomato|alface|lettuce|cebola|onion|alho|garlic|batata|potato|cenoura|carrot|lim[ãa]o|lemon|frutas?|fruit|verduras?|legumes?|vegetables?)\b`), 'Hortifruti', 'mercado'],
  [rx(String.raw`\b([áa]gua|water|suco|juice|refrigerante|soda|cerveja|beer|vinho|wine|caf[ée]|coffee|ch[áa]|tea)\b`), 'Bebidas e café', 'mercado'],
  [rx(String.raw`\b(arroz|rice|feij[ãa]o|beans|macarr[ãa]o|pasta|a[çc][úu]car|sugar|sal|salt|[óo]leo|oil|azeite|farinha|flour|molho|sauce|cereal|aveia|oats|enlatados?|atum|tuna|milho)\b`), 'Mercearia', 'mercado'],
]

export function classifyItem(name: string): { aisle: string; store: StoreKind } {
  for (const [re, aisle, store] of ITEMS) if (re.test(name)) return { aisle, store }
  return { aisle: 'Outros', store: 'mercado' }
}

export function placeToStore(place: string): StoreKind | null {
  for (const [re, store] of PLACE_WORDS) if (re.test(place)) return store
  return null
}

export function storeLabel(s: StoreKind) {
  return STORES.find((x) => x.id === s)?.label ?? s
}
