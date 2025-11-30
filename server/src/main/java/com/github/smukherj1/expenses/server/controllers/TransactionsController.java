package com.github.smukherj1.expenses.server.controllers;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TransactionsController {
    @GetMapping("/transactions")
    public String searchTransactions() {
        return "all transactions";
    }
}
