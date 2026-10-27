package com.qixia.jira.filtergantt.ao;

import net.java.ao.Entity;
import net.java.ao.schema.NotNull;
import net.java.ao.Preload;
import net.java.ao.schema.Unique;
import net.java.ao.schema.StringLength;
import net.java.ao.schema.Table;
import java.util.Date;

@Table("GANTT_PREF")
@Preload
public interface PersonalGanttPreference extends Entity {
    // SHA-256 of gadgetId + ':' + userKey: a database-enforced composite identity.
    @NotNull @Unique @StringLength(64) String getIdentityKey();
    void setIdentityKey(String value);
    @NotNull Long getGadgetId();
    void setGadgetId(Long value);
    @NotNull @StringLength(255) String getUserKey();
    void setUserKey(String value);
    Long getSelectedFilterId();
    void setSelectedFilterId(Long value);
    @StringLength(8) String getScale();
    void setScale(String value);
    @NotNull Date getUpdatedAt();
    void setUpdatedAt(Date value);
}
