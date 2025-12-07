import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  RowSelectionState,
  useReactTable,
  PaginationState,
  OnChangeFn,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table-pagination'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  getRowId?: (row: TData) => string
  onRowIdSelectionChange?: (rowIDs: string[]) => void
  paginationState?: PaginationState
  setPaginationState?: OnChangeFn<PaginationState>
  className?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  onRowIdSelectionChange,
  paginationState,
  setPaginationState,
  className,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onPaginationChange: setPaginationState,
    state: {
      rowSelection,
      pagination: paginationState,
    },
    initialState: {
      // Ignored when paginationState is passed in via props.
      pagination: {
        pageSize: 25,
      },
    },
  })

  React.useEffect(() => {
    if (!getRowId || !onRowIdSelectionChange) {
      return
    }
    onRowIdSelectionChange(
      table.getFilteredSelectedRowModel().rows.map((row) => row.id),
    )
  }, [rowSelection, getRowId, onRowIdSelectionChange])

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length
  const totalRowCount = table.getFilteredRowModel().rows.length
  const pageSize = table.getState().pagination.pageSize
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const canPreviousPage = table.getCanPreviousPage()
  const canNextPage = table.getCanNextPage()

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <DataTablePagination
        selectedRowCount={selectedRowCount}
        totalRowCount={totalRowCount}
        pageSize={pageSize}
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={canPreviousPage}
        canNextPage={canNextPage}
        setPageIndex={table.setPageIndex}
        setPageSize={table.setPageSize}
        previousPage={table.previousPage}
        nextPage={table.nextPage}
      />
    </div>
  )
}
