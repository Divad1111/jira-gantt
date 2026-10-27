package com.qixia.jira.filtergantt;

import com.atlassian.jira.security.JiraAuthenticationContext;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.web.Condition;
import org.junit.Test;
import org.w3c.dom.NodeList;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.util.Collections;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class LoggedInConditionTest {
    @Test public void hidesDashboardItemForAnonymousAndInactiveUsers() {
        JiraAuthenticationContext auth = mock(JiraAuthenticationContext.class);
        LoggedInCondition condition = new LoggedInCondition(auth);
        condition.init(Collections.emptyMap());
        assertFalse(condition.shouldDisplay(Collections.emptyMap()));
        ApplicationUser user = mock(ApplicationUser.class);
        when(auth.getLoggedInUser()).thenReturn(user);
        assertFalse(condition.shouldDisplay(Collections.emptyMap()));
        when(user.isActive()).thenReturn(true);
        assertTrue(condition.shouldDisplay(Collections.emptyMap()));
    }

    @Test public void descriptorConditionsArePackagedPluginClasses() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        try (InputStream input = getClass().getClassLoader().getResourceAsStream("atlassian-plugin.xml")) {
            assertNotNull(input);
            NodeList conditions = factory.newDocumentBuilder().parse(input).getElementsByTagName("condition");
            assertEquals(1, conditions.getLength());
            String name = conditions.item(0).getAttributes().getNamedItem("class").getNodeValue();
            assertTrue("Avoid reflective references to internal host classes", name.startsWith("com.qixia.jira.filtergantt."));
            assertTrue(Condition.class.isAssignableFrom(Class.forName(name)));
        }
    }
}
