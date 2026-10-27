package com.qixia.jira.filtergantt;

import com.atlassian.jira.security.JiraAuthenticationContext;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.atlassian.plugin.web.Condition;
import javax.inject.Inject;
import java.util.Map;

/** Dashboard visibility uses public APIs rather than a Jira internal condition class. */
public final class LoggedInCondition implements Condition {
    private final JiraAuthenticationContext auth;

    @Inject
    public LoggedInCondition(@ComponentImport JiraAuthenticationContext auth) {
        this.auth = auth;
    }

    @Override public void init(Map<String, String> parameters) { }

    @Override public boolean shouldDisplay(Map<String, Object> context) {
        ApplicationUser user = auth.getLoggedInUser();
        return user != null && user.isActive();
    }
}
