package com.github.smukherj1.expenses.server.controllers;

import com.github.smukherj1.expenses.server.controllers.errors.BadRequestException;
import com.github.smukherj1.expenses.server.models.Transaction;
import com.github.smukherj1.expenses.server.models.TransactionSpecs;
import com.github.smukherj1.expenses.server.models.TransactionStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.IntStream;

@RestController
public class TransactionsController {
    private static final Logger logger = LoggerFactory.getLogger(TransactionsController.class);
    private final TransactionStore transactionStore;

    TransactionsController(TransactionStore transactionStore) {
        this.transactionStore = transactionStore;
    }

    @GetMapping("/transactions")
    public List<Transaction> getTransactions(TransactionSpecs.SearchCriteria criteria) {
        logger.info("GET /transactions: fromDate={}, toDate={}, description={}, fromAmount={}, toAmount={}, institution={}, tag={}",
                criteria.getFromDate(), criteria.getToDate(), criteria.getDescription(), criteria.getFromAmount(), criteria.getToAmount(),
                criteria.getInstitution(), criteria.getTag()
                );
        return this.transactionStore.findAll(TransactionSpecs.search(criteria));
    }

    @PostMapping("/transactions")
    public List<Transaction> postTransactions(@RequestBody List<Transaction> newTransactions) {
        validateTransactionsForCreation(newTransactions);
        return this.transactionStore.saveAll(newTransactions);
    }

    @DeleteMapping("/transactions")
    public void deleteTransactions() {
        this.transactionStore.deleteAll();
    }

    private static void validateTransactionForCreation(int index, Transaction t) {
        if (t.getDate() == null) {
            throw new BadRequestException(String.format("[%d] date is null", index));
        }
        if (t.getDescription() == null) {
            throw new BadRequestException(String.format("[%d] description is null", index));
        }
        if (t.getInstitution() == null) {
            throw new BadRequestException(String.format("[%d] institution is null", index));
        }
        if (t.getAmount() == null) {
            throw new BadRequestException(String.format("[%d] amount is null", index));
        }
        if (t.getTag() == null) {
            throw new BadRequestException(String.format("[%d] tag is null", index));
        }
    }

    private static void validateTransactionsForCreation(List<Transaction> txns) {
        IntStream.range(0, txns.size()).forEach((i) -> {
            validateTransactionForCreation(i, txns.get(i));
        });
    }
}
