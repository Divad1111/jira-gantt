package com.qixia.jira.filtergantt.rest;

import com.atlassian.jira.bc.JiraServiceContext;
import com.atlassian.jira.bc.favourites.FavouritesService;
import com.atlassian.jira.bc.filter.SearchRequestService;
import com.atlassian.jira.issue.search.SearchRequest;
import com.atlassian.jira.sharing.search.SharedEntitySearchParameters;
import com.atlassian.jira.sharing.search.SharedEntitySearchResult;
import com.atlassian.jira.user.ApplicationUser;
import com.qixia.jira.filtergantt.AccessGuard;
import com.qixia.jira.filtergantt.ApiException;
import org.junit.Before;
import org.junit.Test;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class FilterResourceTest {
    private final AccessGuard guard = mock(AccessGuard.class);
    private final SearchRequestService filters = mock(SearchRequestService.class);
    private final FavouritesService favourites = mock(FavouritesService.class);
    private final ApplicationUser user = mock(ApplicationUser.class);
    @SuppressWarnings("unchecked") private final SharedEntitySearchResult<SearchRequest> result = mock(SharedEntitySearchResult.class);
    private final FilterResource resource = new FilterResource(guard, filters, favourites);
    @Before public void setup() {
        when(guard.currentUser()).thenReturn(user); when(user.getName()).thenReturn("viewer"); when(user.getKey()).thenReturn("viewer-key");
        when(filters.search(any(JiraServiceContext.class), any(), anyInt(), eq(25))).thenReturn(result);
        when(result.getResults()).thenReturn(List.of());
    }
    @Test public void invalidQueryAndScopeFailBeforeSearch() {
        assertEquals(400, resource.search("a".repeat(101), "shared", "0").getStatus());
        assertEquals(400, resource.search("a\nb", "mine", "0").getStatus());
        assertEquals(400, resource.search("", "all-admin", "0").getStatus());
        assertEquals(400, resource.search("", "mine", "-1").getStatus()); verifyNoInteractions(filters);
    }
    @Test public void mineUsesViewerOwnerAndPageNumber() {
        assertEquals(200, resource.search("my plan", "mine", "2").getStatus());
        verify(filters).search(argThat(ctx -> ctx.getLoggedInApplicationUser() == user), argThat(p -> "viewer".equals(p.getUserName()) && "my plan".equals(p.getName())), eq(2), eq(25));
    }
    @Test public void favouriteScopeIsExplicit() {
        resource.search("", "favourite", "0");
        verify(filters).search(any(), argThat(p -> Boolean.TRUE.equals(p.getFavourite())), eq(0), eq(25));
    }
    @Test public void revokedResultsAreRemovedAndJqlNeverSerialized() {
        SearchRequest allowed = mock(SearchRequest.class), denied = mock(SearchRequest.class);
        when(allowed.getId()).thenReturn(1L); when(allowed.getName()).thenReturn("public plan");
        when(denied.getId()).thenReturn(2L); when(guard.filter(user, 1)).thenReturn(allowed);
        when(guard.filter(user, 2)).thenThrow(new ApiException(403, "hidden"));
        when(result.getResults()).thenReturn(List.of(allowed, denied)); when(favourites.isFavourite(user, allowed)).thenReturn(true);
        var response = resource.search("", "shared", "0"); assertEquals(200, response.getStatus());
        @SuppressWarnings("unchecked") Map<String, Object> body = (Map<String, Object>) response.getEntity();
        @SuppressWarnings("unchecked") List<Map<String, Object>> values = (List<Map<String, Object>>) body.get("values");
        assertEquals(1, values.size()); assertEquals("1", values.get(0).get("id")); assertEquals(true, values.get(0).get("favourite"));
        assertFalse(values.get(0).containsKey("jql")); verify(allowed, never()).getQuery(); verify(denied, never()).getName();
    }
    @Test public void sharedScopeExcludesOwnFiltersAndRetainsMorePagesFlag() {
        SearchRequest owned = mock(SearchRequest.class); when(owned.getId()).thenReturn(1L); when(owned.getOwner()).thenReturn(user);
        when(guard.filter(user, 1)).thenReturn(owned); when(result.getResults()).thenReturn(List.of(owned)); when(result.hasMoreResults()).thenReturn(true);
        var response = resource.search("", "shared", "0");
        assertTrue(((Map<?, ?>)response.getEntity()).get("values") instanceof List<?> values && values.isEmpty());
        assertEquals(true, ((Map<?, ?>)response.getEntity()).get("hasMore"));
    }
}
