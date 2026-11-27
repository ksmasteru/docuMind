package com.docuMind.backend.model;

import java.util.List;

import com.docuMind.backend.model.PumpDocumentViews.ModelLink;

public record FileResponse(
    List<FileInfo> files,
    int filesCount
)
{
    // models: the pump models the document is ticked for, and what it is to each (plan_pump_manuals.md part B);
    // empty for a general document
    public record FileInfo(
        String id,
        String name,
        Long size,
        String userId,
        List<ModelLink> models
    ){
        public FileInfo(String id, String name, Long size, String userId)
        {
            this(id, name, size, userId, List.of());
        }
    }
}
