using System.Data;
using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;
using ExcelDataReader;

namespace CsvFolderImporter.Services;

public sealed class FileData
{
    public List<string>   Headers { get; }
    public List<string[]> Rows    { get; }

    public FileData(List<string> headers, List<string[]> rows)
    {
        Headers = headers;
        Rows    = rows;
    }
}

public static class FileReaderService
{
    private static readonly string[] CsvExtensions   = [".csv"];
    private static readonly string[] ExcelExtensions = [".xlsx", ".xls"];

    public static bool IsSupported(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        return CsvExtensions.Contains(ext) || ExcelExtensions.Contains(ext);
    }

    public static FileData Read(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();

        return ext switch
        {
            ".csv"           => ReadCsv(filePath),
            ".xlsx" or ".xls" => ReadExcel(filePath),
            _ => throw new NotSupportedException($"File type '{ext}' is not supported.")
        };
    }

    private static FileData ReadCsv(string filePath)
    {
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord    = true,
            MissingFieldFound  = null,
            BadDataFound       = null,
            TrimOptions        = TrimOptions.Trim,
        };

        using var reader    = new StreamReader(filePath, detectEncodingFromByteOrderMarks: true);
        using var csvReader = new CsvReader(reader, config);

        csvReader.Read();
        csvReader.ReadHeader();

        var headers = csvReader.HeaderRecord!.ToList();
        var rows    = new List<string[]>();

        while (csvReader.Read())
        {
            var row = new string[headers.Count];
            for (int i = 0; i < headers.Count; i++)
                row[i] = csvReader.GetField(i) ?? string.Empty;
            rows.Add(row);
        }

        return new FileData(headers, rows);
    }

    private static FileData ReadExcel(string filePath)
    {
        // Required for .xls (BIFF format) on .NET Core / .NET 5+
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

        using var stream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var excelReader = ExcelReaderFactory.CreateReader(stream);

        var dataSet = excelReader.AsDataSet(new ExcelDataSetConfiguration
        {
            ConfigureDataTable = _ => new ExcelDataTableConfiguration
            {
                UseHeaderRow = true
            }
        });

        if (dataSet.Tables.Count == 0)
            return new FileData([], []);

        var table = dataSet.Tables[0];

        var headers = table.Columns
            .Cast<DataColumn>()
            .Select(c => c.ColumnName)
            .ToList();

        var rows = table.Rows
            .Cast<DataRow>()
            .Select(r => headers
                .Select((_, i) => r.IsNull(i) ? string.Empty : r[i]?.ToString() ?? string.Empty)
                .ToArray())
            .ToList();

        return new FileData(headers, rows);
    }
}
