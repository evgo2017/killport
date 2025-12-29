using System.Collections.Generic;
using System.Threading.Tasks;
using KillPort.Models;

namespace KillPort.Services;

public interface IPortService
{
    Task<List<ProcessItem>> GetProcessesByPortAsync(int port);
    Task KillProcessAsync(int processId);
}
