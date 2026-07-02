import { useState } from 'react';
import { api } from '../api';

const DEFAULT_CAPTION = `🌺💖 ¡Haz que tu tienda destaque con los vestidos más bonitos de la temporada!

Nuestros vestidos y blusa bordados combinan elegancia, comodidad y excelente calidad. Disponibles varios colores diferentes, son el tipo de prenda que tus clientas verán... ¡y querrán llevarse al instante!

💰 Precio de mayoreo y bulto

✨ Diseños exclusivos.
✨ Bordados de alta calidad.
✨ Ideales para boutiques y negocios de moda.
✨ ¡Se venden rapidísimo!

📍 Ven a conocer toda la colección en nuestra tienda de Mixcalco, CDMX.

📍 Sahiba - Leona Vicario #10, Colonia Centro
🕒 Lunes a sábado | 9:30 am – 5:30 pm
📞 55 5542 9041

📲 Videollamada y WhatsApp con Jasmin
+52 55 4603 2968`;

export default function IGPublisherPage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState(DEFAULT_CAPTION);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [status, setStatus] = useState('idle');   // idle | publishing | ok | err
  const [result, setResult] = useState(null);

  const publish = async () => {
    setStatus('publishing');
    setResult(null);
    try {
      const r = await api.igPublish({ video_url: videoUrl.trim(), caption: caption.trim(), share_to_feed: shareToFeed });
      if (r.ok) { setStatus('ok'); setResult(r); }
      else { setStatus('err'); setResult(r); }
    } catch (e) {
      setStatus('err');
      setResult({ error: e.message });
    }
  };

  const reset = () => {
    setVideoUrl(''); setCaption(DEFAULT_CAPTION); setStatus('idle'); setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">📤 Instagram Reel Publisher</h2>
        <p className="text-sm text-gray-600 mb-5">
          Paste a Dropbox video URL + caption → post lands on <b>@sahiba_mexico</b>. Takes ~60-90 seconds while Meta processes the video.
          Dropbox links auto-convert to direct-download form.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dropbox video URL</label>
          <input
            type="text"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            disabled={status === 'publishing'}
            placeholder="https://www.dropbox.com/scl/fi/abc123/video.mp4?rlkey=xyz&dl=0"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
          />
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Any Dropbox share URL works. Video must be 9:16, 3-90 sec, MP4/MOV, ≤ 100 MB.
            <br />
            🎯 <b>Target duration: 8-15 seconds</b> (sweet spot: <b>10s</b>). Anything over 30s tanks completion rate on AI reels.
          </p>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Caption</label>
            <button
              type="button"
              onClick={() => setCaption(DEFAULT_CAPTION)}
              disabled={status === 'publishing'}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            >
              ↻ Reset to standard
            </button>
          </div>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            disabled={status === 'publishing'}
            rows={16}
            placeholder="Standard Sahiba wholesale caption (pre-filled). Edit only if you need product-specific text."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-y"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-5 cursor-pointer">
          <input type="checkbox" checked={shareToFeed} onChange={e => setShareToFeed(e.target.checked)} disabled={status === 'publishing'} className="rounded" />
          Also share to grid feed (not just Reels tab)
        </label>

        <div className="flex gap-3">
          <button
            onClick={publish}
            disabled={!videoUrl.trim() || status === 'publishing'}
            className={`px-6 py-3 rounded font-bold text-sm transition-colors ${
              !videoUrl.trim() || status === 'publishing'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {status === 'publishing' ? '⏳ Publishing… (60-90 sec)' : '📤 Publish to Instagram'}
          </button>
          {status !== 'idle' && (
            <button onClick={reset} className="px-4 py-3 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              New Post
            </button>
          )}
        </div>

        {status === 'publishing' && (
          <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-500 text-sm text-blue-900 rounded-r">
            Meta is downloading the video from Dropbox → processing → publishing. Don't close this tab. On a slow connection this can take up to 2 minutes.
          </div>
        )}

        {status === 'ok' && result?.permalink && (
          <div className="mt-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-r">
            <div className="font-bold text-green-800 mb-1">✅ Published successfully</div>
            <a href={result.permalink} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all text-sm">
              {result.permalink}
            </a>
            <div className="text-xs text-gray-500 mt-1">
              media_id: <code className="bg-white px-1 rounded">{result.media_id}</code> · published at {result.timestamp || 'now'}
            </div>
          </div>
        )}

        {status === 'err' && (
          <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r">
            <div className="font-bold text-red-800 mb-1">❌ Publish failed</div>
            <div className="text-sm text-red-900">{result?.error || 'Unknown error'}</div>
            {result?.last_status && <div className="text-xs text-gray-600 mt-1">Meta status: {result.last_status}</div>}
            {result?.steps && (
              <details className="mt-2">
                <summary className="text-xs text-gray-600 cursor-pointer">Debug steps</summary>
                <ul className="text-xs text-gray-700 pl-4 mt-1 list-disc">
                  {result.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">📋 How to use</h2>
        <ol className="text-sm text-gray-700 space-y-1.5 pl-5 list-decimal">
          <li>Upload your video to Dropbox</li>
          <li>Right-click → <b>Share</b> → <b>Create link</b> → <b>Copy link</b></li>
          <li>Paste here (any format — <code className="bg-gray-100 px-1 rounded">www.dropbox.com/s/...</code> or <code className="bg-gray-100 px-1 rounded">/scl/fi/...</code> works)</li>
          <li>Write your caption. Emojis and line breaks OK.</li>
          <li>Click <b>📤 Publish to Instagram</b> and wait 60-90 seconds</li>
          <li>You'll get the permalink when it's live</li>
        </ol>
        <p className="text-xs text-gray-500 mt-4">
          <b>Requirements:</b> 9:16 aspect ratio, 3-90 seconds, MP4 or MOV, ≤ 100 MB.
          Rate limit: 25 posts per 24 hours per IG account.
        </p>
      </div>
    </div>
  );
}
