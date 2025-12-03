package com.github.smukherj1.expenses.server.models;

import jakarta.persistence.criteria.Predicate;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.jpa.domain.Specification;

import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class TransactionSpecs {
    public static class SearchCriteria {
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
        String description;

        @Getter
        @Setter
        BigDecimal fromAmount;

        @Getter
        @Setter
        BigDecimal toAmount;

        @Getter
        @Setter
        String institution;

        @Getter
        @Setter
        String tag;
    }

    public static Specification<TransactionModel> search(SearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (criteria.fromDate != null) {
                predicates
                        .add(criteriaBuilder.greaterThanOrEqualTo(root.get("date").as(LocalDate.class),
                                criteria.fromDate));
            }
            if (criteria.toDate != null) {
                predicates.add(
                        criteriaBuilder.lessThanOrEqualTo(root.get("date").as(LocalDate.class), criteria.toDate));
            }
            if (criteria.description != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("description")),
                        "%" + criteria.description.toLowerCase() + "%"));
            }
            if (criteria.fromAmount != null) {
                predicates.add(criteriaBuilder.greaterThanOrEqualTo(root.get("amount").as(BigDecimal.class),
                        criteria.fromAmount));
            }
            if (criteria.toAmount != null) {
                predicates.add(criteriaBuilder.lessThanOrEqualTo(root.get("amount").as(BigDecimal.class),
                        criteria.toAmount));
            }
            if (criteria.institution != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("institution")),
                        "%" + criteria.institution.toLowerCase() + "%"));
            }
            if (criteria.tag != null) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("tag")),
                        "%" + criteria.tag.toLowerCase() + "%"));
            }
            return criteriaBuilder.and(predicates);
        };
    }
}
