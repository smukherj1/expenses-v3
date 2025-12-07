import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Txn } from '@/lib/transactions'
import { DataTable } from '@/components/data-table'
import { Checkbox } from '@/components/ui/checkbox'

function getColumns(): ColumnDef<Txn>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => {
        return <div>{row.getValue('date')}</div>
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
    },
    {
      accessorKey: 'amount',
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue('amount'))
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'CAD',
        }).format(amount)

        return <div className="text-right font-medium">{formatted}</div>
      },
    },
    {
      accessorKey: 'institution',
      header: 'Institution',
    },
    {
      accessorKey: 'tag',
      header: 'Tag',
    },
  ]
}

interface TransactionsTableProps {
  data: Txn[]
  className?: string
  onRowIdSelectionChange?: (rowIds: string[]) => void
  defaultPageSize?: number
}

export function TransactionsTable({
  data,
  className,
  onRowIdSelectionChange,
  defaultPageSize,
}: TransactionsTableProps) {
  const columns = React.useMemo(() => {
    return getColumns()
  }, [])
  return (
    <DataTable
      columns={columns}
      data={data}
      className={className}
      getRowId={(row) => `${row.id}`}
      onRowIdSelectionChange={onRowIdSelectionChange}
      defaultPageSize={defaultPageSize}
    />
  )
}
