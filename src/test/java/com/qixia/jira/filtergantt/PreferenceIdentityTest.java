package com.qixia.jira.filtergantt;

import org.junit.Test;
import static org.junit.Assert.*;
public class PreferenceIdentityTest {
    @Test public void identitySeparatesUsersAndGadgetsAndIsDeterministic() {
        assertEquals(PersonalPreferenceStore.identity(1, "user-A"), PersonalPreferenceStore.identity(1, "user-A"));
        assertNotEquals(PersonalPreferenceStore.identity(1, "user-A"), PersonalPreferenceStore.identity(1, "user-B"));
        assertNotEquals(PersonalPreferenceStore.identity(1, "user-A"), PersonalPreferenceStore.identity(2, "user-A"));
        assertEquals(64, PersonalPreferenceStore.identity(1, "user-A").length());
    }
    @Test public void idValidationRejectsOverflowAndJqlInjection() {
        assertEquals(9223372036854775807L, ApiException.positiveId("9223372036854775807"));
        for (String value : new String[]{"0", "-1", "1 OR 1=1", "1.0", "9223372036854775808", "01"}) AccessGuardTest.assertStatus(400, () -> ApiException.positiveId(value));
    }
}
