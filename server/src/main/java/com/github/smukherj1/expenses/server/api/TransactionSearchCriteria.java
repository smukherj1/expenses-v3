package com.github.smukherj1.expenses.server.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public class TransactionSearchCriteria {
    @Getter
    @Setter
    @DateTimeFormat(pattern = "yyyy/MM/dd")
    LocalDate fromDate;

    @Getter
    @Setter
    @DateTimeFormat(pattern = "yyyy/MM/dd")
    LocalDate toDate;

    @Getter
    @Setter
    @Size(min=1, max = 10)
    String description;

    @Getter
    @Setter
    BigDecimal fromAmount;

    @Getter
    @Setter
    BigDecimal toAmount;

    @Getter
    @Setter
    @Size(min = 1, max = 100)
    String institution;

    @Getter
    @Setter
    @Size(min = 1, max = 100)
    String tag;
}
