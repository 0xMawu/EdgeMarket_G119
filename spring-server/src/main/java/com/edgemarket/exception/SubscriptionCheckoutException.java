package com.edgemarket.exception;

public class SubscriptionCheckoutException extends RuntimeException {
    public SubscriptionCheckoutException(String message, Throwable cause) {
        super(message, cause);
    }
}
