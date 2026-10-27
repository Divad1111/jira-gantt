package com.qixia.jira.filtergantt.rest;

import com.atlassian.jira.portal.PortletConfiguration;
import com.atlassian.jira.user.ApplicationUser;
import com.qixia.jira.filtergantt.*;
import org.junit.Before;
import org.junit.Test;
import java.util.Map;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class PersonalResourceTest {
    private final AccessGuard guard = mock(AccessGuard.class);
    private final PersonalPreferenceStore store = mock(PersonalPreferenceStore.class);
    private final ApplicationUser user = mock(ApplicationUser.class);
    private final PortletConfiguration gadget = mock(PortletConfiguration.class);
    private final PersonalResource resource = new PersonalResource(guard, store);
    @Before public void setup() {
        when(guard.currentUser()).thenReturn(user); when(user.getKey()).thenReturn("viewer-B");
        when(guard.gadget(user, 10L)).thenReturn(gadget); when(guard.selectable(gadget)).thenReturn(true);
    }
    @Test public void readOnlyUsesSessionUserAndDoesNotWrite() {
        when(store.get(10L, "viewer-B")).thenReturn(Map.of("usesDefault", true));
        assertEquals(200, resource.get("10").getStatus()); verify(store).get(10L, "viewer-B"); verifyNoMoreInteractions(store);
    }
    @Test public void spoofedIdentityOrUnknownFieldsAreRejected() {
        assertEquals(400, resource.put("10", Map.of("userKey", "victim", "selectedFilterId", "99"), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus());
        verifyNoInteractions(store);
    }
    @Test public void preferenceWritesAreViewerScopedAndFilterChecked() {
        assertEquals(200, resource.put("10", Map.of("selectedFilterId", "99", "scale", "week"), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus());
        verify(guard).filter(user, 99L); verify(store).write(10L, "viewer-B", 99L, "week", false);
    }
    @Test public void inaccessibleFilterRejectsWrite() {
        when(guard.filter(user, 99L)).thenThrow(new ApiException(403, "unavailable"));
        assertEquals(403, resource.put("10", Map.of("selectedFilterId", "99"), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus()); verifyNoInteractions(store);
    }
    @Test public void fixedModeHidesPersonalChoiceAndRejectsUpdates() {
        when(guard.selectable(gadget)).thenReturn(false);
        assertEquals(200, resource.get("10").getStatus()); verifyNoInteractions(store);
        assertEquals(403, resource.put("10", Map.of("selectedFilterId", "99"), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus()); verifyNoInteractions(store);
    }
    @Test public void guessedPrivateGadgetFailsBeforeAnyStorageAccess() {
        when(guard.gadget(user, 10L)).thenThrow(new ApiException(404, "unavailable"));
        assertEquals(404, resource.get("10").getStatus());
        assertEquals(404, resource.delete("10", WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus()); verifyNoInteractions(store);
    }
    @Test public void invalidIdScaleAndNonStringFilterFail() {
        assertEquals(400, resource.get("1 OR 1=1").getStatus());
        assertEquals(400, resource.put("10", Map.of("scale", "year"), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus());
        assertEquals(400, resource.put("10", Map.of("selectedFilterId", 99), WriteProtectionTest.request(), WriteProtectionTest.uri()).getStatus()); verifyNoInteractions(store);
    }
    @Test public void deleteClearsOnlyCurrentUsersRowAndReturnsNoStoreHeader() {
        var response = resource.delete("10", WriteProtectionTest.request(), WriteProtectionTest.uri());
        assertEquals(200, response.getStatus()); assertTrue(response.getHeaderString("Cache-Control").contains("no-store"));
        verify(store).write(10L, "viewer-B", null, null, true);
    }
    @Test public void unauthenticatedRequestsNeverReachDatabase() {
        when(guard.currentUser()).thenThrow(new ApiException(401, "login"));
        assertEquals(401, resource.get("10").getStatus()); verifyNoInteractions(store);
    }
}
