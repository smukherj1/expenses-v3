
export interface Transaction {
    id: string;
    userId: string;
    date: Date;
    description: string;
    amount: number;
    source: string;
    tag: string;
}