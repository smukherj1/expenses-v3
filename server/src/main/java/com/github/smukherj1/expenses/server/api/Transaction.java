package com.github.smukherj1.expenses.server.api;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

public class Transaction {
    @Getter
    @Setter
    Long id;

    @Getter
    @Setter
    @com.fasterxml.jackson.annotation.JsonFormat(pattern = "yyyy/MM/dd")
    private LocalDate date;

    @Getter
    @Setter
    private String description;

    @Getter
    @Setter
    private BigDecimal amount;

    @Getter
    @Setter
    private String institution;

    @Getter
    @Setter
    private String tag;

    public Transaction(Long id, LocalDate date, String description, BigDecimal amount, String institution, String tag) {
        this.id = id;
        this.date = date;
        this.description = description;
        this.amount = amount;
        this.institution = institution;
        this.tag = tag;
    }
}
