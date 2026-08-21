package br.com.absono.attachment

import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import br.com.absono.message.MessageMapper
import br.com.absono.message.MessageAttachment
import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping('/api/attachments')
class AttachmentController {

    private final S3Service s3Service
    private final MessageMapper messageMapper
    private final UserService userService

    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

    AttachmentController(S3Service s3Service, MessageMapper messageMapper, UserService userService) {
        this.s3Service = s3Service
        this.messageMapper = messageMapper
        this.userService = userService
    }

    @PostMapping
    ResponseEntity<?> uploadAttachment(
        @RequestParam('file') MultipartFile file,
        @RequestParam(defaultValue = 'uploads') String folder
    ) {
        if (file.empty) {
            throw new BusinessException('Arquivo vazio')
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new BusinessException('Arquivo excede o limite de 50MB')
        }

        String s3Key = s3Service.upload(file, folder)
        String url = "/api/files/${s3Key}".toString()

        def attachment = [
            fileName: file.originalFilename,
            mimeType: file.contentType,
            fileSize: file.size,
            s3Key: s3Key,
            url: url
        ]

        ResponseEntity.ok(attachment)
    }

    @PostMapping('/presign')
    ResponseEntity<?> presignUpload(@RequestBody Map<String, String> body) {
        def fileName = body.fileName ?: 'upload'
        def mimeType = body.mimeType ?: 'application/octet-stream'
        def fileSize = body.fileSize ?: 0 as long
        def folder = (body.folder ?: 'uploads') as String
        def s3Key = "${folder}/${folder}_${Ulid.generate()}".toString()

        def presignedUrl = s3Service.getPresignedUploadUrl(s3Key, Duration.ofMinutes(15))

        def attachment = [
            fileName: fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            s3Key: s3Key,
            url: presignedUrl
        ]

        ResponseEntity.ok(attachment)
    }

    @DeleteMapping('/{id}')
    ResponseEntity<?> deleteAttachment(@PathVariable String id) {
        def attachment = messageMapper.findAttachmentById(id)
        if (!attachment) {
            throw new ResourceNotFoundException('Anexo não encontrado')
        }

        s3Service.deleteFile(attachment.s3Key)
        messageMapper.deleteAttachment(id)

        ResponseEntity.ok([success: true, message: 'Anexo excluído com sucesso'])
    }
}
