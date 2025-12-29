using System.Collections.Generic;

namespace KillPort.Models;

public record PortInfo(string Number, string Description);

public class PortCategory
{
    public string Name { get; }
    public List<PortInfo> Ports { get; }

    public PortCategory(string name, List<PortInfo> ports)
    {
        Name = name;
        Ports = ports;
    }

    public override string ToString() => "---Category---";
}
