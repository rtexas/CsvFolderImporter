using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using CsvFolderImporter;
using CsvFolderImporter.Models;
using CsvFolderImporter.Services;

// ExcelDataReader requires this for .xls (BIFF) format on .NET Core+.
System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

// ── File logger — captures failures before SQL is reachable ──────────────────
using var fileLogger = new FileLoggerService();

// ── Load connection string from appsettings.json ──────────────────────────────
string connectionString;
try
{
    var config = new ConfigurationBuilder()
        .SetBasePath(AppContext.BaseDirectory)
        .AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
        .Build();

    connectionString = config.GetConnectionString("CsvFolderImporter")
        ?? throw new InvalidOperationException(
               "Connection string 'CsvFolderImporter' is missing from appsettings.json.");
}
catch (Exception ex)
{
    fileLogger.WriteException("Failed to load appsettings.json", ex);
    Console.Error.WriteLine($"[CRITICAL] {ex.Message}");
    return 1;
}

// ── Load settings from [dbo].[Settings] ──────────────────────────────────────
AppSettings appSettings;
try
{
    using var startupCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
    var settingsService  = new SettingsService(connectionString);
    var rawSettings      = await settingsService.LoadAsync(startupCts.Token);
    appSettings          = AppSettings.From(rawSettings);

    fileLogger.WriteEntry(LogLevel.Information,
        $"Loaded {rawSettings.Count} setting(s) from [dbo].[Settings].");
}
catch (Exception ex)
{
    fileLogger.WriteException(
        "Cannot connect to the database. Verify the connection string in appsettings.json.", ex);
    Console.Error.WriteLine($"[CRITICAL] {ex.Message}");
    return 1;
}

// ── Validate root folder ──────────────────────────────────────────────────────
if (string.IsNullOrWhiteSpace(appSettings.RootFolderPath))
{
    const string msg = "Setting 'RootFolderPath' is not configured in [dbo].[Settings].";
    fileLogger.WriteEntry(LogLevel.Critical, msg);
    Console.Error.WriteLine($"[CRITICAL] {msg}");
    return 1;
}

if (!Directory.Exists(appSettings.RootFolderPath))
{
    var msg = $"Root folder does not exist: {appSettings.RootFolderPath}";
    fileLogger.WriteEntry(LogLevel.Critical, msg);
    Console.Error.WriteLine($"[CRITICAL] {msg}");
    return 1;
}

// ── SQL logger (fans out to SQL table + file log) ─────────────────────────────
var sqlLogger = new SqlLoggerService(connectionString, appSettings.LoggingMinLevel, fileLogger);
await sqlLogger.PurgeOldLogsAsync();
await sqlLogger.LogAsync(
    $"Starting — root: {appSettings.RootFolderPath}, poll: {appSettings.PollIntervalMinutes} min.",
    LogLevel.Information);

// ── Build and run the Windows-Service–compatible host ────────────────────────
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(opt => opt.ServiceName = "CsvFolderImporter");

// Register pre-loaded singletons so services receive fully configured instances.
builder.Services.AddSingleton(appSettings);
builder.Services.AddSingleton(sqlLogger);
builder.Services.AddSingleton(_ => new TableService(connectionString, sqlLogger));
builder.Services.AddSingleton(sp =>
    new FileImportService(sp.GetRequiredService<TableService>(), sqlLogger));
builder.Services.AddSingleton(sp =>
    new FolderMonitorService(
        appSettings.RootFolderPath,
        sp.GetRequiredService<FileImportService>(),
        sqlLogger));
builder.Services.AddHostedService<Worker>();

await builder.Build().RunAsync();
return 0;
