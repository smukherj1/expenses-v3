package com.github.smukherj1.expenses.server.api;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

public class TransactionSearchResult {

    @Getter
    @Setter
    List<Transaction> transactions;

    @Getter
    @Setter
    String nextPageToken;

    public TransactionSearchResult(List<Transaction> transactions, String next) {
        this.transactions = transactions;
        this.nextPageToken = next;
    }


}
