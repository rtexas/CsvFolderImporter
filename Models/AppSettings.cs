using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Models;

public sealed record AppSettings
{
    public LogLevel LoggingMinLevel              { get; private init; } = LogLevel.Information;
    public string   RootFolderPath               { get; private init; } = string.Empty;
    public bool     ProcessExistingFilesOnStartup { get; private init; } = true;
    public int      PollIntervalMinutes           { get; private init; } = 5;

    public static AppSettings From(IReadOnlyDictionary<string, string> raw)
    {
        var s = new AppSettings();

        if (raw.TryGetValue("Logging.MinLevel", out var lvlRaw))
        {
            if (Enum.TryParse<LogLevel>(lvlRaw, ignoreCase: true, out var parsed))
                s = s with { LoggingMinLevel = parsed };
            else if (int.TryParse(lvlRaw, out var intVal) && Enum.IsDefined(typeof(LogLevel), intVal))
                s = s with { LoggingMinLevel = (LogLevel)intVal };
        }

        if (raw.TryGetValue("RootFolderPath", out var root) && !string.IsNullOrWhiteSpace(root))
            s = s with { RootFolderPath = root };

        if (raw.TryGetValue("ProcessExistingFilesOnStartup", out var processRaw) &&
            bool.TryParse(processRaw, out var boolVal))
            s = s with { ProcessExistingFilesOnStartup = boolVal };

        if (raw.TryGetValue("PollIntervalMinutes", out var pollRaw) &&
            int.TryParse(pollRaw, out var pollVal) && pollVal > 0)
            s = s with { PollIntervalMinutes = pollVal };

        return s;
    }
}
