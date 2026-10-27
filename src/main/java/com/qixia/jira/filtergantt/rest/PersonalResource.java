package com.qixia.jira.filtergantt.rest;

import com.atlassian.jira.portal.PortletConfiguration;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugins.rest.api.security.annotation.LicensedOnly;
import com.qixia.jira.filtergantt.AccessGuard;
import com.qixia.jira.filtergantt.ApiException;
import com.qixia.jira.filtergantt.PersonalPreferenceStore;
import com.qixia.jira.filtergantt.WriteProtection;
import javax.inject.Inject;
import javax.inject.Named;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.*;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.UriInfo;
import java.util.Map;
import java.util.Set;

@Path("/personal/{gadgetId}") @Produces("application/json") @LicensedOnly @Named
public class PersonalResource {
    private final AccessGuard guard;
    private final PersonalPreferenceStore store;
    @Inject public PersonalResource(AccessGuard guard, PersonalPreferenceStore store) { this.guard = guard; this.store = store; }

    @GET public Response get(@PathParam("gadgetId") String rawId) {
        return RestResponses.execute(() -> {
            ApplicationUser user = guard.currentUser(); long gadgetId = ApiException.positiveId(rawId);
            PortletConfiguration gadget = guard.gadget(user, gadgetId);
            return guard.selectable(gadget) ? store.get(gadgetId, user.getKey()) : PersonalPreferenceStore.response(gadgetId, null);
        });
    }
    @PUT @Consumes("application/json")
    public Response put(@PathParam("gadgetId") String rawId, Map<String, Object> body,
                        @Context HttpServletRequest request, @Context UriInfo uri) {
        return RestResponses.execute(() -> {
            ApplicationUser user = guard.currentUser(); WriteProtection.check(request, uri);
            long gadgetId = ApiException.positiveId(rawId);
            PortletConfiguration gadget = guard.gadget(user, gadgetId);
            if (!guard.selectable(gadget)) throw new ApiException(403, "Shared fixed mode does not accept personal changes");
            if (body == null || body.isEmpty() || !Set.of("selectedFilterId", "scale").containsAll(body.keySet())) throw new ApiException(400, "Invalid preference fields");
            Object rawFilter = body.get("selectedFilterId");
            if (rawFilter != null && !(rawFilter instanceof String)) throw new ApiException(400, "Filter ID must be a string");
            Long filterId = rawFilter == null ? null : ApiException.positiveId((String) rawFilter);
            Object rawScale = body.get("scale");
            if (rawScale != null && (!(rawScale instanceof String) || !Set.of("day", "week", "month").contains(rawScale))) throw new ApiException(400, "Invalid scale");
            if (filterId != null) guard.filter(user, filterId);
            return store.write(gadgetId, user.getKey(), filterId, (String) rawScale, false);
        });
    }
    @DELETE public Response delete(@PathParam("gadgetId") String rawId, @Context HttpServletRequest request, @Context UriInfo uri) {
        return RestResponses.execute(() -> {
            ApplicationUser user = guard.currentUser(); WriteProtection.check(request, uri);
            long gadgetId = ApiException.positiveId(rawId); guard.gadget(user, gadgetId);
            return store.write(gadgetId, user.getKey(), null, null, true);
        });
    }
}
