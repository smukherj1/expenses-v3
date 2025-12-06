import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { GetTransactionsRequest, GetTransactionsResponse } from "src/lib/models/transactions"
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Transactions {
  private http = inject(HttpClient);

  getTransactions(request: GetTransactionsRequest): Observable<GetTransactionsResponse> {
    const params = new HttpParams();
    if (request.fromDate) {
      params.set('fromDate', formatDate(request.fromDate));
    }
    if (request.toDate) {
      params.set('toDate', formatDate(request.toDate));
    }
    if (request.description) {
      params.set('description', request.description);
    }
    if (request.institution) {
      params.set('institution', request.institution);
    }
    if (request.tag) {
      params.set('tag', request.tag);
    }
    if (request.fromAmount) {
      params.set('fromAmount', request.fromAmount.toString());
    }
    if (request.toAmount) {
      params.set('toAmount', request.toAmount.toString());
    }
    if (request.pageSize) {
      params.set('pageSize', request.pageSize.toString());
    }
    if (request.nextPageToken) {
      params.set('nextPageToken', request.nextPageToken);
    }
    return this.http.get<GetTransactionsResponse>('/api/transactions', {
      params
    });
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  // Months are 0-indexed, so add 1 and pad with '0' if single digit
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // Pad with '0' if day is a single digit
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}/${month}/${day}`;
}