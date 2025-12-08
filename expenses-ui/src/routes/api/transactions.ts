import { createFileRoute } from '@tanstack/react-router'
import { TxnSearchRequest, TxnSearchRequestSchema } from '@/lib/transactions'
import { StatusCodes, ReasonPhrases } from 'http-status-codes'
import { TransactionsService } from '@/lib/server/transactions'

function parseGETSearchParams(params: URLSearchParams): TxnSearchRequest {
  const rawParams: Record<string, string | string[] | undefined> = {}
  for (const [key, value] of params.entries()) {
    const allValues = params.getAll(key)
    if (allValues.length > 1) {
      rawParams[key] = allValues
    } else {
      rawParams[key] = value
    }
  }
  return TxnSearchRequestSchema.parse(rawParams, { reportInput: true })
}

async function streamTransactions(
  req: TxnSearchRequest,
  streamController: ReadableStreamDefaultController<any>,
) {
  let nextPageToken: string | undefined = undefined
  let firstChunk = true

  streamController.enqueue('[')

  try {
    while (true) {
      const pageSize = 1000
      console.log(
        `Txns API handler: req: ${JSON.stringify(req)}, pageSize: ${pageSize}, pageToken: ${nextPageToken}`,
      )
      const result = await TransactionsService.searchTransactions({
        ...req,
        pageSize,
        pageToken: nextPageToken,
      })
      console.log(
        `Txns API handler result: req: ${JSON.stringify(req)}, pageSize: ${pageSize}, pageToken: ${nextPageToken}, got ${result.transactions.length} txns, nextPageToken: ${result.nextPageToken}`,
      )

      if (result.transactions.length > 0) {
        if (!firstChunk) {
          streamController.enqueue(',\n')
        }
        streamController.enqueue(
          result.transactions.map((t) => JSON.stringify(t)).join(',\n'),
        )
        firstChunk = false
      }

      if (result.nextPageToken) {
        nextPageToken = result.nextPageToken
      } else {
        break
      }
    }
    streamController.enqueue(']')
    streamController.close()
  } catch (error) {
    console.error(
      `Txns API handler: req: ${JSON.stringify(req)}, stream error: ${error}`,
    )
    streamController.error(error)
  }
}

export const Route = createFileRoute('/api/transactions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)

        var params: TxnSearchRequest

        try {
          params = parseGETSearchParams(url.searchParams)
        } catch (error) {
          return new Response(`${ReasonPhrases.BAD_REQUEST}: ${error}`, {
            status: StatusCodes.BAD_REQUEST,
          })
        }
        const stream = new ReadableStream({
          async start(controller) {
            streamTransactions(params, controller)
          },
        })

        return new Response(stream, {
          headers: { 'Content-Type': 'application/json' },
        })
      }, // End of GET handler.
    }, // End of handlers.
  }, // End of server.
})
