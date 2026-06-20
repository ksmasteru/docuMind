package com.docuMind.backend.model;

import java.util.List;
import com.docuMind.backend.model.FileEntity;
import java.util.Map;
import java.util.stream.Collectors;


public record DocumentResponse(
    Map<String, Long> fileDetails)
    {
    public DocumentResponse(FileEntity file)
    {
        this(Map.of(file.getName(),file.getSize()));
    }

    public DocumentResponse(List<FileEntity> files)
    {
        this(files.stream()
            .collect(Collectors.toMap(
                FileEntity::getName, 
                FileEntity::getSize,
                (existing, replacement) -> existing // Merge function in case of duplicate filenames
            ))
        );
    }
}