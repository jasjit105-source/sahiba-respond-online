// ═══ MASTER CITY DATABASE ═══
// Only cities from this list are used. No guessing.

export const CITY_TIERS = {
  URBAN_T1: {
    label: 'Urban Tier 1',
    desc: 'Top metro markets',
    default: true,
    cities: [
      { name: 'CDMX', radius: 20 },
      { name: 'Guadalajara', radius: 15 },
      { name: 'Monterrey', radius: 15 },
    ]
  },
  URBAN_T2: {
    label: 'Urban Tier 2',
    desc: 'Strong wholesale cities',
    default: true,
    cities: [
      { name: 'Puebla', radius: 20 },
      { name: 'León', radius: 20 },
      { name: 'Querétaro', radius: 20 },
      { name: 'Toluca', radius: 20 },
      { name: 'Veracruz', radius: 15 },
      { name: 'Oaxaca City', radius: 20 },
      { name: 'Mérida', radius: 15 },
      { name: 'San Luis Potosí', radius: 20 },
    ]
  },
  URBAN_T3: {
    label: 'Urban Tier 3 (Testing)',
    desc: 'Expansion markets',
    default: false,
    cities: [
      { name: 'Aguascalientes', radius: 20 },
      { name: 'Tuxtla Gutiérrez', radius: 15 },
      { name: 'Villahermosa', radius: 20 },
      { name: 'Culiacán', radius: 20 },
      { name: 'Hermosillo', radius: 20 },
      { name: 'Chihuahua', radius: 20 },
      { name: 'Saltillo', radius: 20 },
      { name: 'Morelia', radius: 20 },
    ]
  },
  BEACH_T1: {
    label: 'Beach Tier 1',
    desc: 'Top tourist destinations',
    default: true,
    cities: [
      { name: 'Cancún', radius: 15 },
      { name: 'Playa del Carmen', radius: 10 },
      { name: 'Tulum', radius: 10 },
    ]
  },
  BEACH_T2: {
    label: 'Beach Tier 2',
    desc: 'Major beach markets',
    default: true,
    cities: [
      { name: 'Puerto Vallarta', radius: 15 },
      { name: 'Los Cabos', radius: 15 },
      { name: 'Mazatlán', radius: 15 },
      { name: 'Acapulco', radius: 15 },
    ]
  },
  BEACH_T3: {
    label: 'Beach Tier 3 (Testing)',
    desc: 'Secondary beach markets',
    default: false,
    cities: [
      { name: 'Ixtapa-Zihuatanejo', radius: 15 },
      { name: 'Huatulco', radius: 15 },
      { name: 'Cozumel', radius: 10 },
      { name: 'Isla Mujeres', radius: 10 },
      { name: 'Bacalar', radius: 10 },
      { name: 'Progreso', radius: 15 },
    ]
  }
};

// Tier groupings for campaign type mapping
export const TIER_TO_TYPE = {
  URBAN_T1: 'WHOLESALE',
  URBAN_T2: 'WHOLESALE',
  URBAN_T3: 'TESTING',
  BEACH_T1: 'BEACHFRONT',
  BEACH_T2: 'BEACHFRONT',
  BEACH_T3: 'TESTING',
};

// Legacy exports for backward compat
export const BEACHFRONT_CITIES = [
  ...CITY_TIERS.BEACH_T1.cities,
  ...CITY_TIERS.BEACH_T2.cities,
  ...CITY_TIERS.BEACH_T3.cities,
].map(c => c.name);

export const WHOLESALE_CITIES = [
  ...CITY_TIERS.URBAN_T1.cities,
  ...CITY_TIERS.URBAN_T2.cities,
].map(c => c.name);

export const TESTING_CITIES = [
  ...CITY_TIERS.URBAN_T3.cities,
].map(c => c.name);

export const CAMPAIGN_CATEGORIES = {
  BEACHFRONT: { label: 'Beachfront / Tourist', color: 'bg-cyan-100 text-cyan-800' },
  WHOLESALE: { label: 'Wholesale City', color: 'bg-purple-100 text-purple-800' },
  TESTING: { label: 'Testing', color: 'bg-amber-100 text-amber-800' },
  RETARGET: { label: 'Retargeting', color: 'bg-pink-100 text-pink-800' },
  UNCATEGORIZED: { label: 'Uncategorized', color: 'bg-gray-100 text-gray-600' }
};

export const AI_LABELS = {
  SCALE: { label: 'SCALE', color: 'bg-green-100 text-green-800 border-green-300' },
  MONITOR: { label: 'MONITOR', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  FIX: { label: 'FIX', color: 'bg-red-100 text-red-800 border-red-300' },
  PAUSE: { label: 'PAUSE', color: 'bg-gray-100 text-gray-600 border-gray-300' }
};

export const LEAD_STAGES = {
  cold: { label: 'Cold', color: 'bg-blue-100 text-blue-700' },
  warm: { label: 'Warm', color: 'bg-yellow-100 text-yellow-700' },
  hot: { label: 'Hot', color: 'bg-orange-100 text-orange-700' },
  customer: { label: 'Customer', color: 'bg-green-100 text-green-700' },
  lost: { label: 'Lost', color: 'bg-gray-100 text-gray-500' }
};
