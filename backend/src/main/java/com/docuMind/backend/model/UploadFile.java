// file to upload
package com.docuMind.backend.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@Valid
public class UploadFile{
    @NotBlank
    private String Name;
    @NotBlank
    private String ContentType;
    private Long Size;
    private byte[] data;

    public UploadFile(String Name, String ContentType, Long Size,
         byte[]data)
    {
        this.Name = Name;
        this.ContentType = ContentType;
        this.Size = Size;
        this.data = data;
    }

    public String getName()
    {
        return this.Name;
    }
    
    public String getContentType()
    {
        return this.ContentType;
    }
    
    public Long getSize()
    {
        return this.Size;
    }
    
    public byte[] getData()
    {
        return this.data;
    }
}