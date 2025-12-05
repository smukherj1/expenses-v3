package com.github.smukherj1.expenses.server.models;

import com.github.smukherj1.expenses.server.api.Transaction;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(indexes = {
        @Index(name = "date_index", columnList = "date")
})
public class TransactionModel {

    @Getter
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(nullable = false)
    private Long id;

    @Getter
    @NotNull
    @Column(nullable = false)
    private LocalDate date;

    @Getter
    @NotNull
    @Column(nullable = false)
    private String description;

    @Getter
    @NotNull
    @Column(nullable = false)
    private BigDecimal amount;

    @Getter
    @NotNull
    @Column(nullable = false)
    private String institution;

    @Getter
    private String tag;

    protected TransactionModel() {
    }

    public TransactionModel(Transaction t) {
        this.date = t.getDate();
        this.description = t.getDescription();
        this.amount = t.getAmount();
        this.institution = t.getInstitution();
        this.tag = t.getTag();
    }

    @Override
    public String toString() {
        return String.format("Txn[id=%d, date=%s, desc=%s, amt=%f, src=%s, tag=%s]",
                this.id, this.date.toString(), this.description, this.amount, this.institution, this.tag);
    }
}
