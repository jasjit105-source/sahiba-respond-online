// One-button IG Reel publisher — pastes a Dropbox video URL + caption, hits the
// button, backend does the 3-step Meta dance and returns the permalink. First
// step toward the fully automated 10-reels/day pipeline; keeping it manual for
// now so the user can eyeball each post before automating.
import { useState } from 'react';
import { api } from '../api';

export default function IGPublisherPage() {
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
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
    setVideoUrl(''); setCaption(''); setStatus('idle'); setResult(null);
  };

  return (
    <div className="analyzer">
      <div className="sec">
        <h2 className="sh">📤 Instagram Reel Publisher</h2>
        <p style={{ fontSize: '.85rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          Paste a Dropbox video URL + caption → post lands on @sahiba_mexico. Takes ~60-90 seconds while Meta processes the video.
          Dropbox links auto-convert to direct-download form (I handle both <code>?dl=0</code> and <code>?dl=1</code> variants).
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '.75rem', color: 'var(--at2)', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Dropbox video URL</label>
          <input
            type="text"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            disabled={status === 'publishing'}
            placeholder="https://www.dropbox.com/scl/fi/abc123/video.mp4?rlkey=xyz&dl=0"
            style={{ width: '100%', padding: '.55rem .7rem', fontSize: '.85rem', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', borderRadius: 6, fontFamily: 'monospace' }}
          />
          <p style={{ fontSize: '.7rem', color: 'var(--at3)', marginTop: '.3rem' }}>Any Dropbox share URL works. Video must be 9:16, 3-90 sec, MP4/MOV, ≤ 100 MB.</p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '.75rem', color: 'var(--at2)', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Caption</label>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            disabled={status === 'publishing'}
            rows={5}
            placeholder="🚨 ¡ATENCIÓN MAYORISTAS! 🚨&#10;👗 Vestidos hermosos por 70 pesos&#10;📦 Paquete de 24 piezas&#10;💬 Cotiza por WhatsApp: wa.me/5215657534707"
            style={{ width: '100%', padding: '.55rem .7rem', fontSize: '.82rem', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', borderRadius: 6, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          <input type="checkbox" checked={shareToFeed} onChange={e => setShareToFeed(e.target.checked)} disabled={status === 'publishing'} />
          Also share to grid feed (not just Reels tab)
        </label>

        <div style={{ display: 'flex', gap: '.6rem' }}>
          <button
            onClick={publish}
            disabled={!videoUrl.trim() || status === 'publishing'}
            style={{ background: 'var(--gold)', color: '#000', padding: '.7rem 1.4rem', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: '.9rem', cursor: status === 'publishing' ? 'wait' : 'pointer', opacity: !videoUrl.trim() || status === 'publishing' ? 0.4 : 1 }}
          >
            {status === 'publishing' ? '⏳ Publishing… (60-90 sec)' : '📤 Publish to Instagram'}
          </button>
          {status !== 'idle' && (
            <button onClick={reset} style={{ background: 'transparent', border: '1px solid var(--abdr)', color: 'var(--at2)', padding: '.7rem 1rem', borderRadius: 6, fontSize: '.82rem' }}>
              New Post
            </button>
          )}
        </div>

        {status === 'publishing' && (
          <div className="snap-info" style={{ marginTop: '1rem', borderLeftColor: 'var(--gold)' }}>
            Meta is downloading the video from Dropbox → processing → publishing. Don't close this tab. On a slow connection this can take up to 2 minutes.
          </div>
        )}

        {status === 'ok' && result?.permalink && (
          <div className="snap-info" style={{ marginTop: '1rem', borderLeftColor: 'var(--grn)', background: 'rgba(74,222,128,.08)' }}>
            <b style={{ color: 'var(--grn)' }}>✅ Published successfully</b>
            <div style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
              <a href={result.permalink} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', wordBreak: 'break-all' }}>
                {result.permalink}
              </a>
              <div style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.3rem' }}>
                media_id: <code>{result.media_id}</code> · published at {result.timestamp || 'now'}
              </div>
            </div>
          </div>
        )}

        {status === 'err' && (
          <div className="snap-info" style={{ marginTop: '1rem', borderLeftColor: '#d33', background: 'rgba(248,113,113,.08)' }}>
            <b style={{ color: '#d33' }}>❌ Publish failed</b>
            <div style={{ marginTop: '.5rem', fontSize: '.82rem' }}>{result?.error || 'Unknown error'}</div>
            {result?.last_status && <div style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.3rem' }}>Meta status: {result.last_status}</div>}
            {result?.steps && (
              <details style={{ marginTop: '.5rem' }}>
                <summary style={{ fontSize: '.72rem', color: 'var(--at3)', cursor: 'pointer' }}>Debug steps</summary>
                <ul style={{ fontSize: '.72rem', color: 'var(--at3)', paddingLeft: '1rem' }}>
                  {result.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="sec">
        <h2 className="sh">📋 How to use</h2>
        <ol style={{ fontSize: '.85rem', lineHeight: 1.7, paddingLeft: '1.2rem', color: 'var(--at2)' }}>
          <li>Upload your video to Dropbox</li>
          <li>Right-click → <b>Share</b> → <b>Create link</b> → <b>Copy link</b></li>
          <li>Paste here (any format — <code>www.dropbox.com/s/...</code> or <code>/scl/fi/...</code> works)</li>
          <li>Write your caption. Emojis and line breaks OK.</li>
          <li>Click <b>📤 Publish to Instagram</b> and wait 60-90 seconds</li>
          <li>You'll get the permalink when it's live</li>
        </ol>
        <p style={{ fontSize: '.75rem', color: 'var(--at3)', marginTop: '1rem' }}>
          <b>Requirements:</b> Video must be 9:16 aspect ratio, 3-90 seconds long, MP4 or MOV format, ≤ 100 MB.
          Meta rejects videos in other formats. Rate limit: 25 posts per 24 hours per IG account.
        </p>
      </div>
    </div>
  );
}
