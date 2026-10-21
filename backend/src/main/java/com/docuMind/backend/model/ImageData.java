package com.docuMind.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// the image bytes. Metadata lives in ImageEntity.
@Entity
@Table(name = "images_data")
public class ImageData {

    @Id
    private String id; // same id as ImageEntity — 1:1 relationship

    // bytea, not @Lob: on Postgres @Lob byte[] becomes a large object (oid)
    // that is not deleted with the row
    @Column(nullable = false, columnDefinition = "bytea")
    private byte[] data;

    public ImageData() {}

    public ImageData(String id, byte[] data) {
        this.id = id;
        this.data = data;
    }

    public String getId()               { return id; }
    public void setId(String id)        { this.id = id; }
    public byte[] getData()             { return data; }
    public void setData(byte[] data)    { this.data = data; }
}
