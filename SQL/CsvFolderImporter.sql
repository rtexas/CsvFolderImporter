-- =============================================================================
-- CsvFolderImporter — Database Schema
-- Run this script once against your SQL Server instance.
-- All DDL is guarded with IF NOT EXISTS — safe to re-run.
-- =============================================================================

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'CsvFolderImporter')
BEGIN
    CREATE DATABASE [CsvFolderImporter];
    PRINT 'Database [CsvFolderImporter] created.';
END
ELSE
    PRINT 'Database [CsvFolderImporter] already exists — skipping CREATE.';
GO

USE [CsvFolderImporter];
GO

-- ── Settings ──────────────────────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE  object_id = OBJECT_ID(N'[dbo].[Settings]'))
BEGIN
    CREATE TABLE [dbo].[Settings]
    (
        [SettingID]  INT           NOT NULL IDENTITY(1,1),
        [Name]       NVARCHAR(100) NOT NULL,
        [Value]      NVARCHAR(500) NULL,
        [IsEnabled]  BIT           NOT NULL CONSTRAINT [DF_Settings_IsEnabled] DEFAULT (0),
        CONSTRAINT [PK_Settings] PRIMARY KEY CLUSTERED ([SettingID] ASC)
    );
    PRINT 'Table [dbo].[Settings] created.';
END
ELSE
    PRINT 'Table [dbo].[Settings] already exists — skipping.';
GO

-- ── Logging ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE  object_id = OBJECT_ID(N'[dbo].[Logging]'))
BEGIN
    CREATE TABLE [dbo].[Logging]
    (
        [LogID]     BIGINT        NOT NULL IDENTITY(1,1),
        [LoggedAt]  DATETIME      NOT NULL CONSTRAINT [DF_Logging_LoggedAt] DEFAULT (GETDATE()),
        [LogLevel]  INT           NOT NULL CONSTRAINT [DF_Logging_LogLevel]  DEFAULT (2),
        [Message]   NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_Logging] PRIMARY KEY CLUSTERED ([LogID] ASC)
    );
    PRINT 'Table [dbo].[Logging] created.';
END
ELSE
    PRINT 'Table [dbo].[Logging] already exists — skipping.';
GO

-- ── Seed Settings ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'Logging.MinLevel')
    INSERT INTO [dbo].[Settings] ([Name], [Value], [IsEnabled])
    VALUES ('Logging.MinLevel', 'Information', 1);

IF NOT EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'RootFolderPath')
    INSERT INTO [dbo].[Settings] ([Name], [Value], [IsEnabled])
    VALUES ('RootFolderPath', 'C:\ImportData', 1);
    -- Updated by the installer. Each direct subfolder becomes a SQL table name.

IF NOT EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'PollIntervalMinutes')
    INSERT INTO [dbo].[Settings] ([Name], [Value], [IsEnabled])
    VALUES ('PollIntervalMinutes', '5', 1);
    -- Full folder scan interval in minutes. FileSystemWatcher triggers immediately on new files.

IF NOT EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'ProcessExistingFilesOnStartup')
    INSERT INTO [dbo].[Settings] ([Name], [Value], [IsEnabled])
    VALUES ('ProcessExistingFilesOnStartup', 'true', 1);
    -- When true, all existing CSV/Excel files are imported when the service starts.
GO

-- ── Verification ──────────────────────────────────────────────────────────────
SELECT 'Settings' AS [Table], COUNT(*) AS [Rows] FROM [dbo].[Settings]
UNION ALL
SELECT 'Logging',              COUNT(*)              FROM [dbo].[Logging];

SELECT [SettingID], [Name], [Value], [IsEnabled] FROM [dbo].[Settings] ORDER BY [Name];
GO
