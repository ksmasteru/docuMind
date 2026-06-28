
package com.docuMind.backend.model;
public record AuthResponse(
    String accessToken, String refreshToken, String type)
    {

    }