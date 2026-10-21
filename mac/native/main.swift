// Pare 3D for Mac - a native window around the app.
//
// Starts the bundled local server (Bun running serve.mjs), shows the app in its own
// window (WebKit, the engine Safari uses) with its own Dock icon and menu, and stops the
// server when the app quits. Closing the window quits the app. No browser is involved.
//
// Built on GitHub's Mac machines by .github/workflows/pare3d-release.yml:
//   swiftc -O -target arm64-apple-macos12 main.swift   (and x86_64, joined with lipo)

import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: Process?
    private var port = 47177
    private var readyToQuit = false
    private let resources = Bundle.main.resourceURL!

    private lazy var supportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = base.appendingPathComponent("Pare 3D", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }()

    private func log(_ line: String) {
        let url = supportDirectory.appendingPathComponent("launcher.log")
        let text = "\(Date()) \(line)\n"
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(text.data(using: .utf8)!)
            try? handle.close()
        } else {
            try? text.data(using: .utf8)!.write(to: url)
        }
    }

    // MARK: Start-up

    func applicationDidFinishLaunching(_ notification: Notification) {
        log("--- native app starting (\(Bundle.main.bundlePath))")
        buildMenu()
        createWindow()
        DispatchQueue.global(qos: .userInitiated).async {
            let started = self.startServer()
            DispatchQueue.main.async {
                if started {
                    self.webView.load(URLRequest(url: URL(string: "http://localhost:\(self.port)/")!))
                } else {
                    self.showStartFailure()
                }
            }
        }
    }

    private func createWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Pare 3D"
        window.minSize = NSSize(width: 1000, height: 640)
        window.contentView = webView
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("Pare3DMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        let waiting = """
        <html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;\
        font:600 15px -apple-system,sans-serif;color:#5b6778;background:#f8f9fb">Starting Pare 3D…</body></html>
        """
        webView.loadHTMLString(waiting, baseURL: nil)
    }

    /// Asks a local port something; nil when nothing answers.
    private func ask(_ port: Int, _ path: String, timeout: TimeInterval = 0.8) -> (status: Int, body: String)? {
        guard let url = URL(string: "http://127.0.0.1:\(port)\(path)") else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let done = DispatchSemaphore(value: 0)
        var result: (Int, String)?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if let http = response as? HTTPURLResponse {
                result = (http.statusCode, String(data: data ?? Data(), encoding: .utf8) ?? "")
            }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + timeout + 0.5)
        return result
    }

    private func isPare3D(_ port: Int, timeout: TimeInterval = 0.8) -> Bool {
        ask(port, "/__pare3d", timeout: timeout)?.body == "pare3d"
    }

    /// The designs are stored per address, so the same port is used every time when it can be.
    private func startServer() -> Bool {
        #if arch(arm64)
        let bun = resources.appendingPathComponent("bun-arm64")
        #else
        let bun = resources.appendingPathComponent("bun-x64")
        #endif
        for candidate in [47177, 47178, 47179, 47180, 47181] {
            if isPare3D(candidate) {
                port = candidate
                log("reusing the Pare 3D server on \(candidate)")
                return true
            }
            if ask(candidate, "/") != nil {
                log("port \(candidate) is used by something else")
                continue
            }
            let process = Process()
            process.executableURL = bun
            process.arguments = [resources.appendingPathComponent("serve.mjs").path]
            var environment = ProcessInfo.processInfo.environment
            environment["PORT"] = String(candidate)
            process.environment = environment
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            do {
                try process.run()
            } catch {
                log("could not start the server: \(error.localizedDescription)")
                return false
            }
            for _ in 0..<100 {
                if isPare3D(candidate, timeout: 0.3) {
                    server = process
                    port = candidate
                    log("started the server on \(candidate)")
                    return true
                }
                Thread.sleep(forTimeInterval: 0.1)
            }
            log("the server did not answer on \(candidate)")
            process.terminate()
        }
        return false
    }

    private func showStartFailure() {
        let alert = NSAlert()
        alert.messageText = "Pare 3D could not start"
        alert.informativeText = "Its local server did not start. Details are in ~/Library/Application Support/Pare 3D/launcher.log"
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApp.terminate(nil)
    }

    // MARK: Quitting

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// The open design is written to storage first, then the app quits.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if readyToQuit || webView == nil {
            return .terminateNow
        }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('layerling:save-now')); true") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                self.readyToQuit = true
                NSApp.reply(toApplicationShouldTerminate: true)
            }
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate()
        log("quit")
    }

    // MARK: Menu

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Pare 3D", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Pare 3D", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Pare 3D", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        // Text fields need these for copy and paste; the design's own shortcuts reach the page first.
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "")
        let fullScreen = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimise", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadPage() {
        webView.reload()
    }

    // MARK: Links and downloads

    private func isLocal(_ url: URL) -> Bool {
        guard let host = url.host else { return true }
        return host == "localhost" || host == "127.0.0.1"
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           (scheme == "http" || scheme == "https" || scheme == "mailto"),
           !isLocal(url) {
            // The web, the source code, mail: in the person's own browser or mail app.
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    /// Exports and backups go to Downloads, as a browser would put them; a name already taken gets a number.
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let name = suggestedFilename.isEmpty ? "Pare 3D download" : suggestedFilename
        var target = downloads.appendingPathComponent(name)
        let base = target.deletingPathExtension().lastPathComponent
        let ext = target.pathExtension
        var number = 2
        while FileManager.default.fileExists(atPath: target.path) {
            target = downloads.appendingPathComponent(ext.isEmpty ? "\(base) \(number)" : "\(base) \(number).\(ext)")
            number += 1
        }
        log("download to \(target.path)")
        completionHandler(target)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        log("download failed: \(error.localizedDescription)")
    }

    /// A link that opens a new window (the user guide) opens in the default browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: File picker and dialogs

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn ? field.stringValue : nil)
        }
    }

    /// If the page's process ends (rare), it is loaded again rather than left blank.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log("web content ended; reloading")
        webView.reload()
    }
}

let application = NSApplication.shared
let appDelegate = AppDelegate()
application.delegate = appDelegate
application.setActivationPolicy(.regular)
application.run()
