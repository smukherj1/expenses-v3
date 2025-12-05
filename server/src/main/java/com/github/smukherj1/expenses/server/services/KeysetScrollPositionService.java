package com.github.smukherj1.expenses.server.services;

import org.springframework.data.domain.KeysetScrollPosition;
import org.springframework.data.domain.ScrollPosition;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

@Service
public class KeysetScrollPositionService {
    private final ObjectMapper objectMapper;

    public KeysetScrollPositionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * ENCODE: Converts a KeysetScrollPosition to a URL-safe Base64 String
     */
    public String encode(KeysetScrollPosition position) {
        if (position == null || position.getKeys().isEmpty()) {
            return null;
        }
        if (!position.scrollsForward()) {
            throw new RuntimeException("Got cursor that does not scroll forward");
        }

        try {
            Map<String, Object> keys = position.getKeys();
            String json = objectMapper.writeValueAsString(keys);
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(json.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("Failed to encode cursor", e);
        }
    }

    /**
     * DECODE: Converts a Base64 String back to a ScrollPosition
     */
    public ScrollPosition decode(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return ScrollPosition.keyset(); // Returns an initial empty position
        }

        try {
            byte[] decodedBytes = Base64.getUrlDecoder().decode(cursor);
            String json = new String(decodedBytes, StandardCharsets.UTF_8);
            Map<String, Object> keys = objectMapper.readValue(json, new TypeReference<>() {
            });
            if (keys.containsKey("date") && keys.get("date") instanceof String) {
                keys.put("date", java.time.LocalDate.parse((String) keys.get("date")));
            }
            return ScrollPosition.forward(keys);

        } catch (Exception e) {
            throw new RuntimeException("Invalid cursor format:", e);
        }
    }
}
