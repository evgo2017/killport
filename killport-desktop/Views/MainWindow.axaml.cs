using Avalonia.Controls;
using Avalonia.VisualTree;
using System.Linq;

namespace KillPort.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }



    private void SearchBox_KeyUp(object? sender, Avalonia.Input.KeyEventArgs e)
    {
        if (e.Key == Avalonia.Input.Key.Enter)
        {
             if (DataContext is ViewModels.MainWindowViewModel vm)
             {
                 vm.IsDropDownOpen = false;
             }
        }
    }

    private void SearchBox_GotFocus(object? sender, Avalonia.Input.GotFocusEventArgs e)
    {
         if (DataContext is ViewModels.MainWindowViewModel vm)
         {
             vm.IsDropDownOpen = true;
         }
    }

    private void SearchBox_Tapped(object? sender, Avalonia.Input.TappedEventArgs e)
    {
         if (DataContext is ViewModels.MainWindowViewModel vm)
         {
             // Toggle or Ensure Open? User wants to see dropdown.
             vm.IsDropDownOpen = true;
         }
    }
}