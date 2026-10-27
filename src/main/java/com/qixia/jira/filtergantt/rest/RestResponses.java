package com.qixia.jira.filtergantt.rest;

import com.qixia.jira.filtergantt.ApiException;
import javax.ws.rs.core.Response;
import java.util.Map;
import java.util.function.Supplier;

final class RestResponses {
    private RestResponses() {}
    static Response execute(Supplier<Object> action) {
        try { return json(200, action.get()); }
        catch (ApiException e) { return json(e.status, Map.of("message", e.getMessage())); }
    }
    static Response json(int status, Object body) {
        return Response.status(status).entity(body).type("application/json")
            .header("Cache-Control", "no-store, private").header("Vary", "Cookie")
            .header("X-Content-Type-Options", "nosniff").build();
    }
}
