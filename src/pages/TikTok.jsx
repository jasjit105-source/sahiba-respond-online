// Standalone TikTok page — promotes the TikTok ad-account dashboard into its
// own sidebar slot so Meta and TikTok don't crowd each other. The TikTokTab
// component is exported from Dashboard.jsx and reused here verbatim.
import { TikTokTab } from './Dashboard';

export default function TikTokPage() {
  return (
    <div className="analyzer">
      <TikTokTab />
    </div>
  );
}
