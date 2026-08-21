package br.com.absono.common

class ApiResponse<T> {
    boolean success
    String message
    T data

    static <T> ApiResponse<T> ok(T data) {
        new ApiResponse<>(success: true, data: data)
    }

    static <T> ApiResponse<T> ok(String message, T data) {
        new ApiResponse<>(success: true, message: message, data: data)
    }

    static <T> ApiResponse<T> error(String message) {
        new ApiResponse<>(success: false, message: message)
    }

    static <T> ApiResponse<T> error(int status, String message) {
        new ApiResponse<>(success: false, message: message)
    }
}
