package com.qixia.jira.filtergantt;

public final class ApiException extends RuntimeException {
    public final int status;
    public ApiException(int status, String message) { super(message); this.status = status; }
    public static long positiveId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new ApiException(400, "Invalid ID");
        try { return Long.parseLong(value); } catch (NumberFormatException e) { throw new ApiException(400, "Invalid ID"); }
    }
}
