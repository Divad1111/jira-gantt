package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.ClusterLockService;
import com.atlassian.beehive.ClusterLock;
import com.atlassian.sal.api.transaction.TransactionCallback;
import com.qixia.jira.filtergantt.ao.PersonalGanttPreference;
import net.java.ao.DBParam;
import net.java.ao.Query;
import org.junit.Before;
import org.junit.Test;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class PersonalPreferenceStoreTest {
    private final ActiveObjects ao = mock(ActiveObjects.class);
    private final ClusterLockService locks = mock(ClusterLockService.class);
    private final ClusterLock lock = mock(ClusterLock.class);
    private final PersonalGanttPreference row = mock(PersonalGanttPreference.class);
    private final PersonalPreferenceStore store = new PersonalPreferenceStore(ao, locks);
    @Before public void setup() throws Exception {
        when(locks.getLockForName(anyString())).thenReturn(lock); when(lock.tryLock(10, TimeUnit.SECONDS)).thenReturn(true);
        when(ao.executeInTransaction(any())).thenAnswer(inv -> inv.<TransactionCallback<Object>>getArgument(0).doInTransaction());
        when(ao.find(eq(PersonalGanttPreference.class), any(Query.class))).thenReturn(new PersonalGanttPreference[0]);
        when(ao.create(eq(PersonalGanttPreference.class), any(DBParam[].class))).thenReturn(row);
    }
    @Test public void missingReadReturnsDefaultWithoutCreatingAnything() {
        assertEquals(true, store.get(10, "A").get("usesDefault")); verify(ao, never()).create(eq(PersonalGanttPreference.class), any(DBParam[].class)); verifyNoInteractions(locks);
    }
    @Test public void repeatedWritesUpdateExistingRowUnderSameClusterLock() {
        store.write(10, "A", 100L, "week", false);
        when(ao.find(eq(PersonalGanttPreference.class), any(Query.class))).thenReturn(new PersonalGanttPreference[]{row});
        store.write(10, "A", 200L, "month", false);
        verify(ao, times(1)).create(eq(PersonalGanttPreference.class), any(DBParam[].class)); verify(row).setSelectedFilterId(200L);
        verify(locks, times(2)).getLockForName("filter-gantt.preference." + PersonalPreferenceStore.identity(10, "A")); verify(lock, times(2)).unlock();
    }
    @Test public void lockFailureDoesNotWrite() throws Exception {
        when(lock.tryLock(10, TimeUnit.SECONDS)).thenReturn(false);
        AccessGuardTest.assertStatus(503, () -> store.write(10, "A", 100L, "week", false)); verifyNoInteractions(ao); verify(lock, never()).unlock();
    }
    @Test public void deleteUsesScopedFindAndLeavesNoReplacementRow() {
        when(ao.find(eq(PersonalGanttPreference.class), any(Query.class))).thenReturn(new PersonalGanttPreference[]{row});
        assertEquals(true, store.write(10, "A", null, null, true).get("usesDefault"));
        verify(ao).delete(row); verify(ao, never()).create(eq(PersonalGanttPreference.class), any(DBParam[].class));
    }
    @Test public void failedTransactionReleasesClusterLock() {
        doThrow(new IllegalStateException("database unavailable")).when(ao).executeInTransaction(any());
        try { store.write(10, "A", null, "week", false); fail(); } catch (IllegalStateException expected) { verify(lock).unlock(); }
    }
}
