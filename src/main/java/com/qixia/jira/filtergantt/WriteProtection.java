package com.qixia.jira.filtergantt;

import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.core.UriInfo;
import java.net.URI;
import java.util.Locale;

public final class WriteProtection {
    private WriteProtection() {}
    public static void check(HttpServletRequest request, UriInfo uriInfo) {
        // JSON + a non-simple header forces a CORS preflight. Also require a matching
        // browser origin (or same-origin Referer); never trust X-Atlassian-Token:no-check.
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).split(";", 2)[0].trim().equals("application/json") ||
                !"XMLHttpRequest".equals(request.getHeader("X-Requested-With"))) throw new ApiException(403, "XSRF check failed");
        String source = request.getHeader("Origin");
        if (source == null) source = request.getHeader("Referer");
        if (!sameOrigin(source, uriInfo.getBaseUri())) throw new ApiException(403, "XSRF check failed");
        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (fetchSite != null && !fetchSite.equals("same-origin") && !fetchSite.equals("none")) throw new ApiException(403, "XSRF check failed");
    }
    static boolean sameOrigin(String source, URI target) {
        if (source == null) return false;
        try {
            URI uri = URI.create(source);
            return uri.getUserInfo() == null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) &&
                uri.getScheme().equalsIgnoreCase(target.getScheme()) && uri.getHost() != null &&
                uri.getHost().equalsIgnoreCase(target.getHost()) && effectivePort(uri) == effectivePort(target);
        } catch (IllegalArgumentException e) { return false; }
    }
    private static int effectivePort(URI uri) { return uri.getPort() >= 0 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
}
