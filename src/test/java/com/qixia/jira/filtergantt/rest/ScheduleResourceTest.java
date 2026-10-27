package com.qixia.jira.filtergantt.rest;

import com.atlassian.jira.user.ApplicationUser;
import com.qixia.jira.filtergantt.*;
import org.junit.Test;
import java.util.Map;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class ScheduleResourceTest {
    AccessGuard guard=mock(AccessGuard.class);ScheduleService service=mock(ScheduleService.class);ScheduleResource resource=new ScheduleResource(guard,service);
    @Test public void sessionAndCsrfAreRequiredForRealWritesAndPreview(){
        when(guard.currentUser()).thenReturn(mock(ApplicationUser.class));var r=WriteProtectionTest.request();when(r.getHeader("X-Requested-With")).thenReturn(null);
        assertEquals(403,resource.apply("10",Map.of(),r,WriteProtectionTest.uri()).getStatus());assertEquals(403,resource.preview("10",Map.of(),r,WriteProtectionTest.uri()).getStatus());assertEquals(403,resource.source("10",Map.of(),r,WriteProtectionTest.uri()).getStatus());verifyNoInteractions(service);
    }
    @Test public void writeUsesSessionUserAndDoesNotAcceptTargetUser(){
        var user=mock(ApplicationUser.class);when(guard.currentUser()).thenReturn(user);var body=Map.<String,Object>of("filterId","99");
        assertEquals(200,resource.apply("10",body,WriteProtectionTest.request(),WriteProtectionTest.uri()).getStatus());verify(service).run(10,body,user,true);
        assertEquals(400,resource.get("0","99").getStatus());
    }
}
