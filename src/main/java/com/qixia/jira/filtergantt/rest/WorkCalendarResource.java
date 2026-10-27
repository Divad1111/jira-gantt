package com.qixia.jira.filtergantt.rest;

import com.atlassian.plugins.rest.api.security.annotation.LicensedOnly;
import com.qixia.jira.filtergantt.*;
import javax.inject.*;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.*;
import javax.ws.rs.core.*;
import java.util.Map;

@Path("/calendar") @Produces("application/json") @LicensedOnly @Named
public class WorkCalendarResource {
    private final AccessGuard guard;private final WorkCalendarService service;
    @Inject public WorkCalendarResource(AccessGuard guard,WorkCalendarService service){this.guard=guard;this.service=service;}
    @GET public Response get(){return RestResponses.execute(()->service.get(guard.currentUser()));}
    @PUT @Consumes("application/json") public Response save(Map<String,Object> body,@Context HttpServletRequest request,@Context UriInfo uri){return RestResponses.execute(()->{var user=guard.currentUser();WriteProtection.check(request,uri);return service.save(body,user);});}
}
