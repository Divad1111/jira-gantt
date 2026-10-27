package com.qixia.jira.filtergantt;

import com.atlassian.activeobjects.external.ActiveObjects;
import com.atlassian.beehive.ClusterLockService;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.qixia.jira.filtergantt.ao.PersonalGanttPreference;
import net.java.ao.DBParam;
import net.java.ao.Query;
import javax.inject.Inject;
import javax.inject.Named;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Date;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Lock;

@Named
public class PersonalPreferenceStore {
    private final ActiveObjects ao;
    private final ClusterLockService locks;
    @Inject
    public PersonalPreferenceStore(@ComponentImport ActiveObjects ao, @ComponentImport ClusterLockService locks) { this.ao = ao; this.locks = locks; }

    public static String identity(long gadgetId, String userKey) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((gadgetId + ":" + userKey).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public Map<String, Object> get(long gadgetId, String userKey) {
        return ao.executeInTransaction(() -> {
            PersonalGanttPreference[] rows = find(gadgetId, userKey);
            return response(gadgetId, rows.length == 0 ? null : rows[0]);
        });
    }
    public Map<String, Object> write(long gadgetId, String userKey, Long filterId, String scale, boolean delete) {
        Lock lock = locks.getLockForName("filter-gantt.preference." + identity(gadgetId, userKey));
        boolean acquired = false;
        try {
            acquired = lock.tryLock(10, TimeUnit.SECONDS);
            if (!acquired) throw new ApiException(503, "Preference busy; retry later");
            return ao.executeInTransaction(() -> {
                PersonalGanttPreference[] rows = find(gadgetId, userKey);
                if (delete) { ao.delete(rows); return response(gadgetId, null); }
                PersonalGanttPreference row = rows.length == 0 ? ao.create(PersonalGanttPreference.class,
                    new DBParam("IDENTITY_KEY", identity(gadgetId, userKey)), new DBParam("GADGET_ID", gadgetId),
                    new DBParam("USER_KEY", userKey), new DBParam("UPDATED_AT", new Date())) : rows[0];
                row.setSelectedFilterId(filterId); row.setScale(scale); row.setUpdatedAt(new Date()); row.save();
                return response(gadgetId, row);
            });
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new ApiException(503, "Preference busy; retry later"); }
        finally { if (acquired) lock.unlock(); }
    }
    private PersonalGanttPreference[] find(long gadgetId, String userKey) {
        return ao.find(PersonalGanttPreference.class, Query.select().where("IDENTITY_KEY = ? AND GADGET_ID = ? AND USER_KEY = ?", identity(gadgetId, userKey), gadgetId, userKey));
    }
    public static Map<String, Object> response(long gadgetId, PersonalGanttPreference row) {
        Map<String, Object> result = new LinkedHashMap<>();
        Long filter = row == null ? null : row.getSelectedFilterId();
        result.put("gadgetId", gadgetId); result.put("selectedFilterId", filter == null ? null : filter.toString());
        result.put("scale", row == null ? null : row.getScale()); result.put("usesDefault", filter == null);
        return result;
    }
}
