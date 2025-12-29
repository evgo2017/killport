namespace KillPort.Models;

public class PortOption
{
    public string Port { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    // Override ToString to make it easier for TextSearch if needed, though we will use templates
    public override string ToString() => Port; 
}
