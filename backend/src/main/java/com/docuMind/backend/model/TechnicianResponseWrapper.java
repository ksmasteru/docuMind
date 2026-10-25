package com.docuMind.backend.model;

import java.util.List;

public record TechnicianResponseWrapper(
    List<TechnicianInfo> technicianInfo,
    int techCount
)
{
    public record TechnicianInfo(
        String name, String email, String worksite
    )
    {
        
    }
}
