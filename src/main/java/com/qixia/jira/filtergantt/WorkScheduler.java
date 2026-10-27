package com.qixia.jira.filtergantt;

import java.time.*;
import java.util.*;
import java.util.regex.*;

/** Day-granular resource scheduling, independent of the Gantt renderer. */
public final class WorkScheduler {
    public static final class Task {
        public String issueId, assigneeKey, estimate, note = "", notBefore = "", startDate = "", endDate = "";
        public boolean locked, done;
        public double hours;
        public int sequence;
        public final List<String> predecessors = new ArrayList<>();
        public Task(String id, String person, String estimate) { this.issueId = id; this.assigneeKey = person; this.estimate = estimate; }
    }
    public static final class Calendar {
        public LocalDate start;
        public Set<Integer> weekdays = new HashSet<>(List.of(1,2,3,4,5));
        public Set<LocalDate> holidays = new HashSet<>(), workDates = new HashSet<>();
        public double hoursPerDay = 8, daysPerWeek = 5;
        public String timeZone = "UTC";
        public boolean working(LocalDate date) { return workDates.contains(date) || (weekdays.contains(date.getDayOfWeek().getValue()) && !holidays.contains(date)); }
        public LocalDate next(LocalDate date) {
            for (int i=0;i<3660;i++, date=date.plusDays(1)) if (working(date)) return date;
            throw invalid("工作日历中找不到可用日期");
        }
    }
    private WorkScheduler() { }
    public static ApiException invalid(String message) { return new ApiException(400, message); }
    public static LocalDate date(String value) {
        try { LocalDate d = LocalDate.parse(value); if(d.getYear()<1900 || d.getYear()>2200) throw new IllegalArgumentException(); return d; }
        catch (RuntimeException e) { throw invalid("日期无效: " + value); }
    }
    public static double hours(String input, Calendar calendar) {
        input=input.trim();
        Matcher m = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)\\s*([hdwm])", Pattern.CASE_INSENSITIVE).matcher(input);
        double sum=0; int end=0;
        while(m.find()) {
            if(!input.substring(end,m.start()).isBlank()) throw invalid("估时格式无效, 示例: 4h, 2d, 1w 2d");
            double n=Double.parseDouble(m.group(1));
            sum += n * switch(m.group(2).toLowerCase(Locale.ROOT)) {case "w" -> calendar.daysPerWeek*calendar.hoursPerDay; case "d" -> calendar.hoursPerDay; case "m" -> 1d/60; default -> 1;};
            end=m.end();
        }
        if(end==0 || !input.substring(end).isBlank() || !Double.isFinite(sum) || sum<=0 || sum>calendar.hoursPerDay*3660) throw invalid("估时必须大于 0 且在 10 年工作量以内");
        return Math.ceil(sum*60-1e-8)/60;
    }
    public static void schedule(List<Task> tasks, Calendar calendar) {
        if(calendar.start==null || calendar.weekdays.isEmpty() || calendar.hoursPerDay<=0 || calendar.hoursPerDay>24 || calendar.daysPerWeek<=0 || calendar.daysPerWeek>7) throw invalid("工作日历无效");
        Map<String,Task> byId=new LinkedHashMap<>();
        Map<String,String> previous=new HashMap<>();
        Map<String,LinkedHashSet<String>> edges=new HashMap<>();
        Map<String,Map<LocalDate,Double>> usage=new HashMap<>();
        for(Task task:tasks) {
            if(byId.put(task.issueId,task)!=null) throw invalid("任务重复");
            edges.put(task.issueId,new LinkedHashSet<>(task.predecessors));
            if(task.done) continue;
            if(task.assigneeKey==null || task.assigneeKey.isBlank()) throw invalid("请为任务分配负责人: " + task.issueId);
            task.hours=hours(task.estimate,calendar);
            String prev=previous.put(task.assigneeKey,task.issueId);
            if(prev!=null) edges.get(task.issueId).add(prev);
        }
        // A predecessor outside the selected issues cannot be silently treated as completed.
        for(var set:edges.values()) for(String dependency:set) if(!byId.containsKey(dependency)) throw invalid("前置任务不在排期范围内, 请扩大筛选范围");
        // Reserve locked tasks before filling free capacity.
        for(Task task:tasks) if(task.locked && !task.done) {
            LocalDate start=date(task.startDate);
            if(!calendar.working(start) || start.isBefore(calendar.start)) throw invalid("锁定任务开始日不在有效工作日内: " + task.issueId);
            var days=usage.computeIfAbsent(task.assigneeKey,k->new HashMap<>());
            LocalDate finish=allocate(task,start,calendar,days,true);
            if(!task.endDate.isBlank() && !finish.equals(date(task.endDate))) throw invalid("锁定任务日期与估时不一致: " + task.issueId);
            task.endDate=finish.toString();
        }
        Set<String> placed=new HashSet<>(); Map<String,Integer> sequences=new HashMap<>();
        while(placed.size()<tasks.size()) {
            boolean progressed=false;
            for(Task task:tasks) {
                if(placed.contains(task.issueId) || !placed.containsAll(edges.get(task.issueId))) continue;
                progressed=true;
                if(!task.done) {
                    LocalDate earliest=calendar.start;
                    if(!task.notBefore.isBlank() && date(task.notBefore).isAfter(earliest)) earliest=date(task.notBefore);
                    for(String dependency:edges.get(task.issueId)) {
                        Task pred=byId.get(dependency); if(pred.done) continue;
                        // Resource sequence may share a day; real task dependencies finish before the next working day.
                        LocalDate bound=date(pred.endDate);
                        if(task.predecessors.contains(dependency)) bound=bound.plusDays(1);
                        if(bound.isAfter(earliest)) earliest=bound;
                    }
                    if(task.locked) {
                        if(date(task.startDate).isBefore(earliest)) throw invalid("锁定任务与前置顺序冲突: " + task.issueId);
                    } else {
                        var days=usage.computeIfAbsent(task.assigneeKey,k->new HashMap<>());
                        LocalDate start=calendar.next(earliest);
                        for(int tries=0;;tries++,start=calendar.next(start.plusDays(1))) {
                            if(tries>3660) throw invalid("无法在 10 年内完成排期");
                            Map<LocalDate,Double> candidate=new HashMap<>(days);
                            try {
                                LocalDate end=allocate(task,start,calendar,candidate,false);
                                days.clear(); days.putAll(candidate); task.startDate=start.toString(); task.endDate=end.toString(); break;
                            } catch(NoCapacity e) { }
                        }
                    }
                    task.sequence=sequences.merge(task.assigneeKey,1,Integer::sum);
                }
                placed.add(task.issueId);
            }
            if(!progressed) throw invalid("任务依赖与人员顺序存在循环, 请调整顺序");
        }
    }
    private static final class NoCapacity extends RuntimeException { }
    private static LocalDate allocate(Task task, LocalDate start, Calendar cal, Map<LocalDate,Double> used, boolean locked) {
        double remaining=task.hours; LocalDate date=start;
        for(int days=0; remaining>1e-7 && days<3660; days++,date=cal.next(date.plusDays(1))) {
            double take=Math.min(remaining,cal.hoursPerDay), already=used.getOrDefault(date,0d);
            if(already+take>cal.hoursPerDay+1e-7) {
                if(locked) throw invalid("锁定任务工作量冲突: " + task.issueId);
                throw new NoCapacity();
            }
            used.put(date,already+take); remaining-=take;
            if(remaining<1e-7) return date;
        }
        throw invalid("任务超过允许的排期跨度");
    }
}
