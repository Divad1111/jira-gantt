package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.ClusterLockService;
import com.atlassian.jira.bc.JiraServiceContextImpl;
import com.atlassian.jira.bc.issue.IssueService;
import com.atlassian.jira.config.properties.*;
import com.atlassian.jira.datetime.*;
import com.atlassian.jira.issue.*;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.link.IssueLinkManager;
import com.atlassian.jira.timezone.TimeZoneService;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.jira.user.util.UserManager;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.qixia.jira.filtergantt.ao.GadgetSchedule;
import net.java.ao.*;
import javax.inject.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Lock;

@Named
public class ScheduleService {
    private static final Set<String> DAY_TYPES=Set.of("com.atlassian.jira.plugin.system.customfieldtypes:datepicker","com.atlassian.jpo:jpo-custom-field-baseline-start","com.atlassian.jpo:jpo-custom-field-baseline-end");
    private static final String DATE_TIME_TYPE="com.atlassian.jira.plugin.system.customfieldtypes:datetime";
    private final ActiveObjects ao; private final ClusterLockService locks; private final AccessGuard guard;
    private final IssueService issues; private final UserManager users; private final ApplicationProperties properties;
    private final IssueLinkManager links; private final CustomFieldManager fields; private final DateTimeFormatter formatter;
    private final TimeZoneService zones; private final WorkCalendarService calendars;
    @Inject public ScheduleService(@ComponentImport ActiveObjects ao,@ComponentImport ClusterLockService locks,AccessGuard guard,
        @ComponentImport IssueService issues,@ComponentImport UserManager users,@ComponentImport ApplicationProperties properties,
        @ComponentImport IssueLinkManager links,@ComponentImport CustomFieldManager fields,@ComponentImport DateTimeFormatter formatter,
        @ComponentImport TimeZoneService zones,WorkCalendarService calendars) {
        this.ao=ao;this.locks=locks;this.guard=guard;this.issues=issues;this.users=users;this.properties=properties;this.links=links;this.fields=fields;this.formatter=formatter;this.zones=zones;this.calendars=calendars;
    }
    private double setting(String key,double fallback,double max) {
        try{double n=Double.parseDouble(properties.getDefaultBackedString(key));return Double.isFinite(n)&&n>0&&n<=max?n:fallback;}catch(RuntimeException e){return fallback;}
    }
    private Map<String,Object> settings(){return Map.of("hoursPerDay",setting(APKeys.JIRA_TIMETRACKING_HOURS_PER_DAY,8,24),"daysPerWeek",setting(APKeys.JIRA_TIMETRACKING_DAYS_PER_WEEK,5,7));}
    private String zone(ApplicationUser user){return zones.getUserTimeZoneInfo(new JiraServiceContextImpl(user)).getTimeZoneId();}
    private GadgetSchedule[] rows(long gadgetId,long filterId){return ao.find(GadgetSchedule.class,Query.select().where("IDENTITY_KEY = ?",PersonalPreferenceStore.identity(gadgetId,String.valueOf(filterId))));}
    public Object get(long gadgetId,long filterId,ApplicationUser user) {
        var gadget=guard.gadget(user,gadgetId);guard.filter(user,filterId);
        var global=calendars.snapshot();var calendar=new HashMap<String,Object>(global.values());calendar.put("timeZone",zone(user));
        return ao.executeInTransaction(()->{
            var found=rows(gadgetId,filterId);var row=found.length==0?null:found[0];
            String start=gadget.getUserPrefs().get("startDateFieldId"),end=gadget.getUserPrefs().get("endDateFieldId");
            String problem=dateProblem(start,end);boolean writable=problem==null,owner=guard.ownsDashboard(user,gadgetId);
            return Map.ofEntries(Map.entry("calendarRevision",global.revision()),Map.entry("canManageCalendar",calendars.canEdit(user)),Map.entry("canEdit",owner&&writable),Map.entry("configurationRequired",owner&&!writable),Map.entry("reason",!owner?"只读：仅仪表盘所有者可在此修改任务":!writable?problem:"修改将同步到 Jira 任务"),
                Map.entry("revision",row==null?0:Objects.requireNonNullElse(row.getRevision(),0)),Map.entry("order",split(row==null?null:row.getOrderIds())),Map.entry("settings",settings()),Map.entry("calendar",calendar));
        });
    }
    boolean writableField(String id) {
        if("duedate".equals(id))return true;
        if(id==null||!id.matches("customfield_[0-9]+"))return false;
        CustomField field=fields.getCustomFieldObject(id);
        return field!=null&&(DAY_TYPES.contains(field.getCustomFieldType().getKey())||DATE_TIME_TYPE.equals(field.getCustomFieldType().getKey()));
    }
    private String dateProblem(String start,String end){
        for(var entry:List.of(new String[]{"开始",start},new String[]{"结束",end}))if(!writableField(entry[1])) {
            String id=entry[1],description=id==null||id.isBlank()?"未配置":switch(id){case "created"->"创建日期 (created)，由 Jira 自动维护，不能修改";case "updated"->"更新日期 (updated)，由 Jira 自动维护，不能修改";default->id+"，字段不存在或类型不支持写回";};
            return entry[0]+"字段："+description+"。请选择 Target start / Target end 或可写的日期字段。";
        }
        return Objects.equals(start,end)?"开始和结束使用了同一字段，请选择两个不同的日期字段。":null;
    }
    static String text(Map<?,?> map,String key,int max,String fallback) {
        Object v=map.get(key);if(v==null)return fallback;
        if(!(v instanceof String s)||s.length()>max||s.indexOf('\u0000')>=0)throw WorkScheduler.invalid("字段无效: "+key);return s;
    }
    private static void allowed(Map<?,?> map,Set<String> keys){if(!keys.containsAll(map.keySet()))throw WorkScheduler.invalid("包含不支持的字段");}
    static List<String> split(String v){return v==null||v.isBlank()?List.of():List.of(v.split(","));}
    private Issue read(ApplicationUser user,long id){var r=issues.getIssue(user,id);if(r==null||!r.isValid()||r.getIssue()==null)throw new ApiException(403,"任务不存在或已无浏览权限");return r.getIssue();}
    public Object source(long gadgetId,Map<String,Object> body,ApplicationUser user){
        var gadget=guard.gadget(user,gadgetId);if(body==null)throw WorkScheduler.invalid("任务列表为空");allowed(body,Set.of("filterId","issueIds"));
        guard.filter(user,ApiException.positiveId(text(body,"filterId",20,"")));
        if(!(body.get("issueIds") instanceof List<?> ids)||ids.size()>1000)throw WorkScheduler.invalid("任务列表无效");
        String start=gadget.getUserPrefs().get("startDateFieldId"),end=gadget.getUserPrefs().get("endDateFieldId"),zone=zone(user);
        // Legacy read-only mappings remain displayable; their dates come from the search response.
        boolean mapped=writableField(start)&&writableField(end);var result=new ArrayList<Map<String,Object>>();var seen=new HashSet<Long>();
        for(Object raw:ids){if(!(raw instanceof String id))throw WorkScheduler.invalid("任务 ID 无效");long issueId=ApiException.positiveId(id);if(!seen.add(issueId))throw WorkScheduler.invalid("任务重复");
            Issue issue=read(user,issueId);if(issue.getUpdated()==null)throw WorkScheduler.invalid("任务缺少更新时间: "+issue.getKey());
            var values=new HashMap<String,Object>();var person=issue.getAssignee();Long seconds=issue.getOriginalEstimate(),remaining=issue.getEstimate();
            values.put("text",Objects.requireNonNullElse(issue.getSummary(),""));values.put("assigneeKey",person==null?"":person.getKey());values.put("assignee",person==null?"未分配":person.getDisplayName());
            values.put("estimate",seconds==null||seconds<=0?"":seconds%3600==0?seconds/3600+"h":(long)Math.ceil(seconds/60d)+"m");
            values.put("progress",seconds!=null&&seconds>0&&remaining!=null?Math.max(0,Math.min(1,(seconds-remaining)/(double)seconds)):null);
            values.put("status",Objects.requireNonNullElse(issue.getStatus().getName(),"未知状态"));values.put("statusId",Objects.requireNonNullElse(issue.getStatus().getId(),""));values.put("statusCategory",issue.getStatus().getStatusCategory().getKey());values.put("done","done".equals(issue.getStatus().getStatusCategory().getKey()));
            if(mapped){values.put("startDate",dateValue(issue,start,zone));values.put("endDate",dateValue(issue,end,zone));}
            result.add(Map.of("issueId",id,"updatedMillis",String.valueOf(issue.getUpdated().getTime()),"source",values));
        }
        return Map.of("tasks",result);
    }
    static void snapshot(Issue issue,String expected){if(issue.getUpdated()==null||!String.valueOf(issue.getUpdated().getTime()).equals(expected))throw new ApiException(409,"任务已被其他人修改，请刷新后重试: "+issue.getKey());}
    private String dateValue(Issue issue,String id,String zone) {
        Object v="duedate".equals(id)?issue.getDueDate():issue.getCustomFieldValue(fields.getCustomFieldObject(id));
        if(!(v instanceof Date date))return "";
        boolean dayOnly="duedate".equals(id)||DAY_TYPES.contains(fields.getCustomFieldObject(id).getCustomFieldType().getKey());
        return dayOnly ? formatter.withSystemZone().withStyle(DateTimeStyle.ISO_8601_DATE).format(date) : date.toInstant().atZone(ZoneId.of(zone)).toLocalDate().toString();
    }
    private void dateParameter(IssueInputParameters params,String field,String value,ApplicationUser user,String zone) {
        DateTimeStyle style="duedate".equals(field)||DAY_TYPES.contains(fields.getCustomFieldObject(field).getCustomFieldType().getKey())?DateTimeStyle.DATE_PICKER:DateTimeStyle.DATE_TIME_PICKER;
        ZoneId dateZone=style==DateTimeStyle.DATE_PICKER?ZoneOffset.UTC:ZoneId.of(zone);
        Date date=Date.from(WorkScheduler.date(value).atStartOfDay(dateZone).toInstant());
        String formatted=formatter.forUser(user).withZone(TimeZone.getTimeZone(dateZone)).withStyle(style).format(date);
        if("duedate".equals(field))params.setDueDate(formatted);else params.addCustomFieldValue(field,formatted);
    }
    private Map<String,Date> validatedDates(IssueService.UpdateValidationResult validation,Set<String> changed,String key){
        var expected=new HashMap<String,Date>();for(String field:changed){Object value=validation.getFieldValuesHolder().get(field);var staged=validation.getIssue();if(value!=null&&staged!=null)value="duedate".equals(field)?staged.getDueDate():staged.getCustomFieldValue(fields.getCustomFieldObject(field));if(!(value instanceof Date date))throw WorkScheduler.invalid("无法修改 "+key+" 的日期字段 "+field+"：字段未参与 Jira 更新，请将它加入项目的编辑界面并检查字段上下文");expected.put(field,new Date(date.getTime()));}return expected;
    }
    private void verifyDates(Issue actual,Map<String,Date> expected){for(var entry:expected.entrySet()){Object value="duedate".equals(entry.getKey())?actual.getDueDate():actual.getCustomFieldValue(fields.getCustomFieldObject(entry.getKey()));if(!(value instanceof Date date)||date.getTime()!=entry.getValue().getTime())throw WorkScheduler.invalid("Jira 返回成功，但日期字段 "+entry.getKey()+" 未保存，请检查编辑界面和字段上下文；部分其他字段可能已保存");}}
    private record Prepared(Issue issue,WorkScheduler.Task task,String expected,IssueInputParameters parameters,Set<String> changedDates) { }
    public Object run(long gadgetId,Map<String,Object> body,ApplicationUser user,boolean apply) {
        var gadget=guard.gadget(user,gadgetId);
        if(!guard.ownsDashboard(user,gadgetId))throw new ApiException(403,"仅仪表盘所有者可以修改，其他查看者只读");
        if(body==null)throw WorkScheduler.invalid("排期为空");
        allowed(body,Set.of("filterId","revision","calendarRevision","startDate","calendar","tasks"));
        long filterId=ApiException.positiveId(text(body,"filterId",20,""));guard.filter(user,filterId);
        String startField=gadget.getUserPrefs().get("startDateFieldId"),endField=gadget.getUserPrefs().get("endDateFieldId");
        String problem=dateProblem(startField,endField);if(problem!=null)throw WorkScheduler.invalid(problem);
        Object rawRevision=body.get("revision");if(!(rawRevision instanceof Number revision)||revision.doubleValue()!=revision.intValue()||revision.intValue()<0)throw WorkScheduler.invalid("排期版本无效");
        Lock lock=locks.getLockForName("filter-gantt.schedule."+gadgetId+"."+filterId);boolean acquired=false;
        try {
            acquired=lock.tryLock(10,TimeUnit.SECONDS);if(!acquired)throw new ApiException(503,"正在同步，请稍后重试");
            int current=ao.executeInTransaction(()->{var found=rows(gadgetId,filterId);return found.length==0?0:Objects.requireNonNullElse(found[0].getRevision(),0);});
            if(current!=revision.intValue())throw new ApiException(409,"此甘特图已被其他窗口修改，请刷新后重试");
            var cal=calendar(body,user);
            if(!(body.get("tasks") instanceof List<?> input)||input.isEmpty()||input.size()>1000)throw WorkScheduler.invalid("排期应包含 1 至 1000 个任务");
            List<WorkScheduler.Task> tasks=new ArrayList<>();Map<String,Issue> originals=new HashMap<>();Map<String,String> snapshots=new HashMap<>();
            for(Object entry:input) {
                if(!(entry instanceof Map<?,?> m))throw WorkScheduler.invalid("任务无效");
                allowed(m,Set.of("issueId","assigneeKey","estimate","note","notBefore","locked","startDate","endDate","updatedMillis"));
                String id=text(m,"issueId",20,"");Issue issue=read(user,ApiException.positiveId(id));
                String expected=text(m,"updatedMillis",20,"");snapshot(issue,expected);snapshots.put(id,expected);originals.put(id,issue);
                var t=new WorkScheduler.Task(id,text(m,"assigneeKey",255,""),text(m,"estimate",100,""));
                t.done="done".equals(issue.getStatus().getStatusCategory().getKey());t.note=text(m,"note",2000,"");t.notBefore=text(m,"notBefore",10,"");if(!t.notBefore.isBlank())WorkScheduler.date(t.notBefore);
                if(m.get("locked")!=null&&!(m.get("locked") instanceof Boolean))throw WorkScheduler.invalid("锁定标志无效");
                t.locked=Boolean.TRUE.equals(m.get("locked"));t.startDate=dateValue(issue,startField,cal.timeZone);t.endDate=dateValue(issue,endField,cal.timeZone);
                if(!t.done){ApplicationUser assignee=users.getUserByKey(t.assigneeKey);if(assignee==null||!assignee.isActive())throw WorkScheduler.invalid("请选择有效负责人: "+issue.getKey());
                    for(var link:links.getInwardLinks(issue.getId()))if("Blocks".equalsIgnoreCase(link.getIssueLinkType().getName())) {
                        Issue predecessor=read(user,link.getSourceId());if(!"done".equals(predecessor.getStatus().getStatusCategory().getKey()))t.predecessors.add(link.getSourceId().toString());
                    }
                }
                tasks.add(t);
            }
            WorkScheduler.schedule(tasks,cal);
            List<Prepared> changes=new ArrayList<>();List<Map<String,Object>> calculated=new ArrayList<>();
            boolean legacy=properties.getOption(APKeys.JIRA_OPTION_TIMETRACKING_ESTIMATES_LEGACY_BEHAVIOUR);
            for(var t:tasks) {
                Issue issue=originals.get(t.issueId);IssueInputParameters params=issues.newIssueInputParameters();params.setRetainExistingValuesWhenParameterNotProvided(true,true);params.setApplyDefaultValuesWhenParameterNotProvided(false);
                boolean changed=false;var changedDates=new HashSet<String>();
                if(!t.done) {
                    if(!t.startDate.equals(dateValue(issue,startField,cal.timeZone))){dateParameter(params,startField,t.startDate,user,cal.timeZone);changedDates.add(startField);changed=true;}
                    if(!t.endDate.equals(dateValue(issue,endField,cal.timeZone))){dateParameter(params,endField,t.endDate,user,cal.timeZone);changedDates.add(endField);changed=true;}
                    if(!t.assigneeKey.equals(issue.getAssignee()==null?"":issue.getAssignee().getKey())){params.setAssigneeId(users.getUserByKey(t.assigneeKey).getName());changed=true;}
                    long seconds=Math.round(t.hours*3600);
                    if(!Objects.equals(issue.getOriginalEstimate(),seconds)) {
                        String estimate=(seconds/60)+"m";
                        if(legacy&&issue.getTimeSpent()!=null&&issue.getTimeSpent()>0)throw WorkScheduler.invalid("Jira 旧版工时模式禁止修改已记录工时任务的原始估时: "+issue.getKey());
                        if(legacy)params.setOriginalEstimate(estimate);
                        else {long remaining=Math.max(0,seconds-Objects.requireNonNullElse(issue.getTimeSpent(),0L));params.setOriginalAndRemainingEstimate(estimate,(remaining/60)+"m");}
                        changed=true;
                    }
                }
                if(!t.note.isBlank()){params.setComment(t.note);changed=true;}
                if(changed) {
                    var validation=issues.validateUpdate(user,issue.getId(),params);
                    if(!validation.isValid())throw WorkScheduler.invalid("无法修改 "+issue.getKey()+": "+validation.getErrorCollection().getErrors()+" "+validation.getErrorCollection().getErrorMessages());
                    validatedDates(validation,changedDates,issue.getKey());changes.add(new Prepared(issue,t,snapshots.get(t.issueId),params,Set.copyOf(changedDates)));
                }
                calculated.add(Map.of("issueId",t.issueId,"startDate",t.startDate,"endDate",t.endDate,"hours",t.hours,"sequence",t.sequence));
            }
            if(!apply)return Map.of("tasks",calculated,"changeCount",changes.size(),"settings",settings());
            List<Map<String,Object>> results=new ArrayList<>();boolean failed=false;
            for(Prepared change:changes) {
                if(failed){results.add(Map.of("issueId",change.task.issueId,"key",change.issue.getKey(),"status","notAttempted","message","前一任务同步失败，未继续执行"));continue;}
                Lock issueLock=locks.getLockForName("filter-gantt.issue."+change.task.issueId);boolean held=false;
                try{
                    held=issueLock.tryLock(10,TimeUnit.SECONDS);if(!held)throw new ApiException(503,"任务正在被其他甘特图修改");
                    guard.gadget(user,gadgetId);guard.filter(user,filterId);if(!guard.ownsDashboard(user,gadgetId))throw new ApiException(403,"已无修改权限");
                    calendars.requireRevision(body.get("calendarRevision"));
                    snapshot(read(user,change.issue.getId()),change.expected);
                    var valid=issues.validateUpdate(user,change.issue.getId(),change.parameters);
                    if(!valid.isValid())throw WorkScheduler.invalid("Jira 校验失败: "+valid.getErrorCollection().getErrors()+" "+valid.getErrorCollection().getErrorMessages());
                    var expectedDates=validatedDates(valid,change.changedDates,change.issue.getKey());
                    var updated=issues.update(user,valid);
                    if(!updated.isValid())throw WorkScheduler.invalid("Jira 同步失败: "+updated.getErrorCollection().getErrors()+" "+updated.getErrorCollection().getErrorMessages());
                    verifyDates(read(user,change.issue.getId()),expectedDates);
                    results.add(Map.of("issueId",change.task.issueId,"key",change.issue.getKey(),"status","saved","message","已同步到 Jira"));
                }catch(InterruptedException e){Thread.currentThread().interrupt();failed=true;results.add(Map.of("issueId",change.task.issueId,"key",change.issue.getKey(),"status","failed","message","同步被中断"));}
                catch(RuntimeException e){failed=true;results.add(Map.of("issueId",change.task.issueId,"key",change.issue.getKey(),"status","failed","message",e instanceof ApiException?e.getMessage():"Jira 更新异常，请检查任务后刷新"));}
                finally{if(held)issueLock.unlock();}
            }
            boolean preferencesSaved=false;
            if(!failed)try{saveOptions(gadgetId,filterId,current,cal,tasks);preferencesSaved=true;}catch(RuntimeException e){/* Issue updates cannot be rolled back by an AO error. */}
            return Map.of("results",results,"allSaved",!failed,"preferencesSaved",preferencesSaved,"revision",preferencesSaved?current+1:current);
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(503,"同步被中断");}finally{if(acquired)lock.unlock();}
    }
    private void saveOptions(long gadgetId,long filterId,int version,WorkScheduler.Calendar cal,List<WorkScheduler.Task> tasks) {
        ao.executeInTransaction(()->{var found=rows(gadgetId,filterId);var row=found.length==0?ao.create(GadgetSchedule.class,new DBParam("IDENTITY_KEY",PersonalPreferenceStore.identity(gadgetId,String.valueOf(filterId)))):found[0];
            row.setOrderIds(String.join(",",tasks.stream().map(t->t.issueId).toList()));row.setRevision(version+1);row.save();return null;});
    }
    private WorkScheduler.Calendar calendar(Map<String,Object> body,ApplicationUser user) {
        var c=new WorkScheduler.Calendar();c.start=WorkScheduler.date(text(body,"startDate",10,""));c.timeZone=zone(user);c.hoursPerDay=((Number)settings().get("hoursPerDay")).doubleValue();c.daysPerWeek=((Number)settings().get("daysPerWeek")).doubleValue();
        var global=calendars.requireRevision(body.get("calendarRevision"));
        c.weekdays=new HashSet<>(global.weekdays());for(String date:global.holidays())c.holidays.add(WorkScheduler.date(date));for(String date:global.workDates())c.workDates.add(WorkScheduler.date(date));return c;
    }
}
