import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccounts, deleteAccount } from "../api/accounts.ts";
import ConfirmDialog from "../components/ConfirmDialog.tsx";
import { useState } from "react";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setConfirmId(null);
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-xl border p-5 max-w-lg">
        <h2 className="font-semibold text-gray-800 mb-4">Account Labels</h2>
        <p className="text-sm text-gray-500 mb-4">
          Accounts are created automatically when you upload a file. Deleting an
          account removes all associated transactions.
        </p>

        {isLoading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="text-sm text-gray-400" data-testid="no-accounts">
            No accounts yet. Upload a file to create one.
          </div>
        ) : (
          <ul className="divide-y" data-testid="accounts-list">
            {accounts.map((acct) => (
              <li
                key={acct.id}
                className="flex items-center justify-between py-3"
              >
                <span className="text-sm font-medium">{acct.label}</span>
                <button
                  onClick={() => setConfirmId(acct.id)}
                  className="text-xs text-red-600 hover:underline"
                  data-testid="delete-account-btn"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmId && (
        <ConfirmDialog
          message="Delete this account and all its transactions? This cannot be undone."
          onConfirm={() => deleteMutation.mutate(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
