package com.github.smukherj1.expenses.server.models;

import com.github.smukherj1.expenses.server.api.TransactionSearchCriteria;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class TransactionSpecs {

    public static Specification<TransactionModel> search(TransactionSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (criteria.getFromDate() != null) {
                predicates
                        .add(criteriaBuilder.greaterThanOrEqualTo(root.get("date").as(LocalDate.class),
                                criteria.getFromDate()));
            }
            if (criteria.getToDate() != null) {
                predicates.add(
                        criteriaBuilder.lessThanOrEqualTo(root.get("date").as(LocalDate.class), criteria.getToDate()));
            }
            if (criteria.getDescription() != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("description")),
                        "%" + criteria.getDescription().toLowerCase() + "%"));
            }
            if (criteria.getFromAmount() != null) {
                predicates.add(criteriaBuilder.greaterThanOrEqualTo(root.get("amount").as(BigDecimal.class),
                        criteria.getFromAmount()));
            }
            if (criteria.getToAmount() != null) {
                predicates.add(criteriaBuilder.lessThanOrEqualTo(root.get("amount").as(BigDecimal.class),
                        criteria.getToAmount()));
            }
            if (criteria.getInstitution() != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("institution")),
                        "%" + criteria.getInstitution().toLowerCase() + "%"));
            }
            if (criteria.getTag() != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("tag")),
                        "%" + criteria.getTag().toLowerCase() + "%"));
            }
            return criteriaBuilder.and(predicates);
        };
    }
}
