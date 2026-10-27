package com.qixia.jira.filtergantt;

import org.junit.Test;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.core.UriInfo;
import java.net.URI;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class WriteProtectionTest {
    @Test public void originComparisonNormalizesPortsAndRejectsLookalikes() {
        URI target = URI.create("https://jira.example.test/jira/rest/filter-gantt/1.0");
        assertTrue(WriteProtection.sameOrigin("https://jira.example.test:443", target));
        for (String value : new String[]{null, "null", "http://jira.example.test", "https://jira.example.test.evil.test", "https://evil.test@jira.example.test", "javascript:alert(1)", "https://jira.example.test:444"}) assertFalse(WriteProtection.sameOrigin(value, target));
    }
    @Test public void validSameOriginJsonIsAccepted() {
        HttpServletRequest request = request(); WriteProtection.check(request, uri());
    }
    @Test public void forgedCrossOriginOrMissingHeadersAreRejected() {
        HttpServletRequest request = request(); when(request.getHeader("Origin")).thenReturn("https://evil.test");
        AccessGuardTest.assertStatus(403, () -> WriteProtection.check(request, uri()));
        when(request.getHeader("Origin")).thenReturn(null); AccessGuardTest.assertStatus(403, () -> WriteProtection.check(request, uri()));
        when(request.getHeader("Referer")).thenReturn("https://jira.test/jira/dashboard"); WriteProtection.check(request, uri());
        when(request.getHeader("X-Requested-With")).thenReturn(null); AccessGuardTest.assertStatus(403, () -> WriteProtection.check(request, uri()));
    }
    @Test public void simpleFormContentAndCrossSiteFetchAreRejected() {
        HttpServletRequest request = request(); when(request.getContentType()).thenReturn("text/plain");
        AccessGuardTest.assertStatus(403, () -> WriteProtection.check(request, uri()));
        when(request.getContentType()).thenReturn("application/json"); when(request.getHeader("Sec-Fetch-Site")).thenReturn("cross-site");
        AccessGuardTest.assertStatus(403, () -> WriteProtection.check(request, uri()));
    }
    public static HttpServletRequest request() {
        HttpServletRequest r = mock(HttpServletRequest.class);
        when(r.getContentType()).thenReturn("application/json; charset=utf-8");
        when(r.getHeader("X-Requested-With")).thenReturn("XMLHttpRequest"); when(r.getHeader("Origin")).thenReturn("https://jira.test"); return r;
    }
    public static UriInfo uri() { UriInfo u = mock(UriInfo.class); when(u.getBaseUri()).thenReturn(URI.create("https://jira.test/jira/rest/filter-gantt/1.0")); return u; }
}
