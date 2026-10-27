package com.qixia.jira.filtergantt;

import org.junit.Test;
import java.time.LocalDate;
import java.util.*;
import static org.junit.Assert.*;
import static com.qixia.jira.filtergantt.AccessGuardTest.assertStatus;

public class WorkSchedulerTest {
    private WorkScheduler.Calendar calendar() {var c=new WorkScheduler.Calendar();c.start=LocalDate.of(2026,10,30);return c;}
    private WorkScheduler.Task task(String id,String person,String estimate) {return new WorkScheduler.Task(id,person,estimate);}
    @Test public void packSmallTasksSameDayThenMoveWholeTaskToMonday() {
        var a=task("1","A","6h");var b=task("2","A","4h");var c=task("3","A","4h");var d=task("4","B","1d");
        WorkScheduler.schedule(List.of(a,b,c,d),calendar());
        assertEquals("2026-10-30",a.endDate);assertEquals("2026-11-02",b.startDate);assertEquals(b.startDate,c.startDate);assertEquals(a.startDate,d.startDate);assertEquals(3,c.sequence);
    }
    @Test public void longTasksSkipWeekendsHolidayAndRespectMakeupDay() {
        var c=calendar(); c.holidays.add(LocalDate.of(2026,11,2)); c.workDates.add(LocalDate.of(2026,10,31));var a=task("1","A","3d");
        WorkScheduler.schedule(List.of(a),c); assertEquals("2026-11-03",a.endDate);
    }
    @Test public void dragCascadesOnlyFollowingResourceTasksAndDependencies() {
        var a=task("1","A","1d");a.notBefore="2026-11-04";var b=task("2","A","1d");var c=task("3","B","1d");c.predecessors.add("2");var d=task("4","C","1d");
        WorkScheduler.schedule(List.of(a,b,c,d),calendar());assertEquals("2026-11-05",b.startDate);assertEquals("2026-11-06",c.startDate);assertEquals("2026-10-30",d.startDate);
    }
    @Test public void dependencyReordersAcrossPeopleButConflictingPersonOrderIsRejected() {
        var a=task("1","A","1h");var b=task("2","B","1h");a.predecessors.add("2");WorkScheduler.schedule(List.of(a,b),calendar());assertEquals("2026-11-02",a.startDate);
        b.assigneeKey="A"; assertStatus(400,()->WorkScheduler.schedule(List.of(a,b),calendar()));
    }
    @Test public void locksReserveCapacityAndDetectOrderConflict() {
        var a=task("1","A","1d");a.locked=true;a.startDate="2026-11-02";a.endDate="2026-11-02";var b=task("2","A","1d");
        WorkScheduler.schedule(List.of(a,b),calendar());assertEquals("2026-11-03",b.startDate);
        b.notBefore="2026-11-04";assertStatus(400,()->WorkScheduler.schedule(List.of(b,a),calendar()));
    }
    @Test public void invalidEstimateMissingAssigneeAndExternalDependencyRejected() {
        assertStatus(400,()->WorkScheduler.hours("0h",calendar())); assertStatus(400,()->WorkScheduler.hours("-1d",calendar()));assertStatus(400,()->WorkScheduler.hours("NaN",calendar()));
        var a=task("1","","1h");assertStatus(400,()->WorkScheduler.schedule(List.of(a),calendar()));a.assigneeKey="A";a.predecessors.add("9");assertStatus(400,()->WorkScheduler.schedule(List.of(a),calendar()));
    }
    @Test public void usesJiraUnitDefinitionsAndSkipsCompletedTasks() {
        var c=calendar();c.hoursPerDay=6;c.daysPerWeek=4;assertEquals(31,WorkScheduler.hours(" 1w 1d 1h ",c),.001);
        var a=task("1","","0h");a.done=true;var b=task("2","A","1h");b.predecessors.add("1");WorkScheduler.schedule(List.of(a,b),c);assertEquals("2026-10-30",b.startDate);
    }
}
