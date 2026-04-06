import { Outlet } from "react-router";
import Sidebar from "./Sidebar.tsx";

export default function RootLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
