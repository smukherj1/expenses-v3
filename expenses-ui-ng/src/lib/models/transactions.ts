
export interface Transaction {
    id: string;
    userId: string;
    date: Date;
    description: string;
    amount: number;
    institution: string;
    tag: string;
}

export interface GetTransactionsRequest {
    fromDate?: Date;
    toDate?: Date;
    description?: string;
    institution?: string;
    tag?: string;
    fromAmount?: number;
    toAmount?: number;
    pageSize?: number;
    nextPageToken?: string;
}

export interface GetTransactionsResponse {
    transactions: Transaction[];
    nextPageToken?: string;
}
