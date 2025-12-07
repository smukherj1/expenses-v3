package com.github.smukherj1.expenses.server.controllers;

import com.github.smukherj1.expenses.server.api.TransactionSearchRequest;
import com.github.smukherj1.expenses.server.api.Transaction;
import com.github.smukherj1.expenses.server.api.TransactionSearchResult;
import com.github.smukherj1.expenses.server.controllers.errors.BadRequestException;
import com.github.smukherj1.expenses.server.models.TransactionModel;
import com.github.smukherj1.expenses.server.models.TransactionSpecs;
import com.github.smukherj1.expenses.server.models.TransactionStore;
import com.github.smukherj1.expenses.server.services.KeysetScrollPositionService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.KeysetScrollPosition;
import org.springframework.data.domain.ScrollPosition;
import org.springframework.data.domain.Window;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.IntStream;

@RestController
@RequestMapping("/v1/transactions")
public class TransactionsController {
    private static final Integer defaultPageSize = 1000;
    private static final Logger logger = LoggerFactory.getLogger(TransactionsController.class);
    private final TransactionStore transactionStore;
    private final KeysetScrollPositionService scrollPositionService;

    TransactionsController(
            TransactionStore transactionStore,
            KeysetScrollPositionService keysetScrollPositionService
            ) {
        this.transactionStore = transactionStore;
        this.scrollPositionService = keysetScrollPositionService;
    }

    @GetMapping
    public TransactionSearchResult getTransactions(@Valid TransactionSearchRequest request) {
        logger.info(
                "getTransactions: fromDate={}, toDate={}, description={}, fromAmount={}, toAmount={}, institution={}, tag={}, pageToken={}",
                request.getFromDate(), request.getToDate(), request.getDescription(), request.getFromAmount(),
                request.getToAmount(),
                request.getInstitution(), request.getTag(), request.getPageToken());
        // Build DB query from request.
        var spec = TransactionSpecs.search(request);
        var pageSize = request.getPageSize() == null ? defaultPageSize : request.getPageSize();
        ScrollPosition pos;
        try {
            pos = scrollPositionService.decode(request.getPageToken());
        } catch (RuntimeException e) {
            throw new BadRequestException(String.format("Invalid pageToken: %s", e.getMessage()));
        }

        // Query DB.
        var window = transactionStore.findBy(
                spec,
                q -> q.sortBy(
                        TransactionSpecs.scrollOrder()).limit(pageSize).scroll(pos));

        // Process query results and create response.
        return windowToSearchResult(window);
    }

    private TransactionSearchResult windowToSearchResult(Window<TransactionModel> w) {
        var transactions = w.stream().map(tm -> {
            return new Transaction(tm.getId(),
                    tm.getDate(),
                    tm.getDescription(),
                    tm.getAmount(),
                    tm.getInstitution(),
                    tm.getTag());
        }).toList();
        if(!w.hasNext()) {
            return new TransactionSearchResult(transactions, null);
        }
        ScrollPosition last = w.positionAt(w.size() - 1);
        if(!(last instanceof KeysetScrollPosition)) {
            logger.error("Got query results with cursor of type {} that's not a KeysetScrollPosition", last.getClass().getName());
        }
        KeysetScrollPosition lastKSP = (KeysetScrollPosition) last;
        try {
            return new TransactionSearchResult(
                    transactions,
                    scrollPositionService.encode(lastKSP));
        } catch (RuntimeException e) {
            logger.error("Error encoding scroll position to nextPageToken string: {}", e.getMessage());
        }
        return new TransactionSearchResult(transactions, null);
    }

    @PostMapping
    public List<Transaction> postTransactions(@RequestBody List<Transaction> newTransactions) {
        validateTransactionsForCreation(newTransactions);

        var addedTxnModels = this.transactionStore.saveAll(
                txnsAPIToModels(newTransactions));
        return txnsModelsToAPI(addedTxnModels);
    }

    @DeleteMapping
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
        } else if (t.getDescription().length() == 0 || t.getDescription().length() > 100) {
            throw new BadRequestException(
                    String.format("[%d] description must be between 1 and 100 characters, got %d characters", index,
                            t.getDescription().length()));
        }
        if (t.getInstitution() == null) {
            throw new BadRequestException(String.format("[%d] institution is null", index));
        } else if (t.getInstitution().length() == 0 || t.getInstitution().length() > 100) {
            throw new BadRequestException(
                    String.format("[%d] institution must be between 1 and 100 characters, got %d characters", index,
                            t.getInstitution().length()));
        }
        if (t.getAmount() == null) {
            throw new BadRequestException(String.format("[%d] amount is null", index));
        }
        if (t.getTag() == null) {
            throw new BadRequestException(String.format("[%d] tag is null", index));
        } else if (t.getTag().length() == 0 || t.getTag().length() > 100) {
            throw new BadRequestException(
                    String.format("[%d] tag must be between 1 and 100 characters, got %d characters", index,
                            t.getTag().length()));
        }
    }

    private static void validateTransactionsForCreation(List<Transaction> txns) {
        IntStream.range(0, txns.size()).forEach((i) -> {
            validateTransactionForCreation(i, txns.get(i));
        });
    }
}
