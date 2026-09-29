package com.docuMind.backend.model;

import java.util.List;

public record AiResponse(
    List<chatAnswer> answer,
    String askInteractionId,
    int answerCount
)
{
    public record chatAnswer(
        String key,
        String answer
   ){}
}