package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.*;
import com.atlassian.jira.security.GlobalPermissionManager;
import com.atlassian.jira.permission.GlobalPermissionKey;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.sal.api.transaction.TransactionCallback;
import com.qixia.jira.filtergantt.ao.GlobalWorkCalendar;
import net.java.ao.*;
import org.junit.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.mockito.Mockito.*;
import static org.junit.Assert.*;
import static com.qixia.jira.filtergantt.AccessGuardTest.assertStatus;

public class WorkCalendarServiceTest {
    ActiveObjects ao=mock(ActiveObjects.class);ClusterLockService locks=mock(ClusterLockService.class);ClusterLock lock=mock(ClusterLock.class);
    GlobalPermissionManager permissions=mock(GlobalPermissionManager.class);ApplicationUser user=mock(ApplicationUser.class);GlobalWorkCalendar row=mock(GlobalWorkCalendar.class);
    WorkCalendarService service=new WorkCalendarService(ao,locks,permissions);
    @Before public void setup() throws Exception {
        when(ao.executeInTransaction(any())).thenAnswer(i->i.<TransactionCallback<Object>>getArgument(0).doInTransaction());when(ao.find(eq(GlobalWorkCalendar.class),any(Query.class))).thenReturn(new GlobalWorkCalendar[0]);when(ao.create(eq(GlobalWorkCalendar.class),any(DBParam[].class))).thenReturn(row);
        when(locks.getLockForName(anyString())).thenReturn(lock);when(lock.tryLock(10,TimeUnit.SECONDS)).thenReturn(true);when(permissions.hasPermission(GlobalPermissionKey.ADMINISTER,user)).thenReturn(true);
    }
    Map<String,Object> body(){return new HashMap<>(Map.of("revision",0,"calendar",Map.of("weekdays",List.of(1,2,3,4,5),"holidays",List.of("2026-11-02"),"workDates",List.of("2026-11-07"))));}
    @Test public void defaultsAreSharedWithoutCreatingPerGadgetRecords(){var result=service.snapshot();assertEquals(List.of(1,2,3,4,5),result.weekdays());assertEquals(0,result.revision());verify(ao,never()).create(any(),any(DBParam[].class));}
    @Test public void onlyJiraAdministratorsMayChangeTheCalendar(){when(permissions.hasPermission(GlobalPermissionKey.ADMINISTER,user)).thenReturn(false);assertStatus(403,()->service.save(body(),user));verifyNoInteractions(ao);assertEquals(false,((Map<?,?>)service.get(user)).get("canEdit"));}
    @Test public void validatedGlobalSettingsAreSavedWithRevisionUnderClusterLock(){var result=(Map<?,?>)service.save(body(),user);assertEquals(1,result.get("revision"));verify(row).setWeekdays("1,2,3,4,5");verify(row).setHolidays("2026-11-02");verify(row).setWorkDates("2026-11-07");verify(row).setRevision(1);verify(row).save();verify(lock).unlock();}
    @Test public void staleGlobalRevisionCannotOverwriteAnotherAdministrator(){var b=body();b.put("revision",2);assertStatus(409,()->service.save(b,user));verify(row,never()).save();verify(lock).unlock();}
    @Test public void calendarRequiresWorkDaysValidDatesAndDisjointExceptions(){for(var calendar:List.of(Map.of("weekdays",List.of(),"holidays",List.of(),"workDates",List.of()),Map.of("weekdays",List.of(8),"holidays",List.of(),"workDates",List.of()),Map.of("weekdays",List.of(1),"holidays",List.of("2026-02-30"),"workDates",List.of()),Map.of("weekdays",List.of(1),"holidays",List.of("2026-11-02"),"workDates",List.of("2026-11-02")))){var b=body();b.put("calendar",calendar);assertStatus(400,()->service.save(b,user));}verify(row,never()).save();}
    @Test public void persistedCalendarIsUsedByEveryCallerAndRequiresCurrentVersion(){when(ao.find(eq(GlobalWorkCalendar.class),any(Query.class))).thenReturn(new GlobalWorkCalendar[]{row});when(row.getRevision()).thenReturn(3);when(row.getWeekdays()).thenReturn("1,3,5");when(row.getHolidays()).thenReturn("2026-11-02");when(row.getWorkDates()).thenReturn("2026-11-07");var s=service.requireRevision(3);assertEquals(List.of(1,3,5),s.weekdays());assertEquals(List.of("2026-11-07"),s.workDates());assertStatus(409,()->service.requireRevision(2));assertStatus(400,()->service.requireRevision(null));}
}
