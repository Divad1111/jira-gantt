package com.qixia.jira.filtergantt;

import com.atlassian.jira.bc.JiraServiceContextImpl;
import com.atlassian.jira.bc.filter.SearchRequestService;
import com.atlassian.jira.bc.portal.PortalPageService;
import com.atlassian.jira.issue.search.SearchRequest;
import com.atlassian.jira.portal.PortletConfiguration;
import com.atlassian.jira.portal.PortletConfigurationManager;
import com.atlassian.jira.security.JiraAuthenticationContext;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import javax.inject.Inject;
import javax.inject.Named;

@Named
public class AccessGuard {
    public static final String MODULE = "com.qixia.jira.filter-gantt-gadget:filter-gantt-dashboard-item";
    private final JiraAuthenticationContext auth;
    private final PortletConfigurationManager portlets;
    private final PortalPageService pages;
    private final SearchRequestService filters;

    @Inject
    public AccessGuard(@ComponentImport JiraAuthenticationContext auth,
                       @ComponentImport PortletConfigurationManager portlets,
                       @ComponentImport PortalPageService pages,
                       @ComponentImport SearchRequestService filters) {
        this.auth = auth; this.portlets = portlets; this.pages = pages; this.filters = filters;
    }
    public ApplicationUser currentUser() {
        ApplicationUser user = auth.getLoggedInUser();
        if (user == null || !user.isActive()) throw new ApiException(401, "Login required");
        return user;
    }
    public PortletConfiguration gadget(ApplicationUser user, long gadgetId) {
        PortletConfiguration portlet = portlets.getByPortletId(gadgetId);
        if (portlet == null || portlet.getCompleteModuleKey().isEmpty() ||
                !MODULE.equals(portlet.getCompleteModuleKey().get().getCompleteKey())) throw hidden();
        JiraServiceContextImpl context = new JiraServiceContextImpl(user);
        if (pages.getPortalPage(context, portlet.getDashboardPageId()) == null || context.getErrorCollection().hasAnyErrors()) throw hidden();
        return portlet;
    }
    public boolean selectable(PortletConfiguration gadget) {
        return "VIEWER_SELECTABLE".equals(gadget.getUserPrefs().getOrDefault("mode", "VIEWER_SELECTABLE"));
    }
    public boolean ownsDashboard(ApplicationUser user, long gadgetId) {
        PortletConfiguration gadget = gadget(user, gadgetId);
        JiraServiceContextImpl context = new JiraServiceContextImpl(user);
        var page = pages.getPortalPage(context, gadget.getDashboardPageId());
        return page != null && page.getOwner() != null && user.getKey().equals(page.getOwner().getKey());
    }
    public SearchRequest filter(ApplicationUser user, long filterId) {
        JiraServiceContextImpl context = new JiraServiceContextImpl(user);
        SearchRequest filter = filters.getFilter(context, filterId);
        if (filter == null || context.getErrorCollection().hasAnyErrors()) throw new ApiException(403, "Filter unavailable");
        return filter;
    }
    private ApiException hidden() { return new ApiException(404, "Gadget unavailable"); }
}
