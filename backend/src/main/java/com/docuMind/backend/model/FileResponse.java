package com.docuMind.backend.model;

import java.util.List;
import java.util.UUID;



public record FileResponse(
    List<FileInfo> files,
    int filesCount
)
{
    public record FileInfo(
        UUID id,
        String name,
        Long size,
        String userId
    ){}
}