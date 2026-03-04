export type PokemonKoItem = {
  id: number;
  name: string;
  imageUrl: string | null;
  types: string[];
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
    total: number;
  };
  evolution: {
    from: string | null;
    to: string[];
  };
  generation: string;
  abilities: string[];
};

export type PokemonKoCache = {
  fetchedAt: number;
  items: PokemonKoItem[];
};
