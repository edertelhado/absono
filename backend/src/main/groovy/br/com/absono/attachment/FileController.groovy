package br.com.absono.attachment

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

import java.time.Duration

@RestController
class FileController {

    private static final Duration PRESIGN_DURATION = Duration.ofHours(1)

    private final S3Service s3Service

    FileController(S3Service s3Service) {
        this.s3Service = s3Service
    }

    @GetMapping('/api/files/**')
    void serveFile(HttpServletRequest request,
                   HttpServletResponse response,
                   @RequestParam(required = false) boolean download) {
        String prefix = '/api/files/'
        String rawPath = request.requestURI.substring(prefix.length())

        if (!rawPath) {
            response.status = HttpServletResponse.SC_BAD_REQUEST
            return
        }

        String key = java.net.URLDecoder.decode(rawPath.replace('+', '%2B'), 'UTF-8')
        String fileName = extractFileName(key)
        String dispositionType = download ? 'attachment' : 'inline'
        String encodedName = java.net.URLEncoder.encode(fileName, 'UTF-8').replace('+', '%20')
        String disposition = "${dispositionType}; filename=\"${sanitizeAscii(fileName)}\"; filename*=UTF-8''${encodedName}".toString()

        response.status = HttpServletResponse.SC_TEMPORARY_REDIRECT
        response.setHeader('Location', s3Service.getPresignedUrl(key, PRESIGN_DURATION, disposition))
    }

    private static String extractFileName(String key) {
        String name = key.substring(key.lastIndexOf('/') + 1)
        name.replaceFirst(/^[0-9A-Z]{26}_/, '')
    }

    private static String sanitizeAscii(String value) {
        value.replaceAll(/[^\x20-\x7E]/, '_').replace('"', '').replace('\\', '')
    }
}
