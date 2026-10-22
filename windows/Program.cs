// Pare 3D for Windows - a native window around the app.
//
// Starts the bundled local server (bun.exe running serve.mjs), shows the app in its own
// window (WebView2, the Edge engine built into Windows) with its own taskbar icon, and stops
// the server when the window closes. No browser window is involved.

using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pare3D;

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}

sealed class MainForm : Form
{
    static readonly string AppDir = AppContext.BaseDirectory;
    static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pare 3D");
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMilliseconds(800) };

    const string WaitingHtml = "<html><body style=\"margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font:600 15px 'Segoe UI',sans-serif;color:#5b6778;background:#f8f9fb\">Starting Pare 3D…</body></html>";

    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    Process? server;
    int port = 47177;
    bool readyToClose;

    public MainForm()
    {
        Text = "Pare 3D";
        Width = 1440;
        Height = 900;
        MinimumSize = new Size(1000, 640);
        StartPosition = FormStartPosition.CenterScreen;
        try
        {
            Icon = new Icon(Path.Combine(AppDir, "Pare3D.ico"));
        }
        catch
        {
            // The window still opens without its icon.
        }
        Controls.Add(web);
        Load += async (_, _) => await StartAsync();
        FormClosing += OnFormClosing;
    }

    static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            File.AppendAllText(Path.Combine(DataDir, "launcher.log"), $"{DateTime.Now:s} {line}\r\n");
        }
        catch
        {
            // Logging never stops the app.
        }
    }

    static async Task<string?> Ask(int candidate, string path)
    {
        try
        {
            using var response = await Http.GetAsync($"http://127.0.0.1:{candidate}{path}");
            return await response.Content.ReadAsStringAsync();
        }
        catch
        {
            return null;
        }
    }

    /// The runtime of the serve.mjs this app carries (RUNTIME_VERSION there).
    const int OwnRuntime = 4;

    /// Fork (build 29): a Pare 3D server already on the port is reused only when it is at least as new as
    /// this app; one left running by an older app is replaced on the same port (designs are kept per address).
    static async Task<bool> ServerIsCurrentAsync(int candidate)
    {
        var body = await Ask(candidate, "/__pare3d/update");
        if (body == null) return false;
        try
        {
            using var state = System.Text.Json.JsonDocument.Parse(body);
            var root = state.RootElement;
            var runtime = root.TryGetProperty("runtime", out var r) && r.TryGetInt32(out var rv) ? rv : 0;
            var serving = root.TryGetProperty("serving", out var s) && s.TryGetInt32(out var sv) ? sv : 0;
            var bundled = 0;
            try { bundled = int.Parse(File.ReadAllText(Path.Combine(AppDir, "app", "pare-build.txt")).Trim()); } catch { }
            return runtime >= OwnRuntime && serving >= bundled;
        }
        catch
        {
            return false;
        }
    }

    /// Stops the Pare 3D server on the port: politely if it knows how, otherwise by the process listening there.
    static async Task StopServerAsync(int candidate)
    {
        try { using var _ = await Http.PostAsync($"http://127.0.0.1:{candidate}/__pare3d/quit", null); } catch { }
        for (var i = 0; i < 20 && await Ask(candidate, "/") != null; i++) await Task.Delay(100);
        if (await Ask(candidate, "/") == null) return;
        try
        {
            var netstat = Process.Start(new ProcessStartInfo("netstat", "-ano -p tcp") { UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true });
            var output = netstat == null ? "" : await netstat.StandardOutput.ReadToEndAsync();
            foreach (var line in output.Split('\n'))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 5 && parts[1].EndsWith($":{candidate}") && parts[3] == "LISTENING" && int.TryParse(parts[4], out var pid) && pid != Environment.ProcessId)
                {
                    try { Process.GetProcessById(pid).Kill(true); } catch { }
                }
            }
        }
        catch
        {
            // Nothing more to try; the next port is used instead.
        }
        for (var i = 0; i < 30 && await Ask(candidate, "/") != null; i++) await Task.Delay(100);
    }

    /// The designs are stored per address, so the same port is used every time when it can be.
    async Task<bool> StartServerAsync()
    {
        foreach (var candidate in new[] { 47177, 47178, 47179, 47180, 47181 })
        {
            if (await Ask(candidate, "/__pare3d") == "pare3d")
            {
                if (await ServerIsCurrentAsync(candidate))
                {
                    port = candidate;
                    Log($"reusing the Pare 3D server on {candidate}");
                    return true;
                }
                Log($"replacing an older Pare 3D server on {candidate}");
                await StopServerAsync(candidate);
            }
            if (await Ask(candidate, "/") != null)
            {
                Log($"port {candidate} is used by something else");
                continue;
            }
            var start = new ProcessStartInfo(Path.Combine(AppDir, "bun.exe"), $"\"{Path.Combine(AppDir, "serve.mjs")}\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = AppDir,
            };
            start.Environment["PORT"] = candidate.ToString();
            Process? process;
            try
            {
                process = Process.Start(start);
            }
            catch (Exception error)
            {
                Log("could not start the server: " + error.Message);
                return false;
            }
            for (var i = 0; i < 100; i++)
            {
                if (await Ask(candidate, "/__pare3d") == "pare3d")
                {
                    server = process;
                    port = candidate;
                    Log($"started the server on {candidate}");
                    return true;
                }
                await Task.Delay(100);
            }
            Log($"the server did not answer on {candidate}");
            try
            {
                process?.Kill(true);
            }
            catch
            {
                // Already gone.
            }
        }
        return false;
    }

    async Task StartAsync()
    {
        Log("--- native app starting");
        try
        {
            // Only for the automated Windows check: lets it look into the window through a debugging port.
            var debugPort = Environment.GetEnvironmentVariable("PARE3D_DEBUG_PORT");
            var options = int.TryParse(debugPort, out var parsedPort) && parsedPort > 1024
                ? new CoreWebView2EnvironmentOptions($"--remote-debugging-port={parsedPort}")
                : null;
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "WebView2"), options);
            await web.EnsureCoreWebView2Async(environment);
        }
        catch (Exception error)
        {
            Log("WebView2 is missing: " + error.Message);
            var answer = MessageBox.Show(
                "Pare 3D needs the Microsoft Edge WebView2 Runtime. It comes with Windows 11 and most Windows 10 PCs.\n\nOpen the download page now?",
                "Pare 3D",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information);
            if (answer == DialogResult.Yes) OpenExternal("https://developer.microsoft.com/microsoft-edge/webview2/");
            readyToClose = true;
            Close();
            return;
        }

        var core = web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = true;
        // A link that opens a new window (the user guide) opens in the default browser.
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            OpenExternal(e.Uri);
        };
        // The web, the source code, mail: in the person's own browser or mail app.
        core.NavigationStarting += (_, e) =>
        {
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)
                && (uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "mailto")
                && uri.Host != "localhost" && uri.Host != "127.0.0.1")
            {
                e.Cancel = true;
                OpenExternal(e.Uri);
            }
        };
        // Exports and backups go to Downloads, as a browser would put them.
        core.DownloadStarting += (_, e) =>
        {
            var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            var name = Path.GetFileName(e.ResultFilePath);
            e.ResultFilePath = UniquePath(Path.Combine(downloads, string.IsNullOrWhiteSpace(name) ? "Pare 3D download" : name));
            e.Handled = true;
            Log("download to " + e.ResultFilePath);
        };
        core.ProcessFailed += (_, e) =>
        {
            Log("web content failed: " + e.ProcessFailedKind);
            if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited) core.Reload();
        };

        core.NavigateToString(WaitingHtml);
        if (await StartServerAsync())
        {
            core.Navigate($"http://localhost:{port}/");
        }
        else
        {
            MessageBox.Show(
                "Pare 3D could not start its local server. Details are in %LOCALAPPDATA%\\Pare 3D\\launcher.log",
                "Pare 3D",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            readyToClose = true;
            Close();
        }
    }

    static string UniquePath(string path)
    {
        if (!File.Exists(path)) return path;
        var folder = Path.GetDirectoryName(path) ?? "";
        var stem = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (var number = 2; ; number++)
        {
            var candidate = Path.Combine(folder, $"{stem} {number}{ext}");
            if (!File.Exists(candidate)) return candidate;
        }
    }

    static void OpenExternal(string target)
    {
        try
        {
            Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Log("could not open " + target + ": " + error.Message);
        }
    }

    /// The open design is written to storage first, then the window closes and the server stops.
    async void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (readyToClose || web.CoreWebView2 == null)
        {
            StopServer();
            return;
        }
        e.Cancel = true;
        try
        {
            await web.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('layerling:save-now')); true");
        }
        catch
        {
            // Closing anyway.
        }
        await Task.Delay(600);
        readyToClose = true;
        Close();
    }

    void StopServer()
    {
        try
        {
            if (server != null && !server.HasExited) server.Kill(true);
        }
        catch
        {
            // Already gone.
        }
        Log("closed");
    }
}
