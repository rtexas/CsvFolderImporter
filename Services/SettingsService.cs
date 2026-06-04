using Microsoft.Data.SqlClient;

namespace CsvFolderImporter.Services;

public sealed class SettingsService
{
    private readonly string _connectionString;

    public SettingsService(string connectionString)
        => _connectionString = connectionString;

    public async Task<IReadOnlyDictionary<string, string>> LoadAsync(
        CancellationToken cancellationToken = default)
    {
        const string sql =
            "SELECT [Name], [Value] FROM [dbo].[Settings] WHERE [IsEnabled] = 1;";

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection);
        await using var reader  = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var name  = reader.GetString(0);
            var value = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
            result[name] = value;
        }

        return result;
    }

    public static string Require(
        IReadOnlyDictionary<string, string> settings, string key)
    {
        if (settings.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            return value;
        throw new InvalidOperationException(
            $"Required setting '{key}' is missing or empty in [dbo].[Settings].");
    }

    public static string GetOrDefault(
        IReadOnlyDictionary<string, string> settings, string key, string defaultValue)
        => settings.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : defaultValue;
}
