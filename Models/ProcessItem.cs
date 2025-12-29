namespace KillPort.Models;

public class ProcessItem
{
    public int Port { get; set; }
    public int ProcessId { get; set; }
    public string ProcessName { get; set; } = string.Empty;
    public string Protocol { get; set; } = string.Empty;
}
