import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';

export default function MediaLibrary() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState({ type: '', product: '', search: '' });
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showGdrive, setShowGdrive] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkForm, setBulkForm] = useState({ product: '', group_name: '', tags: '' });
  const [addUrls, setAddUrls] = useState('');
  const [gdriveForm, setGdriveForm] = useState({ folder_id: '', folder_name: '', files_json: '' });
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const searchRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.type) params.type = filter.type;
      if (filter.product) params.product = filter.product;
      if (filter.search) params.search = filter.search;
      const [a, p, g] = await Promise.all([api.getMedia(params), api.getMediaProducts(), api.getMediaGroups()]);
      setAssets(a); setProducts(p); setGroups(g);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.type, filter.product]);

  const handleSearch = () => { setFilter({ ...filter, search: searchRef.current?.value || '' }); setTimeout(load, 50); };

  // File upload
  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ids) {
        setSelected(prev => new Set([...prev, ...data.ids]));
      }
      await load();
    } catch (e) { alert('Upload failed: ' + e.message); }
    setUploading(false);
  };

  const handleFileSelect = (e) => uploadFiles(e.target.files);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => { if (selected.size === assets.length) setSelected(new Set()); else setSelected(new Set(assets.map(a => a.id))); };
  const selectGroup = (groupName) => { const ids = assets.filter(a => a.group_name === groupName).map(a => a.id); setSelected(new Set([...selected, ...ids])); };

  const handleAddUrls = async () => {
    const urls = addUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    await api.addMedia(urls.map(url => ({ url, filename: url.split('/').pop() })));
    setShowUrlModal(false); setAddUrls(''); load();
  };

  const handleGdriveImport = async () => {
    let files = [];
    try { files = JSON.parse(gdriveForm.files_json); } catch { return alert('Invalid JSON'); }
    if (gdriveForm.folder_id) await api.addGdriveFolder({ folder_id: gdriveForm.folder_id, folder_name: gdriveForm.folder_name });
    await api.importGdrive({ folder_id: gdriveForm.folder_id, files });
    setShowGdrive(false); setGdriveForm({ folder_id: '', folder_name: '', files_json: '' }); load();
  };

  const handleBulkEdit = async () => {
    const data = { ids: [...selected] };
    if (bulkForm.product) data.product = bulkForm.product;
    if (bulkForm.group_name) data.group_name = bulkForm.group_name;
    if (bulkForm.tags) data.tags = bulkForm.tags.split(',').map(t => t.trim());
    await api.bulkUpdateMedia(data);
    setShowBulkEdit(false); setBulkForm({ product: '', group_name: '', tags: '' }); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this asset?')) return;
    await api.deleteMedia(id);
    selected.delete(id); setSelected(new Set(selected)); load();
  };

  const imgCount = assets.filter(a => a.type === 'image').length;
  const vidCount = assets.filter(a => a.type === 'video').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Media Library</h2>
          <p className="text-sm text-gray-500">{assets.length} assets &middot; {imgCount} images &middot; {vidCount} videos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGdrive(true)} className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">Google Drive</button>
          <button onClick={() => setShowUrlModal(true)} className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">Add URLs</button>
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-1.5 bg-fb text-white rounded-lg text-sm font-semibold hover:bg-fb-dark">
            Upload Files
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${dragOver ? 'border-fb bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />
            <span className="text-sm font-semibold text-gray-600">Uploading...</span>
          </div>
        ) : (
          <>
            <div className="text-3xl mb-2">{dragOver ? '\u{1F4E5}' : '\u{1F4F7}'}</div>
            <p className="text-sm font-semibold text-gray-700">
              {dragOver ? 'Drop files here' : 'Drag & drop images/videos here'}
            </p>
            <p className="text-xs text-gray-500 mt-1">or click to browse &middot; JPG, PNG, WEBP, MP4, MOV &middot; up to 100MB</p>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1">
          {[{ v: '', l: 'All' }, { v: 'image', l: 'Images' }, { v: 'video', l: 'Videos' }].map(f => (
            <button key={f.v} onClick={() => setFilter({ ...filter, type: f.v })}
              className={`px-3 py-1 rounded-full text-xs font-bold ${filter.type === f.v ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.l}</button>
          ))}
        </div>
        {products.length > 0 && (
          <select value={filter.product} onChange={e => setFilter({ ...filter, product: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1 text-xs">
            <option value="">All products</option>
            {products.map(p => <option key={p.product} value={p.product}>{p.product}</option>)}
          </select>
        )}
        <div className="flex gap-1 flex-1 max-w-xs">
          <input ref={searchRef} className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs" placeholder="Search..." onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} />
          <button onClick={handleSearch} className="px-2 py-1 bg-gray-100 rounded-lg text-xs hover:bg-gray-200">Go</button>
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <span className="text-xs text-fb font-bold self-center">{selected.size} selected</span>
            <button onClick={() => setShowBulkEdit(true)} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200">Tag / Group</button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">Clear</button>
          </div>
        )}
      </div>

      {/* Groups */}
      {groups.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-500 uppercase self-center">Groups:</span>
          {groups.map(g => (
            <button key={g.group_name} onClick={() => selectGroup(g.group_name)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
              {g.group_name} ({g.count})
            </button>
          ))}
        </div>
      )}

      {/* Select All */}
      {assets.length > 0 && (
        <button onClick={selectAll} className="text-xs text-gray-500 hover:text-fb font-medium">
          {selected.size === assets.length ? 'Deselect all' : 'Select all'}
        </button>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No media yet — upload files or add URLs above</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {assets.map(asset => {
            const isSel = selected.has(asset.id);
            return (
              <div key={asset.id} onClick={() => toggleSelect(asset.id)}
                className={`relative bg-white rounded-xl border-2 overflow-hidden cursor-pointer transition-all group ${isSel ? 'border-fb shadow-md ring-2 ring-fb/20' : 'border-gray-200 hover:border-gray-400'}`}>
                <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center z-10 ${isSel ? 'bg-fb border-fb' : 'bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  {isSel && <span className="text-white text-xs font-bold">&#10003;</span>}
                </div>
                <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${asset.type === 'video' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-white'}`}>
                  {asset.type === 'video' ? '\u25B6 VID' : 'IMG'}
                </div>
                <div className="aspect-square bg-gray-100">
                  {asset.type === 'video' ? (
                    <video src={asset.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={asset.thumbnail_url || asset.url} alt={asset.filename} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[11px] font-medium text-gray-800 truncate">{asset.filename}</p>
                  {asset.product && <p className="text-[10px] text-fb font-medium">{asset.product}</p>}
                  {asset.group_name && <p className="text-[10px] text-indigo-500">{asset.group_name}</p>}
                  {asset.source === 'upload' && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded">uploaded</span>}
                  {asset.source === 'gdrive' && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">drive</span>}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(asset.id); }}
                  className="absolute bottom-2 right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">&times;</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating CTA */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <a href={`/bulk-create?assets=${[...selected].join(',')}`}
            className="px-8 py-3 bg-green-600 text-white rounded-2xl text-sm font-bold shadow-xl hover:bg-green-700 transition-colors inline-flex items-center gap-2">
            Create Campaigns from {selected.size} asset{selected.size > 1 ? 's' : ''} &#8594;
          </a>
        </div>
      )}

      {/* URL Modal */}
      {showUrlModal && (
        <Modal title="Add by URL" onClose={() => setShowUrlModal(false)} footer={<>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold" onClick={() => setShowUrlModal(false)}>Cancel</button>
          <button className="px-4 py-2 bg-fb text-white rounded-lg text-sm font-semibold" onClick={handleAddUrls}>Add</button>
        </>}>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 font-mono" value={addUrls} onChange={e => setAddUrls(e.target.value)} placeholder="Paste URLs (one per line)" />
        </Modal>
      )}

      {/* Google Drive Modal */}
      {showGdrive && (
        <Modal title="Import from Google Drive" onClose={() => setShowGdrive(false)} footer={<>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold" onClick={() => setShowGdrive(false)}>Cancel</button>
          <button className="px-4 py-2 bg-fb text-white rounded-lg text-sm font-semibold" onClick={handleGdriveImport}>Import</button>
        </>}>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              <strong>Drive sync adapter ready.</strong> When API is connected, auto-import will work. For now, paste file metadata.
            </div>
            <div><label className="block text-sm font-semibold mb-1">Folder ID</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={gdriveForm.folder_id} onChange={e => setGdriveForm({ ...gdriveForm, folder_id: e.target.value })} /></div>
            <div><label className="block text-sm font-semibold mb-1">Folder Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={gdriveForm.folder_name} onChange={e => setGdriveForm({ ...gdriveForm, folder_name: e.target.value })} /></div>
            <div><label className="block text-sm font-semibold mb-1">Files JSON</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-28 font-mono" value={gdriveForm.files_json} onChange={e => setGdriveForm({ ...gdriveForm, files_json: e.target.value })} placeholder={'[{"name":"file.jpg","url":"https://..."}]'} /></div>
          </div>
        </Modal>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <Modal title={`Edit ${selected.size} assets`} onClose={() => setShowBulkEdit(false)} footer={<>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold" onClick={() => setShowBulkEdit(false)}>Cancel</button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold" onClick={handleBulkEdit}>Apply</button>
        </>}>
          <div className="space-y-3">
            <div><label className="block text-sm font-semibold mb-1">Product</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={bulkForm.product} onChange={e => setBulkForm({ ...bulkForm, product: e.target.value })} placeholder="e.g. Vestido 517" /></div>
            <div><label className="block text-sm font-semibold mb-1">Group Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={bulkForm.group_name} onChange={e => setBulkForm({ ...bulkForm, group_name: e.target.value })} placeholder="e.g. Abril Launch" /></div>
            <div><label className="block text-sm font-semibold mb-1">Tags (comma separated)</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={bulkForm.tags} onChange={e => setBulkForm({ ...bulkForm, tags: e.target.value })} placeholder="new, summer" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
