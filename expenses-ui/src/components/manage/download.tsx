import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import DatePicker from '@/components/date-picker'
import { Label } from '@/components/ui/label'

export default function Component() {
  const [from, setFrom] = useState<Date | undefined>(new Date('2010-01-01'))
  const [to, setTo] = useState<Date | undefined>(new Date())

  let validation: { error: boolean; message: string | null } = {
    error: false,
    message: null,
  }
  if (!from || !to) {
    validation = {
      error: true,
      message: 'Please select both from and to dates.',
    }
  } else if (from > to) {
    validation = { error: true, message: 'From date cannot be after To date.' }
  }

  return (
    <Card className="w-96 md:w-240">
      <CardHeader>
        <CardTitle>Download</CardTitle>
        <CardDescription>Download transactions as JSON.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="grid gap-2">
              <Label>From</Label>
              <DatePicker date={from} setDate={setFrom} />
            </div>
            <div className="grid gap-2">
              <Label>To</Label>
              <DatePicker date={to} setDate={setTo} />
            </div>
          </div>
          {validation.error && (
            <p className="text-sm text-red-500">{validation.message}</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          className="w-28"
          disabled={validation.error}
          onClick={async () => {
            if (validation.error || !from || !to) {
              return
            }
            const params = new URLSearchParams({
              fromDate: from.toISOString(),
              toDate: to.toISOString(),
            })
            const a = document.createElement('a')
            a.href = `/api/transactions?${params}`
            a.download = 'transactions.json'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          }}
        >
          Download
        </Button>
      </CardFooter>
    </Card>
  )
}
