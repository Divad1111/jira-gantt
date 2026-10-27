package com.qixia.jira.filtergantt;

import com.atlassian.jira.bc.JiraServiceContext;
import com.atlassian.jira.bc.filter.SearchRequestService;
import com.atlassian.jira.bc.portal.PortalPageService;
import com.atlassian.jira.issue.search.SearchRequest;
import com.atlassian.jira.portal.PortalPage;
import com.atlassian.jira.portal.PortletConfiguration;
import com.atlassian.jira.portal.PortletConfigurationManager;
import com.atlassian.jira.security.JiraAuthenticationContext;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.ModuleCompleteKey;
import io.atlassian.fugue.Option;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class AccessGuardTest {
    private final JiraAuthenticationContext auth = mock(JiraAuthenticationContext.class);
    private final PortletConfigurationManager portlets = mock(PortletConfigurationManager.class);
    private final PortalPageService pages = mock(PortalPageService.class);
    private final SearchRequestService filters = mock(SearchRequestService.class);
    private final ApplicationUser user = mock(ApplicationUser.class);
    private final PortletConfiguration gadget = mock(PortletConfiguration.class);
    private final AccessGuard guard = new AccessGuard(auth, portlets, pages, filters);
    @Before public void setup() {
        when(user.isActive()).thenReturn(true); when(auth.getLoggedInUser()).thenReturn(user);
        when(portlets.getByPortletId(10L)).thenReturn(gadget);
        when(gadget.getCompleteModuleKey()).thenReturn(Option.some(new ModuleCompleteKey(AccessGuard.MODULE)));
        when(gadget.getDashboardPageId()).thenReturn(20L);
    }
    @Test public void missingSessionIsUnauthorized() {
        when(auth.getLoggedInUser()).thenReturn(null); assertStatus(401, () -> guard.currentUser());
    }
    @Test public void inactiveUserIsUnauthorized() {
        when(user.isActive()).thenReturn(false); assertStatus(401, () -> guard.currentUser());
    }
    @Test public void correctModuleAndAccessibleDashboardAreRequired() {
        PortalPage page = PortalPage.id(20L).name("Test dashboard").owner(user).build();
        when(pages.getPortalPage(any(JiraServiceContext.class), eq(20L))).thenReturn(page);
        assertSame(gadget, guard.gadget(user, 10L));
        verify(pages).getPortalPage(argThat(ctx -> ctx.getLoggedInApplicationUser() == user), eq(20L));
    }
    @Test public void privateDashboardIsNotExposedByGuessingGadgetId() {
        assertStatus(404, () -> guard.gadget(user, 10L));
    }
    @Test public void missingGadgetAndOtherPluginAreHidden() {
        assertStatus(404, () -> guard.gadget(user, 11L));
        when(gadget.getCompleteModuleKey()).thenReturn(Option.some(new ModuleCompleteKey("other:module")));
        assertStatus(404, () -> guard.gadget(user, 10L)); verifyNoInteractions(pages);
    }
    @Test public void legacyGadgetsWithoutModuleAreRejected() {
        when(gadget.getCompleteModuleKey()).thenReturn(Option.none()); assertStatus(404, () -> guard.gadget(user, 10L));
    }
    @Test public void filterPermissionIsEvaluatedAsViewer() {
        SearchRequest filter = mock(SearchRequest.class);
        when(filters.getFilter(any(JiraServiceContext.class), eq(99L))).thenReturn(filter);
        assertSame(filter, guard.filter(user, 99L));
        verify(filters).getFilter(argThat(ctx -> ctx.getLoggedInApplicationUser() == user), eq(99L));
        assertStatus(403, () -> guard.filter(user, 100L));
    }
    @Test public void dashboardErrorsFailClosedEvenIfObjectReturned() {
        when(pages.getPortalPage(any(JiraServiceContext.class), eq(20L))).thenAnswer(invocation -> {
            invocation.<JiraServiceContext>getArgument(0).getErrorCollection().addErrorMessage("denied");
            return PortalPage.id(20L).name("Test dashboard").owner(user).build();
        });
        assertStatus(404, () -> guard.gadget(user, 10L));
    }
    static void assertStatus(int expected, Runnable fn) {
        try { fn.run(); fail("Expected API error " + expected); } catch (ApiException e) { assertEquals(expected, e.status); }
    }
}
