import * as React from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { z } from 'zod/v4'
import { TxnSearchRequestSchema } from '@/lib/transactions'
import { TransactionsService } from '@/lib/server/transactions'
import SearchBar, { SearchBarParamsSchema } from '@/components/search/searchbar'
import EditBar from '@/components/search/editbar'
import { SearchBarParams } from '@/components/search/searchbar'
import { TransactionsTable } from '@/components/search/transactions-table'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

const defaultPageSize = 25

const GetTxnsServerFn = createServerFn({
  method: 'GET',
})
  .inputValidator(TxnSearchRequestSchema)
  .handler(async ({ data }) => {
    return TransactionsService.searchTransactions(data)
  })

const updateTxnsTagSchema = z.object({
  txnIds: z.array(z.number()),
  tag: z.string().nullable(),
})

const UpdateTxnsTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(updateTxnsTagSchema)
  .handler(async () => {
    throw new Error('Updating transactions not implemented yet')
  })

export const Route = createFileRoute('/')({
  validateSearch: SearchBarParamsSchema,
  loaderDeps: ({ search }) => {
    return search
  },
  loader: async ({ deps }) => {
    return GetTxnsServerFn({ data: deps })
  },
  component: Search,
  errorComponent: (props) => {
    return (
      <>
        <span>Error loading search page:</span>
        <p>{props.error.message}</p>
      </>
    )
  },
})

function SearchOrEditBar({
  selectedTxnIds,
  searchBarParams,
  onSearchBarChange,
  onEditBarSubmit,
}: {
  selectedTxnIds: string[]
  searchBarParams: SearchBarParams
  onSearchBarChange: (newSbp: SearchBarParams) => void
  onEditBarSubmit: (tag: string | null) => void
}) {
  return selectedTxnIds.length > 0 ? (
    <EditBar txnIDs={selectedTxnIds} onSubmit={onEditBarSubmit} />
  ) : (
    <SearchBar params={searchBarParams} onParamsChange={onSearchBarChange} />
  )
}

function Search() {
  const sp = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const data = Route.useLoaderData()
  const router = useRouter()

  const updateTxnsTag = useServerFn(UpdateTxnsTagServerFn)
  const txnsTagMutator = useMutation({
    mutationFn: updateTxnsTag,
    onSuccess: () => router.invalidate(),
    onError: (error) => toast.error(`Failed to update transactions: ${error}`),
  })

  const [selectedTxnIds, setSelectedTxnIds] = React.useState<string[]>([])

  const onSearchBarChange = React.useCallback(
    (newSbp: SearchBarParams) => {
      navigate({
        search: () => newSbp,
      })
    },
    [navigate],
  )

  const onEditBarSubmit = React.useCallback(
    (tag: string | null) => {
      const txnIds = selectedTxnIds
        .map((id) => Number(id))
        .filter((id) => !isNaN(id))
      txnsTagMutator.mutate({
        data: { txnIds, tag: tag },
      })
    },
    [selectedTxnIds],
  )

  console.log(
    `Rendering search page with ${data.transactions.length} txns, nextPageToken=${data.nextPageToken}`,
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <SearchOrEditBar
        selectedTxnIds={selectedTxnIds}
        searchBarParams={sp}
        onSearchBarChange={onSearchBarChange}
        onEditBarSubmit={onEditBarSubmit}
      />
      <TransactionsTable
        data={data.transactions}
        onRowIdSelectionChange={(rowIds) => {
          // Only update the state if the selection has actually changed.
          // Otherwise, it can create an infinite re-render loop because
          // onRowIdSelectionChange is always called when TransactionsTable
          // loads.
          if (
            rowIds.length !== selectedTxnIds.length ||
            JSON.stringify([...rowIds].sort()) !==
              JSON.stringify([...selectedTxnIds].sort())
          ) {
            setSelectedTxnIds(rowIds)
          }
        }}
        defaultPageSize={defaultPageSize}
      />
    </div>
  )
}
