const BASE = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  // Dashboard
  getDashboard: (from, to) => request('GET', `/dashboard?from=${from}&to=${to}`),

  // Campaigns
  getCampaigns: () => request('GET', '/campaigns'),
  getCampaign: (id) => request('GET', `/campaigns/${id}`),
  updateCampaign: (id, data) => request('PATCH', `/campaigns/${id}`, data),

  // Ad Sets
  getAdsets: (campaignId) => request('GET', `/adsets${campaignId ? `?campaign_id=${campaignId}` : ''}`),
  updateAdset: (id, data) => request('PATCH', `/adsets/${id}`, data),

  // Ads
  getAds: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request('GET', `/ads${q ? `?${q}` : ''}`);
  },
  updateAd: (id, data) => request('PATCH', `/ads/${id}`, data),

  // Leads
  getLeads: () => request('GET', '/leads'),
  createLead: (data) => request('POST', '/leads', data),
  updateLead: (id, data) => request('PATCH', `/leads/${id}`, data),

  // Sales
  getSales: () => request('GET', '/sales'),
  createSale: (data) => request('POST', '/sales', data),

  // Agents
  getAgents: () => request('GET', '/agents'),
  createAgent: (data) => request('POST', '/agents', data),

  // Alerts
  getAlerts: () => request('GET', '/alerts'),
  resolveAlert: (id) => request('PATCH', `/alerts/${id}/resolve`),

  // Sync
  sync: () => request('POST', '/sync'),

  // Settings
  getSettings: () => request('GET', '/settings'),
  saveSettings: (data) => request('POST', '/settings', data),

  // Media Library
  getMedia: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request('GET', `/media${q ? `?${q}` : ''}`);
  },
  getMediaGroups: () => request('GET', '/media/groups'),
  getMediaProducts: () => request('GET', '/media/products'),
  addMedia: (data) => request('POST', '/media', data),
  updateMedia: (id, data) => request('PATCH', `/media/${id}`, data),
  bulkUpdateMedia: (data) => request('POST', '/media/bulk-update', data),
  deleteMedia: (id) => request('DELETE', `/media/${id}`),

  // Google Drive
  getGdriveFolders: () => request('GET', '/gdrive/folders'),
  addGdriveFolder: (data) => request('POST', '/gdrive/folders', data),
  importGdrive: (data) => request('POST', '/gdrive/import', data),

  // AI Campaign Creation
  aiGenerate: (data) => request('POST', '/ai-generate', data),
  bulkGenerate: (data) => request('POST', '/bulk-generate', data),
  bulkPublish: (data) => request('POST', '/bulk-publish', data),
  generateCopy: (data) => request('POST', '/generate-copy', data),
  getBudgetAllocation: () => request('GET', '/budget-allocation'),

  // AI Report
  getDailyReport: () => request('GET', '/daily-report'),
  recalculateLabels: () => request('POST', '/recalculate-labels')
};
