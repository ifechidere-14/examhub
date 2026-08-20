using System;
using System.Diagnostics;

public static class ExamHubLauncher
{
    public static void Main(string[] args)
    {
        string url = "https://examhub.onrender.com";
        foreach (string argument in args)
        {
            if (argument.StartsWith("--app-url=", StringComparison.OrdinalIgnoreCase))
            {
                url = argument.Substring("--app-url=".Length);
            }
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });
    }
}