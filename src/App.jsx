import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import AdSets from './pages/AdSets';
import Ads from './pages/Ads';
import Leads from './pages/Leads';
import Agents from './pages/Agents';
import Alerts from './pages/Alerts';
import BulkCreate from './pages/BulkCreate';
import DailyReport from './pages/DailyReport';
import MediaLibrary from './pages/MediaLibrary';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/media" element={<MediaLibrary />} />
          <Route path="/bulk-create" element={<BulkCreate />} />
          <Route path="/daily-report" element={<DailyReport />} />
          <Route path="/adsets" element={<AdSets />} />
          <Route path="/ads" element={<Ads />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/alerts" element={<Alerts />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
