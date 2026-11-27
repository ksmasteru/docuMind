package com.docuMind.backend.services;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docuMind.backend.exception.InvalidFormException;
import com.docuMind.backend.model.FileEntity;
import com.docuMind.backend.model.PumpDocumentViews.ModelDocument;
import com.docuMind.backend.model.PumpDocumentViews.ModelLink;
import com.docuMind.backend.model.PumpDocumentViews.ResolvedModel;
import com.docuMind.backend.model.PumpModelDocument;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.LinkOrigin;
import com.docuMind.backend.model.enums.PumpType;
import com.docuMind.backend.repository.DocumentRepository;
import com.docuMind.backend.repository.PumpModelDocumentRepository;

// Which documents serve which pump model (plan_pump_manuals.md part B): the admin ticks the models when uploading
// a document or on « Documents », and says whether it is PHOVA's own (OWN) or a comparable pump's manual
// (COMPARABLE). Spec sheets (SPEC) are SpecSheetService's: ticking a document never adds or removes one.
// Also where a model comes from for an equipment, the same answer for the pump page, the task page and, later,
// the chat (part C).
@Service
public class PumpDocumentService {

    private final PumpModelDocumentRepository links;
    private final DocumentRepository documents;

    // The report platform (branch rapports) has no pump registry (Pump, PumpRepository: the full platform's
    // 2026-11-21 work), so an equipment's model is only read from its code (plan_rapports_new_changes.md)
    public PumpDocumentService(PumpModelDocumentRepository links, DocumentRepository documents)
    {
        this.links = links;
        this.documents = documents;
    }

    public List<PumpType> models()
    {
        return Arrays.asList(PumpType.values());
    }

    // "otw" -> OTW; an unknown name is a 400, not a silent skip: a typo would untie a document
    public static PumpType parseModel(String name)
    {
        try {
            return PumpType.valueOf(name.strip().toUpperCase(Locale.ROOT));
        }
        catch (IllegalArgumentException | NullPointerException ex) {
            throw new InvalidFormException("Modèle de pompe inconnu : « " + name + " ».");
        }
    }

    // what a ticked document is: PHOVA's (OWN, the default) or a comparable pump's manual. SPEC can't be ticked.
    public static DocumentKind parseKind(String kind)
    {
        if (kind == null || kind.isBlank())
            return DocumentKind.OWN;
        try {
            DocumentKind parsed = DocumentKind.valueOf(kind.strip().toUpperCase(Locale.ROOT));
            if (parsed != DocumentKind.SPEC)
                return parsed;
        }
        catch (IllegalArgumentException ex) {
            // falls through to the 400 below
        }
        throw new InvalidFormException("Type de document inconnu : « " + kind + " » (OWN ou COMPARABLE).");
    }

    public List<PumpType> parseModels(Collection<String> names)
    {
        if (names == null)
            return List.of();
        return names.stream().filter(n -> n != null && !n.isBlank()).map(PumpDocumentService::parseModel)
            .distinct().toList();
    }

    // the models each document is ticked for, spec sheets included, in PumpType order
    public Map<String, List<ModelLink>> linksOf(Collection<String> fileIds)
    {
        if (fileIds.isEmpty())
            return Map.of();
        return links.findByFileIdIn(fileIds).stream()
            .sorted(Comparator.comparing(PumpModelDocument::getModel))
            .collect(Collectors.groupingBy(PumpModelDocument::getFileId,
                Collectors.mapping(ModelLink::of, Collectors.toList())));
    }

    public List<ModelLink> linksOf(String fileId)
    {
        return linksOf(List.of(fileId)).getOrDefault(fileId, List.of());
    }

    // Ticks the document for exactly these models, all of one kind (OWN or COMPARABLE). Its spec-sheet links are
    // kept whatever is ticked: those are changed on « Fiches techniques ».
    @Transactional
    public List<ModelLink> setModels(String fileId, Collection<PumpType> models, DocumentKind kind, String user)
    {
        if (kind == DocumentKind.SPEC)
            throw new InvalidFormException("Une fiche technique se change sur la page « Fiches techniques ».");
        Set<PumpType> wanted = new LinkedHashSet<>(models);
        for (PumpModelDocument link : links.findByFileId(fileId))
        {
            if (link.getKind() == DocumentKind.SPEC)
            {
                wanted.remove(link.getModel()); // already tied to that model, as its sheet
                continue;
            }
            if (!wanted.remove(link.getModel()))
                links.delete(link);
            else if (link.getKind() != kind)
            {
                link.setKind(kind);
                link.setOrigin(LinkOrigin.ADMIN);
                link.setChangedBy(user);
                links.save(link);
            }
        }
        for (PumpType model : wanted)
            links.save(new PumpModelDocument(model, fileId, kind, LinkOrigin.ADMIN, user));
        links.flush();
        return linksOf(fileId);
    }

    // A model's documents for its pump page: the spec sheet first, then PHOVA's, then the comparable pumps'
    public List<ModelDocument> documentsOf(PumpType model)
    {
        List<PumpModelDocument> modelLinks = links.findByModel(model);
        Map<String, FileEntity> files = documents.findAllById(modelLinks.stream().map(PumpModelDocument::getFileId).toList())
            .stream().collect(Collectors.toMap(FileEntity::getId, Function.identity()));
        List<ModelDocument> out = new ArrayList<>();
        for (PumpModelDocument link : modelLinks)
        {
            FileEntity file = files.get(link.getFileId());
            if (file != null)
                out.add(ModelDocument.of(file, link.getKind()));
        }
        out.sort(Comparator.comparing(ModelDocument::kind).thenComparing(ModelDocument::title, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    // what a model has, for the chat (part C): its spec sheet's file (null without one), and whether documents other
    // than the sheet are ticked for it (OWN or COMPARABLE: the chat then searches those, scope MANUALS)
    public record ModelDocs(String specFileId, boolean hasManuals) {}

    public ModelDocs docsOf(PumpType model)
    {
        String spec = null;
        boolean manuals = false;
        for (PumpModelDocument link : links.findByModel(model))
        {
            if (link.getKind() == DocumentKind.SPEC)
                spec = link.getFileId();
            else
                manuals = true;
        }
        return new ModelDocs(spec, manuals);
    }

    // The chat's model (part C): the one chosen on the « Assistant » page wins (source CHOSEN), else the
    // equipment's (resolve below)
    public ResolvedModel resolveFor(String pumpModel, String equipment)
    {
        if (pumpModel != null && !pumpModel.isBlank())
            return new ResolvedModel(equipment, parseModel(pumpModel), "CHOSEN");
        return resolve(equipment);
    }

    // An equipment's model: the model its code starts with (« OTW-JORF-01 », « OTC125-45 »), else none. The full
    // platform first looks the code up in its pump registry (source REGISTRY); the report platform has none.
    public ResolvedModel resolve(String equipment)
    {
        if (equipment == null || equipment.isBlank())
            return new ResolvedModel(equipment, null, null);
        String code = equipment.strip().toUpperCase(Locale.ROOT);
        PumpType fromCode = modelInCode(code);
        return new ResolvedModel(equipment, fromCode, fromCode == null ? null : "CODE");
    }

    // the longest model name the code starts with, not followed by a letter (« PHB3-J-07 », « OTC125 »: yes;
    // « OTWX-1 »: no)
    static PumpType modelInCode(String code)
    {
        return Arrays.stream(PumpType.values())
            .sorted(Comparator.comparingInt((PumpType t) -> t.name().length()).reversed())
            .filter(t -> code.startsWith(t.name())
                && (code.length() == t.name().length() || !Character.isLetter(code.charAt(t.name().length()))))
            .findFirst()
            .orElse(null);
    }
}
