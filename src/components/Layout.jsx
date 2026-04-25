import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '\u{1F4CA}' },
  { to: '/campaigns', label: 'Campaigns', icon: '\u{1F3AF}' },
  { to: '/media', label: 'Media Library', icon: '\u{1F4F7}' },
  { to: '/bulk-create', label: 'Create Ads', icon: '\u{1F680}' },
  { to: '/daily-report', label: 'AI Report', icon: '\u{1F9E0}' },
  { to: '/adsets', label: 'Ad Sets', icon: '\u{1F465}' },
  { to: '/ads', label: 'Ads', icon: '\u{1F4F1}' },
  { to: '/leads', label: 'Leads', icon: '\u{1F4CB}' },
  { to: '/agents', label: 'Agents', icon: '\u{1F9D1}' },
  { to: '/alerts', label: 'Alerts', icon: '\u{1F514}' },
  // External: standalone Respond Tracker page (vanilla HTML in /public/respond.html).
  // Renders as a normal <a> in the sidebar. Agents bookmark /respond?v=nancy directly.
  { to: '/respond', label: 'Respond Tracker', icon: '\u{1F4AC}', external: true },
];

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 fixed top-0 left-0 bottom-0 overflow-y-auto z-10">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-lg font-extrabold text-fb">Sahiba CRM</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">FB Ads Manager</p>
        </div>
        <nav className="mt-2">
          {NAV.map(n => n.external ? (
            <a
              key={n.to}
              href={n.to}
              className="flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-[3px] border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </a>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium border-l-[3px] transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-fb border-fb font-semibold'
                    : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-800'
                }`
              }
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="ml-56 flex-1 p-6 max-w-[1200px]">
        {children}
      </main>
    </div>
  );
}
