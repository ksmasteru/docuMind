package com.docuMind.backend.resources.eval;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.client.RestClient;

import com.docuMind.backend.model.AiResponse;
import com.docuMind.backend.model.AuthResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@EnabledIfSystemProperty(named = "eval", matches = "true")   // ① guard
public class RagEvalTest {

    private static RestClient restClient;
    private static AuthResponse loginResponse;

    @BeforeAll
    static void setUpAndLogin()
    {
        restClient = RestClient.builder()
                    .baseUrl("http://localhost:8080")
                    .defaultHeader("Content-Type", "application/json")
                    .defaultHeader("Accept", "application/json")
                    .build();
        Map<String, String> loginObj = new HashMap<>();
        loginObj.put("email" , "hicham2@gmail.com");
        loginObj.put("password" , "123456789");
        // static field of this same class: RagEvalTest.class is a Class object
        // and has no such field, so it is addressed by its bare name.
        loginResponse = restClient.post()
                            .uri("/api/auth/login")
                            .body(loginObj)
                            .retrieve()
                            .body(AuthResponse.class);
    }

    static Stream<EvalCase> cases() {
        try {
            // mke the json file into a java object
            ObjectMapper mapper = new ObjectMapper();
            // Resolved against this class's package, so cases.json has to live
            // under src/test/resources on the SAME package path - src/test/java
            // is not copied onto the classpath.
            InputStream inputStream = RagEvalTest.class.getResourceAsStream("cases.json");
            if (inputStream == null) {
                throw new RuntimeException("Could not find cases.json in the same folder as RagEvalTest!");
            }
            List<EvalCase> caseList = mapper.readValue(inputStream, new TypeReference<List<EvalCase>>() {});
            return caseList.stream();
        }
        catch (Exception e)
        {
            throw new RuntimeException("Failed to read cases.json", e);
        }
    }
    // ACT : get cases {http request body}
    @ParameterizedTest(name = "{0}")             // ④ one test per case
    @MethodSource("cases")
    void answers(EvalCase c) {
        Map<String, String> obj = new HashMap<>();
        obj.put("question", c.question());
        AiResponse response = restClient.post()
                                .uri("/api/v1/ask")
                                .header("Authorization", "Bearer " + loginResponse.accessToken())
                                .body(obj)
                                .retrieve()
                                .body(AiResponse.class);
        Assertions.assertNotNull(response, "The AI response should not be null");
        // MUST CONTAIN.
        String answer = response.answer().get(0).answer();
        // will handle handling no answer later.
        Assertions.assertTrue(
                answer.contains(c.mustContain()),
                    "Error in case '" + c.id() + "': AI answer did not contain the required text -> "
             + c.mustContain());
    }
    // ASSERT
    // how ?

    // Nested so the file keeps one public top-level type; a second public one
    // would need its own EvalCase.java.
    record EvalCase(
        String id,
        String question,
        String mustContain,
        String source
    ){}
}
