package br.com.absono.attachment

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import software.amazon.awssdk.services.s3.model.NoSuchKeyException

import java.net.URLDecoder
import java.net.URLEncoder

/**
 * Serve os arquivos por streaming direto do storage — URL permanente,
 * sem expiração. Uploads continuam usando PUT presignado temporário.
 *
 * Suporta Range requests (seek de vídeo/áudio).
 */
@RestController
class FileController {

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

        String key = URLDecoder.decode(rawPath.replace('+', '%2B'), 'UTF-8')
        String fileName = extractFileName(key)

        try {
            def head = s3Service.head(key)
            long total = head.contentLength()

            response.contentType = head.contentType() ?: 'application/octet-stream'
            response.setHeader('Accept-Ranges', 'bytes')
            String dispositionType = download ? 'attachment' : 'inline'
            String encodedName = URLEncoder.encode(fileName, 'UTF-8').replace('+', '%20')
            response.setHeader('Content-Disposition',
                "${dispositionType}; filename=\"${sanitizeAscii(fileName)}\"; filename*=UTF-8''${encodedName}")

            def range = parseRange(request.getHeader('Range'), total)

            if (range != null) {
                long start = range[0] as long
                long end = range[1] as long
                response.status = HttpServletResponse.SC_PARTIAL_CONTENT
                response.setHeader('Content-Range', "bytes ${start}-${end}/${total}")
                response.contentLengthLong = end - start + 1
                s3Service.withStream(key, start, end) { InputStream inStream ->
                    inStream.transferTo(response.outputStream)
                }
            } else {
                response.contentLengthLong = total
                s3Service.withStream(key, null, null) { InputStream inStream ->
                    inStream.transferTo(response.outputStream)
                }
            }
            response.outputStream.flush()
        } catch (NoSuchKeyException e) {
            response.status = HttpServletResponse.SC_NOT_FOUND
            response.contentType = 'application/json'
            response.writer.write('{"success":false,"message":"Arquivo não encontrado"}')
        }
    }

    /** Aceita bytes=start-end, bytes=start- e bytes=-suffix; null quando sem Range válido. */
    private static List<Long> parseRange(String header, long total) {
        if (!header) return null
        def m = (header =~ /bytes=(\d*)-(\d*)/)
        if (!m.find()) return null
        String s1 = m.group(1)
        String s2 = m.group(2)

        if (s1 && s2) {
            long start = Long.parseLong(s1)
            long end = Math.min(Long.parseLong(s2), total - 1)
            return start > end ? null : [start, end]
        }
        if (s1) {
            long start = Long.parseLong(s1)
            return start >= total ? null : [start, total - 1]
        }
        if (s2) {
            long suffix = Long.parseLong(s2)
            long start = Math.max(0, total - suffix)
            return [start, total - 1]
        }
        null
    }

    private static String extractFileName(String key) {
        String name = key.substring(key.lastIndexOf('/') + 1)
        name.replaceFirst(/^[0-9A-Z]{26}_/, '')
    }

    private static String sanitizeAscii(String value) {
        value.replaceAll(/[^\x20-\x7E]/, '_').replace('"', '').replace('\\', '')
    }
}
