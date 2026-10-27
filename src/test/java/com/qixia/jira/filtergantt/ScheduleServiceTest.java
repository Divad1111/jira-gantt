package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.*;
import com.atlassian.jira.bc.issue.IssueService;
import com.atlassian.jira.config.properties.*;
import com.atlassian.jira.datetime.*;
import com.atlassian.jira.issue.*;
import com.atlassian.jira.issue.link.IssueLinkManager;
import com.atlassian.jira.timezone.*;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.jira.user.util.UserManager;
import com.atlassian.sal.api.transaction.TransactionCallback;
import com.qixia.jira.filtergantt.ao.GadgetSchedule;
import net.java.ao.*;
import org.junit.*;
import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.mockito.Mockito.*;
import static org.junit.Assert.*;
import static com.qixia.jira.filtergantt.AccessGuardTest.assertStatus;

public class ScheduleServiceTest {
    ActiveObjects ao=mock(ActiveObjects.class);ClusterLockService locks=mock(ClusterLockService.class);ClusterLock lock=mock(ClusterLock.class);
    AccessGuard guard=mock(AccessGuard.class);IssueService issues=mock(IssueService.class);UserManager users=mock(UserManager.class);ApplicationProperties props=mock(ApplicationProperties.class);
    IssueLinkManager links=mock(IssueLinkManager.class);CustomFieldManager fields=mock(CustomFieldManager.class,RETURNS_DEEP_STUBS);DateTimeFormatter formatter=mock(DateTimeFormatter.class,RETURNS_SELF);TimeZoneService zones=mock(TimeZoneService.class,RETURNS_DEEP_STUBS);
    ApplicationUser user=mock(ApplicationUser.class);com.atlassian.jira.portal.PortletConfiguration gadget=mock(com.atlassian.jira.portal.PortletConfiguration.class);
    MutableIssue issue=mock(MutableIssue.class,RETURNS_DEEP_STUBS);IssueInputParameters params=mock(IssueInputParameters.class,RETURNS_SELF);
    IssueService.UpdateValidationResult valid=mock(IssueService.UpdateValidationResult.class);IssueService.IssueResult read=mock(IssueService.IssueResult.class);
    GadgetSchedule options=mock(GadgetSchedule.class);
    Date writtenDate=new Date(1793318400000L);
    WorkCalendarService calendars=mock(WorkCalendarService.class);
    ScheduleService service=new ScheduleService(ao,locks,guard,issues,users,props,links,fields,formatter,zones,calendars);
    @Before public void setup() throws Exception {
        var calendar=new WorkCalendarService.Snapshot(0,List.of(1,2,3,4,5),List.of(),List.of());when(calendars.snapshot()).thenReturn(calendar);when(calendars.requireRevision(any())).thenReturn(calendar);
        when(guard.gadget(user,10)).thenReturn(gadget);when(guard.ownsDashboard(user,10)).thenReturn(true);
        when(gadget.getUserPrefs()).thenReturn(Map.of("startDateFieldId","customfield_10000","endDateFieldId","duedate"));
        when(fields.getCustomFieldObject("customfield_10000").getCustomFieldType().getKey()).thenReturn("com.atlassian.jira.plugin.system.customfieldtypes:datepicker");
        when(zones.getUserTimeZoneInfo(any()).getTimeZoneId()).thenReturn("UTC");when(formatter.format(any())).thenReturn("30/Oct/26");
        when(ao.executeInTransaction(any())).thenAnswer(i->i.<TransactionCallback<Object>>getArgument(0).doInTransaction());
        when(ao.find(eq(GadgetSchedule.class),any(Query.class))).thenReturn(new GadgetSchedule[0]);when(ao.create(eq(GadgetSchedule.class),any(DBParam[].class))).thenReturn(options);
        when(locks.getLockForName(anyString())).thenReturn(lock);when(lock.tryLock(10,TimeUnit.SECONDS)).thenReturn(true);
        when(issues.getIssue(user,1L)).thenReturn(read);when(read.isValid()).thenReturn(true);when(read.getIssue()).thenReturn(issue);
        when(issue.getId()).thenReturn(1L);when(issue.getKey()).thenReturn("DEMO-1");when(issue.getUpdated()).thenReturn(new Timestamp(1000));when(issue.getStatus().getStatusCategory().getKey()).thenReturn("new");
        when(issue.getAssignee()).thenReturn(user);when(user.getKey()).thenReturn("A");when(issue.getOriginalEstimate()).thenReturn(28800L);
        when(users.getUserByKey("A")).thenReturn(user);when(user.getName()).thenReturn("alice");when(user.isActive()).thenReturn(true);
        when(links.getInwardLinks(1L)).thenReturn(List.of());when(issues.newIssueInputParameters()).thenReturn(params);
        when(valid.isValid()).thenReturn(true);when(valid.getFieldValuesHolder()).thenReturn(Map.of("customfield_10000",writtenDate,"customfield_10110",writtenDate,"duedate",writtenDate));when(issues.validateUpdate(user,1L,params)).thenReturn(valid);when(issues.update(user,valid)).thenAnswer(i->{persistDates();return read;});
    }
    void persistDates(){when(issue.getCustomFieldValue(any())).thenReturn(writtenDate);when(issue.getDueDate()).thenReturn(new Timestamp(writtenDate.getTime()));}
    Map<String,Object> body(){return new HashMap<>(Map.of("filterId","99","revision",0,"calendarRevision",0,"startDate","2026-10-30","calendar",Map.of("weekdays",List.of(1,2,3,4,5),"holidays",List.of(),"workDates",List.of(),"timeZone","UTC"),"tasks",List.of(Map.of("issueId","1","assigneeKey","A","estimate","4h","updatedMillis","1000","note","说明"))));}
    @Test public void previewValidatesActualJiraFieldsWithoutWriting() {
        var result=(Map<?,?>)service.run(10,body(),user,false);assertEquals(1,result.get("changeCount"));
        verify(params).addCustomFieldValue(eq("customfield_10000"),eq("30/Oct/26"));verify(params).setDueDate("30/Oct/26");verify(params).setOriginalAndRemainingEstimate("240m","240m");verify(params).setComment("说明");
        verify(issues,never()).update(any(),any());verify(params,never()).setSkipScreenCheck(true);
    }
    @Test public void applyCallsJiraUpdateAndStoresOnlyOrder() {
        var result=(Map<?,?>)service.run(10,body(),user,true);assertEquals(true,result.get("allSaved"));assertEquals(true,result.get("preferencesSaved"));
        verify(issues).update(user,valid);verify(options).setOrderIds("1");verify(options).save();verify(lock,times(2)).unlock();
    }
    @Test public void readonlyViewerCannotPreviewOrApplyEvenWithForgedBody() {
        when(guard.ownsDashboard(user,10)).thenReturn(false);
        assertStatus(403,()->service.run(10,body(),user,false));assertStatus(403,()->service.run(10,body(),user,true));verifyNoInteractions(issues,ao);
    }
    @Test public void createdAndUpdatedFieldsAreNeverWritable() {
        when(gadget.getUserPrefs()).thenReturn(Map.of("startDateFieldId","created","endDateFieldId","duedate"));
        assertStatus(400,()->service.run(10,body(),user,true));verifyNoInteractions(issues);
        assertFalse(service.writableField("updated"));assertFalse(service.writableField("summary"));
    }
    @Test public void concurrentIssueChangeRejectedBeforeUpdate() {
        when(issue.getUpdated()).thenReturn(new Timestamp(2000));assertStatus(409,()->service.run(10,body(),user,true));verify(issues,never()).update(any(),any());
    }
    @Test public void fieldOrPermissionValidationErrorBlocksWholeBatch() {
        when(valid.isValid()).thenReturn(false);when(valid.getErrorCollection()).thenReturn(new com.atlassian.jira.util.SimpleErrorCollection());
        assertStatus(400,()->service.run(10,body(),user,true));verify(issues,never()).update(any(),any());
    }
    @Test public void jiraUpdateFailureIsReportedAndNoPreferenceSuccessClaimed() {
        var failure=mock(IssueService.IssueResult.class);when(failure.isValid()).thenReturn(false);when(failure.getErrorCollection()).thenReturn(new com.atlassian.jira.util.SimpleErrorCollection());doReturn(failure).when(issues).update(user,valid);
        var result=(Map<?,?>)service.run(10,body(),user,true);assertEquals(false,result.get("allSaved"));assertEquals(false,result.get("preferencesSaved"));
        assertEquals("failed",((Map<?,?>)((List<?>)result.get("results")).get(0)).get("status"));verify(options,never()).save();
    }
    @Test public void legacyLoggedWorkCannotSilentlyChangeOriginalEstimate() {
        when(props.getOption(APKeys.JIRA_OPTION_TIMETRACKING_ESTIMATES_LEGACY_BEHAVIOUR)).thenReturn(true);when(issue.getTimeSpent()).thenReturn(3600L);
        assertStatus(400,()->service.run(10,body(),user,true));verify(issues,never()).update(any(),any());
    }
    @Test public void reassignmentUsesResolvedUsernameAndEstimateRetainsSpentWork() {
        var assignee=mock(ApplicationUser.class);when(assignee.isActive()).thenReturn(true);when(assignee.getName()).thenReturn("bob");when(users.getUserByKey("user-key-B")).thenReturn(assignee);
        when(issue.getTimeSpent()).thenReturn(3600L);var b=body();b.put("tasks",List.of(Map.of("issueId","1","assigneeKey","user-key-B","estimate","4h","updatedMillis","1000")));
        service.run(10,b,user,true);verify(params).setAssigneeId("bob");verify(params).setOriginalAndRemainingEstimate("240m","180m");verify(issue,never()).setTimeSpent(any());
    }
    @Test public void batchReportsSavedFailedAndNotAttemptedSeparately() {
        var b=body();b.put("tasks",List.of(Map.of("issueId","1","assigneeKey","A","estimate","4h","updatedMillis","1000"),Map.of("issueId","2","assigneeKey","A","estimate","4h","updatedMillis","1000"),Map.of("issueId","3","assigneeKey","A","estimate","4h","updatedMillis","1000")));
        var second=mock(MutableIssue.class,RETURNS_DEEP_STUBS);var third=mock(MutableIssue.class,RETURNS_DEEP_STUBS);
        for(var entry:Map.of(2L,second,3L,third).entrySet()){
            var r=mock(IssueService.IssueResult.class);when(r.isValid()).thenReturn(true);when(r.getIssue()).thenReturn(entry.getValue());when(issues.getIssue(user,entry.getKey())).thenReturn(r);
            when(entry.getValue().getId()).thenReturn(entry.getKey());when(entry.getValue().getKey()).thenReturn("DEMO-"+entry.getKey());when(entry.getValue().getUpdated()).thenReturn(new Timestamp(1000));when(entry.getValue().getStatus().getStatusCategory().getKey()).thenReturn("new");when(entry.getValue().getOriginalEstimate()).thenReturn(28800L);when(entry.getValue().getAssignee()).thenReturn(user);when(links.getInwardLinks(entry.getKey())).thenReturn(List.of());
        }
        when(issues.validateUpdate(eq(user),anyLong(),eq(params))).thenReturn(valid);doAnswer(i->{persistDates();return read;}).doThrow(new IllegalStateException("fail")).when(issues).update(user,valid);
        var result=(Map<?,?>)service.run(10,b,user,true);var results=(List<?>)result.get("results");assertEquals("saved",((Map<?,?>)results.get(0)).get("status"));assertEquals("failed",((Map<?,?>)results.get(1)).get("status"));assertEquals("notAttempted",((Map<?,?>)results.get(2)).get("status"));verify(issues,times(2)).update(user,valid);
    }
    @Test public void roadmapTargetDatesAreEditableAndUseDatePickerFormatting() {
        when(fields.getCustomFieldObject("customfield_10000").getCustomFieldType().getKey()).thenReturn("com.atlassian.jpo:jpo-custom-field-baseline-start");
        when(fields.getCustomFieldObject("customfield_10110").getCustomFieldType().getKey()).thenReturn("com.atlassian.jpo:jpo-custom-field-baseline-end");
        when(gadget.getUserPrefs()).thenReturn(Map.of("startDateFieldId","customfield_10000","endDateFieldId","customfield_10110"));
        var metadata=(Map<?,?>)service.get(10,99,user);assertEquals(true,metadata.get("canEdit"));assertEquals(false,metadata.get("configurationRequired"));
        service.run(10,body(),user,false);verify(params).addCustomFieldValue("customfield_10000","30/Oct/26");verify(params).addCustomFieldValue("customfield_10110","30/Oct/26");verify(formatter,times(2)).withStyle(DateTimeStyle.DATE_PICKER);verify(issues,never()).update(any(),any());
    }
    @Test public void legacyCreatedMappingExplainsWhyDragAndSchedulingAreBlocked() {
        when(gadget.getUserPrefs()).thenReturn(Map.of("startDateFieldId","created","endDateFieldId","duedate"));
        var metadata=(Map<?,?>)service.get(10,99,user);assertEquals(false,metadata.get("canEdit"));assertEquals(true,metadata.get("configurationRequired"));assertTrue(metadata.get("reason").toString().contains("created"));
        assertStatus(400,()->service.run(10,body(),user,true));verifyNoInteractions(issues);
    }
    @Test public void actualSourceReturnsFullMillisecondsTogetherWithEditableValues() {
        when(issue.getUpdated()).thenReturn(new Timestamp(1135));when(issue.getEstimate()).thenReturn(14400L);when(user.getDisplayName()).thenReturn("Alice");
        var response=(Map<?,?>)service.source(10,Map.of("filterId","99","issueIds",List.of("1")),user);var task=(Map<?,?>)((List<?>)response.get("tasks")).get(0);var values=(Map<?,?>)task.get("source");
        assertEquals("1135",task.get("updatedMillis"));assertEquals("A",values.get("assigneeKey"));assertEquals("8h",values.get("estimate"));assertEquals(0.5,values.get("progress"));verify(issues,never()).update(any(),any());verifyNoInteractions(ao);
    }
    @Test public void realChangesWithinSameSecondStillConflict() {
        when(issue.getUpdated()).thenReturn(new Timestamp(1135));ScheduleService.snapshot(issue,"1135");assertStatus(409,()->ScheduleService.snapshot(issue,"1100"));
    }
    @Test public void sourceCannotExposeUnreadableIssuesOrAcceptInjectedFields() {
        when(read.isValid()).thenReturn(false);assertStatus(403,()->service.source(10,Map.of("filterId","99","issueIds",List.of("1")),user));
        assertStatus(400,()->service.source(10,Map.of("filterId","99","issueIds",List.of("1"),"userKey","other"),user));
    }
    @Test public void ignoredDateFieldIsRejectedBeforeAnyJiraWrite(){when(valid.getFieldValuesHolder()).thenReturn(Map.of("duedate",writtenDate));assertStatus(400,()->service.run(10,body(),user,true));verify(issues,never()).update(any(),any());}
    @Test public void customFieldFormParametersAreReadFromValidatedIssue(){var staged=mock(MutableIssue.class);when(staged.getCustomFieldValue(any())).thenReturn(writtenDate);when(staged.getDueDate()).thenReturn(new Timestamp(writtenDate.getTime()));when(valid.getIssue()).thenReturn(staged);when(valid.getFieldValuesHolder()).thenReturn(Map.of("customfield_10000",new Object(),"duedate",writtenDate));service.run(10,body(),user,false);verify(issues,never()).update(any(),any());}
    @Test public void updateSuccessWithoutPersistedDatesIsReportedAsFailure(){doReturn(read).when(issues).update(user,valid);var result=(Map<?,?>)service.run(10,body(),user,true);assertEquals(false,result.get("allSaved"));assertEquals("failed",((Map<?,?>)((List<?>)result.get("results")).get(0)).get("status"));verify(options,never()).save();}
    @Test public void schedulingIgnoresForgedPerGadgetCalendarAndUsesGlobalHolidays(){when(calendars.requireRevision(any())).thenReturn(new WorkCalendarService.Snapshot(0,List.of(1,2,3,4,5),List.of("2026-10-30"),List.of()));var result=(Map<?,?>)service.run(10,body(),user,false);assertEquals("2026-11-02",((Map<?,?>)((List<?>)result.get("tasks")).get(0)).get("startDate"));}
    @Test public void staleGlobalCalendarBlocksTheEntireBatchBeforeWriting(){when(calendars.requireRevision(any())).thenThrow(new ApiException(409,"全局工作日历已更新"));assertStatus(409,()->service.run(10,body(),user,true));verify(issues,never()).update(any(),any());}
    @Test public void schedulingDoesNotChangeTheGlobalCalendar(){service.run(10,body(),user,true);verify(calendars,never()).save(any(),any());verify(options,never()).setWeekdays(any());verify(options,never()).setHolidays(any());verify(options,never()).setWorkDates(any());}

}
