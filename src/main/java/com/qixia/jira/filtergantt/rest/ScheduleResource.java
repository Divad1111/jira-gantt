package com.qixia.jira.filtergantt.rest;

import com.atlassian.plugins.rest.api.security.annotation.LicensedOnly;
import com.qixia.jira.filtergantt.*;
import javax.inject.*;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.*;
import javax.ws.rs.core.*;
import java.util.Map;

@Path("/schedule/{gadgetId}") @Produces("application/json") @LicensedOnly @Named
public class ScheduleResource {
    private final AccessGuard guard;private final ScheduleService service;
    @Inject public ScheduleResource(AccessGuard guard,ScheduleService service){this.guard=guard;this.service=service;}
    @GET public Response get(@PathParam("gadgetId") String gadget,@QueryParam("filterId") String filter){return RestResponses.execute(()->service.get(ApiException.positiveId(gadget),ApiException.positiveId(filter),guard.currentUser()));}
    @POST @Path("/source") @Consumes("application/json") public Response source(@PathParam("gadgetId") String gadget,Map<String,Object> body,@Context HttpServletRequest request,@Context UriInfo uri){return RestResponses.execute(()->{var user=guard.currentUser();WriteProtection.check(request,uri);return service.source(ApiException.positiveId(gadget),body,user);});}
    @POST @Path("/preview") @Consumes("application/json") public Response preview(@PathParam("gadgetId") String gadget,Map<String,Object> body,@Context HttpServletRequest request,@Context UriInfo uri){return execute(gadget,body,request,uri,false);}
    @POST @Consumes("application/json") public Response apply(@PathParam("gadgetId") String gadget,Map<String,Object> body,@Context HttpServletRequest request,@Context UriInfo uri){return execute(gadget,body,request,uri,true);}
    private Response execute(String gadget,Map<String,Object> body,HttpServletRequest request,UriInfo uri,boolean apply){return RestResponses.execute(()->{var user=guard.currentUser();WriteProtection.check(request,uri);return service.run(ApiException.positiveId(gadget),body,user,apply);});}
}
