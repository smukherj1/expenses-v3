interface Props {
  name: string;
  onRemove?: () => void;
}

export default function TagBadge({ name, onRemove }: Props) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-blue-500 hover:text-blue-800 leading-none"
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
