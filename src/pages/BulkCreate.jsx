import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { CAMPAIGN_CATEGORIES, CITY_TIERS } from '../utils/constants';
import { fmtMoney } from '../utils/format';

const CREATIVE_MODES = [
  { value: 'all', label: 'Distribuir media', desc: 'Rotar assets en los ads' },
  { value: 'one_per_asset', label: '1 ad por asset', desc: 'Un ad separado por cada imagen/video' },
  { value: 'variants_per_asset', label: 'Variantes por asset', desc: '2 copys distintos por cada asset' },
];

export default function BulkCreate() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState('select');
  const [allAssets, setAllAssets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState({ type: '', search: '' });
  const [result, setResult] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [expandedAdset, setExpandedAdset] = useState(null);
  const [productHint, setProductHint] = useState('');
  const [creativeMode, setCreativeMode] = useState('all');
  const [adsPerAdset, setAdsPerAdset] = useState(3);
  const defaultTiers = Object.keys(CITY_TIERS).filter(k => CITY_TIERS[k].default);
  const [selectedTiers, setSelectedTiers] = useState(defaultTiers);
  const [includeRetarget, setIncludeRetarget] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [addUrlText, setAddUrlText] = useState('');

  useEffect(() => {
    const loadAssets = async () => {
      const assets = await api.getMedia();
      setAllAssets(assets);
      const preselect = searchParams.get('assets');
      if (preselect) setSelected(new Set(preselect.split(',').map(Number).filter(Boolean)));
    };
    loadAssets();
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
  const adsetCount = selectedTiers.length + (includeRetarget ? 1 : 0);
  const totalAds = adsetCount * adsPerAdset;

  const handleAddUrls = async () => {
    const urls = addUrlText.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    const res = await api.addMedia(urls.map(url => ({ url, filename: url.split('/').pop() })));
    const assets = await api.getMedia();
    setAllAssets(assets);
    if (res.ids) setSelected(prev => new Set([...prev, ...res.ids]));
    setShowAddUrl(false);
    setAddUrlText('');
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return alert('Selecciona al menos un asset');
    setPhase('generating');
    try {
      const data = await api.aiGenerate({
        asset_ids: [...selected],
        product_hint: productHint || undefined,
        tiers: selectedTiers,
        include_retarget: includeRetarget,
        creative_mode: creativeMode,
        ads_per_adset: adsPerAdset
      });
      setResult(data);
      setPhase('review');
    } catch (e) { alert('Error: ' + e.message); setPhase('select'); }
  };

  const handlePublish = async () => {
    if (!confirm(`Publicar 1 campaña con ${result.total_adsets} ad sets y ${result.total_ads} ads como BORRADOR (PAUSED)?\n\nNada se activa hasta que lo hagas manualmente.`)) return;
    setPublishing(true);
    setPhase('publishing');
    try {
      const res = await api.bulkPublish({ campaign: result.campaign });
      setPublishResult(res);
      setPhase('done');
    } catch (e) { alert('Error: ' + e.message); setPhase('review'); }
    setPublishing(false);
  };

  const reset = () => { setPhase('select'); setResult(null); setPublishResult(null); setExpandedAdset(null); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Crear Campañas</h2>
          <p className="text-sm text-gray-500">{phase === 'select' ? 'Selecciona media, AI construye todo' : phase === 'review' ? 'Revisa y aprueba' : ''}</p>
        </div>
        {phase !== 'select' && phase !== 'generating' && (
          <button onClick={reset} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">Volver</button>
        )}
      </div>

      {/* ═══ SELECT ═══ */}
      {phase === 'select' && (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex gap-1">
              {[{ v: '', l: 'Todos' }, { v: 'image', l: 'Imágenes' }, { v: 'video', l: 'Videos' }].map(f => (
                <button key={f.v} onClick={() => setFilter({ ...filter, type: f.v })}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${filter.type === f.v ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600'}`}>{f.l}</button>
              ))}
            </div>
            <input className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 max-w-xs" placeholder="Buscar..."
              onChange={e => setFilter({ ...filter, search: e.target.value })} />
            <button onClick={() => setShowAddUrl(true)} className="px-3 py-1 bg-fb text-white rounded-lg text-xs font-bold">+ URLs</button>
            <button onClick={selectAll} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">
              {selected.size === filteredAssets.length && filteredAssets.length > 0 ? 'Deseleccionar' : 'Seleccionar todo'}
            </button>
          </div>

          {allAssets.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
              <div className="text-4xl mb-3">&#128247;</div>
              <p className="font-semibold text-gray-700">Sin media</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">Ve a Media Library para subir imágenes y videos</p>
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
                    {asset.type === 'video' && <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded text-[8px] font-bold bg-purple-600 text-white">VID</div>}
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{selected.size} asset{selected.size > 1 ? 's' : ''}</span>
                  <span className="text-xs text-gray-500">{selImages} img, {selVideos} vid</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-600">Ads por Ad Set:</span>
                  {[1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => setAdsPerAdset(n)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold ${adsPerAdset === n ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                  ))}
                  <button onClick={() => setShowOptions(!showOptions)} className="text-xs text-gray-500 hover:text-fb font-medium ml-2">
                    {showOptions ? 'Ocultar' : 'Más'}
                  </button>
                </div>
              </div>

              {/* Targeting badges */}
              <div className="flex gap-2 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">Engagement</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-700">Mujeres 25+</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Solo Español</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">Mayoreo</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">1 campaña · {adsetCount} ad sets · {adsPerAdset} ads c/u · {totalAds} ads total</span>
              </div>

              {showOptions && (
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={productHint} onChange={e => setProductHint(e.target.value)}
                    placeholder="Nombre del producto (opcional)" />

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5">Estrategia creativa:</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {CREATIVE_MODES.map(m => (
                        <button key={m.value} onClick={() => setCreativeMode(m.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs ${creativeMode === m.value ? 'border-fb bg-blue-50 text-fb font-bold' : 'border-gray-200 text-gray-600'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5">Ad Sets (1 por tier seleccionado):</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {Object.entries(CITY_TIERS).map(([key, tier]) => (
                        <button key={key} onClick={() => toggleTier(key)}
                          className={`text-left px-2.5 py-2 rounded-lg border text-xs ${selectedTiers.includes(key) ? 'border-fb bg-blue-50 text-fb' : 'border-gray-200 text-gray-500'}`}>
                          <div className="font-bold">{tier.label}</div>
                          <div className="text-[10px] text-gray-400">{tier.cities.length} ciudades</div>
                        </button>
                      ))}
                      <button onClick={() => setIncludeRetarget(!includeRetarget)}
                        className={`text-left px-2.5 py-2 rounded-lg border text-xs ${includeRetarget ? 'border-fb bg-blue-50 text-fb' : 'border-gray-200 text-gray-500'}`}>
                        <div className="font-bold">Retargeting</div>
                        <div className="text-[10px] text-gray-400">Nacional</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={handleGenerate} className="w-full py-3 bg-fb text-white rounded-xl text-sm font-bold hover:bg-fb-dark">
                Generar 1 Campaña · {adsetCount} Ad Sets · {totalAds} Ads
              </button>
            </div>
          )}

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
        </>
      )}

      {/* ═══ GENERATING ═══ */}
      {phase === 'generating' && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-fb rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold">AI está construyendo la campaña...</p>
        </div>
      )}

      {/* ═══ REVIEW ═══ */}
      {phase === 'review' && result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-5">
            <h3 className="text-base font-bold mb-3">Campaña: {result.campaign.name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Producto</div>
                <div className="text-sm font-bold">{result.product}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Media</div>
                <div className="text-sm font-bold">{result.media_summary.active_images} img, {result.media_summary.active_videos} vid</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Ad Sets</div>
                <div className="text-sm font-bold">{result.total_adsets}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Ads Totales</div>
                <div className="text-sm font-bold">{result.total_ads}</div>
                <div className="text-[10px] text-gray-500">{result.ads_per_adset} por ad set</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">Presupuesto</div>
                <div className="text-sm font-bold">{fmtMoney(result.total_daily_budget)}/día</div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">Engagement</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-700">Mujeres 25+</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Solo Español</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">Mayoreo</span>
            </div>
          </div>

          {/* Duplicate warnings */}
          {result.duplicate_warnings?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              {result.duplicate_warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">&#9888; {w}</p>)}
            </div>
          )}

          {/* Ad Set cards */}
          {result.campaign.adsets.map((adset, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => setExpandedAdset(expandedAdset === i ? null : i)}>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${CAMPAIGN_CATEGORIES[adset.type]?.color || 'bg-gray-100'}`}>{adset.tier_label}</span>
                  <div>
                    <div className="text-sm font-bold">{adset.name}</div>
                    <div className="text-[11px] text-gray-500">
                      {adset.cities_summary} · {fmtMoney(adset.daily_budget)}/día · {adset.ads.length} ads
                    </div>
                  </div>
                </div>
                <span className="text-gray-400">{expandedAdset === i ? '\u25B2' : '\u25BC'}</span>
              </div>
              {expandedAdset === i && (
                <div className="border-t border-gray-100 p-5 space-y-3">
                  {/* Cities in this ad set */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] font-bold text-gray-500 mr-1">Ciudades:</span>
                    {adset.cities.map((c, j) => (
                      <span key={j} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.name} ({c.radius}mi)</span>
                    ))}
                  </div>
                  {/* Copy preview */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <div><span className="text-[10px] font-bold text-fb uppercase">Hook: </span><span className="text-xs">{result.campaign.copy.hooks[0]}</span></div>
                    <div><span className="text-[10px] font-bold text-green-700 uppercase">Headline: </span><span className="text-xs">{result.campaign.copy.headlines[0]}</span></div>
                    <div><span className="text-[10px] font-bold text-purple-700 uppercase">Primary: </span><span className="text-xs">{result.campaign.copy.primaryTexts[0]}</span></div>
                  </div>
                  {/* Ads */}
                  {adset.ads.map((ad, k) => (
                    <div key={k} className="flex items-center gap-2 text-[11px] text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                      <span className={`text-[9px] font-bold px-1 rounded ${ad.creative.media_type === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ad.creative.media_type === 'video' ? 'VID' : 'IMG'}
                      </span>
                      <span className="font-medium">{ad.name}</span>
                      <span className="text-gray-300">|</span>
                      <span className="truncate flex-1">{ad.creative.headline}</span>
                      <span className="text-[9px] text-fb font-bold">{ad.creative.cta}</span>
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
              Publicar como BORRADOR · {result.total_adsets} Ad Sets · {result.total_ads} Ads · {fmtMoney(result.total_daily_budget)}/día
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
            <p className="text-sm text-green-600 mt-1">Todo PAUSED. Ve a Campañas para activar.</p>
          </div>
          {publishResult.results?.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg ${r.error ? 'bg-red-50' : 'bg-green-50'}`}>
              <span>{r.error ? '\u274C' : '\u2705'}</span>
              <span className="text-sm font-medium">{r.name}</span>
              {r.error && <span className="text-xs text-red-600">{r.error}</span>}
            </div>
          ))}
          <button onClick={reset} className="px-6 py-3 bg-fb text-white rounded-xl text-sm font-bold">Crear más</button>
        </div>
      )}
    </div>
  );
}
