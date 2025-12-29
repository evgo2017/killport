using System;
using System.Globalization;
using Avalonia.Data.Converters;
using KillPort.Services;

namespace KillPort.Converters;

public class LocalizationConverter : IValueConverter
{
    public static readonly LocalizationConverter Instance = new();

    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string key)
        {
            return LocalizationManager.Instance[key];
        }
        return value;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
