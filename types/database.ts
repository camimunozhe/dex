export type VerificationLevel = 'none' | 'basic' | 'intermediate' | 'advanced';
export type MeetupType = 'trade' | 'purchase' | 'casual';
export type MeetupStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type CardCondition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played' | 'poor';
export type CardLanguage = 'en' | 'es' | 'jp' | 'pt' | 'fr' | 'de' | 'it' | 'ko' | 'other';
export type TCGGame = 'pokemon' | 'magic' | 'yugioh' | 'onepiece' | 'digimon' | 'lorcana' | 'other';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      cards_collection: {
        Row: CardCollection;
        Insert: Omit<CardCollection, 'id' | 'created_at'>;
        Update: Partial<Omit<CardCollection, 'id' | 'user_id' | 'created_at'>>;
      };
      collection_folders: {
        Row: CollectionFolder;
        Insert: Omit<CollectionFolder, 'id' | 'created_at'>;
        Update: Partial<Omit<CollectionFolder, 'id' | 'user_id' | 'created_at'>>;
      };
      meetups: {
        Row: Meetup;
        Insert: Omit<Meetup, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Meetup, 'id' | 'created_at'>>;
      };
      safe_zones: {
        Row: SafeZone;
        Insert: Omit<SafeZone, 'id' | 'created_at'>;
        Update: Partial<Omit<SafeZone, 'id' | 'created_at'>>;
      };
      meetup_ratings: {
        Row: MeetupRating;
        Insert: Omit<MeetupRating, 'id' | 'created_at'>;
        Update: Partial<Omit<MeetupRating, 'id' | 'created_at'>>;
      };
    };
  };
}

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verification_level: VerificationLevel;
  verification_status: 'pending' | 'approved' | 'rejected' | null;
  collection_public: boolean;
  emergency_contacts: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CardCollection {
  id: string;
  user_id: string;
  game: TCGGame;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  quantity: number;
  condition: CardCondition;
  is_foil: boolean;
  is_for_trade: boolean;
  is_for_sale: boolean;
  price_reference: number | null;
  notes: string | null;
  image_url: string | null;
  language: CardLanguage | null;
  folder_id: string | null;
  pokemon_card_id: string | null;
  created_at: string;
}

export interface CollectionFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Meetup {
  id: string;
  proposer_id: string;
  receiver_id: string;
  type: MeetupType;
  status: MeetupStatus;
  safe_zone_id: string | null;
  custom_location: string | null;
  scheduled_at: string;
  notes: string | null;
  proposer_checked_in: boolean;
  receiver_checked_in: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeZone {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'tcg_store' | 'mall' | 'police_station' | 'public_space';
  country: string;
  city: string;
  verified: boolean;
  created_at: string;
}

export interface MeetupRating {
  id: string;
  meetup_id: string;
  rater_id: string;
  rated_id: string;
  rating: 'positive' | 'negative';
  comment: string | null;
  created_at: string;
}
