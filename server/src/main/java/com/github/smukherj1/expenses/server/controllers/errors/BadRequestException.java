package com.github.smukherj1.expenses.server.controllers.errors;

public class BadRequestException extends RuntimeException {
    public BadRequestException(String msg) {
        super(msg);
    }
}
