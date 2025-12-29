using System.Collections.Generic;
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
    public LocalizationManager Localization => LocalizationManager.Instance;

    [ObservableProperty]
    private string _searchPort = "";

    [ObservableProperty]
    private string _statusMessage;

    // Store state for dynamic localization
    private string _currentStatusKey = "ReadyStatus";
    private object[] _currentStatusArgs = System.Array.Empty<object>();

    public ObservableCollection<ProcessItem> ProcessList { get; } = new();

    public MainWindowViewModel()
    {
        _portService = new PortService();
        SetStatus("ReadyStatus");
    }

    private void SetStatus(string key, params object[] args)
    {
        _currentStatusKey = key;
        _currentStatusArgs = args;
        RefreshStatusMessage();
    }

    private void RefreshStatusMessage()
    {
        var format = Localization.Get(_currentStatusKey);
        if (string.IsNullOrEmpty(format)) format = _currentStatusKey; // Fallback
        
        try
        {
            StatusMessage = string.Format(format, _currentStatusArgs);
        }
        catch
        {
            StatusMessage = format;
        }
    }

    [RelayCommand]
    private void ToggleLanguage()
    {
        Localization.ToggleLanguage();
        RefreshStatusMessage();
    }

    [RelayCommand]
    private async Task Search()
    {
        if (int.TryParse(SearchPort, out int port))
        {
            SetStatus("SearchingMessage", port);
            ProcessList.Clear();
            var items = await _portService.GetProcessesByPortAsync(port);
            foreach (var item in items)
            {
                ProcessList.Add(item);
            }
            
            if (items.Count > 0)
                 SetStatus("FoundProcessesFormat", items.Count); 
            else
                 SetStatus("NoProcessFound");
        }
        else
        {
             SetStatus("InvalidPort");
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
             SetStatus("KillingProcessFormat", item.ProcessId);
            
            // Optimistically update UI or fully refresh.
            // Full refresh ensures state is correct.
            await _portService.KillProcessAsync(item.ProcessId);
            
            // Short delay to allow OS to clean up
            await Task.Delay(500);
            
             SetStatus("KilledProcessFormat", item.ProcessId);
            await Search();
        }
        catch (System.Exception ex)
        {
             SetStatus("ErrorMessage", ex.Message);
        }
        finally
        {
            ProcessToKill = null;
        }
    }
}
