package com.docuMind.backend.services;
 
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class ChunkingService {

    private static final int CHUNK_SIZE = 500;      // in words, approx
    private static final int CHUNK_OVERLAP = 100;

    public List<String> chunk(String text) {
        String[] words = text.split("\\s+");
        List<String> chunks = new ArrayList<>();
        int start = 0;

        while (start < words.length) {
            int end = Math.min(start + CHUNK_SIZE, words.length);
            chunks.add(String.join(" ", Arrays.copyOfRange(words, start, end)));
            start += (CHUNK_SIZE - CHUNK_OVERLAP);
        }

        return chunks;
    }
}
