package com.github.smukherj1.expenses.server.models;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TransactionStore extends JpaRepository<Transaction, Long> {
}
