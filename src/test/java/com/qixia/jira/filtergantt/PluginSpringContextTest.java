package com.qixia.jira.filtergantt;

import org.junit.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.net.URL;
import java.util.Enumeration;
import java.util.Properties;
import static org.junit.Assert.*;

public class PluginSpringContextTest {
    @Test public void scannerNamespaceMatchesProvidedDependencySchema() throws Exception {
        ClassLoader loader = getClass().getClassLoader();
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        Document context;
        try (InputStream input = loader.getResourceAsStream("META-INF/spring/plugin-context.xml")) {
            assertNotNull("Spring context must be packaged", input);
            context = factory.newDocumentBuilder().parse(input);
        }
        String namespace = "http://www.atlassian.com/schema/atlassian-scanner/2";
        assertEquals("Use the versioned namespace supported by Scanner 2+", 1,
            context.getElementsByTagNameNS(namespace, "scan-indexes").getLength());
        assertEquals(1, context.getElementsByTagNameNS("*", "scan-indexes").getLength());
        String schemaUrl = namespace + "/atlassian-scanner.xsd";
        Element root = context.getDocumentElement();
        String locations = root.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "schemaLocation");
        assertTrue(locations.contains(namespace + " " + schemaUrl));
        Properties schemas = new Properties();
        Enumeration<URL> resources = loader.getResources("META-INF/spring.schemas");
        while (resources.hasMoreElements()) {
            try (InputStream input = resources.nextElement().openStream()) { schemas.load(input); }
        }
        assertNotNull("Declared schema must be registered by the provided Scanner dependency", schemas.getProperty(schemaUrl));
    }
}
