package com.qixia.jira.filtergantt.rest;

import com.atlassian.jira.bc.JiraServiceContextImpl;
import com.atlassian.jira.bc.filter.SearchRequestService;
import com.atlassian.jira.bc.favourites.FavouritesService;
import com.atlassian.jira.issue.search.SearchRequest;
import com.atlassian.jira.sharing.SharedEntityColumn;
import com.atlassian.jira.sharing.search.SharedEntitySearchContext;
import com.atlassian.jira.sharing.search.SharedEntitySearchParameters;
import com.atlassian.jira.sharing.search.SharedEntitySearchParametersBuilder;
import com.atlassian.jira.sharing.search.SharedEntitySearchResult;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.atlassian.plugins.rest.api.security.annotation.LicensedOnly;
import com.qixia.jira.filtergantt.AccessGuard;
import com.qixia.jira.filtergantt.ApiException;
import javax.inject.Inject;
import javax.inject.Named;
import javax.ws.rs.*;
import javax.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;

@Path("/filters") @Produces("application/json") @LicensedOnly @Named
public class FilterResource {
    private static final int PAGE_SIZE = 25;
    private final AccessGuard guard;
    private final SearchRequestService filters;
    private final FavouritesService favourites;
    @Inject public FilterResource(AccessGuard guard, @ComponentImport SearchRequestService filters, @ComponentImport FavouritesService favourites) { this.guard = guard; this.filters = filters; this.favourites = favourites; }
    @GET public Response search(@QueryParam("query") @DefaultValue("") String query,
                               @QueryParam("scope") @DefaultValue("favourite") String scope,
                               @QueryParam("page") @DefaultValue("0") String rawPage) {
        return RestResponses.execute(() -> {
            ApplicationUser user = guard.currentUser();
            if (query.length() > 100 || query.codePoints().anyMatch(Character::isISOControl) || !Set.of("favourite", "mine", "shared").contains(scope) ||
                    !rawPage.matches("[0-9]{1,4}")) throw new ApiException(400, "Invalid filter search");
            int page = Integer.parseInt(rawPage);
            SharedEntitySearchParametersBuilder builder = new SharedEntitySearchParametersBuilder()
                .setEntitySearchContext(SharedEntitySearchContext.USE).setSortColumn(SharedEntityColumn.NAME, true);
            if (!query.isBlank()) builder.setName(query.trim()).setTextSearchMode(SharedEntitySearchParameters.TextSearchMode.AND);
            if (scope.equals("mine")) builder.setUserName(user.getName());
            if (scope.equals("favourite")) builder.setFavourite(true);
            SharedEntitySearchParameters parameters = builder.toSearchParameters();
            JiraServiceContextImpl context = new JiraServiceContextImpl(user);
            filters.validateForSearch(context, parameters);
            if (context.getErrorCollection().hasAnyErrors()) throw new ApiException(400, "Invalid filter search");
            SharedEntitySearchResult<SearchRequest> result = filters.search(context, parameters, page, PAGE_SIZE);
            ArrayList<Map<String, Object>> values = new ArrayList<>();
            for (SearchRequest found : result.getResults()) {
                SearchRequest allowed;
                try { allowed = guard.filter(user, found.getId()); } catch (ApiException e) { if (e.status == 403) continue; throw e; }
                if (scope.equals("shared") && allowed.getOwner() != null && user.getKey().equals(allowed.getOwner().getKey())) continue;
                values.add(Map.of("id", allowed.getId().toString(), "name", allowed.getName(),
                    "owner", allowed.getOwner() == null ? "" : allowed.getOwner().getDisplayName(), "favourite", favourites.isFavourite(user, allowed)));
            }
            return Map.of("values", values, "page", page, "hasMore", result.hasMoreResults());
        });
    }
}
