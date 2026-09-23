package com.docuMind.backend.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Empties every Spring-managed cache once the application is up.
 *
 * A cached embedding is only meaningful for the model that produced it, and the
 * cache key is a hash of the text alone — no model name — so switching
 * spring.ai.openai.embedding.options.model leaves the old vectors being served
 * forever. Question vectors from one model then get compared against chunk
 * vectors from another, which does not fail loudly: pgvector happily returns a
 * distance for any two 1536-dim vectors, so it surfaces as answers quietly
 * getting worse. The same applies to cached answers after a prompt or chunker
 * change.
 *
 * A rebuild is exactly when those inputs can change, so the caches are dropped
 * then. The cost is re-embedding on the next few questions; the alternative is a
 * class of bug that is invisible until an eval catches it.
 *
 * This clears the caches the CacheManager knows about ("embeddings",
 * "ragResponses") rather than issuing FLUSHALL, so nothing else sharing the
 * Redis instance is touched.
 */
@Component
public class CacheResetOnStartup {

    private final CacheManager cacheManager;

    public CacheResetOnStartup(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void clearCaches() {
        for (String name : cacheManager.getCacheNames()) {
            Cache cache = cacheManager.getCache(name);
            if (cache != null) {
                cache.clear();
                System.out.println("cache cleared on startup : " + name);
            }
        }
    }
}
