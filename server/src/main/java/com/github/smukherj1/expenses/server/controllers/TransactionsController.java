package com.github.smukherj1.expenses.server.controllers;

import com.github.smukherj1.expenses.server.api.TransactionSearchCriteria;
import com.github.smukherj1.expenses.server.api.Transaction;
import com.github.smukherj1.expenses.server.controllers.errors.BadRequestException;
import com.github.smukherj1.expenses.server.models.TransactionModel;
import com.github.smukherj1.expenses.server.models.TransactionSpecs;
import com.github.smukherj1.expenses.server.models.TransactionStore;
import jakarta.validation.Valid;
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
    public List<Transaction> getTransactions(@Valid TransactionSearchCriteria criteria) {
        logger.info("GET /transactions: fromDate={}, toDate={}, description={}, fromAmount={}, toAmount={}, institution={}, tag={}",
                criteria.getFromDate(), criteria.getToDate(), criteria.getDescription(), criteria.getFromAmount(), criteria.getToAmount(),
                criteria.getInstitution(), criteria.getTag()
                );
        return txnsModelsToAPI(this.transactionStore.findAll(TransactionSpecs.search(criteria)));
    }

    @PostMapping("/transactions")
    public List<Transaction> postTransactions(@RequestBody List<Transaction> newTransactions) {
        validateTransactionsForCreation(newTransactions);

        var addedTxnModels = this.transactionStore.saveAll(
                txnsAPIToModels(newTransactions)
        );
        return txnsModelsToAPI(addedTxnModels);
    }

    @DeleteMapping("/transactions")
    public void deleteTransactions() {
        this.transactionStore.deleteAll();
    }

    private static List<TransactionModel> txnsAPIToModels(List<Transaction> txns) {
        return txns.stream().map(TransactionModel::new).toList();
    }

    private static List<Transaction> txnsModelsToAPI(List<TransactionModel> tms) {
        logger.info("TxnsModelsToAPI: {} transactions", tms.size());
        return tms.stream().map(t -> {
            return new Transaction(
                    t.getId(),
                    t.getDate(),
                    t.getDescription(),
                    t.getAmount(),
                    t.getInstitution(),
                    t.getTag());
        }).toList();
    }

    private static void validateTransactionForCreation(int index, Transaction t) {
        if (t.getId() != null) {
            throw new BadRequestException(String.format("[%d] id can't be set", index));
        }
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
