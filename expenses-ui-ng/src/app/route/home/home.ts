import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatNativeDateModule } from '@angular/material/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Transactions } from '../../services/transactions';
import { Transaction } from '../../../lib/models/transactions';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    MatNativeDateModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  private transactionsService = inject(Transactions);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  searchForm = this.fb.group({
    searchQuery: [''], // General search query if needed, or specific fields below
    fromDate: [null as Date | null],
    toDate: [null as Date | null],
    description: [''],
    institution: [''],
    tag: [''],
    fromAmount: [null as number | null],
    toAmount: [null as number | null],
    pageSize: [50],
  });

  transactions = signal<Transaction[]>([]);
  displayedColumns: string[] = ['date', 'description', 'institution', 'amount', 'tag'];
  nextPageToken = signal<string | undefined>(undefined);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      // Patch form values from URL params
      this.searchForm.patchValue({
        fromDate: params['fromDate'] ? new Date(params['fromDate']) : null,
        toDate: params['toDate'] ? new Date(params['toDate']) : null,
        description: params['description'] || '',
        institution: params['institution'] || '',
        tag: params['tag'] || '',
        fromAmount: params['fromAmount'] ? Number(params['fromAmount']) : null,
        toAmount: params['toAmount'] ? Number(params['toAmount']) : null,
        pageSize: params['pageSize'] ? Number(params['pageSize']) : 50,
      }, { emitEvent: false }); // Avoid triggering valueChanges if we listen to it

      // If there are search params, load transactions automatically
      if (Object.keys(params).length > 0) {
        this.loadTransactions();
      }
    });
  }

  search() {
    // Reset transactions and nextPageToken for a new search
    this.transactions.set([]);
    this.nextPageToken.set(undefined);

    // Update URL with search parameters
    const formValue = this.searchForm.value;
    const queryParams: any = { ...formValue };

    // Convert Dates to strings
    if (formValue.fromDate) {
      queryParams.fromDate = this.formatDate(formValue.fromDate);
    }
    if (formValue.toDate) {
      queryParams.toDate = this.formatDate(formValue.toDate);
    }

    // Remove null/undefined/empty string values to keep URL clean
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === null || queryParams[key] === undefined || queryParams[key] === '') {
        delete queryParams[key];
      }
    });
    // Remove searchQuery for now as it wasn't used
    delete queryParams.searchQuery;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge', // or 'replace' depending on preference, likely replace for a fresh search
    }).then(() => {
      // Load transactions after URL update (though we could also do it directly, 
      // doing it here ensures state matches URL if we were relying on route subscription for everything, 
      // but we are calling loadTransactions directly below anyway to be explicit/faster UI feedback)
      this.loadTransactions();
    });
  }

  loadMore() {
    if (this.nextPageToken()) {
      this.loadTransactions(this.nextPageToken());
    }
  }

  private loadTransactions(nextPageToken?: string) {
    const formValue = this.searchForm.value;

    this.transactionsService.getTransactions({
      fromDate: formValue.fromDate || undefined,
      toDate: formValue.toDate || undefined,
      description: formValue.description || undefined,
      institution: formValue.institution || undefined,
      tag: formValue.tag || undefined,
      fromAmount: formValue.fromAmount || undefined,
      toAmount: formValue.toAmount || undefined,
      pageSize: formValue.pageSize || 50,
      nextPageToken: nextPageToken
    }).subscribe({
      next: (response) => {
        if (nextPageToken) {
          // Append to existing
          this.transactions.update(current => [...current, ...response.transactions]);
        } else {
          // Replace
          this.transactions.set(response.transactions);
        }
        this.nextPageToken.set(response.nextPageToken);
      },
      error: (err) => {
        console.error('Error fetching transactions', err);
        // Handle error (optional: show snackbar)
      }
    });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // ISO format for URL
  }
}
