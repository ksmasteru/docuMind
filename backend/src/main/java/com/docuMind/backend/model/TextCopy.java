package com.docuMind.backend.model;

import jakarta.annotation.Generated;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class TextCopy{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private long Id;

    // why do some have column ?
    private String fileName;
    
    @Column(columnDefinition = "TEXT")
    private String content;
}
