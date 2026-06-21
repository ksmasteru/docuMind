package com.docuMind.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Using string names allows the app to compile even without the MongoDB dependency!
@SpringBootApplication(excludeName = {
    "org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration",
    "org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration"
})
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}