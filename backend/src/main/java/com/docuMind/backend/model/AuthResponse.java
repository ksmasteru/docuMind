
package com.docuMind.backend.model;
public record AuthResponse(
    String acessToken, String refreshToken, String type)
    {

    }