package com.docuMind.backend.model;

import java.util.List;
import com.docuMind.backend.model.FileEntity;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.ArrayList;

public class DocumentResponse {
    private List<Map.Entry<String, Long>> pairs;

    public DocumentResponse()
    {
        this.pairs = new ArrayList<>();
    }
    
    public DocumentResponse(FileEntity file)
    {
        pairs = new ArrayList<>(List.of(Map.entry(file.getName(), file.getSize())));
    }

    public DocumentResponse(List<FileEntity> files)
    {
        this.pairs = new ArrayList<>();
        for (FileEntity file : files)
        {
            pairs.add(Map.entry(file.getName(), file.getSize()));
        }
    }

    public List<Map.Entry<String, Long>> getPairs()
    {
        return this.pairs;
    }

    public void setPairs(List<Map.Entry<String, Long>> pairs)
    {
        this.pairs = pairs;
    }
}