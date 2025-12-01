package com.github.smukherj1.expenses.server.controllers;

import com.github.smukherj1.expenses.server.models.Transaction;
import com.github.smukherj1.expenses.server.models.TransactionStore;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
public class TransactionsController {
    private final TransactionStore transactionStore;

    TransactionsController(TransactionStore transactionStore) {
        this.transactionStore = transactionStore;
    }

    @GetMapping("/transactions")
    public List<Transaction> getTransactions() {
        return this.transactionStore.findAll();
    }

    @PostMapping("/transactions")
    public List<Transaction> postTransactions(@RequestBody List<Transaction> newTransactions) {
        return this.transactionStore.saveAll(newTransactions);
    }

    @DeleteMapping("/transactions")
    public void deleteTransactions() {
        this.transactionStore.deleteAll();
    }
}
