using System.Collections.ObjectModel;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using KillPort.Models;
using KillPort.Services;

namespace KillPort.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly IPortService _portService;

    [ObservableProperty]
    private string _searchPort = "";

    [ObservableProperty]
    private string _statusMessage = "Ready";

    public ObservableCollection<ProcessItem> ProcessList { get; } = new();

    public MainWindowViewModel()
    {
        _portService = new PortService();
    }

    [RelayCommand]
    private async Task Search()
    {
        if (int.TryParse(SearchPort, out int port))
        {
            StatusMessage = $"Searching for port {port}...";
            ProcessList.Clear();
            var items = await _portService.GetProcessesByPortAsync(port);
            foreach (var item in items)
            {
                ProcessList.Add(item);
            }
            StatusMessage = items.Count > 0 ? $"Found {items.Count} processes." : "No processes found.";
        }
        else
        {
            StatusMessage = "Invalid port number.";
        }
    }

    [ObservableProperty]
    private bool _isConfirmationVisible;

    [ObservableProperty]
    private ProcessItem? _processToKill;

    [RelayCommand]
    private void RequestKillProcess(ProcessItem item)
    {
        ProcessToKill = item;
        IsConfirmationVisible = true;
    }

    [RelayCommand]
    private void CancelKill()
    {
        IsConfirmationVisible = false;
        ProcessToKill = null;
    }

    [RelayCommand]
    private async Task ConfirmKill()
    {
        if (ProcessToKill == null) return;
        
        var item = ProcessToKill;
        IsConfirmationVisible = false; // Close dialog immediately

        try 
        {
            StatusMessage = $"Killing process {item.ProcessId}...";
            
            // Optimistically update UI or fully refresh.
            // Full refresh ensures state is correct.
            await _portService.KillProcessAsync(item.ProcessId);
            
            // Short delay to allow OS to clean up
            await Task.Delay(500);
            
            StatusMessage = $"Killed process {item.ProcessId}.";
            await Search();
        }
        catch (System.Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
        }
        finally
        {
            ProcessToKill = null;
        }
    }
}
