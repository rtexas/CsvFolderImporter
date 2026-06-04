using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Services;

public sealed class SqlLoggerService
{
    private readonly string             _connectionString;
    private readonly LogLevel           _minLevel;
    private readonly FileLoggerService? _fileLogger;

    public SqlLoggerService(
        string             connectionString,
        LogLevel           minLevel   = LogLevel.Warning,
        FileLoggerService? fileLogger = null)
    {
        _connectionString = connectionString;
        _minLevel         = minLevel;
        _fileLogger       = fileLogger;
    }

    public async Task LogAsync(
        string            message,
        LogLevel          logLevel          = LogLevel.Information,
        CancellationToken cancellationToken = default)
    {
        _fileLogger?.WriteEntry(logLevel, message);

        if (logLevel >= _minLevel)
            await WriteSqlAsync(message, logLevel, cancellationToken);
    }

    public async Task PurgeOldLogsAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
            DELETE FROM [dbo].[Logging]
            WHERE [LoggedAt] < DATEADD(YEAR, -1, GETDATE());
            """;
        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = new SqlCommand(sql, connection);
            var deleted = await command.ExecuteNonQueryAsync(cancellationToken);
            _fileLogger?.WriteEntry(LogLevel.Information,
                $"PurgeOldLogs: {deleted} row(s) removed from [dbo].[Logging].");
        }
        catch { }
    }

    private async Task WriteSqlAsync(string message, LogLevel logLevel, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO [dbo].[Logging] ([Message], [LogLevel])
            VALUES (@Message, @LogLevel);
            """;
        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(ct);
            await using var command = new SqlCommand(sql, connection);
            command.Parameters.AddWithValue("@Message",  message);
            command.Parameters.AddWithValue("@LogLevel", (int)logLevel);
            await command.ExecuteNonQueryAsync(ct);
        }
        catch { }
    }
}
