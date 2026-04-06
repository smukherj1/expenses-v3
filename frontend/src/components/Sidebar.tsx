import { NavLink } from "react-router";

const links = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/upload", label: "Upload", icon: "⬆️" },
  { to: "/transactions", label: "Transactions", icon: "💳" },
  { to: "/rules", label: "Rules", icon: "⚙️" },
  { to: "/analytics", label: "Analytics", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "🔧" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="px-6 py-5 text-lg font-bold border-b border-gray-700">
        💰 FinTrack
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`
            }
          >
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
