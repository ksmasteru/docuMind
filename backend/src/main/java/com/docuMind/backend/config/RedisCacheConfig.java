package com.docuMind.backend.config;

import java.time.Duration;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import com.docuMind.backend.metrics.MetricsCacheManager;
import com.docuMind.backend.metrics.RagMetrics;

@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory, RagMetrics ragMetrics) {
        RedisCacheConfiguration embeddingConfig = RedisCacheConfiguration
            .defaultCacheConfig()
            .entryTtl(Duration.ofDays(30))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        RedisCacheConfiguration ragConfig = RedisCacheConfiguration
            .defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(15))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        RedisCacheManager redisCacheManager = RedisCacheManager.builder(factory)
            .withCacheConfiguration("embeddings", embeddingConfig)
            .withCacheConfiguration("ragResponses", ragConfig)
            .build();

        return new MetricsCacheManager(redisCacheManager, ragMetrics);
    }
}