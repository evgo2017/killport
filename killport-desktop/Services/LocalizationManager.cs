using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using KillPort.Properties;

namespace KillPort.Services;

public class LocalizationManager : INotifyPropertyChanged
{
    private static LocalizationManager? _instance;
    public static LocalizationManager Instance => _instance ??= new LocalizationManager();

    public LocalizationManager()
    {
        // Ensure Resources.Culture matches the running thread's culture initially
        // This prevents the "first click does nothing" issue where Resources.Culture is null (defaulting to en in logic) 
        // while the app is actually displaying zh.
        if (Resources.Culture == null)
        {
            Resources.Culture = CultureInfo.CurrentUICulture;
        }
    }

    public string CurrentLanguage => Resources.Culture?.Name ?? CultureInfo.CurrentUICulture.Name;

    public void ToggleLanguage()
    {
        var newLang = CurrentLanguage.StartsWith("zh") ? "en" : "zh";
        Resources.Culture = new CultureInfo(newLang);
        OnPropertyChanged(nameof(CurrentLanguage));
        OnPropertyChanged(string.Empty); // Notify all bindings to refresh
    }

    public string this[string key]
    {
        get
        {
            try
            {
                return Resources.ResourceManager.GetString(key, Resources.Culture) ?? key;
            }
            catch
            {
                return key;
            }
        }
    }
    
    // Helper for C# access
    public string Get(string key) => this[key];

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
