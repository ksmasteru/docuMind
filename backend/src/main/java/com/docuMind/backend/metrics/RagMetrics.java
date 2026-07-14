package com.docuMind.backend.metrics;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Component
public class RagMetrics {

    private final Counter askCounter;
    private final Counter cacheHitCounter;
    private final Counter cacheMissCounter;
    private final Timer embeddingTimer;
    private final Timer retrievalTimer;

    public RagMetrics(MeterRegistry registry) {
        this.askCounter = Counter.builder("rag_ask_total")
            .description("Total questions asked")
            .register(registry);

        this.cacheHitCounter = Counter.builder("rag_cache_hits_total")
            .description("Responses served from cache")
            .register(registry);

        this.cacheMissCounter = Counter.builder("rag_cache_misses_total")
            .description("Responses requiring full RAG pipeline")
            .register(registry);

        this.embeddingTimer = Timer.builder("rag_embedding_duration_seconds")
            .publishPercentileHistogram(true)   // ← this is what creates the _bucket metrics
            .description("Time to embed a question via OpenAI")
            .register(registry);

        this.retrievalTimer = Timer.builder("rag_retrieval_duration_seconds")
            .publishPercentileHistogram(true)   // ← this is what creates the _bucket metrics
            .description("Time to retrieve chunks from pgvector")
            .register(registry);

    }

    public void incrementAsk()       { askCounter.increment(); }
    public void incrementCacheHit()  { cacheHitCounter.increment(); }
    public void incrementCacheMiss() { cacheMissCounter.increment(); }

    public Timer.Sample startTimer() {
        return Timer.start();
    }

    public void recordEmbedding(Timer.Sample sample) {
        sample.stop(embeddingTimer);
    }

    public void recordRetrieval(Timer.Sample sample) {
        sample.stop(retrievalTimer);
    }
}