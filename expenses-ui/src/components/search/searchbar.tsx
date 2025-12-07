import * as React from 'react'
import DatePicker from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedCallback } from 'use-debounce'
import { cn } from '@/lib/utils'
import { DateAsString, DateFromString } from '@/lib/date'
import { z } from 'zod/v4'

export const SearchBarParamsSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  description: z.string().optional(),
  fromAmount: z.number().optional(),
  toAmount: z.number().optional(),
  institution: z.string().optional(),
  tag: z.string().optional(),
  pageSize: z.number().optional(),
  pageIndex: z.number().optional(),
})

export type SearchBarParams = z.infer<typeof SearchBarParamsSchema>

export type Props = {
  params: SearchBarParams
  onParamsChange: (newParams: SearchBarParams) => void
  className?: string
}

export default function SearchBar({
  params,
  onParamsChange,
  className,
}: Props) {
  const [fromDate, setFromDate] = React.useState(
    params.fromDate !== undefined ? DateFromString(params.fromDate) : undefined,
  )
  const [toDate, setToDate] = React.useState(
    params.toDate !== undefined ? DateFromString(params.toDate) : undefined,
  )
  const [description, setDescription] = React.useState(params.description)
  const [fromAmount, setFromAmount] = React.useState(params.fromAmount)
  const [toAmount, setToAmount] = React.useState(params.toAmount)
  const [institution, setInstitution] = React.useState(params.institution)
  const [tag, setTag] = React.useState(params.tag)

  const debouncedSearch = useDebouncedCallback(() => {
    onParamsChange({
      fromDate: fromDate ? DateAsString(fromDate) : undefined,
      toDate: toDate ? DateAsString(toDate) : undefined,
      description,
      fromAmount,
      toAmount,
      institution,
      tag,
    })
  }, 300)
  const isInitialMount = React.useRef(true)
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    debouncedSearch()
  }, [
    fromDate,
    toDate,
    description,
    fromAmount,
    toAmount,
    institution,
    tag,
    debouncedSearch,
  ])

  return (
    <div
      className={cn(
        'flex flex-row items-center gap-4 p-4 rounded-xl bg-card shadow-xl',
        className,
      )}
    >
      <Label className="text-lg mx-4">Search for transactions</Label>
      <div className="flex flex-1 flex-row justify-center items-center gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="from-date">From</Label>
          <DatePicker id="from-date" date={fromDate} setDate={setFromDate} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="to-date">To</Label>
          <DatePicker id="to-date" date={toDate} setDate={setToDate} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="desc">Description</Label>
          <Input
            id="desc"
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-l-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fromAmount">From Amount</Label>
          <Input
            id="fromAmount"
            type="number"
            value={fromAmount ?? ''}
            onChange={(e) => {
              const num = parseFloat(e.target.value)
              setFromAmount(isNaN(num) ? undefined : num)
            }}
            className="rounded-l-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="toAmount">To Amount</Label>
          <Input
            id="toAmount"
            type="number"
            value={toAmount ?? ''}
            onChange={(e) => {
              const num = parseFloat(e.target.value)
              setToAmount(isNaN(num) ? undefined : num)
            }}
            className="rounded-l-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="inst">Institution</Label>
          <Input
            id="institution"
            value={institution ?? ''}
            onChange={(e) => setInstitution(e.target.value)}
            className="rounded-l-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="inst">Tag</Label>
          <Input
            id="tag"
            value={tag ?? ''}
            onChange={(e) => setTag(e.target.value)}
            className="rounded-l-none"
          />
        </div>
      </div>
    </div>
  )
}
