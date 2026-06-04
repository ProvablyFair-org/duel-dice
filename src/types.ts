/**
 * Duel.com Dice — type definitions.
 */

export interface BetRequest {
  amount:   string;
  target:   number;
  bet_type: string;
}

export interface BetResponse {
  id:               number;
  result:           number;
  is_win:           boolean;
  amount_currency:  string;
  amount_won:       string;
  bet_type:         string;
  target:           number;
  win_chance:       string;
  multiplier:       string;
  nonce:            number;
  drand_round:      null;
  drand_randomness: null;
  server_seed_hashed: string;
  client_seed:      string;
  effective_edge:   number;
  transaction_id:   number;
}

export interface DiceBet {
  at:       string;
  phase:    string;
  request:  BetRequest;
  response: BetResponse;
}

export interface NextSeedPromotion {
  previousNextHash: string;
  newActiveHash:    string;
  newNextHash:      string;
  match:            boolean;
}

export interface SeedEntry {
  at:      string;
  context: string;
  phase:   string;
  seed: {
    clientSeed:         string;
    serverSeedHashed:   string;
    nextServerSeedHash: string;
    serverSeed:         string | null;
  };
  nonce: number;
  nextSeedPromotion?: NextSeedPromotion;
  revealedFrom?: { transactionId: number };
}

export interface DiceDataset {
  meta:  Record<string, unknown>;
  seeds: SeedEntry[];
  bets:  DiceBet[];
}
