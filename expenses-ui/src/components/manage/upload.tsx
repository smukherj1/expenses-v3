import { TxnUploadRequestSchema } from '@/lib/transactions'
import { formatZodError } from '@/lib/zodutils'
import { useMutation } from '@tanstack/react-query'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const uploadTxns = createServerFn({
  method: 'POST',
})
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error('Invalid form data')
    }
    const file = data.get('json-file')
    if (!(file instanceof File)) {
      throw new Error('Did not receive a valid file in uploaded form')
    }
    return {
      file: file,
    }
  })
  .handler(async ({ data: { file } }): Promise<number> => {
    const contents = await file.text()
    var json: any
    try {
      json = JSON.parse(contents, (key, value) => {
        if (key === 'date' && typeof value === 'string') {
          return new Date(value)
        }
        return value
      })
    } catch (error) {
      throw new Error(`invalid JSON file: ${error}`)
    }
    const result = TxnUploadRequestSchema.safeParse(json, { reportInput: true })
    if (!result.success) {
      const errorStr = formatZodError(result.error)
      throw new Error(
        `Transactions JSON did not have the expected schema: ${errorStr}`,
      )
    }
    // var uploaded = 0
    // try {
    //   uploaded = await UploadTxns(context.session, result.data)
    // } catch (error) {
    //   console.log(`Error uploading transactions: ${error}`)
    //   throw new Error('Error saving uploaded transactions to the database')
    // }
    // return uploaded
    throw new Error('Uploading transactions not implemented yet')
  })

export default function Component() {
  const uploader = useMutation({
    mutationFn: useServerFn(uploadTxns),
  })

  return (
    <Card className="w-96 md:w-240">
      <form
        method="post"
        encType="multipart/form-data"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const formData = new FormData(form)
          uploader.mutate({ data: formData })
        }}
        className="flex flex-col gap-y-4"
      >
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
          <CardDescription>
            Upload Transactions from a JSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            id="json-file"
            type="file"
            name="json-file"
            accept=".json"
            required
          />
        </CardContent>
        <CardFooter className="justify-between">
          <div>
            {uploader.isPending && <div className="p-4">Uploading...</div>}
            {uploader.isError && (
              <div className="text-red-500 p-4">{uploader.error.message}</div>
            )}
            {uploader.isSuccess && (
              <div className="text-green-500 p-4">
                Successfully uploaded {uploader.data} transactions.
              </div>
            )}
          </div>
          <Button type="submit" className="w-28">
            Upload
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
