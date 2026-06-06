using Microsoft.Extensions.Logging;

namespace CsvFolderImporter.Services;

public sealed class FileImportService
{
    private readonly TableService     _tableService;
    private readonly SqlLoggerService _logger;

    public FileImportService(TableService tableService, SqlLoggerService logger)
    {
        _tableService = tableService;
        _logger       = logger;
    }

    /// <summary>
    /// Imports a single CSV or Excel file into the SQL table named after its parent folder.
    /// Creates the table on first import; truncates it for subsequent imports.
    /// On success, moves the file to a _Success subfolder with a timestamp suffix.
    /// On failure, moves the file to a _Failed subfolder with a timestamp suffix.
    /// </summary>
    public async Task ImportFileAsync(string filePath, string tableName, CancellationToken ct = default)
    {
        await _logger.LogAsync($"Processing: {filePath}", LogLevel.Information, ct);

        var parentFolder  = Path.GetDirectoryName(filePath)!;
        var successFolder = Path.Combine(parentFolder, "_Success");
        var failedFolder  = Path.Combine(parentFolder, "_Failed");

        FileData data;
        try
        {
            data = await WaitForFileAndReadAsync(filePath, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            await _logger.LogAsync(
                $"Failed to read '{Path.GetFileName(filePath)}': {ex.Message}",
                LogLevel.Error, ct);
            MoveFile(filePath, failedFolder);
            return;
        }

        if (data.Headers.Count == 0)
        {
            await _logger.LogAsync(
                $"Skipping '{Path.GetFileName(filePath)}' — no headers found.",
                LogLevel.Warning, ct);
            MoveFile(filePath, failedFolder);
            return;
        }

        try
        {
            bool exists = await _tableService.TableExistsAsync(tableName, ct);

            if (!exists)
            {
                await _tableService.CreateTableAsync(tableName, data.Headers, ct);
            }
            else
            {
                int existing = await _tableService.CountRowsForTodayAsync(tableName, ct);
                if (existing > 0)
                {
                    await _logger.LogAsync(
                        $"[dbo].[{tableName}] already contains {existing} row(s) for today's import date. " +
                        $"Existing rows will be removed before re-importing.",
                        LogLevel.Information, ct);

                    await _tableService.DeleteRowsForTodayAsync(tableName, ct);
                }
            }

            int imported = await _tableService.BulkInsertAsync(tableName, data.Headers, data.Rows, ct);

            await _logger.LogAsync(
                $"Imported {imported} row(s) from '{Path.GetFileName(filePath)}' into [dbo].[{tableName}].",
                LogLevel.Information, ct);

            MoveFile(filePath, successFolder);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            await _logger.LogAsync(
                $"Failed to import '{Path.GetFileName(filePath)}' into [{tableName}]: {ex.Message}",
                LogLevel.Error, ct);
            MoveFile(filePath, failedFolder);
        }
    }

    // Retries opening the file for up to 30 seconds to handle files still being written.
    private static async Task<FileData> WaitForFileAndReadAsync(
        string filePath, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                return FileReaderService.Read(filePath);
            }
            catch (IOException) when (DateTime.UtcNow < deadline)
            {
                await Task.Delay(500, ct);
            }
        }
    }

    private static void MoveFile(string filePath, string destinationFolder)
    {
        try
        {
            if (!File.Exists(filePath)) return;

            Directory.CreateDirectory(destinationFolder);

            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var name      = Path.GetFileNameWithoutExtension(filePath);
            var ext       = Path.GetExtension(filePath);
            var dest      = Path.Combine(destinationFolder, $"{name}_{timestamp}{ext}");

            for (int i = 1; File.Exists(dest); i++)
                dest = Path.Combine(destinationFolder, $"{name}_{timestamp}_{i}{ext}");

            File.Move(filePath, dest);
        }
        catch
        {
            // Never let a file-move failure crash the import pipeline.
        }
    }
}
