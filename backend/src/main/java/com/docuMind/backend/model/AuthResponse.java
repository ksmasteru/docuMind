
package com.docuMind.backend.model;

import com.docuMind.backend.model.enums.*;;
public record AuthResponse(
    String accessToken, String refreshToken, String type, UserRole Role)
    {

    }