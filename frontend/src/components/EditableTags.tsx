import { useState } from "react";
import TagBadge from "./TagBadge.tsx";

type Props = {
  tags: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  disabled?: boolean;
  testId?: string;
};

export default function EditableTags({
  tags,
  onAdd,
  onRemove,
  disabled = false,
  testId = "editable-tags",
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");

  function submitTag() {
    const next = value.trim();
    if (!next || disabled) return;
    onAdd(next);
    setValue("");
    setIsEditing(false);
  }

  function cancelEdit() {
    setValue("");
    setIsEditing(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <TagBadge
          key={tag}
          name={tag}
          onRemove={() => !disabled && onRemove(tag)}
        />
      ))}
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitTag();
              } else if (e.key === "Escape") {
                cancelEdit();
              }
            }}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
            placeholder="tag"
            disabled={disabled}
            data-testid={`${testId}-input`}
          />
          <button
            type="button"
            onClick={submitTag}
            disabled={disabled}
            className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            data-testid={`${testId}-add`}
          >
            Add
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            data-testid={`${testId}-cancel`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={disabled}
          className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
          data-testid={`${testId}-toggle`}
        >
          + tag
        </button>
      )}
    </div>
  );
}
