import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRules,
  createRule,
  deleteRule,
  applyRule,
  applyAllRules,
  type ConditionInput,
} from "../api/rules.ts";
import { getTags, createTag } from "../api/tags.ts";

const MATCH_FIELDS = ["description", "amount"] as const;
const MATCH_TYPES = ["contains", "exact", "regex", "gt", "lt"] as const;

const emptyCondition = (): ConditionInput => ({
  matchField: "description",
  matchType: "contains",
  matchValue: "",
});

export default function RulesPage() {
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: getRules,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 5 * 60_000,
  });

  const [showForm, setShowForm] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [conditions, setConditions] = useState<ConditionInput[]>([
    emptyCondition(),
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [applyResults, setApplyResults] = useState<
    Record<string, { matched: number; tagged: number }>
  >({});

  const createMutation = useMutation({
    mutationFn: async () => {
      let tagId = selectedTagId;
      if (!tagId && newTagName.trim()) {
        const tag = await createTag(newTagName.trim());
        tagId = tag.id;
      }
      if (!tagId) throw new Error("Select or create a tag");
      return createRule(tagId, conditions);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      setShowForm(false);
      setSelectedTagId("");
      setNewTagName("");
      setConditions([emptyCondition()]);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });

  const applyMutation = useMutation({
    mutationFn: applyRule,
    onSuccess: (data, ruleId) => {
      setApplyResults((prev) => ({ ...prev, [ruleId]: data }));
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const applyAllMutation = useMutation({
    mutationFn: applyAllRules,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });

  function updateCondition(
    i: number,
    field: keyof ConditionInput,
    value: string,
  ) {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)),
    );
  }

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Auto-Tag Rules</h1>
        <div className="flex gap-3">
          <button
            onClick={() => applyAllMutation.mutate()}
            disabled={applyAllMutation.isPending || rules.length === 0}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            data-testid="apply-all-rules-btn"
          >
            Apply all rules
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            data-testid="new-rule-btn"
          >
            + New rule
          </button>
        </div>
      </div>

      {/* Create rule form */}
      {showForm && (
        <div
          className="bg-white rounded-xl border p-5 mb-6"
          data-testid="create-rule-form"
        >
          <h2 className="font-semibold text-gray-800 mb-4">New Rule</h2>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Apply tag
            </label>
            <div className="flex gap-2">
              <select
                value={selectedTagId}
                onChange={(e) => {
                  setSelectedTagId(e.target.value);
                  if (e.target.value) setNewTagName("");
                }}
                className="border rounded-lg px-3 py-1.5 text-sm flex-1"
                data-testid="rule-tag-select"
              >
                <option value="">— select existing tag —</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-400 self-center">
                or create
              </span>
              <input
                type="text"
                placeholder="new tag name"
                value={newTagName}
                onChange={(e) => {
                  setNewTagName(e.target.value);
                  if (e.target.value) setSelectedTagId("");
                }}
                className="border rounded-lg px-3 py-1.5 text-sm"
                data-testid="rule-new-tag-input"
              />
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <label className="block text-xs text-gray-500">
              Conditions (all must match — AND)
            </label>
            {conditions.map((c, i) => (
              <div
                key={i}
                className="flex gap-2 items-center"
                data-testid="condition-row"
              >
                <select
                  value={c.matchField}
                  onChange={(e) =>
                    updateCondition(i, "matchField", e.target.value)
                  }
                  className="border rounded-lg px-2 py-1.5 text-sm"
                  data-testid="condition-field"
                >
                  {MATCH_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  value={c.matchType}
                  onChange={(e) =>
                    updateCondition(i, "matchType", e.target.value)
                  }
                  className="border rounded-lg px-2 py-1.5 text-sm"
                  data-testid="condition-type"
                >
                  {MATCH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="value"
                  value={c.matchValue}
                  onChange={(e) =>
                    updateCondition(i, "matchValue", e.target.value)
                  }
                  className="border rounded-lg px-3 py-1.5 text-sm flex-1"
                  data-testid="condition-value"
                />
                {conditions.length > 1 && (
                  <button
                    onClick={() =>
                      setConditions((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                    className="text-red-400 hover:text-red-600 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setConditions((prev) => [...prev, emptyCondition()])
              }
              className="text-sm text-blue-600 hover:underline"
            >
              + Add condition
            </button>
          </div>

          {formError && (
            <p
              className="text-sm text-red-600 mb-3"
              data-testid="rule-form-error"
            >
              {formError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              data-testid="rule-submit-btn"
            >
              Create rule
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : rules.length === 0 ? (
        <div
          className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm"
          data-testid="rules-empty"
        >
          No rules yet. Create one to auto-tag transactions on upload.
        </div>
      ) : (
        <div className="space-y-3" data-testid="rules-list">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white rounded-xl border p-5"
              data-testid="rule-card"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 mb-2">
                    Tag:{" "}
                    <span className="text-blue-700">
                      {tagMap[rule.tagId] ?? rule.tagId}
                    </span>
                  </p>
                  <div className="space-y-1">
                    {rule.conditions.map((c) => (
                      <p key={c.id} className="text-xs text-gray-500">
                        <span className="font-medium text-gray-700">
                          {c.matchField}
                        </span>{" "}
                        {c.matchType}{" "}
                        <span className="font-mono bg-gray-100 px-1 rounded">
                          {c.matchValue}
                        </span>
                      </p>
                    ))}
                  </div>

                  {applyResults[rule.id] && (
                    <p
                      className="text-xs text-green-700 mt-2"
                      data-testid={`apply-result-${rule.id}`}
                    >
                      Applied: matched {applyResults[rule.id].matched}, tagged{" "}
                      {applyResults[rule.id].tagged}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => applyMutation.mutate(rule.id)}
                    disabled={applyMutation.isPending}
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    data-testid="apply-rule-btn"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(rule.id)}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    data-testid="delete-rule-btn"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
