package com.github.smukherj1.expenses.server.models;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface TransactionStore extends JpaRepository<TransactionModel, Long>, JpaSpecificationExecutor<TransactionModel> {
}
