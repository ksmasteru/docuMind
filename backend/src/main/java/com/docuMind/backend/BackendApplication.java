package com.docuMind.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
//@EnableScheduling 
public class BackendApplication {
    public static void main(String[] args) {
        System.out.println("spring boot started");
        SpringApplication.run(BackendApplication.class, args);
    }
}