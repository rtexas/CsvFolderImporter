using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Services;

public sealed class TableService
{
    private readonly string           _connectionString;
    private readonly SqlLoggerService _logger;

    public TableService(string connectionString, SqlLoggerService logger)
    {
        _connectionString = connectionString;
        _logger           = logger;
    }

    public async Task<bool> TableExistsAsync(string tableName, CancellationToken ct = default)
    {
        const string sql = """
            SELECT COUNT(1) FROM sys.tables
            WHERE object_id = OBJECT_ID(@TableName) AND type = 'U';
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@TableName", $"dbo.{tableName}");
        var result = await command.ExecuteScalarAsync(ct);
        return Convert.ToInt32(result) > 0;
    }

    public async Task CreateTableAsync(
        string       tableName,
        List<string> columns,
        CancellationToken ct = default)
    {
        var columnDefs = string.Join(",\r\n    ",
            columns.Select(c => $"[{EscapeName(c)}] NVARCHAR(MAX) NULL"));

        var sql = $"""
            CREATE TABLE [dbo].[{EscapeName(tableName)}]
            (
                [{EscapeName(tableName)}ID] BIGINT NOT NULL IDENTITY(1,1),
                {columnDefs},
                [ImportDate] DATE NOT NULL DEFAULT GETDATE(),
                CONSTRAINT [PK_{EscapeName(tableName)}] PRIMARY KEY CLUSTERED ([{EscapeName(tableName)}ID] ASC)
            );
            """;

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);
        await using var command = new SqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(ct);

        await _logger.LogAsync(
            $"Created table [dbo].[{tableName}] with {columns.Count} column(s).",
            LogLevel.Information, ct);
    }

    public async Task<int> BulkInsertAsync(
        string       tableName,
        List<string> columns,
        List<string[]> rows,
        CancellationToken ct = default)
    {
        if (rows.Count == 0) return 0;

        var dt = new DataTable();
        foreach (var col in columns)
            dt.Columns.Add(col, typeof(string));

        foreach (var row in rows)
        {
            var dr = dt.NewRow();
            for (int i = 0; i < columns.Count && i < row.Length; i++)
                dr[i] = row[i];
            dt.Rows.Add(dr);
        }

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        using var bulk = new SqlBulkCopy(connection)
        {
            DestinationTableName = $"[dbo].[{EscapeName(tableName)}]",
            BulkCopyTimeout      = 300
        };

        foreach (var col in columns)
            bulk.ColumnMappings.Add(col, $"[{EscapeName(col)}]");

        await bulk.WriteToServerAsync(dt, ct);
        return rows.Count;
    }

    // Escapes ] in identifiers so they are safe inside [...] delimiters.
    private static string EscapeName(string name) => name.Replace("]", "]]");
}
