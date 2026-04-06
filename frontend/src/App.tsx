import { BrowserRouter, Routes, Route } from "react-router";
import RootLayout from "./components/RootLayout.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import UploadPage from "./pages/UploadPage.tsx";
import TransactionsPage from "./pages/TransactionsPage.tsx";
import TransactionDetailPage from "./pages/TransactionDetailPage.tsx";
import RulesPage from "./pages/RulesPage.tsx";
import AnalyticsPage from "./pages/AnalyticsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transactions/:id" element={<TransactionDetailPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
