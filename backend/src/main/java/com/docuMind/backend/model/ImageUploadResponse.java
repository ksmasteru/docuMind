package com.docuMind.backend.model;

/*
What the client gets back after uploading a photo:
{ "imageId": "3f2a…", "name": "cable.jpg", "contentType": "image/jpeg", "size": 254311 }
imageId is what goes in the answer's "value" for an IMAGE question.
*/
public record ImageUploadResponse(
    String imageId,
    String name,
    String contentType,
    long size
)
{}
