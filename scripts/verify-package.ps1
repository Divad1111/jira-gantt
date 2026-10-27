param([string]$JarPath = (Join-Path $PSScriptRoot '..\target\filter-gantt-gadget-1.3.1.jar'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$resolvedJar = (Resolve-Path -LiteralPath $JarPath).Path
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedJar)
try {
    $required = @(
        'atlassian-plugin.xml', 'META-INF/MANIFEST.MF', 'META-INF/LICENSE', 'META-INF/NOTICE',
        'META-INF/spring/plugin-context.xml', 'META-INF/plugin-components/component', 'META-INF/plugin-components/imports',
        'soy/filter-gantt.soy', 'frontend/dashboard-item.js', 'frontend/dashboard-item-min.js',
        'frontend/filter-gantt.css', 'frontend/filter-gantt-min.css', 'frontend/licenses/dhtmlx-gantt-MIT.txt',
        'com/qixia/jira/filtergantt/rest/PersonalResource.class', 'com/qixia/jira/filtergantt/rest/FilterResource.class',
        'com/qixia/jira/filtergantt/ao/PersonalGanttPreference.class',
        'com/qixia/jira/filtergantt/rest/ScheduleResource.class', 'com/qixia/jira/filtergantt/ScheduleService.class',
        'com/qixia/jira/filtergantt/WorkCalendarService.class', 'com/qixia/jira/filtergantt/ao/GlobalWorkCalendar.class',
        'com/qixia/jira/filtergantt/rest/WorkCalendarResource.class', 'com/qixia/jira/filtergantt/WorkScheduler.class', 'com/qixia/jira/filtergantt/ao/GadgetSchedule.class'
    )
    foreach ($entry in $required) { if ($null -eq $archive.GetEntry($entry)) { throw "Missing package entry: $entry" } }
    function Read-Entry([string]$name) {
        $reader = [System.IO.StreamReader]::new($archive.GetEntry($name).Open())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    $manifest = (Read-Entry 'META-INF/MANIFEST.MF') -replace '\r?\n ', ''
    if ($manifest -notmatch '(?m)^Atlassian-Plugin-Key: com\.qixia\.jira\.filter-gantt-gadget\r?$') { throw 'Plugin key missing in OSGi manifest' }
    if ($manifest -notmatch '(?m)^Bundle-SymbolicName: com\.qixia\.jira\.filter-gantt-gadget(?:;[^\r\n]*)?\r?$') { throw 'Unexpected bundle identity' }
    if ($manifest -notmatch 'Import-Package:') { throw 'OSGi imports missing' }
    $springContext = [xml](Read-Entry 'META-INF/spring/plugin-context.xml')
    $scannerNodes = $springContext.SelectNodes('//*[local-name()="scan-indexes"]')
    if ($scannerNodes.Count -ne 1 -or $scannerNodes[0].NamespaceURI -ne 'http://www.atlassian.com/schema/atlassian-scanner/2') { throw 'Unsupported Spring Scanner namespace; Jira cannot enable this plugin' }
    $descriptor = [xml](Read-Entry 'atlassian-plugin.xml')
    foreach ($condition in $descriptor.SelectNodes('//condition[@class]')) {
        $className = $condition.GetAttribute('class')
        $entryName = $className.Replace('.', '/') + '.class'
        if (!$className.StartsWith('com.qixia.jira.filtergantt.') -or $null -eq $archive.GetEntry($entryName)) { throw "Dashboard condition must be packaged by this plugin: $className" }
    }
    if ($manifest -notmatch 'com\.atlassian\.plugin\.web[;,]') { throw 'Public Condition API import missing' }
    if ($descriptor.'atlassian-plugin'.key -ne 'com.qixia.jira.filter-gantt-gadget') { throw 'Plugin descriptor was not filtered' }
    foreach ($module in @('dashboard-item', 'web-resource', 'rest', 'rest-migration', 'ao')) {
        if (!$descriptor.'atlassian-plugin'.$module) { throw "Missing Jira module $module" }
    }
    foreach ($entity in @('com.qixia.jira.filtergantt.ao.GadgetSchedule','com.qixia.jira.filtergantt.ao.GlobalWorkCalendar')) {
        if ($descriptor.'atlassian-plugin'.ao.entity -notcontains $entity) { throw "Missing schedule AO entity: $entity" }
    }
    $components = Read-Entry 'META-INF/plugin-components/component'
    foreach ($component in @('com.qixia.jira.filtergantt.WorkCalendarService', 'com.qixia.jira.filtergantt.rest.WorkCalendarResource','com.qixia.jira.filtergantt.ScheduleService', 'com.qixia.jira.filtergantt.rest.ScheduleResource')) {
        if (!$components.Contains($component)) { throw "Schedule service missing from Spring index: $component" }
    }
    if ((Read-Entry 'frontend/licenses/dhtmlx-gantt-MIT.txt') -notmatch 'The MIT License') { throw 'MIT license missing' }
    if ((Read-Entry 'frontend/dashboard-item.js') -notmatch "define\('filter-gantt/dashboard-item'") { throw 'Named AMD module missing' }
    $classCount = 0
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '/(PlanStore|PlanResource|PlanSchedule|GanttPlan|GanttPlanTask)(\$[^/]*)?\.class$') { throw "Removed plan management class remains in package: $($entry.FullName)" }
        if ($entry.FullName -match '^com/atlassian/.*\.class$|\.jar$') { throw "Host/nested library unexpectedly bundled: $($entry.FullName)" }
        if ($entry.FullName -match '\.class$') {
            $stream = $entry.Open(); $bytes = [byte[]]::new(8)
            try { if ($stream.Read($bytes, 0, 8) -ne 8) { throw 'Truncated class' } } finally { $stream.Dispose() }
            if (($bytes[6] * 256 + $bytes[7]) -ne 61) { throw "Non-Java-17 class: $($entry.FullName)" }
            $classCount++
        }
    }
    [PSCustomObject]@{ Jar = $resolvedJar; Bytes = (Get-Item -LiteralPath $resolvedJar).Length; Java17Classes = $classCount; RequiredEntries = $required.Count; SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedJar).Hash }
} finally { $archive.Dispose() }
