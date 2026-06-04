using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Services;

public sealed class FolderMonitorService : IDisposable
{
    private readonly string            _rootPath;
    private readonly FileImportService _importService;
    private readonly SqlLoggerService  _logger;
    private FileSystemWatcher?         _watcher;

    // Prevents the same file from being processed twice in rapid succession.
    private readonly HashSet<string> _inFlight     = new(StringComparer.OrdinalIgnoreCase);
    private readonly object          _inFlightLock = new();

    public FolderMonitorService(
        string            rootPath,
        FileImportService importService,
        SqlLoggerService  logger)
    {
        _rootPath      = rootPath;
        _importService = importService;
        _logger        = logger;
    }

    /// <summary>
    /// Scans all watched subfolders for CSV/Excel files and imports them.
    /// Used at startup and by the periodic poll timer.
    /// Skips reserved folders (_Success, _Failed) and any folder whose name starts with _.
    /// </summary>
    public async Task ProcessExistingFilesAsync(CancellationToken ct = default)
    {
        if (!Directory.Exists(_rootPath)) return;

        await _logger.LogAsync("Scanning folders for files to import…", LogLevel.Information, ct);

        foreach (var subfolder in Directory.EnumerateDirectories(_rootPath))
        {
            var tableName = Path.GetFileName(subfolder);

            // Skip reserved folders (_Success, _Failed, etc.)
            if (tableName.StartsWith('_')) continue;

            var files = Directory.EnumerateFiles(subfolder, "*.*", SearchOption.TopDirectoryOnly)
                .Where(f => FileReaderService.IsSupported(f))
                .OrderBy(f => File.GetCreationTimeUtc(f))
                .ToList();

            foreach (var file in files)
            {
                ct.ThrowIfCancellationRequested();
                await _importService.ImportFileAsync(file, tableName, ct);
            }
        }

        await _logger.LogAsync("Scan complete.", LogLevel.Information, ct);
    }

    /// <summary>
    /// Starts a FileSystemWatcher on the root folder.
    /// New CSV/Excel files dropped into any direct subfolder are imported immediately.
    /// </summary>
    public void Start(CancellationToken ct)
    {
        _watcher = new FileSystemWatcher(_rootPath)
        {
            IncludeSubdirectories = true,
            NotifyFilter          = NotifyFilters.FileName | NotifyFilters.LastWrite,
            EnableRaisingEvents   = true
        };

        _watcher.Created += (_, e) => OnFileEvent(e.FullPath, ct);
        _watcher.Renamed += (_, e) => OnFileEvent(e.FullPath, ct);
        _watcher.Error   += (_, e) =>
            _logger.LogAsync($"FileSystemWatcher error: {e.GetException().Message}",
                LogLevel.Error, ct).GetAwaiter().GetResult();
    }

    private void OnFileEvent(string fullPath, CancellationToken ct)
    {
        if (!FileReaderService.IsSupported(fullPath)) return;

        // Only handle files that are direct children of a non-reserved subfolder.
        var parent      = Path.GetDirectoryName(fullPath);
        if (parent is null) return;

        var folderName  = Path.GetFileName(parent);
        if (folderName.StartsWith('_')) return;  // skip _Success / _Failed

        var grandparent = Path.GetDirectoryName(parent);
        if (!string.Equals(grandparent, _rootPath, StringComparison.OrdinalIgnoreCase)) return;

        lock (_inFlightLock)
        {
            if (!_inFlight.Add(fullPath)) return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await _importService.ImportFileAsync(fullPath, folderName, ct);
            }
            finally
            {
                lock (_inFlightLock) { _inFlight.Remove(fullPath); }
            }
        }, ct);
    }

    public void Dispose()
    {
        _watcher?.Dispose();
        _watcher = null;
    }
}
