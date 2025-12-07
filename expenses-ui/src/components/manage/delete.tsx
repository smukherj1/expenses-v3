import { useMutation } from '@tanstack/react-query'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const deleteTxns = createServerFn({
  method: 'POST',
}).handler(async ({}) => {
  throw new Error('Deleting transactions not implemented yet')
})

export default function Component() {
  const deleter = useMutation({ mutationFn: useServerFn(deleteTxns) })

  return (
    <Card className="w-96 md:w-240 border-destructive/50 dark:border-destructive bg-destructive/5 dark:bg-destructive/10">
      <CardHeader>
        <CardTitle className="text-destructive">Delete</CardTitle>
        <CardDescription className="text-destructive/80">
          Delete all transactions.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-between">
        <div>
          {deleter.isPending && <div className="p-4">Deleting...</div>}
          {deleter.isError && (
            <div className="text-red-500 p-4">{deleter.error.message}</div>
          )}
          {deleter.isSuccess && (
            <div className="text-green-500 p-4">
              Successfully deleted {deleter.data} transactions.
            </div>
          )}
        </div>
        <Button
          variant="destructive"
          className="w-28"
          onClick={async () => {
            await deleter.mutate({})
          }}
        >
          Delete
        </Button>
      </CardFooter>
    </Card>
  )
}
