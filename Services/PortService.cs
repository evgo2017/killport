using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using KillPort.Models;

namespace KillPort.Services;

public class PortService : IPortService
{
    public async Task<List<ProcessItem>> GetProcessesByPortAsync(int port)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return await GetProcessesWindowsAsync(port);
        }
        else
        {
            return await GetProcessesUnixAsync(port);
        }
    }

    public Task KillProcessAsync(int processId)
    {
        return Task.Run(() =>
        {
            try
            {
                var process = Process.GetProcessById(processId);
                process.Kill();
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to kill process {processId}: {ex.Message}", ex);
            }
        });
    }

    private async Task<List<ProcessItem>> GetProcessesWindowsAsync(int port)
    {
        try 
        {
            var output = await RunCommandAsync("netstat", "-ano");
            var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var result = new List<ProcessItem>();

            foreach (var line in lines)
            {
                if (!line.Contains($":{port}")) continue;

                var parts = Regex.Split(line.Trim(), @"\s+");
                if (parts.Length < 5) continue;

                // parts[1] is Local Address, parts[4] or last is PID depending on state
                // Windows netstat -ano: Proto Local Foreign State PID
                // If State is missing (e.g. UDP), PID might be earlier? No, usually last.
                
                string pidStr = parts[parts.Length - 1];
                string localAddr = parts[1];

                if (int.TryParse(pidStr, out int pid))
                {
                    // Strict port matching
                    if (localAddr.EndsWith($":{port}"))
                    {
                        string processName = GetProcessName(pid);
                        result.Add(new ProcessItem
                        {
                            Port = port,
                            ProcessId = pid,
                            ProcessName = processName,
                            Protocol = parts[0]
                        });
                    }
                }
            }
            return result.DistinctBy(p => p.ProcessId).ToList();
        }
        catch (Exception)
        {
            // Logging would go here
            return new List<ProcessItem>();
        }
    }

    private async Task<List<ProcessItem>> GetProcessesUnixAsync(int port)
    {
        try
        {
             // lsof -i :port
             var output = await RunCommandAsync("lsof", $"-i :{port}");
             var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
             var result = new List<ProcessItem>();
             
             foreach(var line in lines.Skip(1)) // Skip header
             {
                 var parts = Regex.Split(line.Trim(), @"\s+");
                 if (parts.Length < 2) continue;
                 
                 // COMMAND PID ...
                 if (int.TryParse(parts[1], out int pid))
                 {
                     result.Add(new ProcessItem
                     {
                         Port = port,
                         ProcessId = pid,
                         ProcessName = parts[0],
                         Protocol = "TCP/UDP"
                     });
                 }
             }
             return result.DistinctBy(p => p.ProcessId).ToList();
        }
        catch
        {
            return new List<ProcessItem>();
        }
    }

    private string GetProcessName(int pid)
    {
        try
        {
            return Process.GetProcessById(pid).ProcessName;
        }
        catch
        {
            return "Unknown";
        }
    }

    private Task<string> RunCommandAsync(string fileName, string arguments)
    {
        // Use Task.Run to avoid blocking UI thread with synchronous Process methods if any
        return Task.Run(() => 
        {
            try 
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();
                string output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();
                return output;
            }
            catch 
            {
                return string.Empty;
            }
        });
    }
}
