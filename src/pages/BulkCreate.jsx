import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { CITY_TIERS, STRUCTURE_DEFAULTS } from '../utils/constants';
import { fmtMoney } from '../utils/format';

const AD_MODES = [
  { value: 'new', label: 'Crear anuncio nuevo', desc: 'Sube imágenes/videos desde tu Media Library', icon: '\u{1F4F7}' },
  { value: 'existing_post', label: 'Usar publicación existente', desc: 'Promociona un post de Facebook o Instagram Reel', icon: '\u{1F4F1}' },
];

export default function BulkCreate() {
  const [searchParams] = useSearchParams();
  const [adMode, setAdMode] = useState('new'); // 'new' | 'existing_post'
  const [phase, setPhase] = useState('select');
  const [allAssets, setAllAssets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState({ type: '', search: '' });
  const [result, setResult] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [expandedAdset, setExpandedAdset] = useState(null);
  const [productHint, setProductHint] = useState('');

  // Existing post mode
  const [postIds, setPostIds] = useState(['']);
  const [igAccounts, setIgAccounts] = useState([]);
  const [pageId, setPageId] = useState('');

  // Structure controls
  const [adsPerAdset, setAdsPerAdset] = useState(STRUCTURE_DEFAULTS.ads_per_adset.default);
  const [assetsPerAd, setAssetsPerAd] = useState(STRUCTURE_DEFAULTS.assets_per_ad.default);
  const [totalBudget, setTotalBudget] = useState(STRUCTURE_DEFAULTS.total_daily_budget_cap);
  const defaultTiers = Object.keys(CITY_TIERS).filter(k => CITY_TIERS[k].default);
  const [selectedTiers, setSelectedTiers] = useState(defaultTiers);
  const [showOptions, setShowOptions] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [addUrlText, setAddUrlText] = useState('');

  useEffect(() => {
    api.getMedia().then(assets => {
      setAllAssets(assets);
      const pre = searchParams.get('assets');
      if (pre) setSelected(new Set(pre.split(',').map(Number).filter(Boolean)));
    });
    // Load page + IG info
    api.getSettings().then(s => { if (s.page_id) setPageId(s.page_id); });
    api.getIgPosts().then(d => { if (Array.isArray(d)) setIgAccounts(d); }).catch(() => {});
  }, []);

  const filteredAssets = allAssets.filter(a => {
    if (filter.type && a.type !== filter.type) return false;
    if (filter.search && !a.filename.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => { if (selected.size === filteredAssets.length) setSelected(new Set()); else setSelected(new Set(filteredAssets.map(a => a.id))); };
  const toggleTier = (tier) => setSelectedTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]);

  const selectedAssets = allAssets.filter(a => selected.has(a.id));
  const selImages = selectedAssets.filter(a => a.type === 'image').length;
  const selVideos = selectedAssets.filter(a => a.type === 'video').length;
  const selIgPosts = selectedAssets.filter(a => a.type === 'ig_post').length;
  const adsetCount = selectedTiers.length;
  const totalAds = adsetCount * adsPerAdset;
  const format = assetsPerAd > 1 ? 'Carousel' : 'Single';

  const handleAddUrls = async () => {
    const urls = addUrlText.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    const res = await api.addMedia(urls.map(url => ({ url, filename: url.split('/').pop() })));
    setAllAssets(await api.getMedia());
    if (res.ids) setSelected(prev => new Set([...prev, ...res.ids]));
    setShowAddUrl(false);
    setAddUrlText('');
  };

  const handleGenerate = async () => {
    if (adMode === 'existing_post') {
      // Build campaign from existing posts
      const validPosts = postIds.filter(p => p.trim());
      if (validPosts.length === 0) return alert('Ingresa al menos un Post ID');
      if (selectedTiers.length === 0) return alert('Selecciona al menos un tier');
      setPhase('generating');

      // Build campaign structure with existing posts as ads
      const activeTiers = selectedTiers;
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const productName = productHint || 'Post';

      const adsets = activeTiers.map(tierKey => {
        const tier = CITY_TIERS[tierKey];
        if (!tier) return null;
        return {
          name: `${tier.segment}_T${tier.tier}_${productName}`,
          tier: tierKey,
          tier_label: tier.label,
          segment: tier.segment,
          status: 'PAUSED',
          optimization_goal: 'CONVERSATIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget: tier.budget_usd,
          cities: tier.cities,
          cities_summary: tier.cities.map(c => c.name).join(', '),
          cities_count: tier.cities.length,
          audience: { desc: `Mujeres 25+, Español — ${tier.cities.map(c => c.name).join(', ')}` },
          ads: validPosts.map((postId, i) => {
            // Format: {page_id}_{post_id} or just post_id
            const storyId = postId.includes('_') ? postId : `${pageId}_${postId}`;
            return {
              name: `${productName}_Post${i + 1}`,
              status: 'PAUSED',
              format: 'existing_post',
              object_story_id: storyId,
              assets: [{ type: 'ig_post', filename: `Post ${postId.slice(-8)}`, url: '' }],
              creative: { message: 'Existing post' }
            };
          })
        };
      }).filter(Boolean);

      const totalDailyBudget = adsets.reduce((s, a) => s + a.daily_budget, 0);
      const totalAds = adsets.reduce((s, a) => s + a.ads.length, 0);

      setResult({
        product: productName,
        ad_format: 'existing_post',
        ads_per_adset: validPosts.length,
        assets_per_ad: 1,
        total_adsets: adsets.length,
        total_ads: totalAds,
        total_daily_budget: totalDailyBudget,
        budget_cap: totalBudget,
        media_summary: { active: validPosts.length },
        targeting: { age: '25-65', gender: 'Mujeres', language: 'Solo Español', objective: 'Engagement' },
        duplicate_warnings: [],
        campaign: {
          name: `MX_WhatsApp_${productName}_${date}`,
          product: productName,
          objective: 'OUTCOME_ENGAGEMENT',
          status: 'PAUSED',
          daily_budget: totalDailyBudget,
          special_ad_categories: [],
          adsets,
          copy: { hooks: ['Existing post'], primaryTexts: ['Existing post'], headlines: ['Existing post'], ctas: ['WHATSAPP_MESSAGE'] },
          targeting_summary: `Mujeres 25+, Español, ${adsets.length} ad sets, ${totalAds} ads`
        }
      });
      setPhase('review');
      return;
    }

    // Normal mode: create from media
    if (selected.size === 0) return alert('Selecciona al menos un asset');
    if (selectedTiers.length === 0) return alert('Selecciona al menos un tier');
    setPhase('generating');
    try {
      const data = await api.aiGenerate({
        asset_ids: [...selected],
        product_hint: productHint || undefined,
        tiers: selectedTiers,
        ads_per_adset: adsPerAdset,
        assets_per_ad: assetsPerAd,
        total_budget: totalBudget
      });
      setResult(data);
      setPhase('review');
    } catch (e) { alert('Error: ' + e.message); setPhase('select'); }
  };

  const handlePublish = async () => {
    if (!confirm(`Publicar 1 campaña con ${result.total_adsets} ad sets y ${result.total_ads} ads como BORRADOR?\n\nFormato: ${result.ad_format}\nPresupuesto: $${result.total_daily_budget}/día\n\nNada se activa hasta que lo hagas manualmente.`)) return;
    setPublishing(true); setPhase('publishing');
    try {
      const res = await api.bulkPublish({ campaign: result.campaign });
      setPublishResult(res); setPhase('done');
    } catch (e) { alert('Error: ' + e.message); setPhase('review'); }
    setPublishing(false);
  };

  const reset = () => { setPhase('select'); setResult(null); setPublishResult(null); setExpandedAdset(null); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Crear Campañas</h2>
          <p className="text-sm text-gray-500">{phase === 'select' ? 'Selecciona media, configura, AI construye' : phase === 'review' ? 'Revisa y aprueba' : ''}</p>
        </div>
        {phase !== 'select' && phase !== 'generating' && (
          <button onClick={reset} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">Volver</button>
        )}
      </div>

      {/* ═══ SELECT ═══ */}
      {phase === 'select' && (
        <>
          {/* Mode selector */}
          <div className="flex gap-3 mb-2">
            {AD_MODES.map(m => (
              <button key={m.value} onClick={() => setAdMode(m.value)}
                className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${adMode === m.value ? 'border-fb bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{m.icon}</span>
                  <span className={`text-sm font-bold ${adMode === m.value ? 'text-fb' : 'text-gray-800'}`}>{m.label}</span>
                </div>
                <p className="text-[11px] text-gray-500">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* ═══ EXISTING POST MODE ═══ */}
          {adMode === 'existing_post' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold mb-1">Post IDs</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Pega el ID de tu publicación de Facebook o Instagram. Formato: <code className="bg-gray-100 px-1 rounded">page_id_post_id</code> o solo <code className="bg-gray-100 px-1 rounded">post_id</code>
                </p>
                {postIds.map((pid, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" value={pid}
                      onChange={e => { const p = [...postIds]; p[i] = e.target.value; setPostIds(p); }}
                      placeholder={`ID del post ${i + 1} — ej: 514164875351531_880819934994361`} />
                    {postIds.length > 1 && (
                      <button onClick={() => setPostIds(postIds.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setPostIds([...postIds, ''])} className="text-xs text-fb font-semibold hover:underline">+ Agregar otro post</button>
              </div>

              {pageId && (
                <div className="text-xs text-gray-500">
                  Page ID: <code className="bg-gray-100 px-1 rounded">{pageId}</code>
                  {igAccounts.length > 0 && (
                    <span className="ml-3">Instagram: {igAccounts.map(a => <code key={a.id} className="bg-gray-100 px-1 rounded ml-1">@{a.username || a.id}</code>)}</span>
                  )}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p><b>¿Cómo encontrar el Post ID?</b></p>
                <p>1. Abre tu publicación en Facebook/Instagram</p>
                <p>2. Copia la URL — el número al final es el post_id</p>
                <p>3. Formato completo: <code>{pageId || '514164875351531'}_POST_ID</code></p>
                <p>4. Para Instagram Reels: usa el ID del reel compartido en tu Facebook Page</p>
              </div>

              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={productHint} onChange={e => setProductHint(e.target.value)}
                placeholder="Nombre del producto (opcional)" />

              {/* Tier selection */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Ad Sets:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  {Object.entries(CITY_TIERS).map(([key, tier]) => (
                    <button key={key} onClick={() => setSelectedTiers(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key])}
                      className={`text-left px-2.5 py-2 rounded-lg border text-xs ${selectedTiers.includes(key) ? 'border-fb bg-blue-50 text-fb' : 'border-gray-200 text-gray-500'}`}>
                      <div className="font-bold">{tier.label}</div>
                      <div className="text-[10px] text-gray-400">{tier.cities.length} ciudades · ${tier.budget_usd}/día</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleGenerate}
                className="w-full py-3 bg-fb text-white rounded-xl text-sm font-bold hover:bg-fb-dark">
                Generar {selectedTiers.length} Ad Sets con {postIds.filter(p => p.trim()).length} Post{postIds.filter(p => p.trim()).length > 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* ═══ NEW AD MODE: media selection ═══ */}
          {adMode === 'new' && <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            {[{ v: '', l: 'Todos' }, { v: 'image', l: 'Imágenes' }, { v: 'video', l: 'Videos' }, { v: 'ig_post', l: 'IG Posts' }].map(f => (
              <button key={f.v} onClick={() => setFilter({ ...filter, type: f.v })}
                className={`px-3 py-1 rounded-full text-xs font-bold ${filter.type === f.v ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600'}`}>{f.l}</button>
            ))}
            <input className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 max-w-xs" placeholder="Buscar..."
              onChange={e => setFilter({ ...filter, search: e.target.value })} />
            <button onClick={() => setShowAddUrl(true)} className="px-3 py-1 bg-fb text-white rounded-lg text-xs font-bold">+ URLs</button>
            <button onClick={selectAll} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">
              {selected.size === filteredAssets.length && filteredAssets.length > 0 ? 'Deseleccionar' : 'Seleccionar todo'}
            </button>
          </div>

          {/* Grid */}
          {allAssets.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
              <p className="font-semibold text-gray-700">Sin media — ve a Media Library para subir</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {filteredAssets.map(asset => {
                const isSel = selected.has(asset.id);
                return (
                  <div key={asset.id} onClick={() => toggleSelect(asset.id)}
                    className={`relative bg-white rounded-lg border-2 overflow-hidden cursor-pointer transition-all group ${isSel ? 'border-fb ring-2 ring-fb/20' : 'border-gray-200 hover:border-gray-400'}`}>
                    <div className={`absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center z-10 text-[10px] ${isSel ? 'bg-fb border-fb text-white' : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'}`}>
                      {isSel && '\u2713'}
                    </div>
                    <div className={`absolute top-1.5 right-1.5 px-1 py-0.5 rounded text-[8px] font-bold uppercase ${asset.type === 'video' ? 'bg-purple-600 text-white' : asset.type === 'ig_post' ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white' : 'bg-gray-800 text-white'}`}>
                      {asset.type === 'video' ? 'VID' : asset.type === 'ig_post' ? 'IG' : 'IMG'}
                    </div>
                    <div className="aspect-square bg-gray-100">
                      <img src={asset.thumbnail_url || asset.url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="text-[10px] font-medium text-gray-700 truncate">{asset.filename}</p>
                      {asset.product && <p className="text-[9px] text-fb">{asset.product}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom panel */}
          {selected.size > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 sticky bottom-4 shadow-lg">
              {/* Row 1: Assets + Structure controls */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{selected.size} assets</span>
                  <span className="text-xs text-gray-500">{selImages} img{selVideos > 0 ? `, ${selVideos} vid` : ''}{selIgPosts > 0 ? `, ${selIgPosts} IG` : ''}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {/* Ads per ad set */}
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-600">Ads/AdSet:</span>
                    {STRUCTURE_DEFAULTS.ads_per_adset.allowed.map(n => (
                      <button key={n} onClick={() => setAdsPerAdset(n)}
                        className={`w-6 h-6 rounded text-[11px] font-bold ${adsPerAdset === n ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600'}`}>{n}</button>
                    ))}
                  </div>
                  {/* Assets per ad (carousel) */}
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-600">Assets/Ad:</span>
                    {[1, 2, 3, 5].map(n => (
                      <button key={n} onClick={() => setAssetsPerAd(n)}
                        className={`w-6 h-6 rounded text-[11px] font-bold ${assetsPerAd === n ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600'}`}>{n}</button>
                    ))}
                  </div>
                  <button onClick={() => setShowOptions(!showOptions)} className="text-gray-500 hover:text-fb font-medium">
                    {showOptions ? 'Ocultar' : 'Más'}
                  </button>
                </div>
              </div>

              {/* Row 2: Badges + summary */}
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">Engagement</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-700">Mujeres 25+</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Solo Español</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">WhatsApp</span>
                {assetsPerAd > 1 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">Carousel ({assetsPerAd} assets)</span>}
                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                  {adsetCount} ad sets &middot; {adsPerAdset} ads c/u &middot; {totalAds} ads total &middot; ${totalBudget}/día
                </span>
              </div>

              {/* Options panel */}
              {showOptions && (
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={productHint} onChange={e => setProductHint(e.target.value)}
                    placeholder="Nombre del producto (opcional)" />

                  {/* Budget */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">Presupuesto diario total:</span>
                    <input type="number" className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-20" value={totalBudget}
                      onChange={e => setTotalBudget(Math.min(200, Math.max(10, parseInt(e.target.value) || 100)))} />
                    <span className="text-xs text-gray-500">USD (máx $200)</span>
                  </div>

                  {/* Tiers */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5">Ad Sets (1 por tier):</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                      {Object.entries(CITY_TIERS).map(([key, tier]) => (
                        <button key={key} onClick={() => toggleTier(key)}
                          className={`text-left px-2.5 py-2 rounded-lg border text-xs ${selectedTiers.includes(key) ? 'border-fb bg-blue-50 text-fb' : 'border-gray-200 text-gray-500'}`}>
                          <div className="font-bold">{tier.label}</div>
                          <div className="text-[10px] text-gray-400">{tier.cities.length} ciudades &middot; ${tier.budget_usd}/día</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button onClick={handleGenerate} className="w-full py-3 bg-fb text-white rounded-xl text-sm font-bold hover:bg-fb-dark">
                Generar {adsetCount} Ad Sets &middot; {totalAds} Ads {assetsPerAd > 1 ? `(${format})` : ''} &middot; ${totalBudget}/día
              </button>
            </div>
          )}

          {/* Add URL modal */}
          {showAddUrl && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={e => { if (e.target === e.currentTarget) setShowAddUrl(false); }}>
              <div className="bg-white rounded-xl w-[90%] max-w-lg shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b"><h3 className="font-bold">Agregar Media</h3><button onClick={() => setShowAddUrl(false)} className="text-gray-400 text-xl">&times;</button></div>
                <div className="p-5">
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 font-mono" value={addUrlText} onChange={e => setAddUrlText(e.target.value)} placeholder="URLs (una por línea)" />
                </div>
                <div className="px-5 py-3 border-t flex justify-end gap-2">
                  <button onClick={() => setShowAddUrl(false)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-semibold">Cancelar</button>
                  <button onClick={handleAddUrls} className="px-4 py-2 bg-fb text-white rounded-lg text-sm font-semibold">Agregar</button>
                </div>
              </div>
            </div>
          )}
          </>}
        </>
      )}

      {/* ═══ GENERATING ═══ */}
      {phase === 'generating' && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-fb rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold">AI construyendo campaña...</p>
        </div>
      )}

      {/* ═══ REVIEW ═══ */}
      {phase === 'review' && result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-5">
            <h3 className="text-base font-bold mb-3">{result.campaign.name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Producto</div><div className="text-sm font-bold">{result.product}</div></div>
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Media</div><div className="text-sm font-bold">{result.media_summary.active} assets</div></div>
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Ad Sets</div><div className="text-sm font-bold">{result.total_adsets}</div></div>
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Ads</div><div className="text-sm font-bold">{result.total_ads}</div></div>
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Formato</div><div className="text-sm font-bold">{result.ad_format === 'carousel' ? `Carousel (${result.assets_per_ad})` : 'Single'}</div></div>
              <div><div className="text-[10px] font-bold text-gray-500 uppercase">Presupuesto</div><div className="text-sm font-bold">${result.total_daily_budget}/día</div></div>
            </div>
            <div className="flex gap-2 mt-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">Engagement</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-700">Mujeres 25+</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Solo Español</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">WhatsApp</span>
            </div>
          </div>

          {result.duplicate_warnings?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              {result.duplicate_warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">{w}</p>)}
            </div>
          )}

          {/* Ad Set cards */}
          {result.campaign.adsets.map((adset, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => setExpandedAdset(expandedAdset === i ? null : i)}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${adset.segment === 'beach' ? 'bg-cyan-100 text-cyan-800' : 'bg-purple-100 text-purple-800'}`}>
                    {adset.tier_label}
                  </span>
                  <div>
                    <div className="text-sm font-bold">{adset.name}</div>
                    <div className="text-[11px] text-gray-500">
                      {adset.cities_count} ciudades &middot; ${adset.daily_budget}/día &middot; {adset.ads.length} ads
                      {adset.ads[0]?.format === 'carousel' ? ` (carousel ${adset.ads[0].assets.length} assets)` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-gray-400">{expandedAdset === i ? '\u25B2' : '\u25BC'}</span>
              </div>
              {expandedAdset === i && (
                <div className="border-t border-gray-100 p-5 space-y-3">
                  {/* Cities */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] font-bold text-gray-500 mr-1">Ciudades:</span>
                    {adset.cities.map((c, j) => (
                      <span key={j} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.name} ({c.radius}mi)</span>
                    ))}
                  </div>
                  {/* Copy */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <div><span className="text-[10px] font-bold text-fb uppercase">Hook: </span><span className="text-xs">{result.campaign.copy.hooks[0]}</span></div>
                    <div><span className="text-[10px] font-bold text-green-700 uppercase">Headline: </span><span className="text-xs">{result.campaign.copy.headlines[0]}</span></div>
                    <div><span className="text-[10px] font-bold text-purple-700 uppercase">Primary: </span><span className="text-xs">{result.campaign.copy.primaryTexts[0]}</span></div>
                  </div>
                  {/* Ads */}
                  {adset.ads.map((ad, k) => (
                    <div key={k} className="border border-gray-200 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold">{ad.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ad.format === 'existing_post' ? 'bg-gradient-to-r from-pink-100 to-orange-100 text-pink-700' : ad.format === 'carousel' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {ad.format === 'existing_post' ? `Post existente` : ad.format === 'carousel' ? `Carousel (${ad.assets.length})` : 'Single'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {ad.object_story_id && (
                          <div className="flex items-center gap-1 bg-pink-50 rounded px-1.5 py-0.5 text-[10px] text-pink-700">
                            <span className="font-bold">POST</span>
                            <span className="font-mono max-w-[180px] truncate">{ad.object_story_id}</span>
                          </div>
                        )}
                        {ad.assets && ad.assets.map((a, j) => (
                          <div key={j} className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-0.5 text-[10px] text-gray-600">
                            <span className={`font-bold ${a.type === 'video' ? 'text-purple-600' : a.type === 'ig_post' ? 'text-pink-600' : 'text-blue-600'}`}>
                              {a.type === 'video' ? 'VID' : a.type === 'ig_post' ? 'IG' : 'IMG'}
                            </span>
                            <span className="max-w-[80px] truncate">{a.filename}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Publish */}
          <div className="flex gap-3 sticky bottom-4">
            <button onClick={reset} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold">Descartar</button>
            <button onClick={handlePublish} disabled={publishing} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-base font-bold hover:bg-green-700 disabled:opacity-50">
              Publicar BORRADOR &middot; {result.total_adsets} Ad Sets &middot; {result.total_ads} Ads &middot; ${result.total_daily_budget}/día
            </button>
          </div>
        </div>
      )}

      {/* ═══ PUBLISHING ═══ */}
      {phase === 'publishing' && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold">Publicando en Meta...</p>
        </div>
      )}

      {/* ═══ DONE ═══ */}
      {phase === 'done' && publishResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <h3 className="text-base font-bold text-green-800">Campaña publicada como borrador</h3>
          </div>
          {publishResult.results?.map((r, i) => (
            <div key={i} className={`px-4 py-3 rounded-lg ${r.error ? 'bg-red-50' : 'bg-green-50'}`}>
              <span>{r.error ? '\u274C' : '\u2705'} {r.name}</span>
              {r.error && <span className="text-xs text-red-600 ml-2">{r.error}</span>}
            </div>
          ))}
          <button onClick={reset} className="px-6 py-3 bg-fb text-white rounded-xl text-sm font-bold">Crear más</button>
        </div>
      )}
    </div>
  );
}
