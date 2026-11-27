package com.docuMind.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.docuMind.backend.model.PumpModelDocument;
import com.docuMind.backend.model.enums.DocumentKind;
import com.docuMind.backend.model.enums.PumpType;

@Repository
public interface PumpModelDocumentRepository extends JpaRepository<PumpModelDocument, String> {

    List<PumpModelDocument> findByFileId(String fileId);

    List<PumpModelDocument> findByFileIdIn(Collection<String> fileIds);

    List<PumpModelDocument> findByModel(PumpType model);

    List<PumpModelDocument> findByKind(DocumentKind kind);

    // a model's spec sheet: at most one (SpecSheetService keeps it that way)
    Optional<PumpModelDocument> findFirstByModelAndKind(PumpType model, DocumentKind kind);

    // with DocumentService.deleteFile, inside its transaction
    long deleteByFileId(String fileId);
}
