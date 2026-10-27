package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.ClusterLockService;
import com.atlassian.jira.permission.GlobalPermissionKey;
import com.atlassian.jira.security.GlobalPermissionManager;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.qixia.jira.filtergantt.ao.GlobalWorkCalendar;
import net.java.ao.*;
import javax.inject.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Named
public class WorkCalendarService {
    private final ActiveObjects ao; private final ClusterLockService locks; private final GlobalPermissionManager permissions;
    @Inject public WorkCalendarService(@ComponentImport ActiveObjects ao,@ComponentImport ClusterLockService locks,@ComponentImport GlobalPermissionManager permissions){this.ao=ao;this.locks=locks;this.permissions=permissions;}
    public record Snapshot(int revision,List<Integer> weekdays,List<String> holidays,List<String> workDates) {
        public Map<String,Object> values(){return Map.of("weekdays",weekdays,"holidays",holidays,"workDates",workDates);}
    }
    private GlobalWorkCalendar[] rows(){return ao.find(GlobalWorkCalendar.class,Query.select().where("IDENTITY_KEY = ?","global"));}
    public Snapshot snapshot(){return ao.executeInTransaction(()->{var rows=rows();if(rows.length==0)return new Snapshot(0,List.of(1,2,3,4,5),List.of(),List.of());var r=rows[0];return new Snapshot(Objects.requireNonNullElse(r.getRevision(),0),ScheduleService.split(r.getWeekdays()).stream().map(Integer::valueOf).toList(),ScheduleService.split(r.getHolidays()),ScheduleService.split(r.getWorkDates()));});}
    public Object get(ApplicationUser user){var s=snapshot();return Map.of("revision",s.revision(),"canEdit",canEdit(user),"calendar",s.values());}
    public boolean canEdit(ApplicationUser user){return permissions.hasPermission(GlobalPermissionKey.ADMINISTER,user)||permissions.hasPermission(GlobalPermissionKey.SYSTEM_ADMIN,user);}
    static int version(Object value){if(!(value instanceof Number n)||n.doubleValue()!=n.intValue()||n.intValue()<0||n.intValue()==Integer.MAX_VALUE)throw WorkScheduler.invalid("工作日历版本无效");return n.intValue();}
    public Snapshot requireRevision(Object revision){int expected=version(revision);var s=snapshot();if(s.revision()!=expected)throw new ApiException(409,"全局工作日历已更新，请刷新后重新排期");return s;}
    public Object save(Map<String,Object> body,ApplicationUser user){
        if(!canEdit(user))throw new ApiException(403,"仅 Jira 管理员可以修改全局工作日历");
        if(body==null||!body.keySet().equals(Set.of("revision","calendar"))||!(body.get("calendar") instanceof Map<?,?> calendar)||!calendar.keySet().equals(Set.of("weekdays","holidays","workDates")))throw WorkScheduler.invalid("全局工作日历字段无效");
        int revision=version(body.get("revision"));
        if(!(calendar.get("weekdays") instanceof List<?> days)||days.isEmpty()||days.size()>7)throw WorkScheduler.invalid("至少选择一个工作日");
        var weekdays=new TreeSet<Integer>();for(Object day:days){if(!(day instanceof Number n)||n.doubleValue()!=n.intValue()||n.intValue()<1||n.intValue()>7)throw WorkScheduler.invalid("工作日无效");weekdays.add(n.intValue());}
        var exceptions=new HashMap<String,SortedSet<String>>();for(String key:List.of("holidays","workDates")){if(!(calendar.get(key) instanceof List<?> dates)||dates.size()>500)throw WorkScheduler.invalid("例外日期无效");var parsed=new TreeSet<String>();for(Object date:dates){if(!(date instanceof String s))throw WorkScheduler.invalid("例外日期无效");parsed.add(WorkScheduler.date(s).toString());}exceptions.put(key,parsed);}
        if(!Collections.disjoint(exceptions.get("holidays"),exceptions.get("workDates")))throw WorkScheduler.invalid("节假日与补班日期冲突");
        var lock=locks.getLockForName("filter-gantt.global-work-calendar");boolean acquired=false;
        try{acquired=lock.tryLock(10,TimeUnit.SECONDS);if(!acquired)throw new ApiException(503,"工作日历正在保存，请稍后重试");
            requireRevision(revision);if(!canEdit(user))throw new ApiException(403,"已无全局工作日历修改权限");
            ao.executeInTransaction(()->{var found=rows();var r=found.length==0?ao.create(GlobalWorkCalendar.class,new DBParam("IDENTITY_KEY","global")):found[0];r.setWeekdays(String.join(",",weekdays.stream().map(String::valueOf).toList()));r.setHolidays(String.join(",",exceptions.get("holidays")));r.setWorkDates(String.join(",",exceptions.get("workDates")));r.setRevision(revision+1);r.save();return null;});
            return Map.of("revision",revision+1,"canEdit",true,"calendar",Map.of("weekdays",List.copyOf(weekdays),"holidays",List.copyOf(exceptions.get("holidays")),"workDates",List.copyOf(exceptions.get("workDates"))));
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(503,"保存被中断");}finally{if(acquired)lock.unlock();}
    }
}
