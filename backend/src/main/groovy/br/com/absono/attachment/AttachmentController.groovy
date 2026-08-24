package br.com.absono.attachment

import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import br.com.absono.common.Ulid
import br.com.absono.message.MessageMapper
import br.com.absono.message.MessageAttachment
import br.com.absono.message.MessageService
import br.com.absono.user.UserRole
import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

import java.time.Duration

@RestController
@RequestMapping('/api/attachments')
class AttachmentController {

    private final S3Service s3Service
    private final MessageMapper messageMapper
    private final UserService userService
    private final MessageService messageService

    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

    AttachmentController(S3Service s3Service, MessageMapper messageMapper, UserService userService, MessageService messageService) {
        this.s3Service = s3Service
        this.messageMapper = messageMapper
        this.userService = userService
        this.messageService = messageService
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
        def fileName = (body.fileName ?: 'upload') as String
        def mimeType = (body.mimeType ?: 'application/octet-stream') as String
        long fileSize = Long.parseLong(body.fileSize?.toString() ?: '0')

        if (fileSize <= 0) {
            throw new BusinessException('Arquivo vazio')
        }
        if (fileSize > MAX_FILE_SIZE) {
            throw new BusinessException('Arquivo excede o limite de 50MB')
        }

        def folder = 'uploads'
        def s3Key = "${folder}/${Ulid.generate()}_${fileName}".toString()
        def presignedUrl = s3Service.getPresignedUploadUrl(s3Key, Duration.ofMinutes(15), mimeType)

        ResponseEntity.ok([
            fileName : fileName,
            mimeType : mimeType,
            fileSize : fileSize,
            s3Key    : s3Key,
            url      : "/api/files/${s3Key}".toString(),
            uploadUrl: presignedUrl
        ])
    }

    @DeleteMapping('/{id}')
    ResponseEntity<?> deleteAttachment(@PathVariable String id) {
        def attachment = messageMapper.findAttachmentById(id)
        if (!attachment) {
            throw new ResourceNotFoundException('Anexo não encontrado')
        }

        def user = userService.getCurrentUser()
        def message = messageService.getMessage(attachment.messageId)
        boolean isAdmin = user.role == UserRole.ADMIN
        if (!isAdmin && message.userId != user.id) {
            throw new BusinessException('Você não tem permissão para excluir este anexo')
        }

        s3Service.deleteFile(attachment.s3Key)
        messageMapper.deleteAttachment(id)

        ResponseEntity.ok([success: true, message: 'Anexo excluído com sucesso'])
    }
}
