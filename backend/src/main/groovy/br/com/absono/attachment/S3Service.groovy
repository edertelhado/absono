package br.com.absono.attachment

import br.com.absono.common.Ulid
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectResponse
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest

import java.time.Duration

@Service
class S3Service {

    private final S3Client s3Client
    private final S3Presigner s3Presigner

    @Value('${garage.bucket}')
    String bucket

    S3Service(S3Client s3Client, S3Presigner s3Presigner) {
        this.s3Client = s3Client
        this.s3Presigner = s3Presigner
    }

    String upload(MultipartFile file, String folder) {
        String key = buildKey(folder, file.originalFilename)

        PutObjectRequest request = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(file.contentType)
            .build()

        s3Client.putObject(request, RequestBody.fromInputStream(file.inputStream, file.size))

        return key
    }

    /**
     * Monta a chave do objeto sanitizando folder e filename, que são controlados
     * pelo cliente. Evita traversal/escape de prefixo (ex.: folder='../', nomes
     * com '/' ou '\') e limita o tamanho de cada segmento.
     */
    String buildKey(String folder, String fileName) {
        String safeFolder = sanitizeSegment(folder, 'uploads')
        String safeName = sanitizeFileName(fileName)
        return "${safeFolder}/${Ulid.generate()}_${safeName}".toString()
    }

    private static String sanitizeSegment(String value, String fallback) {
        if (!value) return fallback
        def cleaned = value.replaceAll('[^A-Za-z0-9._-]', '_')
        cleaned = cleaned.replaceAll('\\.{2,}', '_')
        return cleaned.length() ? cleaned.substring(0, Math.min(cleaned.length(), 64)) : fallback
    }

    private static String sanitizeFileName(String name) {
        if (!name) return 'file'
        // remove separadores de path e caracteres de controle
        def base = name.replaceAll('[/\\\\]', '_').replaceAll('[\\x00-\\x1f]', '')
        base = base.replaceAll('\\.{2,}', '_')
        return base.length() ? base.substring(0, Math.min(base.length(), 200)) : 'file'
    }

    String getPresignedUploadUrl(String key, Duration duration, String contentType) {
        PutObjectRequest putRequest = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(contentType ?: 'application/octet-stream')
            .build()

        PresignedPutObjectRequest presignUploadRequest = s3Presigner.presignPutObject(req -> {
            req.putObjectRequest(putRequest)
            req.signatureDuration(duration)
        })

        return presignUploadRequest.url().toString()
    }

    HeadObjectResponse head(String key) {
        s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
    }

    ResponseInputStream<GetObjectResponse> getObject(long startInclusive, long endInclusive) {
        throw new UnsupportedOperationException()
    }

    ResponseInputStream<GetObjectResponse> getObject(String key, Long startInclusive, Long endInclusive) {
        def builder = GetObjectRequest.builder().bucket(bucket).key(key)
        if (startInclusive != null && endInclusive != null) {
            builder.range("bytes=${startInclusive}-${endInclusive}")
        } else if (startInclusive != null) {
            builder.range("bytes=${startInclusive}-")
        }
        s3Client.getObject(builder.build())
    }

    void withStream(String key, Long start, Long end, Closure consumer) {
        (getObject(key, start, end) as ResponseInputStream<GetObjectResponse>).withCloseable { inStream ->
            consumer.call(inStream)
        }
    }

    void deleteFile(String key) {
        s3Client.deleteObject { it.bucket(bucket).key(key) }
    }
}
