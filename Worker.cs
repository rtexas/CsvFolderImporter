using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using CsvFolderImporter.Models;
using CsvFolderImporter.Services;

namespace CsvFolderImporter;

public sealed class Worker : BackgroundService
{
    private readonly AppSettings          _settings;
    private readonly FolderMonitorService _monitor;
    private readonly SqlLoggerService     _logger;

    public Worker(AppSettings settings, FolderMonitorService monitor, SqlLoggerService logger)
    {
        _settings = settings;
        _monitor  = monitor;
        _logger   = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _logger.LogAsync("CsvFolderImporter service started.", LogLevel.Information, stoppingToken);

        // Initial scan processes any files already waiting in the folders.
        if (_settings.ProcessExistingFilesOnStartup)
        {
            try { await _monitor.ProcessExistingFilesAsync(stoppingToken); }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                await _logger.LogAsync(
                    $"Error during startup scan: {ex.Message}", LogLevel.Warning, stoppingToken);
            }
        }

        // FileSystemWatcher handles files dropped while the service is running.
        _monitor.Start(stoppingToken);

        // Periodic poll catches anything the watcher might have missed (e.g. network drives,
        // files dropped while the service was stopped).
        var pollInterval = TimeSpan.FromMinutes(_settings.PollIntervalMinutes);
        using var timer  = new PeriodicTimer(pollInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await _monitor.ProcessExistingFilesAsync(stoppingToken); }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    await _logger.LogAsync(
                        $"Error during periodic scan: {ex.Message}", LogLevel.Warning, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) { }

        await _logger.LogAsync("CsvFolderImporter service stopped.", LogLevel.Information,
            CancellationToken.None);
    }
}
