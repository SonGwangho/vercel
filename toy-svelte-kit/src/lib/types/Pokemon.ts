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

export type PokemonDetailTreeNode = {
  dexNo: number | null;
  name: string;
  children: PokemonDetailTreeNode[];
};

export type PokemonDetailEvolutionMethod = {
  from: string;
  to: string;
  method: string;
};

export type PokemonDetailItem = {
  dexNo: number;
  name: string;
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
  description: string;
  imageUrl: string | null;
  evolutionTree: PokemonDetailTreeNode;
  evolutionMethods: PokemonDetailEvolutionMethod[];
  abilities: string[];
};

export type PokemonDetailPayload = {
  generatedAt: string;
  count: number;
  items: PokemonDetailItem[];
};
