package com.docuMind.backend.metrics;

import java.util.Collection;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.lang.Nullable;

/**
 * Decorates every {@link Cache} handed out by the delegate {@link CacheManager}
 * with {@link MetricsCache} so hit/miss counters are recorded regardless of
 * which named cache (embeddings, ragResponses, ...) is being read.
 */
public class MetricsCacheManager implements CacheManager {

    private final CacheManager delegate;
    private final RagMetrics ragMetrics;

    public MetricsCacheManager(CacheManager delegate, RagMetrics ragMetrics) {
        this.delegate = delegate;
        this.ragMetrics = ragMetrics;
    }

    @Override
    @Nullable
    public Cache getCache(String name) {
        Cache cache = delegate.getCache(name);
        return cache == null ? null : new MetricsCache(cache, ragMetrics);
    }

    @Override
    public Collection<String> getCacheNames() {
        return delegate.getCacheNames();
    }
}
