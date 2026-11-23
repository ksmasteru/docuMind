package com.docuMind.backend.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

// What the report platform hides (plan_rapports_platform.md), without Spring or a database
class EditionFilterTest {

    @Test
    void theSettingIsReadWhateverItsCase()
    {
        assertTrue(new Edition("rapports").rapports());
        assertTrue(new Edition(" Rapports ").rapports());
        assertFalse(new Edition("full").rapports());
        assertFalse(new Edition("").rapports(), "blank APP_EDITION: the full platform");
        assertFalse(new Edition(null).rapports());
    }

    @Test
    void theHiddenPartsAndOnlyThem()
    {
        assertTrue(EditionFilter.hidden("/api/v1/alerts"));
        assertTrue(EditionFilter.hidden("/api/v1/alerts/sync"));
        assertTrue(EditionFilter.hidden("/api/v1/interventions/abc/actions"));
        assertTrue(EditionFilter.hidden("/api/v1/pumps/PHB3-J-07/history"));
        assertFalse(EditionFilter.hidden("/api/v1/alertsX"), "a prefix of a word isn't the part");
        for (String kept : new String[] { "/api/v1/task/review", "/api/v1/submissions", "/api/v1/forms/options",
                "/api/v1/ask", "/api/v1/files/upload", "/api/v1/team/technicians", "/api/auth/login",
                "/api/public/verify/7K3F" })
            assertFalse(EditionFilter.hidden(kept), kept);
    }

    @Test
    void theReportPlatformAnswers404ToAHiddenPart() throws Exception
    {
        MockHttpServletResponse response = run("rapports", "/api/v1/alerts/sync");
        assertEquals(404, response.getStatus());
    }

    @Test
    void whatItKeepsGoesThrough() throws Exception
    {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new EditionFilter(new Edition("rapports")).doFilter(new MockHttpServletRequest("GET", "/api/v1/task/review"), response, chain);
        assertNotNull(chain.getRequest(), "passed on");
        assertEquals(200, response.getStatus());
    }

    @Test
    void theFullPlatformHidesNothing() throws Exception
    {
        MockFilterChain chain = new MockFilterChain();
        new EditionFilter(new Edition("full")).doFilter(new MockHttpServletRequest("POST", "/api/v1/alerts/sync"),
                new MockHttpServletResponse(), chain);
        assertNotNull(chain.getRequest(), "passed on");
    }

    private static MockHttpServletResponse run(String edition, String path) throws Exception
    {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();
        new EditionFilter(new Edition(edition)).doFilter(new MockHttpServletRequest("GET", path), response, chain);
        assertNull(chain.getRequest(), "not passed on");
        return response;
    }
}
