// ═══ MASTER CITY DATABASE (source of truth) ═══

export const CITY_TIERS = {
  METRO_T1: {
    label: 'Metropolitan Tier 1',
    segment: 'metropolitan',
    tier: 1,
    default: true,
    budget_usd: 35,
    cities: [
      { name: 'CDMX', key: '2673660', radius: 20, state: 'Ciudad de Mexico' },
      { name: 'Guadalajara', key: '1522110', radius: 15, state: 'Jalisco' },
      { name: 'Monterrey', key: '1536363', radius: 15, state: 'Nuevo Leon' },
      { name: 'Veracruz', key: '1559085', radius: 15, state: 'Veracruz' },
      { name: 'Oaxaca City', key: '1537775', radius: 20, state: 'Oaxaca' },
    ]
  },
  METRO_T2: {
    label: 'Metropolitan Tier 2',
    segment: 'metropolitan',
    tier: 2,
    default: true,
    budget_usd: 20,
    cities: [
      { name: 'Puebla', key: '1542028', radius: 20, state: 'Puebla' },
      { name: 'León', key: '1531557', radius: 20, state: 'Guanajuato' },
      { name: 'Querétaro', key: '1542608', radius: 20, state: 'Queretaro' },
      { name: 'Toluca', key: '1557546', radius: 20, state: 'Estado de Mexico' },
      { name: 'San Luis Potosí', key: '1550499', radius: 20, state: 'San Luis Potosi' },
    ]
  },
  BEACH_T1: {
    label: 'Beach Tier 1',
    segment: 'beach',
    tier: 1,
    default: true,
    budget_usd: 30,
    cities: [
      { name: 'Cancún', key: '1508006', radius: 15, state: 'Quintana Roo' },
      { name: 'Playa del Carmen', key: '1540930', radius: 10, state: 'Quintana Roo' },
      { name: 'Tulum', key: '1558246', radius: 10, state: 'Quintana Roo' },
      { name: 'Puerto Vallarta', key: '1542382', radius: 15, state: 'Jalisco' },
      { name: 'Mazatlán', key: '1535012', radius: 15, state: 'Sinaloa' },
    ]
  },
  BEACH_T2: {
    label: 'Beach Tier 2',
    segment: 'beach',
    tier: 2,
    default: true,
    budget_usd: 15,
    cities: [
      { name: 'Los Cabos', key: '688614', radius: 15, state: 'Baja California Sur' },
      { name: 'Acapulco', key: '1502429', radius: 15, state: 'Guerrero' },
      { name: 'Cozumel', key: '1550858', radius: 10, state: 'Quintana Roo' },
      { name: 'Isla Mujeres', key: '1524168', radius: 10, state: 'Quintana Roo' },
      { name: 'Huatulco', key: '1523448', radius: 15, state: 'Oaxaca' },
    ]
  }
};

// Asset types
export const ASSET_TYPES = [
  { value: 'image', label: 'Imagen', accept: '.jpg,.jpeg,.png,.webp,.gif' },
  { value: 'video', label: 'Video', accept: '.mp4,.mov,.avi,.webm' },
  { value: 'ig_post', label: 'Instagram Post', accept: '' },
];

// Structure controls
export const STRUCTURE_DEFAULTS = {
  adsets: { min: 1, max: 4, default: 4 },
  ads_per_adset: { allowed: [1, 2, 3, 5], default: 3 },
  assets_per_ad: { min: 1, max: 5, default: 1 },
  total_daily_budget_cap: 100,
};

// Campaign categories
export const CAMPAIGN_CATEGORIES = {
  BEACHFRONT: { label: 'Beach', color: 'bg-cyan-100 text-cyan-800' },
  WHOLESALE: { label: 'Metropolitan', color: 'bg-purple-100 text-purple-800' },
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
