package com.docuMind.backend.services;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.List;

import javax.imageio.ImageIO;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.exception.ImageNotFoundException;
import com.docuMind.backend.model.ImageData;
import com.docuMind.backend.model.ImageEntity;
import com.docuMind.backend.model.enums.FixType;
import com.docuMind.backend.repository.ImageDataRepository;
import com.docuMind.backend.repository.ImageEntityRepository;

// stores report photos: metadata in ImageEntity, bytes in ImageData (same id)
@Service
public class ImageService {
    List<String> allowedTypes = List.of("image/jpeg", "image/png", "image/webp");

    private final ImageEntityRepository imageEntityRepository;

    private final ImageDataRepository imageDataRepository;

    public ImageService(ImageEntityRepository imageEntityRepository,
        ImageDataRepository imageDataRepository)
    {
        this.imageEntityRepository = imageEntityRepository;
        this.imageDataRepository = imageDataRepository;
    }

    // reportId is not set here: the report doesn't exist yet when the photo is uploaded
    @Transactional
    public ImageEntity uploadImage(MultipartFile file, String uploadedBy,
        String equipementId, FixType fix) throws IOException
    {
        if (file.isEmpty())
            throw new FileNotSupportedException("image is empty");

        byte[] bytes = file.getBytes();

        // the Content-Type header comes from the client, so check the real bytes too
        String contentType = file.getContentType();
        if (contentType == null || !allowedTypes.contains(contentType)
                || !matchesMagicBytes(bytes, contentType))
            throw new FileNotSupportedException("only JPEG, PNG and WebP images are accepted");

        ImageEntity imageToSave = new ImageEntity(file.getOriginalFilename(),
            contentType, file.getSize(), uploadedBy);
        imageToSave.setEquipementId(equipementId);
        imageToSave.setFix(fix);

        ImageEntity savedImage = imageEntityRepository.save(imageToSave);

        imageDataRepository.save(new ImageData(savedImage.getId(), bytes));

        return savedImage;
    }

    public ImageEntity getImageMetaData(String id)
    {
        return imageEntityRepository.findById(id)
            .orElseThrow(() -> new ImageNotFoundException("no image with id " + id));
    }

    public ImageData getImageData(String id)
    {
        return imageDataRepository.findById(id)
            .orElseThrow(() -> new ImageNotFoundException("no image with id " + id));
    }

    // A phone photo is ~1800×4000 px; the PDF shows it a few centimetres wide, so it is
    // shrunk to this many pixels on its long side before going in.
    private static final int PDF_PHOTO_MAX_SIDE = 1000;

    // The photo as a JPEG data URI for the PDF report, or null when the id is unknown or
    // the bytes can't be decoded (ImageIO reads JPEG and PNG, not WebP).
    public String getPhotoDataUri(String id)
    {
        if (id == null || !imageDataRepository.existsById(id))
            return null;
        try {
            BufferedImage source = ImageIO.read(new ByteArrayInputStream(getImageData(id).getData()));
            if (source == null)
                return null;
            double scale = Math.min(1.0,
                (double) PDF_PHOTO_MAX_SIDE / Math.max(source.getWidth(), source.getHeight()));
            int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
            int height = Math.max(1, (int) Math.round(source.getHeight() * scale));

            // RGB on white: JPEG has no transparency, so a PNG's alpha would turn black
            BufferedImage scaled = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = scaled.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.drawImage(source, 0, 0, width, height, Color.WHITE, null);
            g.dispose();

            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            ImageIO.write(scaled, "jpg", jpeg);
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(jpeg.toByteArray());
        } catch (IOException e) {
            return null;
        }
    }

    public List<ImageEntity> getReportImages(String reportId)
    {
        return imageEntityRepository.findByReportId(reportId);
    }

    public List<ImageEntity> getUserImages(String uploadedBy)
    {
        return imageEntityRepository.findByUploadedBy(uploadedBy);
    }

    // both rows share the id, so delete both
    @Transactional
    public void deleteImage(String id)
    {
        if (!imageEntityRepository.existsById(id))
            throw new ImageNotFoundException("no image with id " + id);
        imageDataRepository.deleteById(id);
        imageEntityRepository.deleteById(id);
    }

    // first bytes of each format: JPEG FF D8 FF, PNG 89 'P' 'N' 'G', WebP "RIFF"...."WEBP"
    private boolean matchesMagicBytes(byte[] b, String contentType)
    {
        return switch (contentType) {
            case "image/jpeg" -> b.length >= 3
                && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
            case "image/png" -> b.length >= 4
                && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
            case "image/webp" -> b.length >= 12
                && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
            default -> false;
        };
    }
}
