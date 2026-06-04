using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Services;

public sealed class FileLoggerService : IDisposable
{
    private readonly string       _filePath;
    private readonly StreamWriter _writer;
    private readonly object       _lock = new();

    public string FilePath => _filePath;

    public FileLoggerService()
    {
        _filePath = ResolveUniqueFilePath();
        _writer   = new StreamWriter(_filePath, append: false, System.Text.Encoding.UTF8)
        {
            AutoFlush = true
        };
        WriteEntry(LogLevel.Information,
            $"CsvFolderImporter log opened — {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
    }

    public void WriteEntry(LogLevel level, string message)
    {
        var entry = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}  [{LevelLabel(level),-8}]  {message}";
        lock (_lock)
        {
            try { _writer.WriteLine(entry); }
            catch { }
        }
    }

    public void WriteException(string context, Exception ex)
    {
        var entry = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}  [{"CRITICAL",-8}]  " +
                    $"{context}: {ex.GetType().Name}: {ex.Message}{Environment.NewLine}{ex}";
        lock (_lock)
        {
            try { _writer.WriteLine(entry); }
            catch { }
        }
    }

    public void Dispose()
    {
        WriteEntry(LogLevel.Information,
            $"CsvFolderImporter log closed  — {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        _writer.Dispose();
    }

    private static string ResolveUniqueFilePath()
    {
        var dir      = AppContext.BaseDirectory;
        var ts       = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var baseName = $"Log_{ts}";
        var path     = Path.Combine(dir, $"{baseName}.txt");
        if (!File.Exists(path)) return path;
        for (int n = 1; ; n++)
        {
            path = Path.Combine(dir, $"{baseName}_{n}.txt");
            if (!File.Exists(path)) return path;
        }
    }

    private static string LevelLabel(LogLevel level) => level switch
    {
        LogLevel.Trace       => "TRACE",
        LogLevel.Debug       => "DEBUG",
        LogLevel.Information => "INFO",
        LogLevel.Warning     => "WARN",
        LogLevel.Error       => "ERROR",
        LogLevel.Critical    => "CRITICAL",
        _                    => "LOG"
    };
}
