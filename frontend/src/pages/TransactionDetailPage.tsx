import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "../api/transactions.ts";
import TagBadge from "../components/TagBadge.tsx";
import ConfirmDialog from "../components/ConfirmDialog.tsx";

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tagInput, setTagInput] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const { data: txn, isLoading } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => getTransaction(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (tags: string[]) => updateTransaction(id!, { tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transaction", id] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id!),
    onSuccess: () => navigate("/transactions"),
  });

  function addTag() {
    const name = tagInput.trim();
    if (!name || !txn) return;
    const existing = txn.tags ?? [];
    if (!existing.includes(name)) {
      updateMutation.mutate([...existing, name]);
    }
    setTagInput("");
  }

  function removeTag(name: string) {
    if (!txn) return;
    updateMutation.mutate((txn.tags ?? []).filter((t) => t !== name));
  }

  if (isLoading) return <div className="text-gray-400 text-sm">Loading…</div>;
  if (!txn)
    return <div className="text-red-600 text-sm">Transaction not found</div>;

  return (
    <div className="max-w-xl">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Transaction Detail
      </h1>

      <div
        className="bg-white rounded-xl border p-6 space-y-4"
        data-testid="transaction-detail"
      >
        <div>
          <p className="text-xs text-gray-500">Date</p>
          <p className="font-medium">{txn.date}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Description</p>
          <p className="font-medium">{txn.description}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Amount</p>
          <p
            className={`font-bold text-lg ${txn.amount >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {txn.amount >= 0 ? "+" : ""}
            {txn.amount.toFixed(2)} {txn.currency}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Tags</p>
          <div className="flex flex-wrap gap-2 mb-3" data-testid="tag-list">
            {(txn.tags ?? []).length === 0 ? (
              <span className="text-sm text-gray-400">No tags</span>
            ) : (
              (txn.tags ?? []).map((name) => (
                <TagBadge
                  key={name}
                  name={name}
                  onRemove={() => removeTag(name)}
                />
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              className="border rounded-lg px-3 py-1.5 text-sm flex-1"
              data-testid="tag-add-input"
            />
            <button
              onClick={addTag}
              disabled={updateMutation.isPending}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              data-testid="tag-add-btn"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={() => setShowDelete(true)}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
          data-testid="delete-transaction-btn"
        >
          Delete transaction
        </button>
      </div>

      {showDelete && (
        <ConfirmDialog
          message="Delete this transaction? This cannot be undone."
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
