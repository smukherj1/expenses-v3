package com.github.smukherj1.expenses.server.models;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
public class Transaction {

    @Getter
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    @Getter
    @com.fasterxml.jackson.annotation.JsonFormat(pattern = "yyyy/MM/dd")
    private LocalDate date;
    @Getter
    private String description;
    private BigDecimal amount;
    @Getter
    private String institution;
    @Getter
    private String tag;

    protected Transaction() {
    }

    public Transaction(LocalDate date, String description, BigDecimal amount, String institution, String tag) {
        this.date = date;
        this.description = description;
        this.amount = amount;
        this.institution = institution;
        this.tag = tag;
    }

    @Override
    public String toString() {
        return String.format("Txn[id=%d, date=%s, desc=%s, amt=%f, src=%s, tag=%s]",
                this.id, this.date.toString(), this.description, this.amount, this.institution, this.tag);
    }

}
