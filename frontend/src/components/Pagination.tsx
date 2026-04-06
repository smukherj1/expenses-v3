interface Props {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}

export default function Pagination({ page, total, limit, onPage }: Props) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div
      className="flex items-center gap-2 justify-end mt-4"
      data-testid="pagination"
    >
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
      >
        Prev
      </button>
      <span className="text-sm text-gray-600">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
      >
        Next
      </button>
    </div>
  );
}
