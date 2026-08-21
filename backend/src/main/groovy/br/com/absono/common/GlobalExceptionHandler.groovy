package br.com.absono.common

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler)

    @ExceptionHandler(ResourceNotFoundException)
    ResponseEntity<Map> handleNotFound(ResourceNotFoundException ex) {
        log.warn("Recurso não encontrado: {}", ex.message)
        ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body([success: false, message: ex.message])
    }

    @ExceptionHandler(BusinessException)
    ResponseEntity<Map> handleBusiness(BusinessException ex) {
        log.warn("Regra de negócio violada: {}", ex.message)
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body([success: false, message: ex.message])
    }

    @ExceptionHandler(AuthException)
    ResponseEntity<Map> handleAuth(AuthException ex) {
        log.warn("Erro de autenticação: {}", ex.message)
        ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body([success: false, message: ex.message])
    }

    @ExceptionHandler(AccessDeniedException)
    ResponseEntity<Map> handleAccessDenied(AccessDeniedException ex) {
        log.warn("Acesso negado: {}", ex.message)
        ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body([success: false, message: ex.message])
    }

    @ExceptionHandler(MethodArgumentNotValidException)
    ResponseEntity<Map> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.bindingResult.fieldErrors.collect { it.defaultMessage }.join(', ')
        log.warn("Validação falhou: {}", message)
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body([success: false, message: message])
    }

    @ExceptionHandler(Exception)
    ResponseEntity<Map> handleGeneric(Exception ex) {
        log.error("Erro interno do servidor", ex)
        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body([success: false, message: 'Erro interno do servidor'])
    }
}

class ResourceNotFoundException extends RuntimeException {
    ResourceNotFoundException(String message) {
        super(message)
    }
}

class BusinessException extends RuntimeException {
    BusinessException(String message) {
        super(message)
    }
}

class AuthException extends RuntimeException {
    AuthException(String message) {
        super(message)
    }
}

class AccessDeniedException extends RuntimeException {
    AccessDeniedException(String message) {
        super(message)
    }
}
