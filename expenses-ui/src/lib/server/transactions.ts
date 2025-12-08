import {
  TxnSearchRequest,
  TxnSearchResponse,
  TxnSearchResponseSchema,
} from '@/lib/transactions'
import EnvironmentService from './environment'

const txnServerEndpoint =
  EnvironmentService.getEnvironment().TRANSACTIONS_SERVER_ENDPOINT

// TransactionsService provides methods to interact with the backend transactions server.
export class TransactionsService {
  static async searchTransactions(
    params: TxnSearchRequest,
  ): Promise<TxnSearchResponse> {
    const queryString = this.encodeQueryParams(params)
    const url = `${txnServerEndpoint}?${queryString}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error(
        `Error response from transactions server for GET ${url}: ${response.status} ${await response.text()}`,
      )
      throw new Error(
        `Error searching transactions: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()
    const searchResult = TxnSearchResponseSchema.safeParse(data, {
      reportInput: true,
    })
    if (!searchResult.success) {
      console.error(
        `Invalid response from transactions server for GET ${url}: ${JSON.stringify(searchResult.error.issues)}`,
      )
      throw new Error(
        `Invalid response from transactions server: ${searchResult.error.message}`,
      )
    }
    return searchResult.data
  }

  private static encodeQueryParams<T>(params: T): string {
    const query = new URLSearchParams()
    for (const key in params) {
      const value = (params as any)[key]
      if (value !== undefined && value !== null) {
        query.append(key, value.toString())
      }
    }
    return query.toString()
  }
}
