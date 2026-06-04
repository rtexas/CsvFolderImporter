const {
 Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
 Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
 ShadingType, PageNumber, PageBreak, LevelFormat, ExternalHyperlink,
 TableOfContents
} = require('docx');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;

// ─── Shared helpers ──────────────────────────────────────────────────────────

const BLUE = "1F4E79";
const LBLUE = "D6E4F0";
const GRAY = "F2F2F2";
const DKGRAY = "595959";
const GREEN = "1D6B2B";
const LGREEN = "D9EAD3";
const AMBER = "7D4800";
const LAMBER = "FFF2CC";
const RED = "C00000";

function border(color = "CCCCCC", size = 6) {
 return { style: BorderStyle.SINGLE, size, color };
}
const cellBorders = (c = "CCCCCC") => ({ top: border(c), bottom: border(c), left: border(c), right: border(c) });

function hdrCell(text, w, bg = BLUE) {
 return new TableCell({
 width: { size: w, type: WidthType.DXA },
 borders: cellBorders("FFFFFF"),
 shading: { fill: bg, type: ShadingType.CLEAR },
 margins: { top: 80, bottom: 80, left: 120, right: 120 },
 verticalAlign: "center",
 children: [new Paragraph({
 children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20, font: "Arial" })]
 })]
 });
}

function dataCell(text, w, bg = "FFFFFF", color = "000000") {
 return new TableCell({
 width: { size: w, type: WidthType.DXA },
 borders: cellBorders("CCCCCC"),
 shading: { fill: bg, type: ShadingType.CLEAR },
 margins: { top: 70, bottom: 70, left: 120, right: 120 },
 children: [new Paragraph({
 children: [new TextRun({ text, size: 18, font: "Arial", color })]
 })]
 });
}

function codeCell(text, w) {
 return new TableCell({
 width: { size: w, type: WidthType.DXA },
 borders: cellBorders("AAAAAA"),
 shading: { fill: "F8F8F8", type: ShadingType.CLEAR },
 margins: { top: 70, bottom: 70, left: 120, right: 120 },
 children: [new Paragraph({
 children: [new TextRun({ text, size: 18, font: "Courier New", color: "1F2937" })]
 })]
 });
}

function makeTable(colWidths, headerTexts, rows, headerBg = BLUE) {
 const total = colWidths.reduce((a, b) => a + b, 0);
 const tableRows = [
 new TableRow({
 tableHeader: true,
 children: headerTexts.map((t, i) => hdrCell(t, colWidths[i], headerBg))
 }),
 ...rows.map((cells, ri) =>
 new TableRow({
 children: cells.map((text, ci) => dataCell(text, colWidths[ci], ri % 2 === 0 ? "FFFFFF" : GRAY))
 })
 )
 ];
 return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: colWidths, rows: tableRows });
}

function codeBlock(lines) {
 const joined = Array.isArray(lines) ? lines.join('\n') : lines;
 const total = 9360;
 return new Table({
 width: { size: total, type: WidthType.DXA },
 columnWidths: [total],
 rows: [new TableRow({ children: [codeCell(joined, total)] })]
 });
}

function note(text, bg = LAMBER, borderColor = AMBER, labelText = "NOTE") {
 const total = 9360;
 return new Table({
 width: { size: total, type: WidthType.DXA },
 columnWidths: [600, total - 600],
 rows: [new TableRow({
 children: [
 new TableCell({
 width: { size: 600, type: WidthType.DXA },
 borders: cellBorders(borderColor),
 shading: { fill: bg, type: ShadingType.CLEAR },
 margins: { top: 80, bottom: 80, left: 120, right: 120 },
 children: [new Paragraph({ children: [new TextRun({ text: labelText, bold: true, size: 18, font: "Arial", color: AMBER })] })]
 }),
 new TableCell({
 width: { size: total - 600, type: WidthType.DXA },
 borders: cellBorders(borderColor),
 shading: { fill: bg, type: ShadingType.CLEAR },
 margins: { top: 80, bottom: 80, left: 120, right: 120 },
 children: [new Paragraph({ children: [new TextRun({ text, size: 18, font: "Arial" })] })]
 })
 ]
 })]
 });
}

function warning(text) { return note(text, "#FFF0F0", RED, "WARN"); }

function h1(text) {
 return new Paragraph({
 heading: HeadingLevel.HEADING_1,
 spacing: { before: 360, after: 120 },
 children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: BLUE })]
 });
}
function h2(text) {
 return new Paragraph({
 heading: HeadingLevel.HEADING_2,
 spacing: { before: 240, after: 80 },
 children: [new TextRun({ text, bold: true, size: 24, font: "Arial", color: BLUE })]
 });
}
function h3(text) {
 return new Paragraph({
 heading: HeadingLevel.HEADING_3,
 spacing: { before: 160, after: 60 },
 children: [new TextRun({ text, bold: true, size: 20, font: "Arial", color: DKGRAY })]
 });
}
function body(text, opts = {}) {
 return new Paragraph({
 spacing: { before: 60, after: 60 },
 children: [new TextRun({ text, size: 20, font: "Arial", ...opts })]
 });
}
function spacer(n = 1) {
 return Array.from({ length: n }, () => new Paragraph({ children: [new TextRun("")], spacing: { before: 0, after: 0 } }));
}

function bullet(text, level = 0) {
 return new Paragraph({
 numbering: { reference: "bullets", level },
 spacing: { before: 40, after: 40 },
 children: [new TextRun({ text, size: 20, font: "Arial" })]
 });
}

function numbered(text, level = 0) {
 return new Paragraph({
 numbering: { reference: "numbers", level },
 spacing: { before: 60, after: 60 },
 children: [new TextRun({ text, size: 20, font: "Arial" })]
 });
}

function step(n, text) {
 return new Paragraph({
 spacing: { before: 80, after: 40 },
 children: [
 new TextRun({ text: `Step ${n} `, bold: true, size: 20, font: "Arial", color: BLUE }),
 new TextRun({ text, size: 20, font: "Arial" })
 ]
 });
}

function titlePage(title, subtitle, version = "Version 1.0") {
 const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
 return [
 ...spacer(6),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 0, after: 0 },
 border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 10 } },
 children: [new TextRun({ text: "CSV Folder Importer", bold: true, size: 64, font: "Arial", color: BLUE })]
 }),
 ...spacer(1),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 120, after: 60 },
 children: [new TextRun({ text: title, bold: true, size: 40, font: "Arial", color: DKGRAY })]
 }),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 0, after: 240 },
 children: [new TextRun({ text: subtitle, size: 24, font: "Arial", color: DKGRAY, italics: true })]
 }),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 0, after: 60 },
 children: [new TextRun({ text: version, size: 20, font: "Arial", color: DKGRAY })]
 }),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 0, after: 0 },
 children: [new TextRun({ text: date, size: 20, font: "Arial", color: DKGRAY })]
 }),
 new Paragraph({ children: [new PageBreak()] })
 ];
}

const sharedStyles = {
 default: { document: { run: { font: "Arial", size: 20 } } },
 paragraphStyles: [
 { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
 run: { size: 32, bold: true, font: "Arial", color: BLUE },
 paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
 { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
 run: { size: 24, bold: true, font: "Arial", color: BLUE },
 paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
 { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
 run: { size: 20, bold: true, font: "Arial", color: DKGRAY },
 paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 } },
 ]
};

const sharedNumbering = {
 config: [
 { reference: "bullets",
 levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
 style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
 { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
 style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
 { reference: "numbers",
 levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
 style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
 { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2.", alignment: AlignmentType.LEFT,
 style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
 { reference: "letters",
 levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: "%1.", alignment: AlignmentType.LEFT,
 style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
 ]
};

const pageProps = {
 page: {
 size: { width: 12240, height: 15840 },
 margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
 }
};

function makeFooter(docTitle) {
 return new Footer({
 children: [new Paragraph({
 border: { top: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } },
 children: [
 new TextRun({ text: `CSV Folder Importer | ${docTitle}`, size: 16, font: "Arial", color: DKGRAY }),
 new TextRun({ children: ["\t", PageNumber.CURRENT], size: 16, font: "Arial", color: DKGRAY })
 ],
 tabStops: [{ type: "right", position: 9360 }]
 })]
 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT 1 — Installation Guide
// ═══════════════════════════════════════════════════════════════════════════════

async function buildInstallGuide() {
 const children = [
 ...titlePage("Installation Guide", "Step-by-step deployment and configuration"),

 // TOC
 new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
 new Paragraph({ children: [new PageBreak()] }),

 // 1. Prerequisites
 h1("1. Prerequisites"),
 body("Ensure all of the following requirements are met before running the installer."),
 ...spacer(1),
 makeTable(
 [3600, 5760],
 ["Requirement", "Notes"],
 [
 ["Windows 10/11 or Windows Server 2016+", "64-bit required"],
 [".NET 9 Runtime", "Download from https://dotnet.microsoft.com/download"],
 ["SQL Server 2016 or later", "Express edition is supported"],
 ["SQL Server Management Studio (optional)", "For manual database management"],
 ["sqlcmd utility", "Included with SQL Server tools; required by the installer"],
 ["Administrator privileges", "Required for service installation"],
 ]
 ),

 // 2. Build the MSI
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("2. Pre-Installation: Build the MSI"),
 note("Only required when building from source. Skip this section if you already have CsvFolderImporterSetup.msi."),
 ...spacer(1),
 step(1, "Install the WiX v7 global tool (run once per machine):"),
 ...spacer(1),
 codeBlock("dotnet tool install --global wix"),
 ...spacer(1),
 step(2, "Open PowerShell as Administrator and navigate to the solution root:"),
 ...spacer(1),
 codeBlock("cd C:\\ClaudeOutput\\CsvFolderImporter"),
 ...spacer(1),
 step(3, "Run the build script:"),
 ...spacer(1),
 codeBlock(".\\Build-Installer.ps1"),
 ...spacer(1),
 body("Output: The MSI is created at:"),
 ...spacer(1),
 codeBlock("Installer\\bin\\Release\\CsvFolderImporterSetup.msi"),

 // 3. Running the Installer
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("3. Running the Installer"),
 step(1, "Right-click CsvFolderImporterSetup.msi and select Run as administrator."),
 step(2, "Welcome screen — click Next."),
 step(3, "License Agreement — read and accept, then click Next."),
 step(4, "SQL Server Configuration screen (custom dialog):"),
 ...spacer(1),
 makeTable(
 [3000, 6360],
 ["Field", "Description"],
 [
 ["SQL Connection String", "Pre-filled from appsettings.json. Edit to match your SQL Server."],
 ["Root Folder Path", "The folder the service will monitor. Each subfolder becomes a SQL table."],
 ["Poll Interval (minutes)", "How often to do a full folder rescan. Default: 5."],
 ]
 ),
 ...spacer(1),
 body("Example connection string:"),
 ...spacer(1),
 codeBlock("Server=venus-01;Database=CsvFolderImporter;User Id=sa;Password=sa;TrustServerCertificate=True;"),
 ...spacer(1),
 body("Both SQL Connection String and Root Folder Path must be non-empty to proceed.", { italics: true }),
 ...spacer(1),
 step(5, "Install Directory — accept the default (C:\\Program Files\\CsvFolderImporter) or change, then click Next."),
 step(6, "Ready to Install — click Install."),
 step(7, "The installer performs the following actions automatically:"),
 ...spacer(1),
 makeTable(
 [200, 3000, 6160],
 ["#", "Action", "Detail"],
 [
 ["a", "Copy files", "Copies all application files to the install directory"],
 ["b", "Write setup_config.ini", "Captures your connection string and folder path from the dialog"],
 ["c", "Update appsettings.json", "Writes the SQL connection string into the application config"],
 ["d", "Create database", "Runs CsvFolderImporter.sql — creates DB, Settings, and Logging tables"],
 ["e", "Seed settings", "Inserts RootFolderPath and PollIntervalMinutes into [dbo].[Settings]"],
 ["f", "Create root folder", "Creates the root import folder if it does not already exist"],
 ["g", "Register service", "Calls New-Service to register CsvFolderImporter in Windows SCM"],
 ["h", "Configure recovery", "Sets service to restart automatically after failure (60-second delay)"],
 ["i", "Start service", "Starts the service immediately after configuration is complete"],
 ]
 ),
 ...spacer(1),
 step(8, "Click Finish."),

 // 4. Verify
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("4. Verifying the Installation"),
 h2("4.1 Verify the Service Is Running"),
 body("Run the following in PowerShell:"),
 ...spacer(1),
 codeBlock("Get-Service CsvFolderImporter\n# Expected output: Status = Running"),
 ...spacer(1),
 h2("4.2 Verify the Database Was Created"),
 body("Run in SQL Server Management Studio or sqlcmd:"),
 ...spacer(1),
 codeBlock("USE [CsvFolderImporter];\nSELECT [Name], [Value], [IsEnabled] FROM [dbo].[Settings] ORDER BY [Name];"),
 ...spacer(1),
 body("Expected rows:"),
 ...spacer(1),
 makeTable(
 [3800, 2600, 2960],
 ["Name", "Value", "IsEnabled"],
 [
 ["Logging.MinLevel", "Information", "1"],
 ["PollIntervalMinutes", "5", "1"],
 ["ProcessExistingFilesOnStartup", "true", "1"],
 ["RootFolderPath", "C:\\ImportData", "1"],
 ]
 ),
 ...spacer(1),
 h2("4.3 Verify the Root Folder"),
 body("The folder specified during installation (e.g. C:\\ImportData) should exist. Create subfolders inside it — each subfolder name will become a SQL table name."),

 // 5. Setting Up Import Folders
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("5. Setting Up Import Folders"),
 step(1, "Navigate to the root folder (e.g. C:\\ImportData)."),
 step(2, "Create a subfolder for each data set. The subfolder name becomes the SQL table name."),
 ...spacer(1),
 makeTable(
 [2800, 3200, 3360],
 ["Subfolder Name", "SQL Table Created", "Notes"],
 [
 ["Orders", "[dbo].[Orders]", "CSV/Excel files with order data"],
 ["Customers", "[dbo].[Customers]", "CSV/Excel files with customer data"],
 ["Products", "[dbo].[Products]", "CSV/Excel files with product data"],
 ]
 ),
 ...spacer(1),
 warning("Subfolder names starting with underscore (_) are reserved and ignored. The service uses _Success and _Failed subfolders internally."),
 ...spacer(1),
 step(3, "Drop any CSV (.csv) or Excel (.xlsx, .xls) file into a subfolder."),
 step(4, "The service detects the file immediately via FileSystemWatcher and begins the import."),
 step(5, "After import, the file is moved to:"),
 bullet("_Success subfolder — import succeeded (timestamp appended to filename)", 1),
 bullet("_Failed subfolder — import failed (timestamp appended to filename; check [dbo].[Logging])", 1),

 // 6. Service Management
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("6. Service Management"),
 makeTable(
 [3600, 5760],
 ["Task", "Command"],
 [
 ["Check service status", "Get-Service CsvFolderImporter"],
 ["Start service", "Start-Service CsvFolderImporter"],
 ["Stop service", "Stop-Service CsvFolderImporter"],
 ["Restart service", "Restart-Service CsvFolderImporter"],
 ["View SQL activity log", "SELECT TOP 100 * FROM [CsvFolderImporter].[dbo].[Logging] ORDER BY LogID DESC"],
 ["View file log", "Open Log_*.txt files in C:\\Program Files\\CsvFolderImporter\\"],
 ]
 ),

 // 7. Changing Config
 ...spacer(1),
 h1("7. Changing Configuration After Installation"),
 body("All runtime settings are stored in [dbo].[Settings]. Edit them using SSMS or sqlcmd. A service restart is required for RootFolderPath changes; PollIntervalMinutes takes effect on the next restart."),
 ...spacer(1),
 codeBlock("USE [CsvFolderImporter];\nUPDATE [dbo].[Settings] SET [Value] = 'C:\\NewPath' WHERE [Name] = 'RootFolderPath';\nUPDATE [dbo].[Settings] SET [Value] = '10' WHERE [Name] = 'PollIntervalMinutes';"),

 // 8. Uninstall
 ...spacer(1),
 h1("8. Uninstalling"),
 step(1, "Open Control Panel → Programs → Uninstall a program."),
 step(2, "Select CSV Folder Importer and click Uninstall."),
 step(3, "The uninstaller stops the service, deletes it from SCM, removes all installed files, and removes the registry entry."),
 ...spacer(1),
 note("The SQL Server database (CsvFolderImporter), the root import folder, and any imported data are NOT removed by the uninstaller. Remove them manually if required."),

 // 9. Troubleshooting
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("9. Troubleshooting"),
 makeTable(
 [2600, 3000, 3760],
 ["Symptom", "Likely Cause", "Resolution"],
 [
 ["Service not found after install", "setup.ps1 failed to register service", "Open Log_*.txt in install dir; run New-Service manually"],
 ["Service starts then stops", "Cannot connect to SQL Server", "Verify connection string in appsettings.json; check SQL Server is running"],
 ["Files not being imported", "Root folder path mismatch", "Check RootFolderPath in [dbo].[Settings]"],
 ["Import fails — SQL error", "Table schema mismatch", "Delete the table in SQL Server; next import recreates it"],
 ["sqlcmd errors during install", "Named Pipes disabled on SQL Server", "Enable TCP/IP in SQL Server Configuration Manager"],
 ["Service running but no imports", "FileSystemWatcher event missed", "Drop a test file; the 5-minute poll will catch it; check [dbo].[Logging]"],
 ]
 ),
 ];

 const doc = new Document({
 styles: sharedStyles,
 numbering: sharedNumbering,
 sections: [{
 properties: pageProps,
 footers: { default: makeFooter("Installation Guide") },
 children
 }]
 });

 const buf = await Packer.toBuffer(doc);
 fs.writeFileSync(path.join(OUT, "CsvFolderImporter_Installation_Guide.docx"), buf);
 console.log("✓ Installation Guide written");
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT 2 — Technical Reference
// ═══════════════════════════════════════════════════════════════════════════════

async function buildTechRef() {
 const children = [
 ...titlePage("Technical Reference", "Architecture, configuration, and implementation details"),
 new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
 new Paragraph({ children: [new PageBreak()] }),

 // Overview
 h1("Overview"),
 body("CsvFolderImporter is a .NET 9 Windows Service that monitors a root folder on the file system. Each direct subfolder maps to a SQL Server table. When a CSV or Excel file is dropped into a subfolder, the service imports it into the corresponding table, dynamically creating the table on first use and truncating it on subsequent imports."),

 // 1. Architecture
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("1. Architecture"),
 h2("1.1 Component Overview"),
 makeTable(
 [2800, 1800, 4760],
 ["Component", "Type", "Responsibility"],
 [
 ["Program.cs", "Entry point", "Loads config, validates settings, builds IHost"],
 ["Worker.cs", "BackgroundService", "Orchestrates startup scan, FileSystemWatcher, and periodic polling"],
 ["FolderMonitorService", "Service class", "Manages FileSystemWatcher; dispatches files to FileImportService"],
 ["FileImportService", "Service class", "Reads files, manages table lifecycle, moves files to _Success/_Failed"],
 ["FileReaderService", "Static utility", "Parses CSV (CsvHelper) and Excel (ExcelDataReader) into FileData"],
 ["TableService", "Service class", "Executes all SQL DDL and DML (CREATE, TRUNCATE, BulkCopy)"],
 ["SettingsService", "Service class", "Loads IsEnabled=1 rows from [dbo].[Settings]"],
 ["SqlLoggerService", "Service class", "Writes to [dbo].[Logging] and FileLoggerService"],
 ["FileLoggerService", "Service class", "Writes timestamped .txt log in the executable directory"],
 ]
 ),
 ...spacer(1),
 h2("1.2 Startup Sequence"),
 numbered("FileLoggerService constructed — captures pre-database errors to disk"),
 numbered("Connection string loaded from appsettings.json"),
 numbered("SettingsService.LoadAsync() reads [dbo].[Settings] (IsEnabled = 1 rows only)"),
 numbered("AppSettings.From() maps raw dictionary to strongly-typed immutable record"),
 numbered("RootFolderPath validated — service exits if missing or non-existent"),
 numbered("IHost built with AddWindowsService(); Worker registered as BackgroundService"),
 numbered("Host.RunAsync() — control passes to Worker.ExecuteAsync()"),
 ...spacer(1),
 h2("1.3 Worker Execution Loop"),
 body("The Worker runs three concurrent mechanisms:"),
 ...spacer(1),
 makeTable(
 [2400, 7000 - 40],
 ["Mechanism", "Description"],
 [
 ["Startup scan", "Processes all existing files in all subfolders on service start (if ProcessExistingFilesOnStartup = true)"],
 ["FileSystemWatcher", "Fires immediately when a .csv, .xlsx, or .xls file is created or renamed in any watched subfolder"],
 ["PeriodicTimer", "Triggers a full rescan every PollIntervalMinutes — safety net for missed file system events"],
 ]
 ),

 // 2. Configuration
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("2. Configuration"),
 h2("2.1 appsettings.json"),
 body("Contains only the SQL connection string. All other settings live in [dbo].[Settings]."),
 ...spacer(1),
 codeBlock('{\n "ConnectionStrings": {\n "CsvFolderImporter": "Server=venus-01;Database=CsvFolderImporter;User Id=sa;Password=sa;TrustServerCertificate=True;"\n }\n}'),
 ...spacer(1),
 h2("2.2 [dbo].[Settings] Table"),
 makeTable(
 [3000, 2000, 4360],
 ["Name", "Default Value", "Description"],
 [
 ["Logging.MinLevel", "Information", "Minimum LogLevel written to [dbo].[Logging] (Trace / Debug / Information / Warning / Error / Critical)"],
 ["RootFolderPath", "C:\\ImportData", "Root folder to monitor; each direct subfolder becomes a SQL table"],
 ["PollIntervalMinutes", "5", "Minutes between full folder rescans"],
 ["ProcessExistingFilesOnStartup", "true", "Whether to process existing files when the service starts"],
 ]
 ),
 ...spacer(1),
 h2("2.3 AppSettings Record"),
 body("All settings are immutable after startup. A service restart is required to apply changes to RootFolderPath. PollIntervalMinutes and Logging.MinLevel changes take effect after restart only."),

 // 3. Database Schema
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("3. Database Schema"),
 h2("3.1 [dbo].[Settings]"),
 codeBlock("CREATE TABLE [dbo].[Settings]\n(\n [SettingID] INT NOT NULL IDENTITY(1,1),\n [Name] NVARCHAR(100) NOT NULL,\n [Value] NVARCHAR(500) NULL,\n [IsEnabled] BIT NOT NULL DEFAULT (0),\n CONSTRAINT [PK_Settings] PRIMARY KEY CLUSTERED ([SettingID] ASC)\n);"),
 ...spacer(1),
 h2("3.2 [dbo].[Logging]"),
 codeBlock("CREATE TABLE [dbo].[Logging]\n(\n [LogID] BIGINT NOT NULL IDENTITY(1,1),\n [LoggedAt] DATETIME NOT NULL DEFAULT (GETDATE()),\n [LogLevel] INT NOT NULL DEFAULT (2),\n [Message] NVARCHAR(MAX) NULL,\n CONSTRAINT [PK_Logging] PRIMARY KEY CLUSTERED ([LogID] ASC)\n);"),
 ...spacer(1),
 body("LogLevel values: 0 = Trace, 1 = Debug, 2 = Information, 3 = Warning, 4 = Error, 5 = Critical"),
 ...spacer(1),
 h2("3.3 Dynamically Created Import Tables"),
 body("Each import table follows this pattern. All data columns are NVARCHAR(MAX):"),
 ...spacer(1),
 codeBlock("CREATE TABLE [dbo].[Orders]\n(\n [OrdersID] BIGINT NOT NULL IDENTITY(1,1),\n [OrderDate] NVARCHAR(MAX) NULL, -- from CSV/Excel header row\n [Customer] NVARCHAR(MAX) NULL,\n -- one column per header in the first file imported\n CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED ([OrdersID] ASC)\n);"),
 ...spacer(1),
 body("Column names are taken from the first row of the first file imported into a subfolder. Subsequent files must match the same column names; the table is truncated before each import."),

 // 4. File Import Behavior
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("4. File Import Behavior"),
 h2("4.1 First File in a Subfolder"),
 numbered("TableService.TableExistsAsync() checks sys.tables for the target table"),
 numbered("TableService.CreateTableAsync() creates the table using the file's header row as column names"),
 numbered("Data rows are inserted using SqlBulkCopy"),
 ...spacer(1),
 h2("4.2 Subsequent Files in a Subfolder"),
 numbered("TableService.TableExistsAsync() returns true"),
 numbered("TableService.TruncateTableAsync() truncates the table (preserving schema)"),
 numbered("Data rows are inserted using SqlBulkCopy"),
 ...spacer(1),
 h2("4.3 File Locking Retry"),
 body("FileImportService waits up to 30 seconds (retrying every 500 ms) for a file to become readable. This handles files that are still being written to disk when the FileSystemWatcher event fires."),
 ...spacer(1),
 h2("4.4 File Archival"),
 body("After processing, the source file is moved to a subfolder within the same watch folder:"),
 bullet("Success: {watchFolder}\\_Success\\{name}_{yyyyMMdd_HHmmss}{ext}"),
 bullet("Failure: {watchFolder}\\_Failed\\{name}_{yyyyMMdd_HHmmss}{ext}"),
 ...spacer(1),
 body("Collision handling: if a file with the same timestamp already exists, an integer suffix is appended (_1, _2, ...)."),
 ...spacer(1),
 h2("4.5 Reserved Folder Names"),
 body("Any subfolder whose name starts with an underscore (_) is ignored by both the scanner and the FileSystemWatcher. This prevents recursive processing of _Success and _Failed folders."),

 // 5. Supported File Formats
 ...spacer(1),
 h1("5. Supported File Formats"),
 makeTable(
 [1600, 1400, 2400, 3960],
 ["Format", "Extension", "Parser", "Notes"],
 [
 ["CSV", ".csv", "CsvHelper 33.x", "Auto-detects encoding via BOM; trims whitespace; tolerates missing fields"],
 ["Excel 2007+", ".xlsx", "ExcelDataReader 3.7", "Reads first worksheet only; first row is the header"],
 ["Excel 97-2003", ".xls", "ExcelDataReader 3.7", "Requires CodePagesEncodingProvider registration at startup"],
 ]
 ),

 // 6. Installer Details
 ...spacer(1),
 new Paragraph({ children: [new PageBreak()] }),
 h1("6. Installer Details"),
 h2("6.1 Build Requirements"),
 makeTable(
 [3600, 5760],
 ["Requirement", "Detail"],
 [
 [".NET 9 SDK", "Required to publish the application"],
 ["WiX v7 global tool", "dotnet tool install --global wix"],
 ["WiX EULA", "Accepted automatically by Build-Installer.ps1 (wix eula accept wix7)"],
 ["WiX extension", "WixToolset.UI.wixext — provides dialog templates"],
 ]
 ),
 ...spacer(1),
 h2("6.2 Build-Installer.ps1 Steps"),
 numbered("Accepts WiX EULA (wix eula accept wix7)"),
 numbered("Adds WixToolset.UI.wixext extension"),
 numbered("dotnet publish — Release, win-x64, framework-dependent"),
 numbered("Copies SQL\\CsvFolderImporter.sql and setup.ps1 to publish output"),
 numbered("Reads connection string from appsettings.json; writes Installer\\DefaultValues.wxi"),
 numbered("Generates Installer\\bin\\Release\\AppFiles.wxs by enumerating publish output (PowerShell)"),
 numbered("wix build — produces CsvFolderImporterSetup.msi"),
 ...spacer(1),
 h2("6.3 MSI Custom Actions"),
 makeTable(
 [2400, 2800, 4160],
 ["Action", "Trigger", "Purpose"],
 [
 ["RunSetupScript", "After WriteIniValues (install)", "Runs setup.ps1 as SYSTEM — updates config, creates DB/tables, registers and starts service"],
 ["RemoveService", "Before RemoveFiles (uninstall)", "Stops the service (Stop-Service) and deletes it from SCM (sc.exe delete)"],
 ]
 ),
 ...spacer(1),
 h2("6.4 setup.ps1 Responsibilities"),
 numbered("Reads setup_config.ini (written by MSI IniFile components from dialog values)"),
 numbered("Updates appsettings.json with the SQL connection string"),
 numbered("Parses connection string into sqlcmd parameters (server, auth type, trust certificate)"),
 numbered("Forces TCP connection (tcp: prefix) to avoid Named Pipes failures with remote servers"),
 numbered("Runs CsvFolderImporter.sql against SQL Server (creates DB, tables, seeds settings)"),
 numbered("Upserts RootFolderPath and PollIntervalMinutes in [dbo].[Settings]"),
 numbered("Creates the root import folder if it does not exist"),
 numbered("Registers the Windows service using New-Service"),
 numbered("Starts the service"),
 numbered("Configures failure recovery via sc.exe failure (restart after 60 s on 1st and 2nd failures)"),

 // 7. NuGet Packages
 ...spacer(1),
 h1("7. NuGet Packages"),
 makeTable(
 [3600, 1200, 4560],
 ["Package", "Version", "Purpose"],
 [
 ["CsvHelper", "33.0.1", "CSV parsing with BOM detection and whitespace trimming"],
 ["ExcelDataReader", "3.7.0", "Excel file reading (.xlsx and .xls)"],
 ["ExcelDataReader.DataSet", "3.7.0", "DataSet adapter for ExcelDataReader"],
 ["Microsoft.Data.SqlClient", "5.2.2", "SQL Server connectivity and SqlBulkCopy"],
 ["Microsoft.Extensions.Hosting", "9.0.0", "IHost and BackgroundService infrastructure"],
 ["Microsoft.Extensions.Hosting.WindowsServices", "9.0.0", "AddWindowsService() for SCM integration"],
 ]
 ),

 // 8. Logging
 ...spacer(1),
 h1("8. Logging"),
 body("SqlLoggerService fans out every log call to two channels:"),
 bullet("[dbo].[Logging] — filtered by the Logging.MinLevel setting"),
 bullet("FileLoggerService — always written regardless of level"),
 ...spacer(1),
 body("FileLoggerService creates a timestamped file (Log_yyyyMMdd_HHmmss.txt) in the executable directory at startup. This captures errors that occur before the SQL connection is available (e.g., bad connection string, missing database)."),
 ...spacer(1),
 body("Log rows older than one year are purged from [dbo].[Logging] on each service start."),
 ];

 const doc = new Document({
 styles: sharedStyles,
 numbering: sharedNumbering,
 sections: [{
 properties: pageProps,
 footers: { default: makeFooter("Technical Reference") },
 children
 }]
 });

 const buf = await Packer.toBuffer(doc);
 fs.writeFileSync(path.join(OUT, "CsvFolderImporter_Technical_Reference.docx"), buf);
 console.log("✓ Technical Reference written");
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT 3 — Executive Summary
// ═══════════════════════════════════════════════════════════════════════════════

async function buildExecSummary() {
 const children = [
 // Cover
 ...spacer(5),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 12 } },
 spacing: { before: 0, after: 0 },
 children: [new TextRun({ text: "CSV Folder Importer", bold: true, size: 72, font: "Arial", color: BLUE })]
 }),
 ...spacer(1),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 120, after: 60 },
 children: [new TextRun({ text: "Executive Summary", bold: true, size: 44, font: "Arial", color: DKGRAY })]
 }),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 spacing: { before: 0, after: 240 },
 children: [new TextRun({ text: "Automated CSV and Excel Import Service for SQL Server", size: 26, font: "Arial", color: DKGRAY, italics: true })]
 }),
 new Paragraph({
 alignment: AlignmentType.CENTER,
 children: [new TextRun({ text: new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }), size: 22, font: "Arial", color: DKGRAY })]
 }),
 new Paragraph({ children: [new PageBreak()] }),

 // Business Problem
 h1("Business Problem"),
 body("Many business processes generate data in CSV or Excel format that must be loaded into SQL Server for reporting, analysis, or downstream processing. Manual import steps are error-prone, time-consuming, and difficult to schedule reliably. Operations teams need a simple, hands-off mechanism to keep SQL Server tables current without developer involvement each time new data arrives."),

 // Solution
 ...spacer(1),
 h1("Solution"),
 body("CSV Folder Importer is a lightweight Windows Service that automates the import of CSV and Excel files into SQL Server. It monitors a configurable root folder on the file system. Each subfolder within the root maps directly to a SQL Server table — when a file is dropped into a subfolder, the service detects it immediately and imports the data."),
 ...spacer(1),
 body("The solution requires no coding knowledge to operate. Business users simply drop files into the appropriate folder; the service handles everything else."),

 // Key Features
 ...spacer(1),
 h1("Key Features"),
 bullet("Automatic table creation — the first file dropped into a subfolder defines the table structure; no manual SQL required"),
 bullet("Immediate processing — files are detected within seconds via Windows file system events"),
 bullet("Scheduled safety net — a configurable periodic scan (default every 5 minutes) catches any files missed by real-time detection"),
 bullet("File archival — successfully imported files move to a timestamped archive; failed files move to a review folder"),
 bullet("Audit trail — all import activity logged to SQL Server with timestamps and severity levels"),
 bullet("Zero-downtime configuration — connection string, root folder, and polling interval configurable without redeployment"),
 bullet("Professional installer — Windows Installer (MSI) guides administrators through configuration and service setup in minutes"),

 // How It Works
 ...spacer(1),
 h1("How It Works"),
 makeTable(
 [400, 3800, 5160],
 ["Step", "Action", "Outcome"],
 [
 ["1", "Administrator creates a subfolder (e.g. Orders) under the root folder", "Service begins watching that folder immediately"],
 ["2", "User drops a CSV or Excel file into the subfolder", "File is detected within seconds via FileSystemWatcher"],
 ["3", "Service reads the file header row to determine column names", "SQL table is created automatically on first import"],
 ["4", "Data rows are bulk-loaded into the SQL table", "Table is truncated and reloaded on each subsequent import"],
 ["5", "File is moved to _Success or _Failed archive folder", "Source folder stays clean; full history preserved with timestamps"],
 ]
 ),

 // Technical Requirements
 ...spacer(1),
 h1("Technical Requirements"),
 makeTable(
 [3200, 6160],
 ["Requirement", "Specification"],
 [
 ["Operating System", "Windows 10 / 11 or Windows Server 2016+ (64-bit)"],
 [".NET Runtime", ".NET 9 (framework-dependent deployment)"],
 ["Database", "SQL Server 2016 or later (Express edition supported)"],
 ["File Formats", "CSV (.csv), Excel 2007+ (.xlsx), Excel 97-2003 (.xls)"],
 ["Installation", "MSI installer; requires Administrator privileges"],
 ["Network", "TCP/IP access to SQL Server required from the host machine"],
 ]
 ),

 // Benefits
 ...spacer(1),
 h1("Benefits"),
 makeTable(
 [4200, 5160],
 ["Benefit", "Detail"],
 [
 ["Eliminates manual imports", "Removes error-prone, repetitive steps from operations workflows"],
 ["Seconds to data", "Files are processed within seconds of arrival, not hours or days"],
 ["Scales without code", "Adding a new data feed requires only creating a subfolder — no development"],
 ["Full audit trail", "Every import is recorded in SQL Server with timestamp and outcome"],
 ["Simple to operate", "No developer needed for day-to-day operation"],
 ["Self-healing service", "Automatically restarts after failures with configurable recovery delay"],
 ]
 ),

 // Deployment
 ...spacer(1),
 h1("Deployment"),
 body("The solution is delivered as a single MSI installer. During installation, administrators provide the SQL Server connection string, the root folder path, and the polling interval. The installer creates the database, registers and starts the Windows service, and configures automatic restart on failure — all in a single guided workflow taking less than five minutes."),
 ...spacer(1),
 body("Once installed, the service requires no ongoing maintenance. It starts automatically with Windows, restarts itself after unexpected failures, and maintains its own audit log in SQL Server."),
 ];

 const doc = new Document({
 styles: sharedStyles,
 numbering: sharedNumbering,
 sections: [{
 properties: pageProps,
 footers: { default: makeFooter("Executive Summary") },
 children
 }]
 });

 const buf = await Packer.toBuffer(doc);
 fs.writeFileSync(path.join(OUT, "CsvFolderImporter_Executive_Summary.docx"), buf);
 console.log("✓ Executive Summary written");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
 try {
 await buildInstallGuide();
 await buildTechRef();
 await buildExecSummary();
 console.log("\nAll Word documents created successfully.");
 } catch (err) {
 console.error("Error:", err);
 process.exit(1);
 }
})();
