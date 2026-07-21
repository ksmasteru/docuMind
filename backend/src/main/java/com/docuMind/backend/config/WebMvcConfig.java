package com.docuMind.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// Separate from AsyncConfig: that one backs @Async service methods
// (IngestionService). This one backs Spring MVC's own async request
// handling — triggered here by AskController.ask returning a Flux<String>
// (Server-Sent Events). Without it, Spring MVC falls back to
// SimpleAsyncTaskExecutor, which spawns one unbounded thread per request.
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("mvc-async-");
        executor.initialize();
        configurer.setTaskExecutor(executor);
    }
}
