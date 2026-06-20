package com.docuMind.backend.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@Valid
public class FileRequest {
    private String id;
    @NotBlank(message = "name must not be blank")
    private String name;
    @NotBlank(message = "type must not be blank")
    private String type;

    public FileRequest(String id, String name, String type)
    {
        this.id = id;
        this.name = name;
        this.type = type;
    }

    public String getId()
    {
        return this.id;
    }

    public String getName()
    {
        return this.name;
    }

    public String type()
    {
        return this.type;
    }
}
