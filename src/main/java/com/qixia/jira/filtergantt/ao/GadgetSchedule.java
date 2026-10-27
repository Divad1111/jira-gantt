package com.qixia.jira.filtergantt.ao;

import net.java.ao.Entity;
import net.java.ao.Preload;
import net.java.ao.schema.*;

/** Presentation order only. Legacy calendar columns are retained but unused. Issue values live in Jira. */
@Table("SCHEDULE") @Preload
public interface GadgetSchedule extends Entity {
    @NotNull @Unique @StringLength(64) String getIdentityKey(); void setIdentityKey(String value);
    @StringLength(StringLength.UNLIMITED) String getOrderIds(); void setOrderIds(String value);
    @StringLength(32) String getWeekdays(); void setWeekdays(String value);
    @StringLength(StringLength.UNLIMITED) String getHolidays(); void setHolidays(String value);
    @StringLength(StringLength.UNLIMITED) String getWorkDates(); void setWorkDates(String value);
    Integer getRevision(); void setRevision(Integer value);
}
