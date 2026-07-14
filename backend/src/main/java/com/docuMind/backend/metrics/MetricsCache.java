package com.docuMind.backend.metrics;

import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.cache.Cache;
import org.springframework.lang.Nullable;

/**
 * Wraps a {@link Cache} so every read is classified as a hit or miss and
 * reported to {@link RagMetrics}. Spring's {@code @Cacheable} interceptor
 * only invokes the annotated method body on a miss, so hits can't be
 * observed from inside the method itself — this decorator is what lets the
 * cache report both outcomes.
 */
public class MetricsCache implements Cache {

    private final Cache delegate;
    private final RagMetrics ragMetrics;

    public MetricsCache(Cache delegate, RagMetrics ragMetrics) {
        this.delegate = delegate;
        this.ragMetrics = ragMetrics;
    }

    @Override
    public String getName() {
        return delegate.getName();
    }

    @Override
    public Object getNativeCache() {
        return delegate.getNativeCache();
    }

    @Override
    @Nullable
    public ValueWrapper get(Object key) {
        ValueWrapper value = delegate.get(key);
        recordResult(value != null);
        return value;
    }

    @Override
    @Nullable
    public <T> T get(Object key, @Nullable Class<T> type) {
        T value = delegate.get(key, type);
        recordResult(value != null);
        return value;
    }

    @Override
    @Nullable
    public <T> T get(Object key, Callable<T> valueLoader) {
        AtomicBoolean hit = new AtomicBoolean(true);
        T value = delegate.get(key, () -> {
            hit.set(false);
            return valueLoader.call();
        });
        recordResult(hit.get());
        return value;
    }

    @Override
    public void put(Object key, @Nullable Object value) {
        delegate.put(key, value);
    }

    @Override
    @Nullable
    public ValueWrapper putIfAbsent(Object key, @Nullable Object value) {
        return delegate.putIfAbsent(key, value);
    }

    @Override
    public void evict(Object key) {
        delegate.evict(key);
    }

    @Override
    public void clear() {
        delegate.clear();
    }

    private void recordResult(boolean hit) {
        if (hit) {
            ragMetrics.incrementCacheHit();
        } else {
            ragMetrics.incrementCacheMiss();
        }
    }
}
