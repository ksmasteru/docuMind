package com.docuMind.backend.services;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.docuMind.backend.exception.FileNotSupportedException;
import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.model.FileContent;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.PumpDocumentViews.SpecSheet;
import com.docuMind.backend.model.PumpModelDocument;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// The pump models' spec sheets, « Fiche technique OTW »… (plan_pump_manuals.md §7):
//   - bundled in resources/specs/specs_<MODEL>.txt and installed at startup into the library, linked SPEC to
//     their model: once per model, never over a sheet the admin changed; a newer bundled sheet replaces one the
//     admin never touched;
//   - read by everyone on « Fiches techniques », the pump page and the task page;
//   - kept up to date by the admin: a new text, or a file (.txt, .md, .pdf) in place of the sheet.
// A change makes a new document (stored, embedded, linked) and deletes the old one with its excerpts, so the
// chat never sees two versions of a sheet.
@Service
public class SpecSheetService {

    static final String SYSTEM_USER = "system";
    private static final Pattern BUNDLED_NAME = Pattern.compile("specs_([A-Za-z0-9]+)\\.txt");

    private final PumpModelDocumentRepository links;
    private final DocumentService documentService;

    // through the proxy, so that installOne's @Transactional applies (same pattern as AskService)
    @Autowired
    @Lazy
    private SpecSheetService self;

    public SpecSheetService(PumpModelDocumentRepository links, DocumentService documentService)
    {
        this.links = links;
        this.documentService = documentService;
    }

    public static String titleFor(PumpType model)
    {
        return "Fiche technique " + model.name();
    }

    // ---- installed by the app ----

    // At every start: first the sheets already linked whose excerpts are missing (their embedding failed) are
    // embedded again, then each bundled sheet is installed or updated. A failure (OpenAI or the database down)
    // is logged and tried again at the next start; the app starts anyway.
    @EventListener(ApplicationReadyEvent.class)
    public void installBundledSheets()
    {
        try {
            reembedMissing();
            installAll();
        }
        catch (RuntimeException ex) {
            System.out.println("spec sheets not checked, next start will try again : " + ex.getMessage());
        }
    }

    private void reembedMissing()
    {
        for (PumpModelDocument sheet : links.findByKind(DocumentKind.SPEC))
        {
            try {
                if (documentService.chunkCount(sheet.getFileId()) == 0 && documentService.reingest(sheet.getFileId()))
                    System.out.println("spec sheet re-embedded : " + sheet.getModel());
            }
            catch (RuntimeException ex) {
                System.out.println("spec sheet " + sheet.getModel() + " could not be re-embedded : " + ex.getMessage());
            }
        }
    }

    private void installAll()
    {
        Resource[] bundled;
        try {
            bundled = new PathMatchingResourcePatternResolver().getResources("classpath*:specs/specs_*.txt");
        }
        catch (IOException ex) {
            System.out.println("bundled spec sheets could not be listed : " + ex.getMessage());
            return;
        }
        for (Resource resource : bundled)
        {
            String name = resource.getFilename();
            Matcher matcher = BUNDLED_NAME.matcher(name == null ? "" : name);
            if (!matcher.matches())
                continue;
            PumpType model;
            try {
                model = PumpType.valueOf(matcher.group(1).toUpperCase());
            }
            catch (IllegalArgumentException ex) {
                System.out.println("bundled spec sheet for an unknown model, skipped : " + name);
                continue;
            }
            try {
                byte[] bytes = resource.getInputStream().readAllBytes();
                String outcome = self.installOne(model, bytes);
                if (outcome != null)
                    System.out.println("spec sheet " + model + " : " + outcome);
            }
            catch (IOException | RuntimeException ex) {
                System.out.println("spec sheet " + model + " not installed, next start will try again : " + ex.getMessage());
            }
        }
    }

    // "installed" / "updated from the bundle" / null when nothing changed
    @Transactional
    public String installOne(PumpType model, byte[] bytes)
    {
        String hash = sha256(bytes);
        Optional<PumpModelDocument> current = links.findFirstByModelAndKind(model, DocumentKind.SPEC);
        if (current.isPresent())
        {
            PumpModelDocument link = current.get();
            if (link.getOrigin() != LinkOrigin.INSTALLED || hash.equals(link.getInstalledHash()))
                return null; // the admin's sheet, or the bundled one already
        }
        FileEntity sheet = documentService.storeDocument(titleFor(model), bytes, MediaType.TEXT_PLAIN_VALUE, "plain", SYSTEM_USER);
        relink(model, sheet, LinkOrigin.INSTALLED, hash, SYSTEM_USER);
        return current.isPresent() ? "updated from the bundle" : "installed";
    }

    // ---- read by everyone ----

    // one entry per model, with or without a sheet, in PumpType order
    public List<SpecSheet> all()
    {
        List<SpecSheet> sheets = new ArrayList<>();
        for (PumpType model : PumpType.values())
            sheets.add(of(model));
        return sheets;
    }

    public SpecSheet of(PumpType model)
    {
        Optional<PumpModelDocument> link = links.findFirstByModelAndKind(model, DocumentKind.SPEC);
        if (link.isEmpty())
            return SpecSheet.none(model);
        PumpModelDocument found = link.get();
        FileEntity file;
        try {
            file = documentService.getFileMetaData(found.getFileId());
        }
        catch (RuntimeException ex) { // the document went missing
            return SpecSheet.none(model);
        }
        String text = null;
        if (isText(file.getContentType()))
        {
            FileContent content = documentService.getFileData(found.getFileId());
            text = new String(content.getData(), StandardCharsets.UTF_8);
        }
        return new SpecSheet(model, file.getId(), file.getName(), file.getContentType(), text,
            found.getOrigin(), found.getChangedBy(), found.getChangedAt());
    }

    // ---- kept up to date by the admin ----

    @Transactional
    public SpecSheet saveText(PumpType model, String text, String user)
    {
        if (text == null || text.isBlank())
            throw new InvalidFormException("La fiche technique est vide.");
        byte[] bytes = text.strip().concat("\n").getBytes(StandardCharsets.UTF_8);
        FileEntity sheet = documentService.storeDocument(titleFor(model), bytes, MediaType.TEXT_PLAIN_VALUE, "plain", user);
        relink(model, sheet, LinkOrigin.ADMIN, null, user);
        return of(model);
    }

    // a .txt, .md or .pdf in place of the sheet; the title stays « Fiche technique <MODEL> »
    @Transactional
    public SpecSheet replaceWithFile(PumpType model, MultipartFile upload, String user)
    {
        if (upload == null || upload.isEmpty())
            throw new InvalidFormException("Aucun fichier reçu.");
        MediaType type = upload.getContentType() == null ? null : MediaType.parseMediaType(upload.getContentType());
        String subtype = type == null ? "" : type.getSubtype();
        if (!List.of("plain", "markdown", "pdf").contains(subtype))
            throw new FileNotSupportedException("Une fiche technique est un fichier .txt, .md ou .pdf.");
        byte[] bytes;
        try {
            bytes = upload.getBytes();
        }
        catch (IOException ex) {
            throw new InvalidFormException("Le fichier n'a pas pu être lu.");
        }
        FileEntity sheet = documentService.storeDocument(titleFor(model), bytes, type.toString(), subtype, user);
        relink(model, sheet, LinkOrigin.ADMIN, null, user);
        return of(model);
    }

    // the new sheet becomes the model's, and the previous one is deleted with its excerpts and links
    private void relink(PumpType model, FileEntity sheet, LinkOrigin origin, String hash, String user)
    {
        Optional<PumpModelDocument> previous = links.findFirstByModelAndKind(model, DocumentKind.SPEC);
        previous.ifPresent(old -> documentService.deleteFile(old.getFileId()));
        PumpModelDocument link = new PumpModelDocument(model, sheet.getId(), DocumentKind.SPEC, origin, user);
        link.setInstalledHash(hash);
        links.save(link);
    }

    private static boolean isText(String contentType)
    {
        return contentType != null && (contentType.startsWith("text/") || contentType.contains("markdown"));
    }

    static String sha256(byte[] bytes)
    {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        }
        catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
