package com.docuMind.backend.model;

import java.util.List;



public record FileResponse(
    List<FileInfo> files,
    int filesCount
)
{
    public record FileInfo(
        String id,
        String name,
        Long size,
        String userId
    ){}
}