package com.qixia.jira.filtergantt.ao;

import net.java.ao.Entity;
import net.java.ao.Preload;
import net.java.ao.schema.*;

/** A single calendar shared by every gadget and filter. */
@Table("WORK_CALENDAR") @Preload
public interface GlobalWorkCalendar extends Entity {
    @NotNull @Unique @StringLength(32) String getIdentityKey(); void setIdentityKey(String value);
    @StringLength(32) String getWeekdays(); void setWeekdays(String value);
    @StringLength(StringLength.UNLIMITED) String getHolidays(); void setHolidays(String value);
    @StringLength(StringLength.UNLIMITED) String getWorkDates(); void setWorkDates(String value);
    Integer getRevision(); void setRevision(Integer value);
}
