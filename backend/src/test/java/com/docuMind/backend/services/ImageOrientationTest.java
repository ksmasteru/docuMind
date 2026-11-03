package com.docuMind.backend.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

// A phone photo stored sideways with an EXIF orientation tag comes out upright in the PDF
// (ImageService.exifOrientation / upright).
class ImageOrientationTest {

    @Test
    void readsTheOrientationTagAndTurnsThePhoto() throws IOException
    {
        // 40 × 20, left half red: stored the way the sensor saw it
        BufferedImage stored = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 40; x++)
            for (int y = 0; y < 20; y++)
                stored.setRGB(x, y, (x < 20 ? Color.RED : Color.BLUE).getRGB());

        for (boolean little : new boolean[] { false, true }) {
            byte[] tagged = withOrientation(jpeg(stored), 6, little);
            assertEquals(6, ImageService.exifOrientation(tagged));

            // turned 90° clockwise: 20 wide, 40 high, the red half now on top
            BufferedImage upright = ImageService.upright(ImageIO.read(new java.io.ByteArrayInputStream(tagged)), 6);
            assertEquals(20, upright.getWidth());
            assertEquals(40, upright.getHeight());
            assertEquals(true, isRed(upright.getRGB(10, 5)));
            assertEquals(false, isRed(upright.getRGB(10, 35)));
        }

        assertEquals(8, ImageService.exifOrientation(withOrientation(jpeg(stored), 8, false)));
        assertEquals(3, ImageService.exifOrientation(withOrientation(jpeg(stored), 3, true)));
    }

    @Test
    void aPhotoWithoutTheTagIsLeftAsItIs() throws IOException
    {
        BufferedImage stored = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        assertEquals(1, ImageService.exifOrientation(jpeg(stored)));
        assertEquals(stored, ImageService.upright(stored, 1));
        assertEquals(1, ImageService.exifOrientation(new byte[] { 1, 2, 3 }));
    }

    private static boolean isRed(int rgb)
    {
        Color c = new Color(rgb);
        return c.getRed() > 150 && c.getBlue() < 100;
    }

    private static byte[] jpeg(BufferedImage image) throws IOException
    {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return out.toByteArray();
    }

    // the JPEG with an APP1 Exif segment holding only the orientation tag, right after SOI
    private static byte[] withOrientation(byte[] jpeg, int orientation, boolean little)
    {
        ByteArrayOutputStream tiff = new ByteArrayOutputStream();
        tiff.writeBytes(little ? new byte[] { 'I', 'I', 42, 0, 8, 0, 0, 0 } : new byte[] { 'M', 'M', 0, 42, 0, 0, 0, 8 });
        tiff.writeBytes(u16(1, little));                 // one entry
        tiff.writeBytes(u16(0x0112, little));            // Orientation
        tiff.writeBytes(u16(3, little));                 // SHORT
        tiff.writeBytes(little ? new byte[] { 1, 0, 0, 0 } : new byte[] { 0, 0, 0, 1 });
        tiff.writeBytes(u16(orientation, little));
        tiff.writeBytes(new byte[] { 0, 0 });
        tiff.writeBytes(new byte[] { 0, 0, 0, 0 });      // no next IFD

        byte[] body = tiff.toByteArray();
        int length = 2 + 6 + body.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(0xD8);
        out.writeBytes(new byte[] { (byte) 0xFF, (byte) 0xE1, (byte) (length >> 8), (byte) length });
        out.writeBytes(new byte[] { 'E', 'x', 'i', 'f', 0, 0 });
        out.writeBytes(body);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static byte[] u16(int value, boolean little)
    {
        return little ? new byte[] { (byte) value, (byte) (value >> 8) } : new byte[] { (byte) (value >> 8), (byte) value };
    }
}
